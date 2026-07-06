import { asc, eq, inArray, sql } from "drizzle-orm"
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import { Pool, type PoolConfig } from "pg"
import { tag } from "@pumped-fn/lite"
import { OperationalFault } from "./errors"
import { latestFeed, pushFeed, type PushFeed } from "./feed"
import {
  completedReport,
  databaseMigrations,
  migrationInfo,
  migrationStatus,
  type DatabaseMigrationRecord,
  type DatabaseMigrationReport,
  type DatabaseMigrationStatus,
} from "./migrations"
import * as schema from "./schema"
import { auditEvents, pendingInvoices, schemaMigrations, storedInvoices } from "./schema"
import type { AuditAction, AuditEvent } from "./audit"
import type { Invoice, SaveInvoiceInput, StoredInvoice } from "./types"

export interface SaveInvoiceRecord extends SaveInvoiceInput {
  importedAt: string
}

export interface DatabaseSeed {
  pending?: readonly Invoice[]
  stored?: readonly StoredInvoice[]
}

export interface InvoiceDatabase {
  migrate(appliedAt: string): Promise<DatabaseMigrationReport>
  migrationStatus(): Promise<DatabaseMigrationStatus>
  enqueue(invoices: readonly Invoice[], enqueuedAt: string): Promise<number>
  drainPending(occurredAt: string): Promise<readonly Invoice[]>
  listPending(): Promise<readonly Invoice[]>
  saveInvoice(input: SaveInvoiceRecord): Promise<StoredInvoice>
  listStored(): Promise<readonly StoredInvoice[]>
  markReminderSent(invoiceId: string, remindedAt: string): Promise<StoredInvoice | undefined>
  reviewCount(): Promise<number>
  watchPending(): AsyncIterable<readonly Invoice[]>
  watchStored(): AsyncIterable<readonly StoredInvoice[]>
  watchReviewCount(): AsyncIterable<number>
  audit(action: AuditAction, entityId: string, occurredAt: string, payload: Record<string, unknown>): Promise<void>
  listAudit(): Promise<readonly AuditEvent[]>
  close(): Promise<void>
}

export interface DatabaseEngine {
  open(): InvoiceDatabase
}

export const databaseEngine = tag<DatabaseEngine>({
  label: "invoice.databaseEngine",
  default: postgresDatabase(),
})

export function memoryDatabase(seed: DatabaseSeed = {}): DatabaseEngine {
  return {
    open: () => new MemoryInvoiceDatabase(seed),
  }
}

export function postgresDatabase(config: PoolConfig = {}): DatabaseEngine {
  return {
    open: () => new PostgresInvoiceDatabase(new Pool({
      connectionString: process.env["DATABASE_URL"] ?? "postgres://invoice:invoice@localhost:5432/invoice_triage",
      ...config,
    })),
  }
}

type Database = NodePgDatabase<typeof schema>
type MigrationRow = typeof schemaMigrations.$inferSelect
type StoredRow = typeof storedInvoices.$inferSelect
type AuditRow = typeof auditEvents.$inferSelect

class MemoryInvoiceDatabase implements InvoiceDatabase {
  private pending: Invoice[]
  private stored: StoredInvoice[]
  private events: AuditEvent[] = []
  private migrations: DatabaseMigrationRecord[] = []
  private sequence = 0
  private pendingWatchers = new Set<PushFeed<readonly Invoice[]>>()
  private storedWatchers = new Set<PushFeed<readonly StoredInvoice[]>>()
  private reviewWatchers = new Set<PushFeed<number>>()

  constructor(seed: DatabaseSeed) {
    this.pending = [...seed.pending ?? []]
    this.stored = [...seed.stored ?? []]
  }

  async migrate(appliedAt: string): Promise<DatabaseMigrationReport> {
    const status = migrationStatus(this.migrations)
    const appliedNow = status.pending.map((item): DatabaseMigrationRecord => {
      this.sequence += 1
      this.events = [...this.events, {
        sequence: this.sequence,
        action: "database.migrated",
        entityId: `schema:${item.version}`,
        occurredAt: appliedAt,
        payload: { ...item },
      }]
      return { ...item, appliedAt }
    })
    this.migrations = [...this.migrations, ...appliedNow]
    return completedReport(this.migrations, appliedNow)
  }

  async migrationStatus(): Promise<DatabaseMigrationStatus> {
    return migrationStatus(this.migrations)
  }

  async enqueue(invoices: readonly Invoice[], enqueuedAt: string): Promise<number> {
    if (invoices.length === 0) return 0
    this.pending = [...this.pending, ...invoices]
    for (const invoice of invoices) {
      await this.audit("invoice.enqueued", invoice.id, enqueuedAt, { invoice })
    }
    this.notifyPending()
    return invoices.length
  }

  async drainPending(occurredAt: string): Promise<readonly Invoice[]> {
    const drained = this.pending
    this.pending = []
    if (drained.length > 0) {
      await this.audit("invoice.drained", "pending", occurredAt, { invoiceIds: drained.map((invoice) => invoice.id) })
    }
    this.notifyPending()
    return drained
  }

  async listPending(): Promise<readonly Invoice[]> {
    return this.pending.slice()
  }

  async saveInvoice(input: SaveInvoiceRecord): Promise<StoredInvoice> {
    const found = this.stored.find((item) => item.id === input.invoice.id)
    const stored: StoredInvoice = {
      ...input.invoice,
      classification: input.classification,
      importedAt: input.importedAt,
      ...(found?.remindedAt === undefined ? {} : { remindedAt: found.remindedAt }),
    }
    this.stored = found === undefined
      ? [...this.stored, stored]
      : this.stored.map((item) => item.id === stored.id ? stored : item)
    await this.audit("invoice.saved", stored.id, input.importedAt, {
      risk: stored.classification.risk,
      category: stored.classification.category,
    })
    this.notifyStored()
    this.notifyReviewCount()
    return stored
  }

  async listStored(): Promise<readonly StoredInvoice[]> {
    return this.stored.slice()
  }

  async markReminderSent(invoiceId: string, remindedAt: string): Promise<StoredInvoice | undefined> {
    const invoice = this.stored.find((item) => item.id === invoiceId)
    if (invoice === undefined || invoice.remindedAt !== undefined) return undefined
    const stored = { ...invoice, remindedAt }
    this.stored = this.stored.map((item) => item.id === invoiceId ? stored : item)
    await this.audit("invoice.reminded", invoiceId, remindedAt, { dueDate: stored.classification.dueDate })
    this.notifyStored()
    return stored
  }

  async reviewCount(): Promise<number> {
    return this.stored.filter((invoice) => invoice.classification.risk === "review").length
  }

  watchPending(): AsyncIterable<readonly Invoice[]> {
    return this.watch(this.pendingWatchers, pushFeed(), this.pending.slice())
  }

  watchStored(): AsyncIterable<readonly StoredInvoice[]> {
    return this.watch(this.storedWatchers, latestFeed(), this.stored.slice())
  }

  watchReviewCount(): AsyncIterable<number> {
    return this.watch(this.reviewWatchers, latestFeed(), this.stored.filter((invoice) => invoice.classification.risk === "review").length)
  }

  async audit(
    action: AuditAction,
    entityId: string,
    occurredAt: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    this.sequence += 1
    this.events = [...this.events, { sequence: this.sequence, action, entityId, occurredAt, payload }]
  }

  async listAudit(): Promise<readonly AuditEvent[]> {
    return this.events.slice()
  }

  async close(): Promise<void> {
    this.closeWatchers(this.pendingWatchers)
    this.closeWatchers(this.storedWatchers)
    this.closeWatchers(this.reviewWatchers)
  }

  private watch<T>(watchers: Set<PushFeed<T>>, feed: PushFeed<T>, initial: T): PushFeed<T> {
    watchers.add(feed)
    feed.push(initial)
    const close = feed.return.bind(feed)
    feed.return = () => {
      watchers.delete(feed)
      return close()
    }
    return feed
  }

  private closeWatchers<T>(watchers: Set<PushFeed<T>>): void {
    for (const watcher of watchers) watcher.close()
    watchers.clear()
  }

  private notifyPending(): void {
    const pending = this.pending.slice()
    for (const watcher of this.pendingWatchers) watcher.push(pending)
  }

  private notifyStored(): void {
    const stored = this.stored.slice()
    for (const watcher of this.storedWatchers) watcher.push(stored)
  }

  private notifyReviewCount(): void {
    const count = this.stored.filter((invoice) => invoice.classification.risk === "review").length
    for (const watcher of this.reviewWatchers) watcher.push(count)
  }
}

class PostgresInvoiceDatabase implements InvoiceDatabase {
  private db: Database
  private pendingWatchers = new Set<PushFeed<readonly Invoice[]>>()
  private storedWatchers = new Set<PushFeed<readonly StoredInvoice[]>>()
  private reviewWatchers = new Set<PushFeed<number>>()

  constructor(private readonly pool: Pool) {
    this.db = drizzle(pool, { schema })
  }

  async migrate(appliedAt: string): Promise<DatabaseMigrationReport> {
    return this.applyMigrations(appliedAt)
  }

  async migrationStatus(): Promise<DatabaseMigrationStatus> {
    if (!await this.hasMigrationLedger()) return migrationStatus([])
    return migrationStatus((await this.db.select().from(schemaMigrations).orderBy(asc(schemaMigrations.version))).map(migrationFromRow))
  }

  async enqueue(invoices: readonly Invoice[], enqueuedAt: string): Promise<number> {
    if (invoices.length === 0) return 0
    await this.db.insert(pendingInvoices).values(invoices.map((invoice) => ({
      id: invoice.id,
      invoice,
      enqueuedAt: new Date(enqueuedAt),
    }))).onConflictDoNothing()
    for (const invoice of invoices) {
      await this.audit("invoice.enqueued", invoice.id, enqueuedAt, { invoice })
    }
    await this.notifyPending()
    return invoices.length
  }

  async drainPending(occurredAt: string): Promise<readonly Invoice[]> {
    const invoices = await this.db.transaction(async (tx) => {
      const rows = await tx.select().from(pendingInvoices).orderBy(asc(pendingInvoices.enqueuedAt), asc(pendingInvoices.id))
      if (rows.length === 0) return []
      await tx.delete(pendingInvoices).where(inArray(pendingInvoices.id, rows.map((row) => row.id)))
      return rows.map((row) => row.invoice)
    })
    if (invoices.length > 0) {
      await this.audit("invoice.drained", "pending", occurredAt, { invoiceIds: invoices.map((invoice) => invoice.id) })
    }
    await this.notifyPending()
    return invoices
  }

  async listPending(): Promise<readonly Invoice[]> {
    const rows = await this.db.select().from(pendingInvoices).orderBy(asc(pendingInvoices.enqueuedAt), asc(pendingInvoices.id))
    return rows.map((row) => row.invoice)
  }

  async saveInvoice(input: SaveInvoiceRecord): Promise<StoredInvoice> {
    const row = await this.db.transaction(async (tx): Promise<StoredRow> => {
      const [existing] = await tx.select().from(storedInvoices).where(eq(storedInvoices.id, input.invoice.id)).limit(1)
      const next = {
        id: input.invoice.id,
        invoice: input.invoice,
        classification: input.classification,
        importedAt: new Date(input.importedAt),
        remindedAt: existing?.remindedAt ?? null,
      }
      await tx.delete(storedInvoices).where(eq(storedInvoices.id, input.invoice.id))
      await tx.insert(storedInvoices).values(next)
      return next
    })
    await this.audit("invoice.saved", row.id, input.importedAt, {
      risk: row.classification.risk,
      category: row.classification.category,
    })
    await this.notifyStored()
    await this.notifyReviewCount()
    return storedFromRow(row)
  }

  async listStored(): Promise<readonly StoredInvoice[]> {
    const rows = await this.db.select().from(storedInvoices).orderBy(asc(storedInvoices.importedAt), asc(storedInvoices.id))
    return rows.map(storedFromRow)
  }

  async markReminderSent(invoiceId: string, remindedAt: string): Promise<StoredInvoice | undefined> {
    const row = await this.db.transaction(async (tx): Promise<StoredRow | undefined> => {
      const [existing] = await tx.select().from(storedInvoices).where(eq(storedInvoices.id, invoiceId)).limit(1)
      if (existing === undefined || existing.remindedAt !== null) return undefined
      const next = { ...existing, remindedAt: new Date(remindedAt) }
      await tx.update(storedInvoices).set({ remindedAt: next.remindedAt }).where(eq(storedInvoices.id, invoiceId))
      return next
    })
    if (row === undefined) return undefined
    await this.audit("invoice.reminded", invoiceId, remindedAt, { dueDate: row.classification.dueDate })
    await this.notifyStored()
    return storedFromRow(row)
  }

  async reviewCount(): Promise<number> {
    return (await this.listStored()).filter((invoice) => invoice.classification.risk === "review").length
  }

  watchPending(): AsyncIterable<readonly Invoice[]> {
    return this.watch(this.pendingWatchers, pushFeed(), () => this.listPending())
  }

  watchStored(): AsyncIterable<readonly StoredInvoice[]> {
    return this.watch(this.storedWatchers, latestFeed(), () => this.listStored())
  }

  watchReviewCount(): AsyncIterable<number> {
    return this.watch(this.reviewWatchers, latestFeed(), () => this.reviewCount())
  }

  async audit(
    action: AuditAction,
    entityId: string,
    occurredAt: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await this.db.insert(auditEvents).values({
      action,
      entityId,
      occurredAt: new Date(occurredAt),
      payload,
    })
  }

  async listAudit(): Promise<readonly AuditEvent[]> {
    const rows = await this.db.select().from(auditEvents).orderBy(asc(auditEvents.sequence))
    return rows.map(auditFromRow)
  }

  async close(): Promise<void> {
    this.closeWatchers(this.pendingWatchers)
    this.closeWatchers(this.storedWatchers)
    this.closeWatchers(this.reviewWatchers)
    await this.pool.end()
  }

  private async applyMigrations(appliedAt: string): Promise<DatabaseMigrationReport> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(932851774)`)
      await tx.execute(sql`
        CREATE TABLE IF NOT EXISTS invoice_schema_migrations (
          version integer PRIMARY KEY,
          name text NOT NULL,
          checksum text NOT NULL,
          applied_at timestamptz NOT NULL
        )
      `)
      const existing = (await tx.select().from(schemaMigrations).orderBy(asc(schemaMigrations.version))).map(migrationFromRow)
      const status = migrationStatus(existing)
      if (status.drift.length > 0) {
        throw new OperationalFault("database-schema-drift", "migrate", "invoice_schema_migrations", {
          versions: status.drift.map((item) => item.version),
        })
      }
      const appliedNow: DatabaseMigrationRecord[] = []
      for (const item of databaseMigrations.filter((migration) => status.pending.some((pending) => pending.version === migration.version))) {
        for (const statement of item.statements) await tx.execute(sql.raw(statement))
        const record: DatabaseMigrationRecord = {
          ...migrationInfo(item),
          appliedAt,
        }
        await tx.insert(schemaMigrations).values({
          version: record.version,
          name: record.name,
          checksum: record.checksum,
          appliedAt: new Date(record.appliedAt),
        })
        await tx.insert(auditEvents).values({
          action: "database.migrated",
          entityId: `schema:${record.version}`,
          occurredAt: new Date(record.appliedAt),
          payload: { ...record },
        })
        appliedNow.push(record)
      }
      return completedReport([...existing, ...appliedNow], appliedNow)
    })
  }

  private async hasMigrationLedger(): Promise<boolean> {
    const result = await this.db.execute<{ exists: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = 'invoice_schema_migrations'
      ) AS exists
    `)
    return result.rows[0]?.exists === true
  }

  private watch<T>(
    watchers: Set<PushFeed<T>>,
    feed: PushFeed<T>,
    initial: () => Promise<T>
  ): PushFeed<T> {
    watchers.add(feed)
    void initial().then((value) => {
      feed.push(value)
    })
    const close = feed.return.bind(feed)
    feed.return = () => {
      watchers.delete(feed)
      return close()
    }
    return feed
  }

  private closeWatchers<T>(watchers: Set<PushFeed<T>>): void {
    for (const watcher of watchers) watcher.close()
    watchers.clear()
  }

  private async notifyPending(): Promise<void> {
    const pending = await this.listPending()
    for (const watcher of this.pendingWatchers) watcher.push(pending)
  }

  private async notifyStored(): Promise<void> {
    const stored = await this.listStored()
    for (const watcher of this.storedWatchers) watcher.push(stored)
  }

  private async notifyReviewCount(): Promise<void> {
    const count = await this.reviewCount()
    for (const watcher of this.reviewWatchers) watcher.push(count)
  }
}

function storedFromRow(row: StoredRow): StoredInvoice {
  return {
    ...row.invoice,
    classification: row.classification,
    importedAt: row.importedAt.toISOString(),
    ...(row.remindedAt === null ? {} : { remindedAt: row.remindedAt.toISOString() }),
  }
}

function auditFromRow(row: AuditRow): AuditEvent {
  return {
    sequence: row.sequence,
    action: row.action,
    entityId: row.entityId,
    occurredAt: row.occurredAt.toISOString(),
    payload: row.payload,
  }
}

function migrationFromRow(row: MigrationRow): DatabaseMigrationRecord {
  return {
    version: row.version,
    name: row.name,
    checksum: row.checksum,
    appliedAt: row.appliedAt.toISOString(),
  }
}

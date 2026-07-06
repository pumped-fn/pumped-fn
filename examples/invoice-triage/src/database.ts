import { asc, eq, inArray, sql } from "drizzle-orm"
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import { Pool, type PoolConfig } from "pg"
import { tag } from "@pumped-fn/lite"
import { operationalFault } from "./errors"
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

export function postgresDatabase(config: PoolConfig = {}): DatabaseEngine {
  const connectionString = config.connectionString ?? "postgres://invoice:invoice@localhost:5432/invoice_triage"
  return {
    open: () => openPostgresInvoiceDatabase(new Pool({
      ...config,
      connectionString,
    })),
  }
}

type Database = NodePgDatabase<typeof schema>
type MigrationRow = typeof schemaMigrations.$inferSelect
type StoredRow = typeof storedInvoices.$inferSelect
type AuditRow = typeof auditEvents.$inferSelect

function openPostgresInvoiceDatabase(pool: Pool): InvoiceDatabase {
  const db: Database = drizzle(pool, { schema })
  const pendingWatchers = new Set<PushFeed<readonly Invoice[]>>()
  const storedWatchers = new Set<PushFeed<readonly StoredInvoice[]>>()
  const reviewWatchers = new Set<PushFeed<number>>()

  async function readMigrationStatus(): Promise<DatabaseMigrationStatus> {
    if (!await hasMigrationLedger()) return migrationStatus([])
    return migrationStatus((await db.select().from(schemaMigrations).orderBy(asc(schemaMigrations.version))).map(migrationFromRow))
  }

  async function enqueue(invoices: readonly Invoice[], enqueuedAt: string): Promise<number> {
    if (invoices.length === 0) return 0
    await db.insert(pendingInvoices).values(invoices.map((invoice) => ({
      id: invoice.id,
      invoice,
      enqueuedAt: new Date(enqueuedAt),
    }))).onConflictDoNothing()
    for (const invoice of invoices) {
      await recordAudit("invoice.enqueued", invoice.id, enqueuedAt, { invoice })
    }
    await notifyPending()
    return invoices.length
  }

  async function drainPending(occurredAt: string): Promise<readonly Invoice[]> {
    const invoices = await db.transaction(async (tx) => {
      const rows = await tx.select().from(pendingInvoices).orderBy(asc(pendingInvoices.enqueuedAt), asc(pendingInvoices.id))
      if (rows.length === 0) return []
      await tx.delete(pendingInvoices).where(inArray(pendingInvoices.id, rows.map((row) => row.id)))
      return rows.map((row) => row.invoice)
    })
    if (invoices.length > 0) {
      await recordAudit("invoice.drained", "pending", occurredAt, { invoiceIds: invoices.map((invoice) => invoice.id) })
    }
    await notifyPending()
    return invoices
  }

  async function listPending(): Promise<readonly Invoice[]> {
    const rows = await db.select().from(pendingInvoices).orderBy(asc(pendingInvoices.enqueuedAt), asc(pendingInvoices.id))
    return rows.map((row) => row.invoice)
  }

  async function saveInvoice(input: SaveInvoiceRecord): Promise<StoredInvoice> {
    const row = await db.transaction(async (tx): Promise<StoredRow> => {
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
    await recordAudit("invoice.saved", row.id, input.importedAt, {
      risk: row.classification.risk,
      category: row.classification.category,
    })
    await notifyStored()
    await notifyReviewCount()
    return storedFromRow(row)
  }

  async function listStored(): Promise<readonly StoredInvoice[]> {
    const rows = await db.select().from(storedInvoices).orderBy(asc(storedInvoices.importedAt), asc(storedInvoices.id))
    return rows.map(storedFromRow)
  }

  async function markReminderSent(invoiceId: string, remindedAt: string): Promise<StoredInvoice | undefined> {
    const row = await db.transaction(async (tx): Promise<StoredRow | undefined> => {
      const [existing] = await tx.select().from(storedInvoices).where(eq(storedInvoices.id, invoiceId)).limit(1)
      if (existing === undefined || existing.remindedAt !== null) return undefined
      const next = { ...existing, remindedAt: new Date(remindedAt) }
      await tx.update(storedInvoices).set({ remindedAt: next.remindedAt }).where(eq(storedInvoices.id, invoiceId))
      return next
    })
    if (row === undefined) return undefined
    await recordAudit("invoice.reminded", invoiceId, remindedAt, { dueDate: row.classification.dueDate })
    await notifyStored()
    return storedFromRow(row)
  }

  async function reviewCount(): Promise<number> {
    return (await listStored()).filter((invoice) => invoice.classification.risk === "review").length
  }

  function watchPending(): AsyncIterable<readonly Invoice[]> {
    return watch(pendingWatchers, pushFeed(), () => listPending())
  }

  function watchStored(): AsyncIterable<readonly StoredInvoice[]> {
    return watch(storedWatchers, latestFeed(), () => listStored())
  }

  function watchReviewCount(): AsyncIterable<number> {
    return watch(reviewWatchers, latestFeed(), () => reviewCount())
  }

  async function recordAudit(
    action: AuditAction,
    entityId: string,
    occurredAt: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await db.insert(auditEvents).values({
      action,
      entityId,
      occurredAt: new Date(occurredAt),
      payload,
    })
  }

  async function listAudit(): Promise<readonly AuditEvent[]> {
    const rows = await db.select().from(auditEvents).orderBy(asc(auditEvents.sequence))
    return rows.map(auditFromRow)
  }

  async function close(): Promise<void> {
    closeWatchers(pendingWatchers)
    closeWatchers(storedWatchers)
    closeWatchers(reviewWatchers)
    await pool.end()
  }

  async function applyMigrations(appliedAt: string): Promise<DatabaseMigrationReport> {
    return db.transaction(async (tx) => {
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
        throw operationalFault("database-schema-drift", "migrate", "invoice_schema_migrations", {
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

  async function hasMigrationLedger(): Promise<boolean> {
    const result = await db.execute<{ exists: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = 'invoice_schema_migrations'
      ) AS exists
    `)
    return result.rows[0]?.exists === true
  }

  function watch<T>(
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

  function closeWatchers<T>(watchers: Set<PushFeed<T>>): void {
    for (const watcher of watchers) watcher.close()
    watchers.clear()
  }

  async function notifyPending(): Promise<void> {
    const pending = await listPending()
    for (const watcher of pendingWatchers) watcher.push(pending)
  }

  async function notifyStored(): Promise<void> {
    const stored = await listStored()
    for (const watcher of storedWatchers) watcher.push(stored)
  }

  async function notifyReviewCount(): Promise<void> {
    const count = await reviewCount()
    for (const watcher of reviewWatchers) watcher.push(count)
  }

  return {
    migrate: applyMigrations,
    migrationStatus: readMigrationStatus,
    enqueue,
    drainPending,
    listPending,
    saveInvoice,
    listStored,
    markReminderSent,
    reviewCount,
    watchPending,
    watchStored,
    watchReviewCount,
    audit: recordAudit,
    listAudit,
    close,
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

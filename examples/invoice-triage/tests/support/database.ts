import { latestFeed, pushFeed, type PushFeed } from "../../src/feed"
import {
  completedReport,
  migrationStatus,
  type DatabaseMigrationRecord,
  type DatabaseMigrationReport,
  type DatabaseMigrationStatus,
} from "../../src/migrations"
import type { AuditAction, AuditEvent } from "../../src/audit"
import type { DatabaseEngine, InvoiceDatabase, SaveInvoiceRecord } from "../../src/database"
import type { Invoice, StoredInvoice } from "../../src/types"

export interface DatabaseSeed {
  pending?: readonly Invoice[]
  stored?: readonly StoredInvoice[]
}

export function memoryDatabase(seed: DatabaseSeed = {}): DatabaseEngine {
  return {
    open: () => new MemoryInvoiceDatabase(seed),
  }
}

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

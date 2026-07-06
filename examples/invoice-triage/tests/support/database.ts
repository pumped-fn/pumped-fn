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

interface InvoiceWatch<T> extends AsyncIterable<T>, AsyncIterator<T, undefined> {
  push(value: T): void
  close(): void
  return(): Promise<IteratorReturnResult<undefined>>
}

export interface DatabaseSeed {
  pending?: readonly Invoice[]
  stored?: readonly StoredInvoice[]
}

export function memoryDatabase(seed: DatabaseSeed = {}): DatabaseEngine {
  return {
    open: () => openMemoryInvoiceDatabase(seed),
  }
}

function openMemoryInvoiceDatabase(seed: DatabaseSeed): InvoiceDatabase {
  let pending = [...seed.pending ?? []]
  let stored = [...seed.stored ?? []]
  let events: AuditEvent[] = []
  let migrations: DatabaseMigrationRecord[] = []
  let sequence = 0
  const pendingWatchers = new Set<InvoiceWatch<readonly Invoice[]>>()
  const storedWatchers = new Set<InvoiceWatch<readonly StoredInvoice[]>>()
  const reviewWatchers = new Set<InvoiceWatch<number>>()

  async function migrate(appliedAt: string): Promise<DatabaseMigrationReport> {
    const status = migrationStatus(migrations)
    const appliedNow = status.pending.map((item): DatabaseMigrationRecord => {
      sequence += 1
      events = [...events, {
        sequence,
        action: "database.migrated",
        entityId: `schema:${item.version}`,
        occurredAt: appliedAt,
        payload: { ...item },
      }]
      return { ...item, appliedAt }
    })
    migrations = [...migrations, ...appliedNow]
    return completedReport(migrations, appliedNow)
  }

  async function readMigrationStatus(): Promise<DatabaseMigrationStatus> {
    return migrationStatus(migrations)
  }

  async function enqueue(invoices: readonly Invoice[], enqueuedAt: string): Promise<number> {
    if (invoices.length === 0) return 0
    pending = [...pending, ...invoices]
    for (const invoice of invoices) {
      await recordAudit("invoice.enqueued", invoice.id, enqueuedAt, { invoice })
    }
    notifyPending()
    return invoices.length
  }

  async function drainPending(occurredAt: string): Promise<readonly Invoice[]> {
    const drained = pending
    pending = []
    if (drained.length > 0) {
      await recordAudit("invoice.drained", "pending", occurredAt, { invoiceIds: drained.map((invoice) => invoice.id) })
    }
    notifyPending()
    return drained
  }

  async function listPending(): Promise<readonly Invoice[]> {
    return pending.slice()
  }

  async function saveInvoice(input: SaveInvoiceRecord): Promise<StoredInvoice> {
    const found = stored.find((item) => item.id === input.invoice.id)
    const invoice: StoredInvoice = {
      ...input.invoice,
      classification: input.classification,
      importedAt: input.importedAt,
      ...(found?.remindedAt === undefined ? {} : { remindedAt: found.remindedAt }),
    }
    stored = found === undefined
      ? [...stored, invoice]
      : stored.map((item) => item.id === invoice.id ? invoice : item)
    await recordAudit("invoice.saved", invoice.id, input.importedAt, {
      risk: invoice.classification.risk,
      category: invoice.classification.category,
    })
    notifyStored()
    notifyReviewCount()
    return invoice
  }

  async function listStored(): Promise<readonly StoredInvoice[]> {
    return stored.slice()
  }

  async function markReminderSent(invoiceId: string, remindedAt: string): Promise<StoredInvoice | undefined> {
    const invoice = stored.find((item) => item.id === invoiceId)
    if (invoice === undefined || invoice.remindedAt !== undefined) return undefined
    const next = { ...invoice, remindedAt }
    stored = stored.map((item) => item.id === invoiceId ? next : item)
    await recordAudit("invoice.reminded", invoiceId, remindedAt, { dueDate: next.classification.dueDate })
    notifyStored()
    return next
  }

  async function reviewCount(): Promise<number> {
    return stored.filter((invoice) => invoice.classification.risk === "review").length
  }

  function watchPending(): AsyncIterable<readonly Invoice[]> {
    return watch(pendingWatchers, invoiceWatch(), pending.slice())
  }

  function watchStored(): AsyncIterable<readonly StoredInvoice[]> {
    return watch(storedWatchers, invoiceWatch(), stored.slice())
  }

  function watchReviewCount(): AsyncIterable<number> {
    return watch(reviewWatchers, invoiceWatch(), stored.filter((invoice) => invoice.classification.risk === "review").length)
  }

  async function recordAudit(
    action: AuditAction,
    entityId: string,
    occurredAt: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    sequence += 1
    events = [...events, { sequence, action, entityId, occurredAt, payload }]
  }

  async function listAudit(): Promise<readonly AuditEvent[]> {
    return events.slice()
  }

  async function close(): Promise<void> {
    closeWatchers(pendingWatchers)
    closeWatchers(storedWatchers)
    closeWatchers(reviewWatchers)
  }

  function watch<T>(watchers: Set<InvoiceWatch<T>>, feed: InvoiceWatch<T>, initial: T): InvoiceWatch<T> {
    watchers.add(feed)
    feed.push(initial)
    const close = feed.return.bind(feed)
    feed.return = () => {
      watchers.delete(feed)
      return close()
    }
    return feed
  }

  function closeWatchers<T>(watchers: Set<InvoiceWatch<T>>): void {
    for (const watcher of watchers) watcher.close()
    watchers.clear()
  }

  function notifyPending(): void {
    const current = pending.slice()
    for (const watcher of pendingWatchers) watcher.push(current)
  }

  function notifyStored(): void {
    const current = stored.slice()
    for (const watcher of storedWatchers) watcher.push(current)
  }

  function notifyReviewCount(): void {
    const count = stored.filter((invoice) => invoice.classification.risk === "review").length
    for (const watcher of reviewWatchers) watcher.push(count)
  }

  return {
    migrate,
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

function invoiceWatch<T>(): InvoiceWatch<T> {
  let value: T | undefined
  let hasValue = false
  let pending: ((result: IteratorResult<T, undefined>) => void) | undefined
  let closed = false
  const feed = {
    next(): Promise<IteratorResult<T, undefined>> {
      if (hasValue) {
        const current = value as T
        value = undefined
        hasValue = false
        return Promise.resolve({ done: false, value: current })
      }
      if (closed) return Promise.resolve({ done: true, value: undefined })
      return new Promise((resolve) => {
        pending = resolve
      })
    },
    push(next: T): void {
      if (closed) throw new Error("Invoice watch is closed")
      if (pending === undefined) {
        value = next
        hasValue = true
        return
      }
      const resolve = pending
      pending = undefined
      resolve({ done: false, value: next })
    },
    close(): void {
      closed = true
      const resolve = pending
      pending = undefined
      resolve?.({ done: true, value: undefined })
    },
    return(): Promise<IteratorReturnResult<undefined>> {
      feed.close()
      return Promise.resolve({ done: true, value: undefined })
    },
    [Symbol.asyncIterator](): AsyncIterator<T, undefined> {
      return feed
    },
  } satisfies InvoiceWatch<T>
  return feed
}

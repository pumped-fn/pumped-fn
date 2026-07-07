import { atom, controller, flow, tags, traced, typed } from "@pumped-fn/lite"
import { step } from "@pumped-fn/sdk"
import { and, asc, count, eq, isNotNull, isNull, sql } from "drizzle-orm"
import { database } from "./database"
import { clock, outstanding, queueSignal, storedSignal } from "./ports"
import { auditEvents, pendingInvoices, storedInvoices } from "./schema"
import {
  enqueueInput,
  type AuditEvent,
  type EnqueueInput,
  type EnqueueSummary,
  type Invoice,
  type SaveInvoiceInput,
  type StoredInvoice,
} from "./types"

type StoredRow = typeof storedInvoices.$inferSelect
type AuditRow = typeof auditEvents.$inferSelect

export const queries = atom({
  keepAlive: true,
  deps: {
    db: database,
    clock: tags.required(clock),
  },
  factory: (_ctx, { db, clock }) => ({
    async enqueuePending(invoices: readonly Invoice[]): Promise<readonly string[]> {
      return db.transaction(async (tx) => {
        const rows = invoices.map((invoice) => ({
          id: invoice.id,
          invoice,
          enqueuedAt: clock.now(),
        }))
        const inserted = rows.length === 0
          ? []
          : await tx.insert(pendingInvoices).values(rows).onConflictDoNothing().returning({ id: pendingInvoices.id })
        const ids = inserted.map((row) => row.id)
        await tx.insert(auditEvents).values({
          action: "enqueued",
          entityId: "pending",
          occurredAt: clock.now(),
          payload: { count: ids.length, ids },
        })
        return ids
      })
    },
    async listPending(): Promise<readonly Invoice[]> {
      const rows = await db.select().from(pendingInvoices).orderBy(asc(pendingInvoices.enqueuedAt), asc(pendingInvoices.id))
      return rows.map((row) => row.invoice)
    },
    async settleImport(input: SaveInvoiceInput): Promise<StoredInvoice> {
      return db.transaction(async (tx) => {
        const rows = await tx.insert(storedInvoices).values({
          id: input.invoice.id,
          invoice: input.invoice,
          classification: input.classification,
          importedAt: clock.now(),
        }).onConflictDoUpdate({
          target: storedInvoices.id,
          set: {
            invoice: sql`excluded.invoice`,
            classification: sql`excluded.classification`,
            importedAt: sql`excluded.imported_at`,
            remindedAt: sql`${storedInvoices.remindedAt}`,
          },
        }).returning()
        await tx.delete(pendingInvoices).where(eq(pendingInvoices.id, input.invoice.id))
        await tx.insert(auditEvents).values({
          action: "imported",
          entityId: input.invoice.id,
          occurredAt: clock.now(),
          payload: {
            risk: input.classification.risk,
            category: input.classification.category,
          },
        })
        return storedFromRow(rows[0]!)
      })
    },
    async claimReminder(invoiceId: string): Promise<StoredInvoice | undefined> {
      return db.transaction(async (tx) => {
        const [row] = await tx.update(storedInvoices)
          .set({ remindedAt: clock.now() })
          .where(and(eq(storedInvoices.id, invoiceId), isNull(storedInvoices.remindedAt)))
          .returning()
        if (row === undefined) return undefined
        await tx.insert(auditEvents).values({
          action: "reminded",
          entityId: row.id,
          occurredAt: clock.now(),
          payload: { dueDate: row.classification.dueDate },
        })
        return storedFromRow(row)
      })
    },
    async releaseReminder(invoiceId: string): Promise<void> {
      return db.transaction(async (tx) => {
        const [row] = await tx.update(storedInvoices)
          .set({ remindedAt: null })
          .where(and(eq(storedInvoices.id, invoiceId), isNotNull(storedInvoices.remindedAt)))
          .returning({
            id: storedInvoices.id,
            classification: storedInvoices.classification,
          })
        if (row === undefined) return
        await tx.insert(auditEvents).values({
          action: "reminder_failed",
          entityId: row.id,
          occurredAt: clock.now(),
          payload: { dueDate: row.classification.dueDate },
        })
      })
    },
    async listStored(): Promise<readonly StoredInvoice[]> {
      const rows = await db.select().from(storedInvoices).orderBy(asc(storedInvoices.importedAt), asc(storedInvoices.id))
      return rows.map(storedFromRow)
    },
    async reviewCount(): Promise<number> {
      const [row] = await db.select({ value: count() }).from(storedInvoices)
        .where(sql`${storedInvoices.classification}->>'risk' = 'review'`)
      return row?.value ?? 0
    },
    async listAudit(): Promise<readonly AuditEvent[]> {
      const rows = await db.select().from(auditEvents).orderBy(asc(auditEvents.sequence))
      return rows.map(auditFromRow)
    },
  }),
})

export const enqueue = flow({
  name: "invoice.enqueue",
  parse: (input): EnqueueInput => enqueueInput.parse(input),
  deps: {
    store: traced(queries),
    queueSignal: controller(queueSignal, { resolve: true }),
    outstanding: controller(outstanding, { resolve: true }),
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: async (ctx, { store, queueSignal, outstanding }): Promise<EnqueueSummary> => {
    const ids = await store.enqueuePending.exec({ params: [ctx.input.invoices] })
    const accepted = ids.length
    if (accepted > 0) {
      outstanding.update((value) => value + accepted)
      queueSignal.update((value) => value + 1)
    }
    return { accepted }
  },
})

export const saveInvoice = flow({
  name: "invoice.save",
  parse: typed<SaveInvoiceInput>(),
  deps: {
    store: traced(queries),
    storedSignal: controller(storedSignal, { resolve: true }),
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: async (ctx, { store, storedSignal }): Promise<StoredInvoice> => {
    const row = await store.settleImport.exec({ params: [ctx.input] })
    storedSignal.update((value) => value + 1)
    return row
  },
})

export const listStored = flow({
  name: "invoice.listStored",
  deps: {
    store: traced(queries),
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: (_ctx, { store }): Promise<readonly StoredInvoice[]> => store.listStored.exec(),
})

export const listPending = flow({
  name: "invoice.listPending",
  deps: {
    store: traced(queries),
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: (_ctx, { store }): Promise<readonly Invoice[]> => store.listPending.exec(),
})

export const reviewCount = flow({
  name: "invoice.reviewCount",
  deps: {
    store: traced(queries),
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: (_ctx, { store }): Promise<number> => store.reviewCount.exec(),
})

export const listAudit = flow({
  name: "invoice.listAudit",
  deps: {
    store: traced(queries),
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: (_ctx, { store }): Promise<readonly AuditEvent[]> => store.listAudit.exec(),
})

export const markReminderSent = flow({
  name: "invoice.markReminderSent",
  parse: typed<{ invoiceId: string }>(),
  deps: {
    store: traced(queries),
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: (ctx, { store }): Promise<StoredInvoice | undefined> => store.claimReminder.exec({ params: [ctx.input.invoiceId] }),
})

export const releaseReminder = flow({
  name: "invoice.releaseReminder",
  parse: typed<{ invoiceId: string }>(),
  deps: {
    store: traced(queries),
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: (ctx, { store }): Promise<void> => store.releaseReminder.exec({ params: [ctx.input.invoiceId] }),
})

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

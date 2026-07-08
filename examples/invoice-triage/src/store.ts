import { controller, flow, tags, typed } from "@pumped-fn/lite"
import { step } from "@pumped-fn/sdk"
import { and, asc, count, eq, isNull, sql } from "drizzle-orm"
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

export const enqueue = flow({
  name: "invoice.enqueue",
  parse: (input): EnqueueInput => enqueueInput.parse(input),
  deps: {
    db: database,
    clock: tags.required(clock),
    outstanding: controller(outstanding, { resolve: true }),
    queueSignal: controller(queueSignal, { resolve: true }),
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: async (ctx, { db, clock, outstanding, queueSignal }): Promise<EnqueueSummary> => {
    const accepted = await db.transaction(async (tx) => {
      const rows = ctx.input.invoices.map((invoice) => ({
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
    if (accepted.length > 0) {
      outstanding.update((value) => value + accepted.length)
      queueSignal.update((value) => value + 1)
    }
    return { accepted: accepted.length }
  },
})

export const settleInvoice = flow({
  name: "invoice.save",
  parse: typed<SaveInvoiceInput>(),
  deps: {
    db: database,
    clock: tags.required(clock),
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: (ctx, { db, clock }): Promise<StoredInvoice> => db.transaction(async (tx) => {
    const importedAt = clock.now()
    const claimed = await tx.delete(pendingInvoices).where(eq(pendingInvoices.id, ctx.input.invoice.id)).returning({ id: pendingInvoices.id })
    if (claimed.length === 0) {
      const existing = await tx.select().from(storedInvoices).where(eq(storedInvoices.id, ctx.input.invoice.id))
      if (existing[0] !== undefined) return storedFromRow(existing[0])
    }
    const rows = await tx.insert(storedInvoices).values({
      id: ctx.input.invoice.id,
      invoice: ctx.input.invoice,
      classification: ctx.input.classification,
      importedAt,
    }).onConflictDoUpdate({
      target: storedInvoices.id,
      set: {
        invoice: sql`excluded.invoice`,
        classification: sql`excluded.classification`,
        importedAt: sql`excluded.imported_at`,
        remindedAt: sql`${storedInvoices.remindedAt}`,
      },
    }).returning()
    await tx.insert(auditEvents).values({
      action: "imported",
      entityId: ctx.input.invoice.id,
      occurredAt: importedAt,
      payload: {
        risk: ctx.input.classification.risk,
        category: ctx.input.classification.category,
      },
    })
    return storedFromRow(rows[0]!)
  }),
})

export const saveInvoice = flow({
  name: "invoice.saveOne",
  parse: typed<SaveInvoiceInput>(),
  deps: {
    settleInvoice: controller(settleInvoice),
    storedSignal: controller(storedSignal, { resolve: true }),
  },
  factory: async (ctx, { settleInvoice, storedSignal }): Promise<StoredInvoice> => {
    const row = await settleInvoice.exec({ input: ctx.input })
    storedSignal.update((value) => value + 1)
    return row
  },
})

export const listStored = flow({
  name: "invoice.listStored",
  deps: { db: database },
  tags: [step({ workflow: true, kind: "store" })],
  factory: async (_ctx, { db }): Promise<readonly StoredInvoice[]> => {
    const rows = await db.select().from(storedInvoices).orderBy(asc(storedInvoices.importedAt), asc(storedInvoices.id))
    return rows.map(storedFromRow)
  },
})

export const listPending = flow({
  name: "invoice.listPending",
  deps: { db: database },
  tags: [step({ workflow: true, kind: "store" })],
  factory: async (_ctx, { db }): Promise<readonly Invoice[]> => {
    const rows = await db.select().from(pendingInvoices).orderBy(asc(pendingInvoices.enqueuedAt), asc(pendingInvoices.id))
    return rows.map((row) => row.invoice)
  },
})

export const reviewCount = flow({
  name: "invoice.reviewCount",
  deps: { db: database },
  tags: [step({ workflow: true, kind: "store" })],
  factory: async (_ctx, { db }): Promise<number> => {
    const [row] = await db.select({ value: count() }).from(storedInvoices)
      .where(sql`${storedInvoices.classification}->>'risk' = 'review'`)
    return row?.value ?? 0
  },
})

export const listAudit = flow({
  name: "invoice.listAudit",
  deps: { db: database },
  tags: [step({ workflow: true, kind: "store" })],
  factory: async (_ctx, { db }): Promise<readonly AuditEvent[]> => {
    const rows = await db.select().from(auditEvents).orderBy(asc(auditEvents.sequence))
    return rows.map(auditFromRow)
  },
})

export const markReminderSent = flow({
  name: "invoice.markReminderSent",
  parse: typed<{ invoiceId: string }>(),
  deps: {
    db: database,
    clock: tags.required(clock),
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: (ctx, { db, clock }): Promise<StoredInvoice | undefined> => db.transaction(async (tx) => {
    const remindedAt = clock.now()
    const [row] = await tx.update(storedInvoices)
      .set({ remindedAt })
      .where(and(eq(storedInvoices.id, ctx.input.invoiceId), isNull(storedInvoices.remindedAt)))
      .returning()
    if (row === undefined) return undefined
    await tx.insert(auditEvents).values({
      action: "reminded",
      entityId: row.id,
      occurredAt: remindedAt,
      payload: { dueDate: row.classification.dueDate },
    })
    return storedFromRow(row)
  }),
})

import { serviceValue, tag, type Lite } from "@pumped-fn/lite"
import { and, asc, count, eq, isNotNull, isNull, sql } from "drizzle-orm"
import type { PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core"
import type { Clock } from "./ports"
import * as schema from "./schema"
import { auditEvents, pendingInvoices, storedInvoices } from "./schema"
import type { AuditEvent, Invoice, SaveInvoiceInput, StoredInvoice } from "./types"

type StoredRow = typeof storedInvoices.$inferSelect
type AuditRow = typeof auditEvents.$inferSelect
export type Tx = PgTransaction<PgQueryResultHKT, typeof schema>

export function txStore(conn: Tx) {
  return serviceValue({
    async enqueuePending(_ctx: Lite.ExecutionContext, invoices: readonly Invoice[], clock: Clock): Promise<readonly string[]> {
      const rows = invoices.map((invoice) => ({
        id: invoice.id,
        invoice,
        enqueuedAt: clock.now(),
      }))
      const inserted = rows.length === 0
        ? []
        : await conn.insert(pendingInvoices).values(rows).onConflictDoNothing().returning({ id: pendingInvoices.id })
      const ids = inserted.map((row) => row.id)
      await conn.insert(auditEvents).values({
        action: "enqueued",
        entityId: "pending",
        occurredAt: clock.now(),
        payload: { count: ids.length, ids },
      })
      return ids
    },
    async settleImport(_ctx: Lite.ExecutionContext, input: SaveInvoiceInput, importedAt: Date): Promise<StoredInvoice> {
      const claimed = await conn.delete(pendingInvoices).where(eq(pendingInvoices.id, input.invoice.id)).returning({ id: pendingInvoices.id })
      if (claimed.length === 0) {
        const existing = await conn.select().from(storedInvoices).where(eq(storedInvoices.id, input.invoice.id))
        if (existing[0] !== undefined) return storedFromRow(existing[0])
      }
      const rows = await conn.insert(storedInvoices).values({
        id: input.invoice.id,
        invoice: input.invoice,
        classification: input.classification,
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
      await conn.insert(auditEvents).values({
        action: "imported",
        entityId: input.invoice.id,
        occurredAt: importedAt,
        payload: {
          risk: input.classification.risk,
          category: input.classification.category,
        },
      })
      return storedFromRow(rows[0]!)
    },
    async claimReminder(_ctx: Lite.ExecutionContext, invoiceId: string, remindedAt: Date): Promise<StoredInvoice | undefined> {
      const [row] = await conn.update(storedInvoices)
        .set({ remindedAt })
        .where(and(eq(storedInvoices.id, invoiceId), isNull(storedInvoices.remindedAt)))
        .returning()
      if (row === undefined) return undefined
      await conn.insert(auditEvents).values({
        action: "reminded",
        entityId: row.id,
        occurredAt: remindedAt,
        payload: { dueDate: row.classification.dueDate },
      })
      return storedFromRow(row)
    },
    async releaseReminder(_ctx: Lite.ExecutionContext, invoiceId: string, failedAt: Date): Promise<void> {
      const [row] = await conn.update(storedInvoices)
        .set({ remindedAt: null })
        .where(and(eq(storedInvoices.id, invoiceId), isNotNull(storedInvoices.remindedAt)))
        .returning({
          id: storedInvoices.id,
          classification: storedInvoices.classification,
        })
      if (row === undefined) return
      await conn.insert(auditEvents).values({
        action: "reminder_failed",
        entityId: row.id,
        occurredAt: failedAt,
        payload: { dueDate: row.classification.dueDate },
      })
    },
    async listPending(): Promise<readonly Invoice[]> {
      const rows = await conn.select().from(pendingInvoices).orderBy(asc(pendingInvoices.enqueuedAt), asc(pendingInvoices.id))
      return rows.map((row) => row.invoice)
    },
    async listStored(): Promise<readonly StoredInvoice[]> {
      const rows = await conn.select().from(storedInvoices).orderBy(asc(storedInvoices.importedAt), asc(storedInvoices.id))
      return rows.map(storedFromRow)
    },
    async reviewCount(): Promise<number> {
      const [row] = await conn.select({ value: count() }).from(storedInvoices)
        .where(sql`${storedInvoices.classification}->>'risk' = 'review'`)
      return row?.value ?? 0
    },
    async listAudit(): Promise<readonly AuditEvent[]> {
      const rows = await conn.select().from(auditEvents).orderBy(asc(auditEvents.sequence))
      return rows.map(auditFromRow)
    },
  })
}

export const tx = tag<ReturnType<typeof txStore>>({
  label: "invoice.tx",
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

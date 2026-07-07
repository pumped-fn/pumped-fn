import { jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core"
import type { Classification, Invoice } from "./types"

export const pendingInvoices = pgTable("invoice_pending", {
  id: text("id").primaryKey(),
  invoice: jsonb("invoice").$type<Invoice>().notNull(),
  enqueuedAt: timestamp("enqueued_at", { withTimezone: true }).notNull(),
})

export const storedInvoices = pgTable("invoice_stored", {
  id: text("id").primaryKey(),
  invoice: jsonb("invoice").$type<Invoice>().notNull(),
  classification: jsonb("classification").$type<Classification>().notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull(),
  remindedAt: timestamp("reminded_at", { withTimezone: true }),
})

export const auditEvents = pgTable("invoice_audit", {
  sequence: serial("sequence").primaryKey(),
  action: text("action").notNull(),
  entityId: text("entity_id").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
})

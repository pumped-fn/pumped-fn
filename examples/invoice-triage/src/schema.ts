import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core"
import type { AuditAction } from "./audit"
import type { Classification, Invoice } from "./types"

export const schemaMigrations = pgTable("invoice_schema_migrations", {
  version: integer("version").primaryKey(),
  name: text("name").notNull(),
  checksum: text("checksum").notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull(),
})

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
  action: text("action").$type<AuditAction>().notNull(),
  entityId: text("entity_id").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
})

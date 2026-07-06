import { z } from "zod"

export const category = z.enum(["utilities", "saas", "hardware", "other"])

export const categories = category.options

export const risk = z.enum(["auto-approve", "review"])

export const invoice = z.object({
  id: z.string(),
  vendor: z.string(),
  amount: z.number(),
  dueDate: z.string(),
  description: z.string(),
})

export const classification = z.object({
  vendor: z.string(),
  amount: z.number(),
  dueDate: z.string(),
  category,
  risk,
  reason: z.string(),
})

const lineInvoices = z.string().transform((line, ctx): unknown => {
  const trimmed = line.trim()
  if (trimmed === "") return []
  try {
    return [JSON.parse(trimmed)]
  } catch {
    ctx.addIssue({ code: "custom", message: "Expected invoice JSON line" })
    return z.NEVER
  }
}).pipe(z.array(invoice))

const lineValue = z.union([
  lineInvoices,
  invoice.transform((item) => [item]),
])

export const enqueueInput = z.union([
  lineInvoices,
  z.object({ lines: z.array(lineValue) }).transform(({ lines }) => lines.flat()),
  z.object({ invoices: z.array(invoice) }).transform(({ invoices }) => invoices),
  z.array(invoice),
  invoice.transform((item) => [item]),
]).transform((invoices) => ({ invoices }))

export type Category = z.infer<typeof category>

export type Risk = z.infer<typeof risk>

export type Invoice = z.infer<typeof invoice>

export type Classification = z.infer<typeof classification>

export type EnqueueInput = z.infer<typeof enqueueInput>

export interface StoredInvoice extends Invoice {
  classification: Classification
  importedAt: string
  remindedAt?: string
}

export interface DailyReport {
  total: number
  byCategory: Record<Category, number>
  overdue: readonly string[]
}

export interface ReminderMessage {
  invoiceId: string
  vendor: string
  dueDate: string
  amount: number
  to: string
  subject: string
  body: string
}

export interface ReminderResult {
  invoiceId: string
  sent: boolean
}

export interface ReminderSummary {
  sent: number
  invoiceIds: readonly string[]
}

export interface ImportSummary {
  imported: number
  review: readonly string[]
}

export interface EnqueueSummary {
  accepted: number
}

export interface IntakeSummary {
  accepted: number
  rejected: number
}

export type TriageProgress =
  | {
      invoiceId: string
      step: "model:request"
    }
  | {
      invoiceId: string
      step: "model:classification"
      risk: Risk
      reason: string
    }

export type ImportProgress =
  | TriageProgress
  | {
      invoiceId: string
      done: number
      total: number
      risk: Risk
    }

export interface SaveInvoiceInput {
  invoice: Invoice
  classification: Classification
}

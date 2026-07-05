export type Category = "utilities" | "saas" | "hardware" | "other"
export type Risk = "auto-approve" | "review"

export interface Invoice {
  id: string
  vendor: string
  amount: number
  dueDate: string
  description: string
}

export interface Classification {
  vendor: string
  amount: number
  dueDate: string
  category: Category
  risk: Risk
  reason: string
}

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

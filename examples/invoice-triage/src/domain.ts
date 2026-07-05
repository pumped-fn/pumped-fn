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

export interface InvoiceStore {
  invoices: readonly StoredInvoice[]
  pending: readonly Invoice[]
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

const categories = ["utilities", "saas", "hardware", "other"] as const

const risks = ["auto-approve", "review"] as const

const msPerDay = 86_400_000

export function emptyStore(): InvoiceStore {
  return { invoices: [], pending: [] }
}

export function classificationPrompt(invoice: Invoice): string {
  return [
    "Return JSON only with vendor, amount, dueDate, category, risk, and reason.",
    "category must be utilities, saas, hardware, or other.",
    "risk must be auto-approve or review.",
    `Invoice: ${JSON.stringify(invoice)}`,
  ].join("\n")
}

export function parseClassification(output: string, invoice: Invoice): Classification {
  const parsed = parseJson(output)
  if (!isRecord(parsed)) return unparseable(invoice)
  const category = parseCategory(parsed["category"])
  const risk = parseRisk(parsed["risk"])
  if (
    typeof parsed["vendor"] !== "string" ||
    typeof parsed["amount"] !== "number" ||
    typeof parsed["dueDate"] !== "string" ||
    typeof parsed["reason"] !== "string" ||
    category === undefined ||
    risk === undefined
  ) return unparseable(invoice)
  return {
    vendor: parsed["vendor"],
    amount: parsed["amount"],
    dueDate: parsed["dueDate"],
    category,
    risk,
    reason: parsed["reason"],
  }
}

export function classifyHeuristically(invoice: Invoice): Classification {
  const description = `${invoice.vendor} ${invoice.description}`.toLowerCase()
  const category = description.includes("electric") || description.includes("water") || description.includes("utility")
    ? "utilities"
    : description.includes("license") || description.includes("subscription") || description.includes("saas")
    ? "saas"
    : description.includes("laptop") || description.includes("server") || description.includes("hardware")
    ? "hardware"
    : "other"
  const risk = invoice.amount <= 1_000 && category !== "hardware" ? "auto-approve" : "review"
  return {
    vendor: invoice.vendor,
    amount: invoice.amount,
    dueDate: invoice.dueDate,
    category,
    risk,
    reason: risk === "auto-approve" ? "within automatic approval policy" : "amount or category requires review",
  }
}

export function upsertInvoice(
  state: InvoiceStore,
  invoice: Invoice,
  classification: Classification,
  importedAt: string
): InvoiceStore {
  const found = state.invoices.find((item) => item.id === invoice.id)
  const stored: StoredInvoice = {
    ...invoice,
    classification,
    importedAt,
    remindedAt: found?.remindedAt,
  }
  return {
    ...state,
    invoices: found
      ? state.invoices.map((item) => item.id === invoice.id ? stored : item)
      : [...state.invoices, stored],
  }
}

export function enqueueInvoices(state: InvoiceStore, invoices: readonly Invoice[]): InvoiceStore {
  return { ...state, pending: [...state.pending, ...invoices] }
}

export function takePending(state: InvoiceStore): {
  invoices: readonly Invoice[]
  state: InvoiceStore
} {
  return {
    invoices: state.pending,
    state: { ...state, pending: [] },
  }
}

export function pendingIds(state: InvoiceStore): string[] {
  return state.pending.map((invoice) => invoice.id)
}

export function markReminded(state: InvoiceStore, invoiceId: string, remindedAt: string): InvoiceStore {
  return {
    ...state,
    invoices: state.invoices.map((invoice) =>
      invoice.id === invoiceId ? { ...invoice, remindedAt } : invoice
    ),
  }
}

export function findInvoice(state: InvoiceStore, invoiceId: string): StoredInvoice | undefined {
  return state.invoices.find((invoice) => invoice.id === invoiceId)
}

export function reviewIds(state: InvoiceStore): string[] {
  return state.invoices
    .filter((invoice) => invoice.classification.risk === "review")
    .map((invoice) => invoice.id)
}

export function reviewCount(state: InvoiceStore): number {
  return reviewIds(state).length
}

export function dueForReminder(state: InvoiceStore, now: Date, windowDays: number): StoredInvoice[] {
  const start = utcDay(now)
  const end = start + windowDays * msPerDay
  return state.invoices.filter((invoice) => {
    const due = utcDay(invoice.dueDate)
    return invoice.remindedAt === undefined && due >= start && due <= end
  })
}

export function dailySummary(state: InvoiceStore, now: Date): DailyReport {
  const byCategory = {
    utilities: 0,
    saas: 0,
    hardware: 0,
    other: 0,
  }
  for (const invoice of state.invoices) byCategory[invoice.classification.category] += 1
  const today = utcDay(now)
  return {
    total: state.invoices.length,
    byCategory,
    overdue: state.invoices
      .filter((invoice) => utcDay(invoice.dueDate) < today)
      .map((invoice) => invoice.id),
  }
}

export function reminderMessage(invoice: StoredInvoice): ReminderMessage {
  return {
    invoiceId: invoice.id,
    vendor: invoice.classification.vendor,
    dueDate: invoice.classification.dueDate,
    amount: invoice.classification.amount,
    to: "ap@company.local",
    subject: `Invoice ${invoice.id} due ${invoice.classification.dueDate}`,
    body: `${invoice.classification.vendor} invoice ${invoice.id} for ${invoice.classification.amount} is due ${invoice.classification.dueDate}.`,
  }
}

function parseJson(output: string): unknown {
  try {
    return JSON.parse(output)
  } catch {
    return undefined
  }
}

function unparseable(invoice: Invoice): Classification {
  return {
    vendor: invoice.vendor,
    amount: invoice.amount,
    dueDate: invoice.dueDate,
    category: "other",
    risk: "review",
    reason: "unparseable",
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseCategory(value: unknown): Category | undefined {
  return categories.find((category) => category === value)
}

function parseRisk(value: unknown): Risk | undefined {
  return risks.find((risk) => risk === value)
}

function utcDay(value: string | Date): number {
  const date = typeof value === "string" ? new Date(`${value}T00:00:00.000Z`) : value
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

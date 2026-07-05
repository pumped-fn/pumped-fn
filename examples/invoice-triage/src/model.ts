import type { Category, Classification, Invoice, Risk } from "./types"

const categories = ["utilities", "saas", "hardware", "other"] as const

const risks = ["auto-approve", "review"] as const

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

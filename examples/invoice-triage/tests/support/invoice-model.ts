import type { Model } from "@pumped-fn/sdk"
import type { Classification, Invoice } from "../../src/invoice-types"

export const heuristic: Model = Object.freeze({
  complete: (_ctx: Parameters<Model["complete"]>[0], request: Parameters<Model["complete"]>[1]) => {
    const message = request.messages.at(-1)?.content ?? ""
    const marker = "Invoice: "
    const index = message.indexOf(marker)
    const invoice = JSON.parse(message.slice(index + marker.length)) as Invoice
    return {
      content: JSON.stringify(classifyHeuristically(invoice)),
      stop: true,
    }
  },
})

function classifyHeuristically(invoice: Invoice): Classification {
  const description = `${invoice.vendor} ${invoice.description}`.toLowerCase()
  const category: Classification["category"] = description.includes("electric") || description.includes("water") || description.includes("utility")
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

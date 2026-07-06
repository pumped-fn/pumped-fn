import { z } from "zod"
import type { Model } from "@pumped-fn/sdk"
import { categories, classification, type Classification, type Invoice } from "./invoice-types"

const classificationOutput = z.string().transform((output, ctx): unknown => {
  try {
    return JSON.parse(output)
  } catch {
    ctx.addIssue({ code: "custom", message: "Expected classification JSON" })
    return z.NEVER
  }
}).pipe(classification)

export function classificationPrompt(invoice: Invoice): string {
  return [
    "Return JSON only with vendor, amount, dueDate, category, risk, and reason.",
    `category must be ${categories.join(", ")}.`,
    "risk must be auto-approve or review.",
    `Invoice: ${JSON.stringify(invoice)}`,
  ].join("\n")
}

export function classifyRequest(invoice: Invoice): Parameters<Model["complete"]>[1] {
  return {
    agentName: "invoice-triage",
    instructions: "Classify invoices for accounts-payable automation.",
    messages: [{ role: "user", content: classificationPrompt(invoice) }],
    tools: [],
    skills: [],
    loadedSkills: [],
    subagents: [],
    round: 0,
  }
}

export function parseClassification(output: string, invoice: Invoice): Classification {
  const parsed = classificationOutput.safeParse(output)
  if (!parsed.success) return unparseable(invoice)
  return parsed.data
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

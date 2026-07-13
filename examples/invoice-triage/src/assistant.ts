import { currentAgent, currentTool, turn } from "@pumped-fn/sdk"
import { z } from "zod"
import { findStored } from "./store"

export const findInvoice = currentTool({
  description: "Find a stored invoice by invoice ID.",
  inputSchema: z.object({ invoiceId: z.string().min(1) }),
  flow: findStored,
})

export const invoiceAssistant = currentAgent({
  name: "invoice-assistant",
  instructions: "Use the available invoice tools. Do not invent invoice data.",
  tools: { findInvoice },
})

export const askInvoice = turn({ agent: invoiceAssistant })

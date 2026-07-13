import { createScope, preset } from "@pumped-fn/lite"
import { model, validation } from "@pumped-fn/sdk"
import { modelStub } from "@pumped-fn/sdk-test"
import { expect, it } from "vitest"
import { z } from "zod"
import { askInvoice } from "../src/assistant"
import { database } from "../src/database"
import { clock } from "../src/ports"
import { saveInvoice } from "../src/store"
import { pgliteDatabase } from "./support/database"

const now = new Date("2026-07-13T00:00:00.000Z")

it("runs a Zod-validated managed invoice tool through the injected model", async () => {
  const provider = modelStub((request) => request.round === 0
    ? {
        content: "Looking up the invoice.",
        toolCalls: [{ name: "invoice.findStored", input: { invoiceId: "inv-42" } }],
      }
    : { content: request.messages.at(-1)?.content ?? "missing", stop: true })
  const scope = createScope({
    presets: [preset(database, await pgliteDatabase())],
    tags: [
      clock({ now: () => now }),
      model(provider),
      validation.engine(validation.standard<z.ZodType>((schema) => z.toJSONSchema(schema))),
    ],
  })
  const ctx = scope.createContext()

  await ctx.exec({
    flow: saveInvoice,
    input: {
      invoice: {
        id: "inv-42",
        vendor: "Acme SaaS",
        amount: 240,
        dueDate: "2026-07-20",
        description: "Team subscription",
      },
      classification: {
        vendor: "Acme SaaS",
        amount: 240,
        dueDate: "2026-07-20",
        category: "saas",
        risk: "auto-approve",
        reason: "Within policy",
      },
    },
  })
  const result = await ctx.exec({ flow: askInvoice, input: { prompt: "Find inv-42." } })

  expect(result.toolResults).toMatchObject([{ name: "invoice.findStored", output: { id: "inv-42" } }])
  expect(result.content).toContain("inv-42")
  await ctx.close()
  await scope.dispose()
})

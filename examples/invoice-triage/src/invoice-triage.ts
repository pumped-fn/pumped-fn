import { controller, flow, tags, typed } from "@pumped-fn/lite"
import { model, step } from "@pumped-fn/sdk"
import { classifyRequest, parseClassification } from "./invoice-model"
import { clock, database } from "./invoice-runtime"
import type {
  Classification,
  ImportProgress,
  ImportSummary,
  Invoice,
  SaveInvoiceInput,
  StoredInvoice,
  TriageProgress,
} from "./invoice-types"

export const classify = flow({
  name: "invoice.classify",
  parse: typed<Invoice>(),
  deps: { model: tags.required(model) },
  tags: [step({ workflow: true, kind: "llm" })],
  factory: async (ctx, { model }): Promise<Classification> => {
    const request = classifyRequest(ctx.input)
    const response = await ctx.exec({ fn: model.complete, params: [request], name: "invoice.model.complete" })
    return parseClassification(response.content, ctx.input)
  },
})

export const saveInvoice = flow({
  name: "invoice.save",
  parse: typed<SaveInvoiceInput>(),
  deps: {
    database,
    clock: tags.required(clock),
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: (ctx, { database, clock }): Promise<StoredInvoice> =>
    database.saveInvoice({ ...ctx.input, importedAt: clock.now().toISOString() }),
})

export const triage = flow({
  name: "invoice.triage",
  parse: typed<Invoice>(),
  deps: { classify: controller(classify) },
  factory: async function* (ctx, { classify }): AsyncGenerator<TriageProgress, Classification, unknown> {
    yield { invoiceId: ctx.input.id, step: "model:request" }
    const classification = await classify.exec({ input: ctx.input })
    yield {
      invoiceId: ctx.input.id,
      step: "model:classification",
      risk: classification.risk,
      reason: classification.reason,
    }
    return classification
  },
})

export const importBatch = flow({
  name: "invoice.importBatch",
  parse: typed<{ invoices: readonly Invoice[] }>(),
  deps: {
    triage: controller(triage),
    saveInvoice: controller(saveInvoice),
  },
  factory: async function* (ctx, { triage, saveInvoice }): AsyncGenerator<ImportProgress, ImportSummary, unknown> {
    const review: string[] = []
    let imported = 0
    for (const invoice of ctx.input.invoices) {
      const stream = triage.execStream({ input: invoice })
      yield* stream
      const classification = await stream.result
      await saveInvoice.exec({ input: { invoice, classification } })
      imported += 1
      if (classification.risk === "review") review.push(invoice.id)
      yield {
        invoiceId: invoice.id,
        done: imported,
        total: ctx.input.invoices.length,
        risk: classification.risk,
      }
    }
    return { imported, review }
  },
})

import { controller, flow, tags, typed, type Lite } from "@pumped-fn/lite"
import { scheduler, type Scheduler } from "@pumped-fn/lite-extension-scheduler"
import { model, step } from "@pumped-fn/sdk"
import {
  classificationPrompt,
  dailySummary,
  dueForReminder,
  enqueueInvoices,
  findInvoice,
  markReminded,
  pendingIds,
  parseClassification,
  reminderMessage,
  reviewIds,
  takePending,
  upsertInvoice,
  type Classification,
  type DailyReport,
  type ImportProgress,
  type ImportSummary,
  type Invoice,
  type ReminderResult,
  type ReminderSummary,
  type SaveInvoiceInput,
  type TriageProgress,
} from "./domain"
import { clock, mailer, reminderCron, reminderWindowDays, reportCron, store } from "./ports"

export const classify = flow({
  name: "invoice.classify",
  parse: typed<Invoice>(),
  deps: { model: tags.required(model) },
  tags: [step({ workflow: true, kind: "llm" })],
  factory: async (ctx, { model }): Promise<Classification> =>
    parseClassification((await model.complete(ctx, {
      agentName: "invoice-triage",
      instructions: "Classify invoices for accounts-payable automation.",
      messages: [{ role: "user", content: classificationPrompt(ctx.input) }],
      tools: [],
      skills: [],
      loadedSkills: [],
      subagents: [],
      round: 0,
    })).content, ctx.input),
})

export const saveInvoice = flow({
  name: "invoice.save",
  parse: typed<SaveInvoiceInput>(),
  deps: {
    store: controller(store, { resolve: true }),
    clock: tags.required(clock),
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: (ctx, { store, clock }) => {
    const next = upsertInvoice(store.get(), ctx.input.invoice, ctx.input.classification, clock.now().toISOString())
    store.set(next)
    return findInvoice(next, ctx.input.invoice.id)!
  },
})

export const triage = flow({
  name: "invoice.triage",
  parse: typed<Invoice>(),
  factory: async function* (ctx): AsyncGenerator<TriageProgress, Classification, unknown> {
    yield { invoiceId: ctx.input.id, step: "model:request" }
    const classification = await ctx.exec({ flow: classify, input: ctx.input })
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
  factory: async function* (ctx): AsyncGenerator<ImportProgress, ImportSummary, unknown> {
    const review: string[] = []
    let imported = 0
    for (const invoice of ctx.input.invoices) {
      const stream = ctx.execStream({ flow: triage, input: invoice })
      yield* stream
      const classification = await stream.result
      await ctx.exec({ flow: saveInvoice, input: { invoice, classification } })
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

export const enqueue = flow({
  name: "invoice.enqueue",
  parse: typed<{ invoices: readonly Invoice[] }>(),
  deps: {
    store: controller(store, { resolve: true }),
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: (ctx, { store }) => {
    store.update((state) => enqueueInvoices(state, ctx.input.invoices))
  },
})

export const dailyReport = flow({
  name: "invoice.dailyReport",
  deps: {
    store,
    clock: tags.required(clock),
  },
  tags: [step({ workflow: true, kind: "report" })],
  factory: (_ctx, { store, clock }): DailyReport => dailySummary(store, clock.now()),
})

export const sendReminder = flow({
  name: "invoice.sendReminder",
  parse: typed<{ invoiceId: string }>(),
  deps: {
    store: controller(store, { resolve: true }),
    mailer,
    clock: tags.required(clock),
  },
  tags: [step({ workflow: true, kind: "email" })],
  factory: async (ctx, { store, mailer, clock }): Promise<ReminderResult> => {
    const invoice = findInvoice(store.get(), ctx.input.invoiceId)
    if (!invoice || invoice.remindedAt !== undefined) return { invoiceId: ctx.input.invoiceId, sent: false }
    store.set(markReminded(store.get(), invoice.id, clock.now().toISOString()))
    await mailer.send(reminderMessage(invoice))
    return { invoiceId: invoice.id, sent: true }
  },
})

export const sendReminders = flow({
  name: "invoice.sendReminders",
  deps: {
    store,
    clock: tags.required(clock),
    reminderWindowDays: tags.required(reminderWindowDays),
  },
  tags: [step({ workflow: true, kind: "reminders" })],
  factory: async (ctx, { store, clock, reminderWindowDays }): Promise<ReminderSummary> => {
    const sent: string[] = []
    for (const invoice of dueForReminder(store, clock.now(), reminderWindowDays)) {
      const result = await ctx.exec({ flow: sendReminder, input: { invoiceId: invoice.id } })
      if (result.sent) sent.push(result.invoiceId)
    }
    return { sent: sent.length, invoiceIds: sent }
  },
})

export const registerCron = flow({
  name: "invoice.registerCron",
  deps: {
    reportCron: tags.required(reportCron),
    reminderCron: tags.required(reminderCron),
  },
  factory: async (ctx, { reportCron, reminderCron }): Promise<{
    daily: Scheduler.Registration
    reminders: Scheduler.Registration
  }> => ({
    daily: await ctx.resolve(scheduler.schedule({
      name: "invoice.dailyReport",
      cadence: { cron: reportCron },
      overlap: "skip",
      catchUp: "skip",
      flow: dailyReport,
      input: () => undefined,
    })),
    reminders: await ctx.resolve(scheduler.schedule({
      name: "invoice.sendReminders",
      cadence: { cron: reminderCron },
      overlap: "queue",
      catchUp: "skip",
      flow: sendReminders,
      input: () => undefined,
    })),
  }),
})

export async function runIngest(scope: Lite.Scope): Promise<void> {
  const control = await scope.controller(store, { resolve: true })
  const pending = scope.select(store, pendingIds, { eq: sameIds })
  for await (const ids of scope.changes(pending)) {
    if (ids.length === 0) continue
    const drained = takePending(control.get())
    if (drained.invoices.length === 0) continue
    control.set(drained.state)
    const ctx = scope.createContext()
    try {
      await ctx.exec({ flow: importBatch, input: { invoices: drained.invoices } })
      await ctx.close({ ok: true })
    } catch (error) {
      await ctx.close({ ok: false, error })
      throw error
    }
  }
  pending.dispose()
}

export async function reviewQueue(scope: Lite.Scope): Promise<Lite.SelectHandle<number>> {
  await scope.resolve(store)
  return scope.select(store, (state) => reviewIds(state).length)
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

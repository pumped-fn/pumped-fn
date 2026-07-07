import { controller, flow, ParseError, tags, typed } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/lite-extension-logging"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"
import { complete, step } from "@pumped-fn/sdk"
import { classifyRequest, parseClassification } from "./model"
import {
  clock,
  drained,
  importing,
  intakeLines,
  ledger,
  mailer,
  queue,
  reminderRecipient,
  reminderWindowDays,
  reviewCount,
} from "./ports"
import {
  categories,
  enqueueInput,
  type Category,
  type Classification,
  type DailyReport,
  type EnqueueInput,
  type EnqueueSummary,
  type ImportProgress,
  type ImportSummary,
  type Invoice,
  type ReminderMessage,
  type ReminderResult,
  type ReminderSummary,
  type SaveInvoiceInput,
  type StoredInvoice,
  type TriageProgress,
} from "./types"

export const classify = flow({
  name: "invoice.classify",
  parse: typed<Invoice>(),
  deps: { complete },
  factory: async (ctx, { complete }): Promise<Classification> => {
    const request = classifyRequest(ctx.input)
    const response = await complete.exec({ input: request })
    return parseClassification(response.content, ctx.input)
  },
})

export const saveInvoice = flow({
  name: "invoice.save",
  parse: typed<SaveInvoiceInput>(),
  deps: {
    ledger: controller(ledger, { resolve: true }),
    clock: tags.required(clock),
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: (ctx, { ledger, clock }): StoredInvoice => {
    let stored: StoredInvoice = {
      ...ctx.input.invoice,
      classification: ctx.input.classification,
      importedAt: clock.now().toISOString(),
    }
    ledger.update((current) => {
      const found = current.find((item) => item.id === ctx.input.invoice.id)
      stored = found?.remindedAt === undefined ? stored : { ...stored, remindedAt: found.remindedAt }
      return found ? current.map((item) => item.id === stored.id ? stored : item) : [...current, stored]
    })
    return stored
  },
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

export const enqueue = flow({
  name: "invoice.enqueue",
  parse: (input): EnqueueInput => enqueueInput.parse(input),
  deps: {
    queue: controller(queue, { resolve: true }),
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: (ctx, { queue }): EnqueueSummary => {
    if (ctx.input.invoices.length > 0) queue.update((pending) => [...pending, ...ctx.input.invoices])
    return { accepted: ctx.input.invoices.length }
  },
})

export const ingest = flow({
  name: "invoice.ingest",
  deps: {
    control: controller(queue, { resolve: true }),
    progress: controller(importing, { resolve: true }),
    importBatch: controller(importBatch),
  },
  factory: async (ctx, { control, progress, importBatch }): Promise<void> => {
    for await (const pending of ctx.changes(queue)) {
      if (pending.length === 0) continue
      progress.update((count) => count + 1)
      let batch: readonly Invoice[] = []
      control.update((current) => {
        batch = current
        return []
      })
      try {
        if (batch.length > 0) await importBatch.exec({ input: { invoices: batch } })
      } finally {
        progress.update((count) => count - 1)
      }
    }
  },
})

export const watchReviewQueue = flow({
  name: "invoice.watchReviewQueue",
  deps: {
    logger: logging.logger,
  },
  factory: async (ctx, { logger }): Promise<void> => {
    let last = -1
    for await (const count of ctx.changes(reviewCount)) {
      if (count === last) continue
      last = count
      logger.info("invoice.reviewQueue", { count })
    }
  },
})

export const intake = flow({
  name: "invoice.intake",
  deps: {
    lines: intakeLines,
    enqueue: controller(enqueue),
    logger: logging.logger,
  },
  factory: async (_ctx, { lines, enqueue, logger }): Promise<{ accepted: number; rejected: number }> => {
    let accepted = 0
    let rejected = 0
    for await (const line of lines) {
      try {
        accepted += (await enqueue.exec({ rawInput: line })).accepted
      } catch (err) {
        if (!(err instanceof ParseError)) throw err
        rejected += 1
        logger.warn("invoice.intake.rejected", { line })
      }
    }
    return { accepted, rejected }
  },
})

export const awaitDrained = flow({
  name: "invoice.awaitDrained",
  factory: async (ctx): Promise<void> => {
    for await (const idle of ctx.changes(drained)) {
      if (idle) return
    }
  },
})

const msPerDay = 86_400_000

function utcDay(value: string | Date): number {
  const date = typeof value === "string" ? new Date(`${value}T00:00:00.000Z`) : value
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function categoryCounts(): Record<Category, number> {
  return Object.fromEntries(categories.map((category) => [category, 0])) as Record<Category, number>
}

export const dailyReport = flow({
  name: "invoice.dailyReport",
  deps: {
    ledger,
    clock: tags.required(clock),
  },
  tags: [step({ workflow: true, kind: "report" })],
  factory: (_ctx, { ledger, clock }): DailyReport => {
    const byCategory = categoryCounts()
    for (const invoice of ledger) byCategory[invoice.classification.category] += 1
    const today = utcDay(clock.now())
    return {
      total: ledger.length,
      byCategory,
      overdue: ledger
        .filter((invoice) => utcDay(invoice.dueDate) < today)
        .map((invoice) => invoice.id),
    }
  },
})

export const sendReminder = flow({
  name: "invoice.sendReminder",
  parse: typed<{ invoiceId: string }>(),
  deps: {
    ledger: controller(ledger, { resolve: true }),
    mailer,
    clock: tags.required(clock),
    reminderRecipient: tags.required(reminderRecipient),
  },
  tags: [step({ workflow: true, kind: "email" })],
  factory: async (ctx, { ledger, mailer, clock, reminderRecipient }): Promise<ReminderResult> => {
    let message: ReminderMessage | undefined
    ledger.update((current) => {
      const invoice = current.find((item) => item.id === ctx.input.invoiceId)
      if (invoice === undefined || invoice.remindedAt !== undefined) return current
      message = {
        invoiceId: invoice.id,
        vendor: invoice.classification.vendor,
        dueDate: invoice.classification.dueDate,
        amount: invoice.classification.amount,
        to: reminderRecipient,
        subject: `Invoice ${invoice.id} due ${invoice.classification.dueDate}`,
        body: `${invoice.classification.vendor} invoice ${invoice.id} for ${invoice.classification.amount} is due ${invoice.classification.dueDate}.`,
      }
      return current.map((item) =>
        item.id === invoice.id ? { ...item, remindedAt: clock.now().toISOString() } : item
      )
    })
    if (message === undefined) return { invoiceId: ctx.input.invoiceId, sent: false }
    await mailer.send(message)
    return { invoiceId: message.invoiceId, sent: true }
  },
})

export const sendReminders = flow({
  name: "invoice.sendReminders",
  deps: {
    ledger,
    clock: tags.required(clock),
    reminderWindowDays: tags.required(reminderWindowDays),
    sendReminder: controller(sendReminder),
  },
  tags: [step({ workflow: true, kind: "reminders" })],
  factory: async (_ctx, { ledger, clock, reminderWindowDays, sendReminder }): Promise<ReminderSummary> => {
    const sent: string[] = []
    const start = utcDay(clock.now())
    const end = start + reminderWindowDays * msPerDay
    for (const invoice of ledger) {
      const due = utcDay(invoice.dueDate)
      if (invoice.remindedAt !== undefined || due < start || due > end) continue
      const result = await sendReminder.exec({ input: { invoiceId: invoice.id } })
      if (result.sent) sent.push(result.invoiceId)
    }
    return { sent: sent.length, invoiceIds: sent }
  },
})

export const dailyReportJob = scheduler.schedule({
  name: "invoice.dailyReport",
  cadence: { cron: "0 8 * * *" },
  overlap: "skip",
  catchUp: "skip",
  flow: dailyReport,
  input: () => undefined,
})

export const sendRemindersJob = scheduler.schedule({
  name: "invoice.sendReminders",
  cadence: { cron: "0 9 * * *" },
  overlap: "queue",
  catchUp: "skip",
  flow: sendReminders,
  input: () => undefined,
})

import { controller, flow, ParseError, tags, typed } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/lite-extension-logging"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"
import { complete, step } from "@pumped-fn/sdk"
import { classifyRequest, parseClassification } from "./model"
import {
  clock,
  deliver,
  drained,
  importing,
  intakeLines,
  outstanding,
  queueSignal,
  reminderRecipient,
  reminderWindowDays,
  stopping,
  storedSignal,
} from "./ports"
import {
  claimReminder,
  countReviews,
  enqueueRows,
  readAudit,
  readPending,
  readStored,
  releaseReminderClaim,
  settleInvoice,
} from "./store"
import { txBoundary } from "./unit"
import {
  enqueueInput,
  categories,
  type AuditEvent,
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

export const enqueue = flow({
  name: "invoice.enqueue",
  parse: (input): EnqueueInput => enqueueInput.parse(input),
  deps: {
    enqueueRows: controller(enqueueRows),
    outstanding: controller(outstanding, { resolve: true }),
    queueSignal: controller(queueSignal, { resolve: true }),
  },
  factory: async (ctx, { enqueueRows, outstanding, queueSignal }): Promise<EnqueueSummary> => {
    const summary = await enqueueRows.exec({ input: ctx.input })
    if (summary.accepted > 0) {
      outstanding.update((value) => value + summary.accepted)
      queueSignal.update((value) => value + 1)
    }
    return summary
  },
})

export const saveInvoice = flow({
  name: "invoice.save",
  parse: typed<SaveInvoiceInput>(),
  deps: {
    settleInvoice: controller(settleInvoice),
    storedSignal: controller(storedSignal, { resolve: true }),
  },
  factory: async (ctx, { settleInvoice, storedSignal }): Promise<StoredInvoice> => {
    const row = await settleInvoice.exec({ input: ctx.input })
    storedSignal.update((value) => value + 1)
    return row
  },
})

export const listStored = flow({
  name: "invoice.listStored",
  deps: {
    readStored: controller(readStored),
  },
  factory: (_ctx, { readStored }): Promise<readonly StoredInvoice[]> => readStored.exec(),
})

export const listPending = flow({
  name: "invoice.listPending",
  deps: {
    readPending: controller(readPending),
  },
  factory: (_ctx, { readPending }): Promise<readonly Invoice[]> => readPending.exec(),
})

export const reviewCount = flow({
  name: "invoice.reviewCount",
  deps: {
    countReviews: controller(countReviews),
  },
  factory: (_ctx, { countReviews }): Promise<number> => countReviews.exec(),
})

export const listAudit = flow({
  name: "invoice.listAudit",
  deps: {
    readAudit: controller(readAudit),
  },
  factory: (_ctx, { readAudit }): Promise<readonly AuditEvent[]> => readAudit.exec(),
})

export const markReminderSent = flow({
  name: "invoice.markReminderSent",
  parse: typed<{ invoiceId: string }>(),
  deps: {
    claimReminder: controller(claimReminder),
  },
  factory: (ctx, { claimReminder }): Promise<StoredInvoice | undefined> => claimReminder.exec({ input: ctx.input }),
})

export const releaseReminder = flow({
  name: "invoice.releaseReminder",
  parse: typed<{ invoiceId: string }>(),
  deps: {
    releaseReminderClaim: controller(releaseReminderClaim),
  },
  factory: (ctx, { releaseReminderClaim }): Promise<void> => releaseReminderClaim.exec({ input: ctx.input }),
})

export const importBatch = flow({
  name: "invoice.importBatch",
  parse: typed<{ invoices: readonly Invoice[] }>(),
  deps: {
    unit: txBoundary,
    triage: controller(triage),
    settleInvoice: controller(settleInvoice),
  },
  factory: async function* (ctx, { triage, settleInvoice }): AsyncGenerator<ImportProgress, ImportSummary, unknown> {
    const review: string[] = []
    let imported = 0
    for (const invoice of ctx.input.invoices) {
      const stream = triage.execStream({ input: invoice })
      yield* stream
      const classification = await stream.result
      await settleInvoice.exec({ input: { invoice, classification } })
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

export const ingest = flow({
  name: "invoice.ingest",
  deps: {
    outstanding: controller(outstanding, { resolve: true }),
    importing: controller(importing, { resolve: true }),
    stopping: controller(stopping, { resolve: true }),
    listPending: controller(listPending),
    importBatch: controller(importBatch),
    storedSignal: controller(storedSignal, { resolve: true }),
  },
  factory: async (ctx, { outstanding, importing, stopping, listPending, importBatch, storedSignal }): Promise<void> => {
    for await (const _signal of ctx.changes(queueSignal)) {
      if (stopping.get()) return
      const batch = await listPending.exec()
      if (batch.length === 0) continue
      importing.update((count) => count + 1)
      try {
        await importBatch.exec({ input: { invoices: batch } })
        storedSignal.update((value) => value + 1)
      } finally {
        importing.update((count) => count - 1)
        outstanding.update((count) => Math.max(0, count - batch.length))
      }
    }
  },
})

export const watchReviewQueue = flow({
  name: "invoice.watchReviewQueue",
  deps: {
    stopping: controller(stopping, { resolve: true }),
    reviewCount: controller(reviewCount),
    logger: logging.logger,
  },
  factory: async (ctx, { stopping, reviewCount, logger }): Promise<void> => {
    let last = -1
    for await (const _signal of ctx.changes(storedSignal)) {
      if (stopping.get()) return
      const count = await reviewCount.exec()
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

export const stop = flow({
  name: "invoice.stop",
  deps: {
    stopping: controller(stopping, { resolve: true }),
    queueSignal: controller(queueSignal, { resolve: true }),
    storedSignal: controller(storedSignal, { resolve: true }),
  },
  factory: (_ctx, { stopping, queueSignal, storedSignal }): void => {
    stopping.update(() => true)
    queueSignal.update((value) => value + 1)
    storedSignal.update((value) => value + 1)
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
    listStored: controller(listStored),
    clock: tags.required(clock),
  },
  tags: [step({ workflow: true, kind: "report" })],
  factory: async (_ctx, { listStored, clock }): Promise<DailyReport> => {
    const byCategory = categoryCounts()
    const stored = await listStored.exec()
    for (const invoice of stored) byCategory[invoice.classification.category] += 1
    const today = utcDay(clock.now())
    return {
      total: stored.length,
      byCategory,
      overdue: stored
        .filter((invoice) => utcDay(invoice.dueDate) < today)
        .map((invoice) => invoice.id),
    }
  },
})

export const sendReminder = flow({
  name: "invoice.sendReminder",
  parse: typed<{ invoiceId: string }>(),
  deps: {
    markReminderSent: controller(markReminderSent),
    releaseReminder: controller(releaseReminder),
    deliver: controller(deliver),
    reminderRecipient: tags.required(reminderRecipient),
  },
  factory: async (ctx, { markReminderSent, releaseReminder, deliver, reminderRecipient }): Promise<ReminderResult> => {
    const invoice = await markReminderSent.exec({ input: { invoiceId: ctx.input.invoiceId } })
    if (invoice === undefined) return { invoiceId: ctx.input.invoiceId, sent: false }
    const message: ReminderMessage = {
      invoiceId: invoice.id,
      vendor: invoice.classification.vendor,
      dueDate: invoice.classification.dueDate,
      amount: invoice.classification.amount,
      to: reminderRecipient,
      subject: `Invoice ${invoice.id} due ${invoice.classification.dueDate}`,
      body: `${invoice.classification.vendor} invoice ${invoice.id} for ${invoice.classification.amount} is due ${invoice.classification.dueDate}.`,
    }
    try {
      return await deliver.exec({ input: message })
    } catch (error) {
      await releaseReminder.exec({ input: { invoiceId: invoice.id } })
      throw error
    }
  },
})

export const sendReminders = flow({
  name: "invoice.sendReminders",
  deps: {
    listStored: controller(listStored),
    clock: tags.required(clock),
    reminderWindowDays: tags.required(reminderWindowDays),
    sendReminder: controller(sendReminder),
  },
  tags: [step({ workflow: true, kind: "reminders" })],
  factory: async (_ctx, { listStored, clock, reminderWindowDays, sendReminder }): Promise<ReminderSummary> => {
    const sent: string[] = []
    const start = utcDay(clock.now())
    const end = start + reminderWindowDays * msPerDay
    for (const invoice of await listStored.exec()) {
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

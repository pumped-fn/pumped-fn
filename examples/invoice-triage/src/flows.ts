import { controller, flow, ParseError, tags, typed } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/lite-extension-logging"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"
import { model, step } from "@pumped-fn/sdk"
import { OperationalFault } from "./errors"
import { classifyRequest, parseClassification } from "./model"
import {
  clock,
  database,
  databaseStartup,
  intakeLines,
  mailer,
  reminderRecipient,
  reminderWindowDays,
} from "./ports"
import type { DatabaseMigrationReport, DatabaseMigrationStatus } from "./migrations"
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

export const migrateDatabase = flow({
  name: "invoice.database.migrate",
  deps: {
    database,
    clock: tags.required(clock),
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: async (_ctx, { database, clock }): Promise<DatabaseMigrationReport> =>
    database.migrate(clock.now().toISOString()),
})

export const verifyDatabase = flow({
  name: "invoice.database.verify",
  deps: {
    database,
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: async (_ctx, { database }): Promise<DatabaseMigrationStatus> => {
    const status = await database.migrationStatus()
    if (status.drift.length > 0 || status.pending.length > 0) {
      throw new OperationalFault("database-schema-not-current", "verify", "invoice_schema_migrations", {
        currentVersion: status.currentVersion,
        targetVersion: status.targetVersion,
        pending: status.pending.map((item) => item.version),
        drift: status.drift.map((item) => item.version),
      })
    }
    return status
  },
})

export const prepareDatabase = flow({
  name: "invoice.database.prepare",
  deps: {
    startup: tags.optional(databaseStartup),
    migrate: controller(migrateDatabase),
    verify: controller(verifyDatabase),
  },
  factory: async (_ctx, { startup, migrate, verify }): Promise<DatabaseMigrationReport | undefined> => {
    if (startup === "migrate") return migrate.exec()
    if (startup === "verify") return { ...await verify.exec(), appliedNow: [] }
    return undefined
  },
})

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

export const enqueue = flow({
  name: "invoice.enqueue",
  parse: (input): EnqueueInput => enqueueInput.parse(input),
  deps: {
    database,
    clock: tags.required(clock),
  },
  tags: [step({ workflow: true, kind: "store" })],
  factory: async (ctx, { database, clock }): Promise<EnqueueSummary> => ({
    accepted: await database.enqueue(ctx.input.invoices, clock.now().toISOString()),
  }),
})

export const ingest = flow({
  name: "invoice.ingest",
  deps: {
    database,
    clock: tags.required(clock),
    importBatch: controller(importBatch),
  },
  factory: async (_ctx, { database, clock, importBatch }): Promise<void> => {
    const drain = async () => {
      const drained = await database.drainPending(clock.now().toISOString())
      if (drained.length > 0) await importBatch.exec({ input: { invoices: drained } })
    }
    await drain()
    for await (const pending of database.watchPending()) {
      if (pending.length === 0) continue
      await drain()
    }
  },
})

export const watchReviewQueue = flow({
  name: "invoice.watchReviewQueue",
  deps: {
    database,
    logger: logging.logger,
  },
  factory: async (_ctx, { database, logger }): Promise<void> => {
    let last = -1
    for await (const count of database.watchReviewCount()) {
      if (count === last) continue
      last = count
      logger.info("invoice.reviewQueue", { count })
    }
  },
})

export const intake = flow({
  name: "invoice.intake",
  deps: {
    lines: tags.required(intakeLines),
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
  deps: {
    database,
  },
  factory: async (_ctx, { database }): Promise<void> => {
    if ((await database.listPending()).length === 0) return
    for await (const pending of database.watchPending()) {
      if (pending.length === 0) return
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
    database,
    clock: tags.required(clock),
  },
  tags: [step({ workflow: true, kind: "report" })],
  factory: async (_ctx, { database, clock }): Promise<DailyReport> => {
    const invoices = await database.listStored()
    const byCategory = categoryCounts()
    for (const invoice of invoices) byCategory[invoice.classification.category] += 1
    const today = utcDay(clock.now())
    return {
      total: invoices.length,
      byCategory,
      overdue: invoices
        .filter((invoice) => utcDay(invoice.dueDate) < today)
        .map((invoice) => invoice.id),
    }
  },
})

export const sendReminder = flow({
  name: "invoice.sendReminder",
  parse: typed<{ invoiceId: string }>(),
  deps: {
    database,
    mailer: tags.required(mailer),
    clock: tags.required(clock),
    reminderRecipient: tags.required(reminderRecipient),
  },
  tags: [step({ workflow: true, kind: "email" })],
  factory: async (ctx, { database, mailer, clock, reminderRecipient }): Promise<ReminderResult> => {
    const invoice = await database.markReminderSent(ctx.input.invoiceId, clock.now().toISOString())
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
    await mailer.send(message)
    return { invoiceId: message.invoiceId, sent: true }
  },
})

export const sendReminders = flow({
  name: "invoice.sendReminders",
  deps: {
    database,
    clock: tags.required(clock),
    reminderWindowDays: tags.required(reminderWindowDays),
    sendReminder: controller(sendReminder),
  },
  tags: [step({ workflow: true, kind: "reminders" })],
  factory: async (_ctx, { database, clock, reminderWindowDays, sendReminder }): Promise<ReminderSummary> => {
    const sent: string[] = []
    const start = utcDay(clock.now())
    const end = start + reminderWindowDays * msPerDay
    for (const invoice of await database.listStored()) {
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

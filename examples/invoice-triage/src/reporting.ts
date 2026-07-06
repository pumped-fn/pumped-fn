import { controller, flow, tags, typed } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/lite-extension-logging"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"
import { step } from "@pumped-fn/sdk"
import {
  clock,
  database,
  mailer,
  reminderRecipient,
  reminderWindowDays,
} from "./runtime"
import {
  categories,
  type Category,
  type DailyReport,
  type ReminderMessage,
  type ReminderResult,
  type ReminderSummary,
} from "./types"

const msPerDay = 86_400_000

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

function utcDay(value: string | Date): number {
  const date = typeof value === "string" ? new Date(`${value}T00:00:00.000Z`) : value
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function categoryCounts(): Record<Category, number> {
  return Object.fromEntries(categories.map((category) => [category, 0])) as Record<Category, number>
}

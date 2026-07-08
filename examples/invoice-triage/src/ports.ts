import { atom, controller, flow, tag, tags, typed } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/lite-extension-logging"
import type { Model, ModelRequest } from "@pumped-fn/sdk"
import { step } from "@pumped-fn/sdk"
import { classifyHeuristically } from "./model"
import type { Invoice, ReminderMessage, ReminderResult } from "./types"

export { intakeLines } from "./adapters/stdin"

export interface Clock {
  now(): Date
}

export const clock = tag<Clock>({
  label: "invoice.clock",
  default: { now: () => new Date() },
})

export const reminderWindowDays = tag<number>({
  label: "invoice.reminderWindowDays",
  default: 7,
})

export const reminderRecipient = tag<string>({
  label: "invoice.reminderRecipient",
  default: "ap@company.local",
})

export const requestId = tag<string>({
  label: "invoice.requestId",
})

export const queueSignal = atom({
  keepAlive: true,
  factory: (): number => 0,
})

export const storedSignal = atom({
  keepAlive: true,
  factory: (): number => 0,
})

export const stopping = atom({
  keepAlive: true,
  factory: (): boolean => false,
})

export const importing = atom({
  keepAlive: true,
  factory: (): number => 0,
})

export const outstanding = atom({
  keepAlive: true,
  factory: (): number => 0,
})

export const drained = atom({
  deps: {
    outstanding: controller(outstanding, { resolve: true, watch: true }),
    importing: controller(importing, { resolve: true, watch: true }),
  },
  factory: (_ctx, { outstanding, importing }) => outstanding.get() === 0 && importing.get() === 0,
})

export const heuristic: Model = flow({
  name: "invoice.heuristic",
  parse: typed<ModelRequest>(),
  factory: (ctx) => {
    const message = ctx.input.messages.at(-1)?.content ?? ""
    const marker = "Invoice: "
    const index = message.indexOf(marker)
    const invoice = JSON.parse(message.slice(index + marker.length)) as Invoice
    return {
      content: JSON.stringify(classifyHeuristically(invoice)),
      stop: true,
    }
  },
})

export const logDelivery = flow({
  name: "invoice.logDelivery",
  parse: typed<ReminderMessage>(),
  deps: { logger: logging.logger },
  factory: (ctx, { logger }): ReminderResult => {
    logger.info("invoice.reminder.delivered", {
      invoiceId: ctx.input.invoiceId,
      to: ctx.input.to,
      subject: ctx.input.subject,
    })
    return { invoiceId: ctx.input.invoiceId, sent: true }
  },
})

export const mailer = tag<typeof logDelivery>({
  label: "invoice.mailer",
  default: logDelivery,
})

export const deliver = flow({
  name: "invoice.deliver",
  parse: typed<ReminderMessage>(),
  deps: { impl: tags.required(mailer) },
  tags: [step({ workflow: true, kind: "email" })],
  factory: (ctx, { impl }) => impl.exec({ input: ctx.input }),
})

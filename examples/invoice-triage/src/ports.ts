import { atom, tag, tags } from "@pumped-fn/lite"
import { createInterface, type Interface } from "node:readline"
import type { Model } from "@pumped-fn/sdk"
import { databaseEngine } from "./database"
import { pushFeed, type PushFeed } from "./feed"
import type { DatabaseStartupMode } from "./migrations"
import { classifyHeuristically } from "./model"
import type { Invoice, ReminderMessage } from "./types"

export interface Clock {
  now(): Date
}

export interface Mailer {
  send(message: ReminderMessage): Promise<void>
  sent(): readonly ReminderMessage[]
}

export interface OpsHeartbeat {
  source: string
  checkedAt: string
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

export const databaseStartup = tag<DatabaseStartupMode>({
  label: "invoice.databaseStartup",
})

export { databaseEngine, memoryDatabase, postgresDatabase } from "./database"

export const database = atom({
  keepAlive: true,
  deps: {
    engine: tags.required(databaseEngine),
  },
  factory: (ctx, { engine }) => {
    const opened = engine.open()
    ctx.cleanup(() => opened.close())
    return opened
  },
})

export const intakeLines = atom({
  factory: (ctx): AsyncIterable<string> => {
    const lines = createStdinLines()
    ctx.cleanup(() => lines.close())
    return lines
  },
})

export const opsHeartbeat = atom({
  keepAlive: true,
  factory: (ctx): PushFeed<OpsHeartbeat> => {
    const feed = pushFeed<OpsHeartbeat>()
    ctx.cleanup(() => {
      feed.close()
    })
    return feed
  },
})

export const mailer = atom({
  keepAlive: true,
  factory: memoryMailer,
})

export const heuristic: Model = Object.freeze({
  complete: (_ctx: Parameters<Model["complete"]>[0], request: Parameters<Model["complete"]>[1]) => {
    const message = request.messages.at(-1)?.content ?? ""
    const marker = "Invoice: "
    const index = message.indexOf(marker)
    const invoice = JSON.parse(message.slice(index + marker.length)) as Invoice
    return {
      content: JSON.stringify(classifyHeuristically(invoice)),
      stop: true,
    }
  },
})

function createStdinLines(): Interface {
  return createInterface({ input: process.stdin })
}

export function memoryMailer(): Mailer {
  const messages: ReminderMessage[] = []
  return {
    async send(message) {
      messages.push(message)
    },
    sent() {
      return messages.slice()
    },
  }
}

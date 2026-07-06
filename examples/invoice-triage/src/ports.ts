import { atom, tag, tags } from "@pumped-fn/lite"
import { databaseEngine } from "./database"
import { pushFeed, type PushFeed } from "./feed"
import type { DatabaseStartupMode } from "./migrations"
import type { ReminderMessage } from "./types"

export interface Clock {
  now(): Date
}

export interface Mailer {
  send(message: ReminderMessage): Promise<void>
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

export { databaseEngine, postgresDatabase } from "./database"

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

export const intakeLines = tag<AsyncIterable<string>>({
  label: "invoice.intakeLines",
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

export const mailer = tag<Mailer>({
  label: "invoice.mailer",
})

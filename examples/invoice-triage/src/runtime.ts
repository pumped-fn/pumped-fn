import { atom, tag, tags } from "@pumped-fn/lite"
import { databaseEngine } from "./database"
import type { DatabaseStartupMode } from "./migrations"
import type { ReminderMessage } from "./types"

type HeartbeatPending<T> = {
  resolve(result: IteratorResult<T, undefined>): void
}

interface Heartbeat<T> extends AsyncIterable<T>, AsyncIterator<T, undefined> {
  push(value: T): void
  close(): void
  return(): Promise<IteratorReturnResult<undefined>>
}

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
  factory: (ctx) => {
    const feed = heartbeat<OpsHeartbeat>()
    ctx.cleanup(() => {
      feed.close()
    })
    return feed
  },
})

export const mailer = tag<Mailer>({
  label: "invoice.mailer",
})

function heartbeat<T>(): Heartbeat<T> {
  const values: T[] = []
  let pending: HeartbeatPending<T> | undefined
  let closed = false
  const feed = {
    next(): Promise<IteratorResult<T, undefined>> {
      if (values.length > 0) return Promise.resolve({ done: false, value: values.shift()! })
      if (closed) return Promise.resolve({ done: true, value: undefined })
      return new Promise((resolve) => {
        pending = { resolve }
      })
    },
    push(value: T): void {
      if (closed) throw new Error("Heartbeat is closed")
      if (pending === undefined) {
        values.push(value)
        return
      }
      const current = pending
      pending = undefined
      current.resolve({ done: false, value })
    },
    close(): void {
      closed = true
      const current = pending
      pending = undefined
      current?.resolve({ done: true, value: undefined })
    },
    return(): Promise<IteratorReturnResult<undefined>> {
      feed.close()
      return Promise.resolve({ done: true, value: undefined })
    },
    [Symbol.asyncIterator](): AsyncIterator<T, undefined> {
      return feed
    },
  } satisfies Heartbeat<T>
  return feed
}

import { atom, controller, tag, type Lite } from "@pumped-fn/lite"
import { createInterface } from "node:readline"
import type { Model } from "@pumped-fn/sdk"
import { classifyHeuristically } from "./model"
import type { Invoice, ReminderMessage, StoredInvoice } from "./types"

type Pending<T> = {
  resolve(result: IteratorResult<T, undefined>): void
}

export interface Clock {
  now(): Date
}

export interface Mailer {
  send(message: ReminderMessage): Promise<void>
  sent(): readonly ReminderMessage[]
}

export interface PushFeed<T> extends AsyncIterable<T>, AsyncIterator<T, undefined> {
  push(value: T): void
  close(): void
}

export interface OpsHeartbeat {
  source: string
  checkedAt: string
}

export function pushFeed<T>(): PushFeed<T> {
  const values: T[] = []
  let pending: Pending<T> | undefined
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
      if (closed) throw new Error("Feed is closed")
      if (!pending) {
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
  } as PushFeed<T>
  Object.defineProperty(feed, Symbol.asyncIterator, { value: () => feed })
  return feed
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

export const intakeLines = atom({
  factory: readlineAdapter,
})

export const queue = atom({
  keepAlive: true,
  factory: (): readonly Invoice[] => [],
})

export const ledger = atom({
  keepAlive: true,
  factory: (): readonly StoredInvoice[] => [],
})

export const reviewCount = atom({
  deps: {
    ledger: controller(ledger, { resolve: true, watch: true }),
  },
  factory: (_ctx, { ledger }) => ledger.get().filter((invoice) => invoice.classification.risk === "review").length,
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
  complete: (_ctx: Lite.ExecutionContext, request: Parameters<Model["complete"]>[1]) => {
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

function readlineAdapter(ctx: Lite.ResolveContext): AsyncIterable<string> {
  const lines = createInterface({ input: process.stdin })
  ctx.cleanup(() => lines.close())
  return lines
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

import { atom, tag, tags } from "@pumped-fn/lite"
import type { ReminderMessage, ReminderResult } from "./types"

export interface Notifier {
  send(message: ReminderMessage): Promise<ReminderResult>
}

export function consoleNotifier(): Notifier {
  return {
    async send(message: ReminderMessage): Promise<ReminderResult> {
      console.log(JSON.stringify({ event: "invoice.reminder.delivered", invoiceId: message.invoiceId, to: message.to }))
      return { invoiceId: message.invoiceId, sent: true }
    },
  }
}

export const notifier = tag<Notifier>({ label: "invoice.notifier" })

export const notifierClient = atom({
  deps: { impl: tags.required(notifier) },
  factory: (_ctx, { impl }): Notifier => impl,
})

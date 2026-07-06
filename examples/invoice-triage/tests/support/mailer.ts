import type { Mailer } from "../../src/runtime"
import type { ReminderMessage } from "../../src/types"

export interface MemoryMailer extends Mailer {
  sent(): readonly ReminderMessage[]
}

export function memoryMailer(): MemoryMailer {
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

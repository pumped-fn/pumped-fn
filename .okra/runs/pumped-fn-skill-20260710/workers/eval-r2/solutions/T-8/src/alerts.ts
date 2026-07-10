import { atom, flow, tag, tags, typed } from "@pumped-fn/lite"

export type Alert = {
  severity: "watch" | "warning"
  text: string
  hour: number
}

export type Channel = {
  name: string
  send: (alert: Alert) => Promise<{ delivered: boolean }> | { delivered: boolean }
}

export type QuietHours = {
  startHour: number
  endHour: number
}

export const channel = tag<Channel>({ label: "alerts.channel" })

export const quietHours = tag<QuietHours>({ label: "alerts.quiet-hours" })

const channels = atom({
  deps: { registered: tags.all(channel) },
  factory: (_ctx, { registered }) => registered,
})

export const issueAlert = flow({
  name: "issue-alert",
  parse: typed<Alert>(),
  deps: {
    channels,
    quietHours: tags.optional(quietHours),
  },
  factory: async (ctx, { channels, quietHours }) => {
    const alert = ctx.input
    const suppressed = alert.severity === "watch"
      && quietHours !== undefined
      && quietHours.startHour <= alert.hour
      && alert.hour < quietHours.endHour

    if (suppressed) return { attempted: 0, delivered: 0, suppressed: true }

    const attempts = channels.map((registeredChannel) => ctx.exec({
      fn: () => registeredChannel.send(alert),
      params: [],
      name: `alert.send.${registeredChannel.name}`,
    }))
    const receipts = await Promise.allSettled(attempts)
    const delivered = receipts.filter((receipt) => (
      receipt.status === "fulfilled" && receipt.value.delivered
    )).length

    return { attempted: channels.length, delivered, suppressed: false }
  },
})

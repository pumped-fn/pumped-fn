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

export const channel = tag<Channel>({ label: "weather.channel" })

export const quietHours = tag<QuietHours>({ label: "weather.quiet-hours" })

const channels = atom({
  deps: { channels: tags.all(channel) },
  factory: function channelsFactory(_ctx, { channels }) {
    return channels
  },
})

export const issueAlert = flow({
  name: "issue-alert",
  parse: typed<Alert>(),
  deps: {
    channels,
    quietHours: tags.optional(quietHours),
  },
  factory: async (ctx, { channels, quietHours }) => {
    const suppressed = ctx.input.severity === "watch"
      && quietHours !== undefined
      && quietHours.startHour <= ctx.input.hour
      && ctx.input.hour < quietHours.endHour

    if (suppressed) return { attempted: 0, delivered: 0, suppressed: true }

    const attempts = await Promise.allSettled(channels.map(entry => ctx.exec({
      fn: () => entry.send(ctx.input),
      params: [],
      name: `channel.send:${entry.name}`,
    })))
    const delivered = attempts.filter(attempt => (
      attempt.status === "fulfilled" && attempt.value.delivered
    )).length

    return { attempted: channels.length, delivered, suppressed: false }
  },
})

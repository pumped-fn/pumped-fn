import { flow, tag, tags, typed } from "@pumped-fn/lite"

export type Alert = { severity: "watch" | "warning"; text: string; hour: number }
export type ChannelReceipt = { delivered: boolean }
export type Channel = { name: string; send: (alert: Alert) => Promise<ChannelReceipt> | ChannelReceipt }
export type QuietWindow = { startHour: number; endHour: number }
export type AlertOutcome = { attempted: number; delivered: number; suppressed: boolean }

const fallback: Channel = { name: "console", send: () => ({ delivered: true }) }

export const channel = tag<Channel>({ label: "alert.channel", default: fallback })
export const quietHours = tag<QuietWindow>({ label: "alert.quiet-hours" })

export const issueAlert = flow({
  name: "issue-alert",
  parse: typed<Alert>(),
  deps: { notifier: tags.required(channel), quiet: tags.optional(quietHours) },
  factory: async (ctx, { notifier, quiet }): Promise<AlertOutcome> => {
    const { severity, hour } = ctx.input
    if (quiet !== undefined && severity === "watch" && hour >= quiet.startHour && hour < quiet.endHour) {
      return { attempted: 0, delivered: 0, suppressed: true }
    }
    const receipt = await ctx.exec({
      fn: () => notifier.send(ctx.input),
      params: [],
      name: "notifier.send",
    })
    return { attempted: 1, delivered: receipt.delivered ? 1 : 0, suppressed: false }
  },
})

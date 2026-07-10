import { atom, flow, tag, tags, typed } from "@pumped-fn/lite"

export type Alert = { severity: "watch" | "warning"; text: string; hour: number }
export type ChannelReceipt = { delivered: boolean }
export type Channel = { name: string; send: (alert: Alert) => Promise<ChannelReceipt> | ChannelReceipt }
export type QuietWindow = { startHour: number; endHour: number }
export type AlertOutcome = { attempted: number; delivered: number; suppressed: boolean }

export const channel = tag<Channel>({ label: "alert.channel" })
export const quietHours = tag<QuietWindow>({ label: "alert.quiet-hours" })

const registry = atom({
  deps: { channels: tags.all(channel) },
  factory: (_ctx, { channels }) => channels,
})

export const issueAlert = flow({
  name: "issue-alert",
  parse: typed<Alert>(),
  deps: { channels: registry, quiet: tags.optional(quietHours) },
  factory: async (ctx, { channels, quiet }): Promise<AlertOutcome> => {
    const { severity, hour } = ctx.input
    if (quiet !== undefined && severity === "watch" && hour >= quiet.startHour && hour < quiet.endHour) {
      return { attempted: 0, delivered: 0, suppressed: true }
    }
    const receipts = await Promise.allSettled(
      channels.map((entry) =>
        ctx.exec({ fn: () => entry.send(ctx.input), params: [], name: `channel.${entry.name}` }),
      ),
    )
    return {
      attempted: channels.length,
      delivered: receipts.filter(
        (receipt) => receipt.status === "fulfilled" && receipt.value.delivered,
      ).length,
      suppressed: false,
    }
  },
})

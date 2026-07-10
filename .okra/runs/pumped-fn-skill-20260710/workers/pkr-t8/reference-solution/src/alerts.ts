import { flow, tag, tags, typed, type Lite } from "@pumped-fn/lite"

export type Alert = { severity: "watch" | "warning"; text: string; hour: number }
export type ChannelReceipt = { delivered: boolean }
export type QuietWindow = { startHour: number; endHour: number }
export type AlertOutcome = { attempted: number; delivered: number; suppressed: boolean }

export const channel = tag<Lite.Flow<ChannelReceipt, Alert>>({ label: "alert.channel" })
export const quietHours = tag<QuietWindow>({ label: "alert.quiet-hours" })

export const issueAlert = flow({
  name: "issue-alert",
  parse: typed<Alert>(),
  deps: { channels: tags.all(channel), quiet: tags.optional(quietHours) },
  factory: async (ctx, { channels, quiet }): Promise<AlertOutcome> => {
    const { severity, hour } = ctx.input
    if (quiet !== undefined && severity === "watch" && hour >= quiet.startHour && hour < quiet.endHour) {
      return { attempted: 0, delivered: 0, suppressed: true }
    }
    const receipts = await Promise.allSettled(
      channels.map((handle) => handle.exec({ input: ctx.input })),
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

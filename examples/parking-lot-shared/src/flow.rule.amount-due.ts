import { flow, typed } from "@pumped-fn/lite"
import type { Lot } from "./model"
import { rule } from "./tags"

export interface AmountDueInput {
  enteredAt: string
  exitedAt: string
  lot: Lot
}

export const amountDue = flow({
  name: "parking.rule.amount-due",
  parse: typed<AmountDueInput>(),
  tags: [rule({ name: "amount-due" })],
  factory: (ctx): number => {
    const minutes = Math.max(0, Math.ceil((Date.parse(ctx.input.exitedAt) - Date.parse(ctx.input.enteredAt)) / 60000))
    const billable = Math.max(0, minutes - ctx.input.lot.settings.graceMinutes)
    return billable === 0 ? 0 : Math.max(1, Math.ceil(billable / 60)) * ctx.input.lot.rateCentsPerHour
  },
})

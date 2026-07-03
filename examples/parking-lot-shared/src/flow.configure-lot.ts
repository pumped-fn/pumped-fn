import { flow, typed } from "@pumped-fn/lite"
import type { Lot } from "./model"
import { tx } from "./resource.tx"
import { allow } from "./rules"

export interface ConfigureLotInput {
  bookingLeadMinutes: number
  capacity: number
  currency: string
  graceMinutes: number
  lotId?: string
  name: string
  rateCentsPerHour: number
  refundWindowMinutes: number
}

export const configureLot = flow({
  name: "parking.configure-lot",
  parse: typed<ConfigureLotInput>(),
  deps: { tx },
  factory: (ctx, deps): Lot => {
    allow(deps.tx.actor, ["manager"], "configure lot")
    const lot: Lot = {
      capacity: ctx.input.capacity,
      id: ctx.input.lotId ?? deps.tx.id("lot"),
      name: ctx.input.name,
      rateCentsPerHour: ctx.input.rateCentsPerHour,
      settings: {
        bookingLeadMinutes: ctx.input.bookingLeadMinutes,
        currency: ctx.input.currency,
        graceMinutes: ctx.input.graceMinutes,
        refundWindowMinutes: ctx.input.refundWindowMinutes,
      },
    }
    deps.tx.store.saveLot(lot)
    deps.tx.record("lot.configured", lot.id, { capacity: lot.capacity, rateCentsPerHour: lot.rateCentsPerHour })
    return lot
  },
})

import { flow, typed } from "@pumped-fn/lite"
import type { Lot } from "./model"
import { overlaps, parkedCount } from "./rules"
import { store } from "./atom.store"
import { rule } from "./tags"

export interface AssertCapacityInput {
  endAt: string
  lot: Lot
  startAt: string
}

export const assertCapacity = flow({
  name: "parking.rule.assert-capacity",
  parse: typed<AssertCapacityInput>(),
  deps: { store },
  tags: [rule({ name: "assert-capacity" })],
  factory: (ctx, { store }): void => {
    const held = store.bookings().filter((booking) =>
      booking.lotId === ctx.input.lot.id &&
      booking.status === "held" &&
      overlaps(ctx.input.startAt, ctx.input.endAt, booking.startAt, booking.endAt)
    ).length
    const parked = parkedCount(store, ctx.input.lot.id)
    if (held + parked >= ctx.input.lot.capacity) throw new Error(`lot ${ctx.input.lot.id} has no reservable capacity`)
  },
})

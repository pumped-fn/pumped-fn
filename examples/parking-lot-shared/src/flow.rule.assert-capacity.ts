import { flow, typed } from "@pumped-fn/lite"
import type { Lot } from "./model"
import { overlaps, parkedCount } from "./rules"
import { store } from "./atom.store"
import type { Fault } from "./error"
import { rule } from "./tags"

export interface AssertCapacityInput {
  endAt: string
  lot: Lot
  startAt: string
}

export const assertCapacity = flow({
  name: "parking.rule.assert-capacity",
  parse: typed<AssertCapacityInput>(),
  faults: typed<Extract<Fault, { kind: "unavailable" }>>(),
  deps: { store },
  tags: [rule({ name: "assert-capacity" })],
  factory: (ctx, { store }): void => {
    const held = store.bookings().filter((booking) =>
      booking.lotId === ctx.input.lot.id &&
      booking.status === "held" &&
      overlaps(ctx.input.startAt, ctx.input.endAt, booking.startAt, booking.endAt)
    ).length
    const parked = parkedCount(store, ctx.input.lot.id)
    if (held + parked >= ctx.input.lot.capacity)
      ctx.fail({ kind: "unavailable", entity: "lot", id: ctx.input.lot.id, reason: "capacity" })
  },
})

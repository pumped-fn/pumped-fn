import { flow, typed } from "@pumped-fn/lite"
import type { Lot } from "./model"
import { store } from "./atom.store"
import type { Unavailable } from "./error"
import { parkedCount } from "./rules"
import { rule } from "./tags"

export interface AssertDriveUpCapacityInput {
  lot: Lot
}

export const assertDriveUpCapacity = flow({
  name: "parking.rule.assert-drive-up-capacity",
  parse: typed<AssertDriveUpCapacityInput>(),
  faults: typed<Unavailable>(),
  deps: { store },
  tags: [rule({ name: "assert-drive-up-capacity" })],
  factory: (ctx, { store }): void => {
    if (parkedCount(store, ctx.input.lot.id) >= ctx.input.lot.capacity)
      ctx.fail({ kind: "unavailable", entity: "lot", id: ctx.input.lot.id, reason: "drive-up-capacity" })
  },
})

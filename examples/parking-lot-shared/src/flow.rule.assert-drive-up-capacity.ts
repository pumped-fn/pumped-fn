import { flow, typed } from "@pumped-fn/lite"
import type { Lot } from "./model"
import { store } from "./atom.store"
import { parkedCount } from "./rules"
import { rule } from "./tags"

export interface AssertDriveUpCapacityInput {
  lot: Lot
}

export const assertDriveUpCapacity = flow({
  name: "parking.rule.assert-drive-up-capacity",
  parse: typed<AssertDriveUpCapacityInput>(),
  deps: { store },
  tags: [rule({ name: "assert-drive-up-capacity" })],
  factory: (ctx, { store }): void => {
    if (parkedCount(store, ctx.input.lot.id) >= ctx.input.lot.capacity) throw new Error(`lot ${ctx.input.lot.id} is full`)
  },
})

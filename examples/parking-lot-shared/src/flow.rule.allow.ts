import { flow, tags, typed } from "@pumped-fn/lite"
import type { Role } from "./model"
import { actor, rule } from "./tags"
import { ParkingError } from "./error"

export interface AllowInput {
  action: string
  roles: readonly Role[]
}

export const allow = flow({
  name: "parking.rule.allow",
  parse: typed<AllowInput>(),
  deps: { actor: tags.required(actor) },
  tags: [rule({ name: "allow" })],
  factory: (ctx, { actor }): void => {
    if (!ctx.input.roles.includes(actor.role)) {
      throw new ParkingError({ kind: "forbidden", action: ctx.input.action, actorId: actor.id })
    }
  },
})

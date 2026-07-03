import { flow, tags, typed, type Lite } from "@pumped-fn/lite"
import type { Role } from "./model"
import { actor, rule } from "./tags"
import type { Conflict, Forbidden } from "./error"

export interface AllowInput {
  action: string
  roles: readonly Role[]
}

export const allow = flow({
  name: "parking.rule.allow",
  parse: typed<AllowInput>(),
  faults: typed<Forbidden>(),
  deps: { actor: tags.required(actor) },
  tags: [rule({ name: "allow" })],
  factory: (ctx, { actor }): void => {
    if (!ctx.input.roles.includes(actor.role)) {
      ctx.fail({ kind: "forbidden", action: ctx.input.action, actorId: actor.id })
    }
  },
})

/**
 * The compound fault union repeated across flows that call `allow` and only
 * fail with `conflict` themselves: replaces the hand-written
 * `Extract<Fault, { kind: "conflict" }> | Lite.Utils.FaultsOf<typeof allow>`.
 * Lives here (next to `allow`) rather than in error.ts, since error.ts must
 * not import flow modules — putting it there would create an import cycle
 * (error.ts -> flow.rule.allow.ts -> error.ts).
 */
export type ConflictOrAllowFault = Conflict | Lite.Utils.FaultsOf<typeof allow>

import { flow, typed, type Lite } from "@pumped-fn/lite"
import type { BaseSchema, KindOfSchema } from "./schema"
import type { ActionToken, JsonAction, JsonExpr } from "./spec"
import { fieldsKindOf } from "./tokens"

/**
 * Binds a Lite flow to its input schema, deriving the param kinds the verifier checks.
 * Only type-checks when `Infer<input>` matches the flow input type, so a kind can never be restated incorrectly.
 */
function action<F extends Lite.Flow<any, any>, const Fields extends Record<string, BaseSchema>>(
  flow: F,
  input: {
    readonly node: "object"
    readonly fields: Fields
    readonly _type: (value: Lite.Utils.FlowInput<F>) => Lite.Utils.FlowInput<F>
  }
): { flow: Lite.Flow<any, any>; params: { [K in keyof Fields]: KindOfSchema<Fields[K]> } } {
  return { flow, params: fieldsKindOf(input) as { [K in keyof Fields]: KindOfSchema<Fields[K]> } }
}

/** The dispatcher input: a verified action plus an optional adapter-normalized event payload. */
type RenderActionInput<Event extends Record<string, unknown> = Record<string, unknown>> = {
  action: JsonAction
  event?: Event
}

function readPath(state: unknown, path: string): unknown {
  return path.split("/").filter(Boolean).reduce<unknown>((value, segment) => {
    if (value === undefined || value === null) return undefined
    if (Array.isArray(value)) return value[Number(segment)]
    return (value as Record<string, unknown>)[segment]
  }, state)
}

function resolveExpr(
  expr: JsonExpr,
  state: unknown,
  item?: Record<string, unknown>,
  event?: Record<string, unknown>
): unknown {
  if (typeof expr !== "object" || expr === null) return expr
  if ("state" in expr) return readPath(state, expr.state)
  if ("item" in expr) return item?.[expr.item]
  if ("event" in expr) return event?.[expr.event]
  return Object.entries(expr.args).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, String(resolveExpr(value, state, item, event) ?? "None")),
    expr.template
  )
}

function actionParams(
  action: JsonAction,
  state: unknown,
  item?: Record<string, unknown>,
  event?: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(action.params).map(([key, expr]) => [key, resolveExpr(expr, state, item, event)]))
}

/**
 * Builds the dispatcher flow for an arbitrary action registry and a state resource.
 * The same registry the verifier guards is the only set the dispatcher can execute; an unregistered flow throws.
 */
function createRunJsonAction<State, Event extends Record<string, unknown> = Record<string, unknown>>(config: {
  registry: Record<string, ActionToken>
  state: Lite.Resource<{ get(): State }>
  name?: string
}): Lite.Flow<unknown, RenderActionInput<Event>> {
  return flow({
    name: config.name ?? "lite-render-run-json-action",
    parse: typed<RenderActionInput<Event>>(),
    deps: { access: config.state },
    factory: (ctx, { access }) => {
      const target = config.registry[ctx.input.action.flow]
      if (!target) throw new Error(`Unknown verified flow ${ctx.input.action.flow}`)
      return ctx.exec({ flow: target.flow, rawInput: actionParams(ctx.input.action, access.get(), undefined, ctx.input.event) })
    },
  })
}

export { action, readPath, resolveExpr, actionParams, createRunJsonAction }
export type { RenderActionInput }

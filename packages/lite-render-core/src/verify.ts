import { displayableKinds, literalMatches } from "./schema"
import type { Equal, ValueKind } from "./schema"
import type {
  ComponentSchema,
  ItemContext,
  JsonAction,
  JsonCondition,
  JsonExpr,
  JsonNode,
  JsonSpec,
  RepeatSlot,
  SlotSpec,
  VerificationError,
  VerificationResult,
  VerifyContext,
} from "./spec"

/** Single-source repeats discriminant: a slot repeats iff it carries a `repeats` key. Guarded type pins to {@link RepeatSlot}. */
function isRepeatingSlot(slot: SlotSpec): slot is RepeatSlot {
  return slot !== true && "repeats" in slot
}

function hasRepeatingSlot(component: ComponentSchema): boolean {
  return Object.values(component.slots).some(isRepeatingSlot)
}

type SlotPredicate<G extends SlotSpec> = (slot: SlotSpec) => slot is G
type RepeatingSlotGuard = typeof isRepeatingSlot extends SlotPredicate<infer G> ? G : never
/** Agreement assert: the runtime repeats predicate guards exactly the {@link RepeatSlot} the author type keys on. */
type IsRepeatingSlotGuardsRepeatSlot = Equal<RepeatingSlotGuard, RepeatSlot>

function verifySpec(spec: JsonSpec, ctx: VerifyContext): VerificationResult {
  const errors: VerificationError[] = []
  verifyNode(spec.root, "$.root", ctx, undefined, false, errors)
  return errors.length === 0 ? { ok: true, spec } : { ok: false, errors }
}

function verifyNode(
  node: JsonNode,
  location: string,
  ctx: VerifyContext,
  item: ItemContext | undefined,
  insideRepeat: boolean,
  errors: VerificationError[]
): void {
  const component = ctx.components[node.type]
  if (!component) {
    errors.push({ code: "unknown_component", path: `${location}.type`, message: `Unknown component ${node.type}` })
    return
  }
  if (insideRepeat && hasRepeatingSlot(component)) {
    errors.push({ code: "nested_repeat_forbidden", path: `${location}.type`, message: `${node.type} has a repeating slot and cannot appear inside another repeating slot` })
  }
  for (const capability of component.capabilities) {
    if (!ctx.rendererCapabilities.has(capability)) {
      errors.push({ code: "unsupported_capability", path: `${location}.type`, message: `${node.type} needs ${capability}` })
    }
  }
  for (const prop of Object.keys(node.props)) {
    if (!(prop in component.props)) {
      errors.push({ code: "unknown_prop", path: `${location}.props.${prop}`, message: `${node.type}.${prop} is not in catalog` })
    }
  }
  for (const [prop, kind] of Object.entries(component.props)) {
    if (!(prop in node.props)) {
      errors.push({ code: "missing_prop", path: `${location}.props.${prop}`, message: `${node.type}.${prop} is required` })
      continue
    }
    verifyExpr(node.props[prop]!, kind, `${location}.props.${prop}`, ctx, item, undefined, errors)
  }
  for (const slot of Object.keys(node.slots ?? {})) {
    if (!(slot in component.slots)) {
      errors.push({ code: "unknown_slot", path: `${location}.slots.${slot}`, message: `${node.type}.${slot} is not in catalog` })
    }
  }
  for (const event of Object.keys(node.on ?? {})) {
    const eventShape = component.events[event]
    if (!eventShape) {
      errors.push({ code: "unknown_event", path: `${location}.on.${event}`, message: `${node.type}.${event} is not in catalog` })
      continue
    }
    verifyAction(node.on![event]!, `${location}.on.${event}`, ctx, item, eventShape, errors)
  }
  for (const [watchedPath, action] of Object.entries(node.watch ?? {})) {
    if (!ctx.state[watchedPath]) {
      errors.push({ code: "unknown_state_path", path: `${location}.watch.${watchedPath}`, message: `${watchedPath} is not a known state path` })
    }
    verifyAction(action, `${location}.watch.${watchedPath}`, ctx, undefined, undefined, errors)
  }
  if (node.visible) verifyCondition(node.visible, `${location}.visible`, ctx, errors)
  for (const [slot, children] of Object.entries(node.slots ?? {})) {
    const slotSpec = component.slots[slot]
    const repeats = slotSpec !== undefined && isRepeatingSlot(slotSpec) ? slotSpec : undefined
    const childItem = repeats
      ? repeatItemContext(node, repeats, ctx, errors, `${location}.slots.${slot}`)
      : item
    const childInsideRepeat = insideRepeat || repeats !== undefined
    children.forEach((child, index) => verifyNode(child, `${location}.slots.${slot}.${index}`, ctx, childItem, childInsideRepeat, errors))
  }
}

function repeatItemContext(
  node: JsonNode,
  slot: RepeatSlot,
  ctx: VerifyContext,
  errors: VerificationError[],
  location: string
): ItemContext | undefined {
  const expr = node.props[slot.repeats]
  if (!expr) {
    errors.push({ code: "missing_repeat_source", path: location, message: `${slot.repeats} is required for repeated slot` })
    return undefined
  }
  if (typeof expr === "object" && expr !== null && "state" in expr) {
    const token = ctx.state[expr.state]
    if (!token?.item) {
      errors.push({ code: "missing_repeat_item_context", path: location, message: `${expr.state} does not expose repeat item fields` })
      return undefined
    }
    return token.item
  }
  errors.push({ code: "unsupported_repeat_source", path: location, message: `${slot.repeats} must bind to a state array token` })
  return undefined
}

function verifyAction(
  action: JsonAction,
  location: string,
  ctx: VerifyContext,
  item: ItemContext | undefined,
  event: Record<string, ValueKind> | undefined,
  errors: VerificationError[]
): void {
  const target = ctx.actions[action.flow]
  if (!target) {
    errors.push({ code: "unknown_flow", path: `${location}.flow`, message: `${action.flow} is not registered` })
    return
  }
  const flowShape = target.params
  for (const [field, kind] of Object.entries(flowShape)) {
    if (!(field in action.params)) {
      errors.push({ code: "missing_action_param", path: `${location}.params.${field}`, message: `${action.flow}.${field} is required` })
      continue
    }
    verifyExpr(action.params[field]!, kind, `${location}.params.${field}`, ctx, item, event, errors)
  }
  for (const field of Object.keys(action.params)) {
    if (!(field in flowShape)) {
      errors.push({ code: "unknown_action_param", path: `${location}.params.${field}`, message: `${action.flow}.${field} is not in flow input` })
    }
  }
}

function verifyCondition(condition: JsonCondition, location: string, ctx: VerifyContext, errors: VerificationError[]): void {
  const token = ctx.state[condition.state]
  if (!token) {
    errors.push({ code: "unknown_state_path", path: `${location}.state`, message: `${condition.state} is not a known state path` })
    return
  }
  if (condition.eq !== undefined && !literalMatches(condition.eq, token.kind)) {
    errors.push({ code: "invalid_condition_value", path: `${location}.eq`, message: `${condition.state} cannot compare to ${typeof condition.eq}` })
  }
}

function verifyExpr(
  expr: JsonExpr,
  expected: ValueKind,
  location: string,
  ctx: VerifyContext,
  item: ItemContext | undefined,
  event: Record<string, ValueKind> | undefined,
  errors: VerificationError[]
): void {
  const actual = exprKind(expr, ctx, item, event, location, errors)
  if (actual && actual !== expected) {
    errors.push({ code: "kind_mismatch", path: location, message: `Expected ${expected}, got ${actual}` })
  }
}

function exprKind(
  expr: JsonExpr,
  ctx: VerifyContext,
  item: ItemContext | undefined,
  event: Record<string, ValueKind> | undefined,
  location: string,
  errors: VerificationError[]
): ValueKind | undefined {
  if (typeof expr === "string") return "string"
  if (typeof expr === "number") return "number"
  if (typeof expr === "boolean") return "boolean"
  if (expr === null) return "nullableString"
  if ("state" in expr) {
    const token = ctx.state[expr.state]
    if (!token) {
      errors.push({ code: "unknown_state_path", path: location, message: `${expr.state} is not a known state path` })
      return undefined
    }
    return token.kind
  }
  if ("item" in expr) {
    const kind = item?.fields[expr.item]
    if (!kind) {
      errors.push({ code: "unknown_item_path", path: location, message: `${expr.item} is not available in this repeat item` })
      return undefined
    }
    return kind
  }
  if ("event" in expr) {
    const kind = event?.[expr.event]
    if (!kind) {
      errors.push({ code: "unknown_event_field", path: location, message: `${expr.event} is not available on this event` })
      return undefined
    }
    return kind
  }
  const placeholders = templatePlaceholders(expr.template)
  for (const name of placeholders) {
    if (!(name in expr.args)) {
      errors.push({ code: "unbound_template_placeholder", path: `${location}.args.${name}`, message: `${name} is referenced but not bound` })
    }
  }
  for (const name of Object.keys(expr.args)) {
    if (!placeholders.has(name)) {
      errors.push({ code: "unreferenced_template_arg", path: `${location}.args.${name}`, message: `${name} is bound but not referenced` })
    }
  }
  for (const [name, arg] of Object.entries(expr.args)) {
    const argKind = exprKind(arg, ctx, item, event, `${location}.args.${name}`, errors)
    if (argKind && !displayableKinds.has(argKind)) {
      errors.push({ code: "non_displayable_template_arg", path: `${location}.args.${name}`, message: `${name} resolves to ${argKind}, which cannot be interpolated into text` })
    }
  }
  return "nullableString"
}

function templatePlaceholders(template: string): Set<string> {
  return new Set(Array.from(template.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)).map((match) => match[1]!))
}

export { isRepeatingSlot, hasRepeatingSlot, verifySpec }
export type { IsRepeatingSlotGuardsRepeatSlot }

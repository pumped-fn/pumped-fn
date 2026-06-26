import type { Lite } from "@pumped-fn/lite"
import type { JsonValue, ValueKind } from "./schema"

type JsonExpr =
  | JsonValue
  | { state: string }
  | { item: string }
  | { event: string }
  | { template: string; args: Record<string, JsonExpr> }

/** A spec-declared dispatch to a registered flow with bound params. */
type JsonAction = {
  flow: string
  params: Record<string, JsonExpr>
}

type JsonCondition = {
  state: string
  eq?: JsonValue
}

/** A single node of the portable spec tree: a catalog component with props, slots, events, watches, and visibility. */
type JsonNode = {
  type: string
  props: Record<string, JsonExpr>
  slots?: Record<string, JsonNode[]>
  on?: Record<string, JsonAction>
  watch?: Record<string, JsonAction>
  visible?: JsonCondition
}

/** The portable, platform-neutral render spec artifact. */
type JsonSpec = {
  root: JsonNode
}

type RepeatSlot = { repeats: string }
type SlotSpec = true | RepeatSlot

/** A catalog component's verified shape: prop kinds, slot specs, event payload kinds, and renderer capabilities. */
type ComponentSchema = {
  props: Record<string, ValueKind>
  slots: Record<string, SlotSpec>
  events: Record<string, Record<string, ValueKind>>
  capabilities: string[]
}

/** The fields available to `{ item }` expressions inside a repeating slot. */
type ItemContext = {
  fields: Record<string, ValueKind>
}

/** A verified state path: its kind and, for arrays, the per-element item context. */
type StateToken = {
  path: string
  kind: ValueKind
  item?: ItemContext
}

/** A registered action: the executable flow plus the kinds of its bound params. */
type ActionToken = {
  flow: Lite.Flow<any, any>
  params: Record<string, ValueKind>
}

/** Everything the verifier checks a spec against: state tokens, catalog, action registry, and renderer capabilities. */
type VerifyContext = {
  state: Record<string, StateToken>
  components: Record<string, ComponentSchema>
  actions: Record<string, ActionToken>
  rendererCapabilities: Set<string>
}

type VerificationError = {
  code: string
  path: string
  message: string
}

type VerificationResult =
  | { ok: true; spec: JsonSpec }
  | { ok: false; errors: VerificationError[] }

export type {
  JsonExpr,
  JsonAction,
  JsonCondition,
  JsonNode,
  JsonSpec,
  RepeatSlot,
  SlotSpec,
  ComponentSchema,
  ItemContext,
  StateToken,
  ActionToken,
  VerifyContext,
  VerificationError,
  VerificationResult,
}

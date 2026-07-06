import type {
  Author,
  BaseSchema,
  DisplayKind,
  Infer,
  JsonAction,
  JsonExpr,
  JsonNode,
  JsonSpec,
  JsonValue,
  KindFor,
  SlotSpec,
  ValueKind,
  VerifyContext,
} from "@pumped-fn/lite-render-core"

const exprKey: unique symbol = Symbol("pumped.ui.expr")
const actKey: unique symbol = Symbol("pumped.ui.act")
const eachKey: unique symbol = Symbol("pumped.ui.each")
const itemKey: unique symbol = Symbol("pumped.ui.item")

type Component = {
  props: Record<string, ValueKind>
  slots: Record<string, SlotSpec>
  events: Record<string, Record<string, ValueKind>>
  capabilities: readonly string[]
}

type Catalog = Record<string, Component>
type Registry = Record<string, { params: Record<string, ValueKind> }>

type Expr<K extends ValueKind> = {
  readonly [exprKey]: JsonExpr
}

type Literal<K extends ValueKind> =
  K extends "string" ? string :
    K extends "number" ? number :
      K extends "boolean" ? boolean :
        K extends "nullableString" ? null :
          never

type Input<K extends ValueKind> = Literal<K> | Expr<K>

type Collection<T> = Expr<"array"> & {
  readonly [itemKey]?: T
}

type Field<T> =
  KindFor<T> extends never ? never :
    Expr<KindFor<T>>

type State<T> =
  T extends readonly (infer Item)[] ? Collection<Item> :
    T extends object ? { readonly [K in keyof T & string]: State<T[K]> } :
      Field<T>

type Item<T> = {
  readonly [K in keyof T & string]: Field<T[K]>
}

type Evt<Shape extends Record<string, ValueKind>> = {
  readonly [K in keyof Shape & string]: Expr<Shape[K]>
}

type Props<PropsShape extends Record<string, ValueKind>> = {
  readonly [P in keyof PropsShape]: Input<PropsShape[P]>
}

type Act = {
  readonly [actKey]: JsonAction
}

type Actions<R extends Registry> = {
  readonly [Name in keyof R & string]: (params: Props<R[Name]["params"]>) => Act
}

type EventInput<Shape extends Record<string, ValueKind>, R extends Registry> =
  | Act
  | ((event: Evt<Shape>) => Act)

type Events<C extends Component, R extends Registry> = {
  readonly [Name in keyof C["events"] & string]?: EventInput<C["events"][Name], R>
}

type SlotInput = JsonNode | readonly JsonNode[] | Each

type Slots<C extends Component> = {
  readonly [Name in keyof C["slots"] & string]?: SlotInput
}

type Visible = {
  readonly state: Expr<ValueKind>
  readonly eq?: JsonValue
}

type NodeInput<C extends Component, R extends Registry> = {
  readonly props: Props<C["props"]>
  readonly slots?: Slots<C>
  readonly on?: Events<C, R>
  readonly watch?: Partial<Record<string, Act>>
  readonly visible?: Visible
}

type Nodes<C extends Catalog, R extends Registry> = {
  readonly [Name in keyof C & string]: (input: NodeInput<C[Name], R>) => JsonNode
}

type Each = {
  readonly [eachKey]: readonly JsonNode[]
  readonly source: JsonExpr
}

type Contract<C extends Catalog, R extends Registry, S extends BaseSchema> = {
  readonly author: Author<C, R, S>
  readonly context: VerifyContext
}

type Ui<C extends Catalog, R extends Registry, S extends BaseSchema> = {
  readonly state: State<Infer<S>>
  readonly action: Actions<R>
  readonly node: Nodes<C, R>
  readonly spec: (root: JsonNode) => JsonSpec
  readonly each: <T>(source: Collection<T>, child: (item: Item<T>) => JsonNode | readonly JsonNode[]) => Each
  readonly text: (template: string, args: Record<string, string | number | boolean | null | Expr<DisplayKind> | Expr<"nullableString">>) => Expr<"nullableString">
}

function bind<K extends ValueKind>(expr: JsonExpr): Expr<K> {
  return { [exprKey]: expr }
}

function state(path: string): unknown {
  return new Proxy(bind({ state: path }) as Record<PropertyKey, unknown>, {
    get(target, property) {
      if (property === exprKey) return target[property]
      if (typeof property !== "string") return target[property]
      return state(`${path}/${property}`)
    },
  })
}

function field(source: "item" | "event", path: string): unknown {
  const expr: JsonExpr = source === "item" ? { item: path } : { event: path }
  return new Proxy(bind(expr) as Record<PropertyKey, unknown>, {
    get(target, property) {
      if (property === exprKey) return target[property]
      if (typeof property !== "string") return target[property]
      return field(source, path === "" ? property : `${path}/${property}`)
    },
  })
}

function expr(input: JsonValue | Expr<ValueKind>): JsonExpr {
  if (typeof input === "object" && input !== null && exprKey in input) return input[exprKey]
  return input
}

function props(input: Record<string, JsonValue | Expr<ValueKind>>): Record<string, JsonExpr> {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, expr(value)]))
}

function act(input: Act): JsonAction {
  return input[actKey]
}

function actions<R extends Registry>(): Actions<R> {
  return new Proxy({} as Record<PropertyKey, unknown>, {
    get(_target, property) {
      if (typeof property !== "string") return undefined
      return (input: Record<string, JsonValue | Expr<ValueKind>>) => ({ [actKey]: { flow: property, params: props(input) } })
    },
  }) as Actions<R>
}

function events(input: Record<string, EventInput<Record<string, ValueKind>, Registry> | undefined> | undefined): Record<string, JsonAction> | undefined {
  if (!input) return undefined
  const entries = Object.entries(input).filter((entry): entry is [string, EventInput<Record<string, ValueKind>, Registry>] => entry[1] !== undefined)
  return Object.fromEntries(entries.map(([key, value]) => {
    const call = typeof value === "function" ? value(field("event", "") as Evt<Record<string, ValueKind>>) : value
    return [key, act(call)]
  }))
}

function isEach(input: SlotInput): input is Each {
  return typeof input === "object" && input !== null && eachKey in input
}

function isRepeat(slot: SlotSpec | undefined): slot is { repeats: string } {
  return slot !== undefined && slot !== true && "repeats" in slot
}

function slot(input: SlotInput): JsonNode[] {
  if (isEach(input)) return [...input[eachKey]]
  if (Array.isArray(input)) return [...input as readonly JsonNode[]]
  return [input as JsonNode]
}

function slots(input: Record<string, SlotInput | undefined> | undefined): Record<string, JsonNode[]> | undefined {
  if (!input) return undefined
  const entries = Object.entries(input).filter((entry): entry is [string, SlotInput] => entry[1] !== undefined)
  return Object.fromEntries(entries.map(([key, value]) => [key, slot(value)]))
}

function visible(input: Visible): { state: string; eq?: JsonValue } {
  const value = expr(input.state)
  const condition: { state: string; eq?: JsonValue } = { state: (value as { state: string }).state }
  if ("eq" in input) condition.eq = input.eq
  return condition
}

function watches(input: Partial<Record<string, Act>> | undefined): Record<string, JsonAction> | undefined {
  if (!input) return undefined
  const entries = Object.entries(input).filter((entry): entry is [string, Act] => entry[1] !== undefined)
  return Object.fromEntries(entries.map(([key, value]) => [key, act(value)]))
}

function applyEachSources(type: string, context: VerifyContext, input: Record<string, SlotInput | undefined> | undefined, output: Record<string, JsonExpr>): void {
  if (!input) return
  const component = context.components[type]
  if (!component) return
  for (const [slotName, value] of Object.entries(input)) {
    if (!value || !isEach(value)) continue
    const slotSpec = component.slots[slotName]
    if (isRepeat(slotSpec)) output[slotSpec.repeats] = value.source
  }
}

function nodes<C extends Catalog, R extends Registry>(context: VerifyContext): Nodes<C, R> {
  return new Proxy({} as Record<PropertyKey, unknown>, {
    get(_target, property) {
      if (typeof property !== "string") return undefined
      return (input: NodeInput<Component, Registry>): JsonNode => {
        const loweredProps = props(input.props)
        applyEachSources(property, context, input.slots, loweredProps)
        const node: JsonNode = { type: property, props: loweredProps }
        const loweredSlots = slots(input.slots)
        const loweredEvents = events(input.on)
        const loweredWatches = watches(input.watch)
        if (loweredSlots) node.slots = loweredSlots
        if (loweredEvents) node.on = loweredEvents
        if (loweredWatches) node.watch = loweredWatches
        if (input.visible) node.visible = visible(input.visible)
        return node
      }
    },
  }) as Nodes<C, R>
}

function each<T>(source: Collection<T>, child: (item: Item<T>) => JsonNode | readonly JsonNode[]): Each {
  const result = child(field("item", "") as Item<T>)
  return {
    [eachKey]: Array.isArray(result) ? result : [result],
    source: expr(source),
  }
}

function ui<const C extends Catalog, const R extends Registry, S extends BaseSchema>(contract: Contract<C, R, S>): Ui<C, R, S> {
  return {
    state: state("") as State<Infer<S>>,
    action: actions<R>(),
    node: nodes<C, R>(contract.context),
    spec: (root) => ({ root }),
    each,
    text: (template, args) => bind({ template, args: props(args) }),
  }
}

export { ui }
export type {
  Act,
  Actions,
  Collection,
  Contract,
  Each,
  Evt,
  Expr,
  Field,
  Input,
  Item,
  Nodes,
  State,
  Ui,
}

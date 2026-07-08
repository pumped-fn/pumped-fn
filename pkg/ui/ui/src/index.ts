const exprKey: unique symbol = Symbol("pumped.ui.expr")
const actKey: unique symbol = Symbol("pumped.ui.act")
const partKey: unique symbol = Symbol("pumped.ui.part")

type Standard<T> = {
  readonly "~standard": {
    readonly version: 1
    readonly vendor: string
    readonly types?: {
      readonly input: unknown
      readonly output: T
    }
  }
}

const valueKinds = ["string", "number", "boolean", "nullableString", "array", "object"] as const

type ValueKind = (typeof valueKinds)[number]

type LeafKind = Exclude<ValueKind, "array" | "object">

type KindFor<T> =
  [T] extends [readonly unknown[]] ? "array" :
    [null] extends [T] ? "nullableString" :
      [T] extends [string] ? "string" :
        [T] extends [number] ? "number" :
          [T] extends [boolean] ? "boolean" :
            never

interface BaseSchema<T = unknown> extends Standard<T> {
  readonly node: "leaf" | "array" | "object"
}

interface LeafSchema<T> extends BaseSchema<T> {
  readonly node: "leaf"
  readonly kind: LeafKind
}

interface ArraySchema<Item extends BaseSchema> extends BaseSchema<readonly InferSchema<Item>[]> {
  readonly node: "array"
  readonly item: Item
}

interface ObjectSchema<Fields extends Record<string, BaseSchema>> extends BaseSchema<{ readonly [Name in keyof Fields & string]: InferSchema<Fields[Name]> }> {
  readonly node: "object"
  readonly fields: Fields
}

type Schema<T = unknown> = BaseSchema<T>

type InferSchema<S> = S extends Standard<infer Output> ? Output : never

type Infer<S> = InferSchema<S>

type KindOfSchema<S extends BaseSchema> =
  S extends LeafSchema<infer Output> ? KindFor<Output> :
    S extends { readonly node: "array" } ? "array" :
      S extends { readonly node: "object" } ? "object" :
        never

function standard<T>() {
  return { "~standard": { version: 1, vendor: "@pumped-fn/ui" } } as Standard<T>
}

function leaf<T>(kind: LeafKind): LeafSchema<T> {
  return { ...standard<T>(), node: "leaf", kind }
}

const p = {
  string: leaf<string>("string"),
  number: leaf<number>("number"),
  boolean: leaf<boolean>("boolean"),
  nullableString: leaf<string | null>("nullableString"),
  array: <Item extends BaseSchema>(item: Item): ArraySchema<Item> => ({ ...standard<readonly InferSchema<Item>[]>(), node: "array", item }),
  object: <const Fields extends Record<string, BaseSchema>>(
    fields: Fields & { readonly [Name in keyof Fields]: Name extends `${string}/${string}` ? never : unknown }
  ): ObjectSchema<Fields> => {
    const invalid = Object.keys(fields).find((name) => name.includes("/"))
    if (invalid !== undefined) throw new Error(`schema field "${invalid}" cannot contain "/"`)
    return { ...standard<{ readonly [Name in keyof Fields & string]: InferSchema<Fields[Name]> }>(), node: "object", fields }
  },
}

type Val = string | number | boolean | null | readonly Val[] | { readonly [key: string]: Val }

type Ref =
  | { readonly kind: "state"; readonly path: readonly string[] }
  | { readonly kind: "item"; readonly path: readonly string[] }
  | { readonly kind: "event"; readonly path: readonly string[] }
  | { readonly kind: "text"; readonly template: string; readonly args: Record<string, Val | Ref> }

type Expr<T = unknown> = {
  readonly [exprKey]: Ref
}

type Raw<T> =
  T extends string ? string :
    T extends number ? number :
      T extends boolean ? boolean :
        T extends null ? null :
          T extends readonly (infer Item)[] ? readonly Raw<Item>[] :
            T extends object ? { readonly [K in keyof T & string]: Raw<T[K]> } :
              never

type Input<T> = Raw<T> | Expr<T>

type Collection<T> = Expr<readonly T[]>

type Field<T> = Expr<T>

type State<T> =
  T extends readonly (infer Item)[] ? Collection<Item> :
    T extends object ? Expr<T> & { readonly [K in keyof T & string]: State<T[K]> } :
      Field<T>

type Item<T> =
  T extends object ? Expr<T> & { readonly [K in keyof T & string]: Field<T[K]> } :
    Expr<T>

type Evt<Shape> =
  Shape extends object ? Expr<Shape> & { readonly [K in keyof Shape & string]: Expr<Shape[K]> } :
    Expr<Shape>

type Part<Props = {}, Slots = {}, Events = {}> = {
  readonly [partKey]?: {
    readonly props: Props
    readonly slots: Slots
    readonly on: Events
  }
}

type Call = {
  readonly name: string
  readonly input: Record<string, Val | Ref>
}

type Act = {
  readonly [actKey]: Call
}

type Node = {
  readonly kind: "node"
  readonly type: string
  readonly props: Record<string, Val | Ref>
  readonly slots?: Record<string, Slot>
  readonly on?: Record<string, Call>
  readonly watch?: Record<string, Call>
  readonly visible?: VisibleOut
}

type Each = {
  readonly kind: "each"
  readonly source: Ref
  readonly nodes: readonly Node[]
}

type Tree = Node | Each

type Slot = readonly Tree[]

type NamedSlot = {
  readonly kind: "slot"
  readonly name: string
  readonly value: Slot
}

type Child = Tree | NamedSlot | readonly Child[]

type Plan = {
  readonly root: Node
}

type Visible = {
  readonly state: Expr<unknown>
  readonly eq?: Val
}

type VisibleOut = {
  readonly state: Ref
  readonly eq?: Val
}

type PropsOf<C> = C extends Part<infer Props, unknown, unknown> ? Props : {}

type SlotsOf<C> = C extends Part<unknown, infer Slots, unknown> ? Slots : {}

type EventsOf<C> = C extends Part<unknown, unknown, infer Events> ? Events : {}

type Props<InputShape> = {
  readonly [Name in keyof InputShape & string]: Input<InputShape[Name]>
}

type Actions<Registry> = {
  readonly [Name in keyof Registry & string]: (input: Props<Registry[Name]>) => Act
}

type EventInput<Shape> =
  | Act
  | ((event: Evt<Shape>) => Act)

type Events<Component> = {
  readonly [Name in keyof EventsOf<Component> & string]?: EventInput<EventsOf<Component>[Name]>
}

type EventAttrs<Component> = {
  readonly [Name in keyof EventsOf<Component> & string as `on${Capitalize<Name>}`]?: EventInput<EventsOf<Component>[Name]>
}

type SlotInput = Tree | readonly Tree[]

type Slots<Component> = {
  readonly [Name in keyof SlotsOf<Component> & string]?: SlotInput
}

type JsxNodeInput<Component, Registry> =
  Props<PropsOf<Component>>
  & EventAttrs<Component>
  & {
    readonly children?: Child
    readonly watch?: Partial<Record<keyof Registry & string, Act>>
    readonly visible?: Visible
  }

type NodeInput<Component, Registry> = {
  readonly props: Props<PropsOf<Component>>
  readonly slots?: Slots<Component>
  readonly on?: Events<Component>
  readonly watch?: Partial<Record<keyof Registry & string, Act>>
  readonly visible?: Visible
}

type NodeFn<Component, Registry> = {
  (input: JsxNodeInput<Component, Registry>): Node
  (input: NodeInput<Component, Registry>): Node
}

type Nodes<Catalog, Registry> = {
  readonly [Name in keyof Catalog & string]: NodeFn<Catalog[Name], Registry>
}

type Def = {
  readonly state: unknown
  readonly action: object
  readonly view: object
}

type SchemaShape = Record<string, Schema>

type SlotShape = readonly string[] | Record<string, unknown>

type PartConfig<Props extends SchemaShape = {}, Slots extends SlotShape = readonly [], Events extends SchemaShape = {}> = {
  readonly props?: Props
  readonly slots?: Slots
  readonly on?: Events
}

type AnyPartConfig = PartConfig<SchemaShape, SlotShape, SchemaShape>

type InferShape<S> = {
  readonly [Name in keyof S & string]: InferSchema<S[Name]>
}

type InferSlots<S> =
  S extends readonly (infer Name extends string)[] ? { readonly [Key in Name]: true } :
    S extends Record<string, unknown> ? { readonly [Key in keyof S & string]: true } :
      {}

type PropsFrom<C> = C extends { readonly props: infer Props extends SchemaShape } ? Props : {}

type SlotsFrom<C> = C extends { readonly slots: infer Slots extends SlotShape } ? Slots : readonly []

type EventsFrom<C> = C extends { readonly on: infer Events extends SchemaShape } ? Events : {}

type InferPart<C extends AnyPartConfig> = Part<InferShape<PropsFrom<C>>, InferSlots<SlotsFrom<C>>, InferShape<EventsFrom<C>>>

type Spec = {
  readonly state: Schema
  readonly action: Record<string, Schema>
  readonly view: Record<string, Part>
}

type InferSpec<S extends Spec> = {
  readonly state: InferSchema<S["state"]>
  readonly action: InferShape<S["action"]>
  readonly view: S["view"]
}

type Ui<D extends Def, S = undefined> = {
  readonly spec: S
  readonly state: State<D["state"]>
  readonly action: Actions<D["action"]>
  readonly view: Nodes<D["view"], D["action"]>
  readonly plan: (root: Node) => Plan
  readonly each: <T>(source: Collection<T>, child: (item: Item<T>) => Node | readonly Node[]) => Each
  readonly slot: (name: string, input: SlotInput) => NamedSlot
  readonly text: (template: string, args: Record<string, Val | Expr<unknown>>) => Expr<string | null>
}

function bind<T>(ref: Ref): Expr<T> {
  return { [exprKey]: ref }
}

function part<const C extends AnyPartConfig>(config: C): InferPart<C> {
  return config as unknown as InferPart<C>
}

function field(source: "state" | "item" | "event", path: readonly string[]): unknown {
  return new Proxy(bind({ kind: source, path }) as Record<PropertyKey, unknown>, {
    get(target, property) {
      if (property === exprKey) return target[property]
      if (typeof property !== "string") return target[property]
      return field(source, [...path, property])
    },
  })
}

function isExpr(input: unknown): input is Expr<unknown> {
  return typeof input === "object" && input !== null && exprKey in input
}

function expr(input: Val | Expr<unknown>): Val | Ref {
  if (isExpr(input)) return input[exprKey]
  return input
}

function props(input: Record<string, Val | Expr<unknown>>): Record<string, Val | Ref> {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, expr(value)]))
}

function act(input: Act): Call {
  return input[actKey]
}

function actions<Registry>(): Actions<Registry> {
  return new Proxy({} as Record<PropertyKey, unknown>, {
    get(_target, property) {
      if (typeof property !== "string") return undefined
      return (input: Record<string, Val | Expr<unknown>>) => ({ [actKey]: { name: property, input: props(input) } })
    },
  }) as Actions<Registry>
}

function events(input: Record<string, EventInput<unknown> | undefined> | undefined): Record<string, Call> | undefined {
  if (!input) return undefined
  const entries = Object.entries(input).filter((entry): entry is [string, EventInput<unknown>] => entry[1] !== undefined)
  return Object.fromEntries(entries.map(([key, value]) => {
    const call = typeof value === "function" ? value(field("event", []) as Evt<unknown>) : value
    return [key, act(call)]
  }))
}

function isTreeList(input: SlotInput): input is readonly Tree[] {
  return Array.isArray(input)
}

function slotValue(input: SlotInput): Slot {
  if (isTreeList(input)) return input
  return [input]
}

function slots(input: Record<string, SlotInput | undefined> | undefined): Record<string, Slot> | undefined {
  if (!input) return undefined
  const entries = Object.entries(input).filter((entry): entry is [string, SlotInput] => entry[1] !== undefined)
  return Object.fromEntries(entries.map(([key, value]) => [key, slotValue(value)]))
}

function visible(input: Visible): VisibleOut {
  const value = expr(input.state)
  const output: { state: Ref; eq?: Val } = { state: value as Ref }
  if ("eq" in input) output.eq = input.eq
  return output
}

function watches(input: Partial<Record<string, Act>> | undefined): Record<string, Call> | undefined {
  if (!input) return undefined
  const entries = Object.entries(input).filter((entry): entry is [string, Act] => entry[1] !== undefined)
  return Object.fromEntries(entries.map(([key, value]) => [key, act(value)]))
}

function eventName(key: string): string | undefined {
  if (!key.startsWith("on") || key.length < 3) return undefined
  return `${key.slice(2, 3).toLowerCase()}${key.slice(3)}`
}

function jsxProps(input: Record<string, unknown>): Record<string, Val | Expr<unknown>> {
  const entries = Object.entries(input).filter(([key]) => key !== "children" && key !== "watch" && key !== "visible" && eventName(key) === undefined)
  return Object.fromEntries(entries.map(([key, value]) => [key, value as Val | Expr<unknown>]))
}

function jsxEvents(input: Record<string, unknown>): Record<string, EventInput<unknown> | undefined> | undefined {
  const entries = Object.entries(input).flatMap(([key, value]) => {
    const name = eventName(key)
    return name === undefined ? [] : [[name, value as EventInput<unknown> | undefined] as const]
  })
  return entries.length === 0 ? undefined : Object.fromEntries(entries)
}

function isNamedSlot(input: Tree | NamedSlot): input is NamedSlot {
  return input.kind === "slot"
}

function isChildList(input: Child): input is readonly Child[] {
  return Array.isArray(input)
}

function childList(input: Child | undefined): readonly (Tree | NamedSlot)[] {
  if (input === undefined) return []
  if (isChildList(input)) return input.flatMap((child) => childList(child))
  return [input]
}

function jsxSlots(input: Child | undefined): Record<string, Slot> | undefined {
  const children = childList(input)
  const output: Record<string, Slot> = {}
  const defaults: Tree[] = []
  for (const child of children) {
    if (isNamedSlot(child)) output[child.name] = child.value
    else defaults.push(child)
  }
  if (defaults.length > 0) output["default"] = defaults
  return Object.keys(output).length === 0 ? undefined : output
}

function fromJsx<Registry>(input: JsxNodeInput<unknown, Registry>): NodeInput<unknown, Registry> {
  const raw = input as Record<string, unknown>
  return {
    props: jsxProps(raw),
    slots: jsxSlots(input.children),
    on: jsxEvents(raw),
    watch: input.watch,
    visible: input.visible,
  }
}

function inputOf<Registry>(input: NodeInput<unknown, Registry> | JsxNodeInput<unknown, Registry>): NodeInput<unknown, Registry> {
  if ("props" in input) return input
  return fromJsx(input)
}

function node<Catalog, Registry>(): Nodes<Catalog, Registry> {
  return new Proxy({} as Record<PropertyKey, unknown>, {
    get(_target, property) {
      if (typeof property !== "string") return undefined
      return ((raw: NodeInput<unknown, Registry> | JsxNodeInput<unknown, Registry>): Node => {
        const input = inputOf(raw)
        const output: Node = { kind: "node", type: property, props: props(input.props) }
        const loweredSlots = slots(input.slots)
        const loweredEvents = events(input.on)
        const loweredWatches = watches(input.watch)
        return {
          ...output,
          ...(loweredSlots ? { slots: loweredSlots } : {}),
          ...(loweredEvents ? { on: loweredEvents } : {}),
          ...(loweredWatches ? { watch: loweredWatches } : {}),
          ...(input.visible ? { visible: visible(input.visible) } : {}),
        }
      }) as NodeFn<unknown, Registry>
    },
  }) as Nodes<Catalog, Registry>
}

function jsx<T>(type: (input: Record<string, unknown>) => T, input: Record<string, unknown>): T {
  return type(input)
}

function Fragment(input: { readonly children?: Child }): readonly Node[] {
  return childList(input.children).filter((child): child is Node => child.kind === "node")
}

const jsxs = jsx

function named(name: string, input: SlotInput): NamedSlot {
  return {
    kind: "slot",
    name,
    value: slotValue(input),
  }
}

function each<T>(source: Collection<T>, child: (item: Item<T>) => Node | readonly Node[]): Each {
  const result = child(field("item", []) as Item<T>)
  return {
    kind: "each",
    source: expr(source) as Ref,
    nodes: Array.isArray(result) ? result : [result],
  }
}

function ui<D extends Def>(): Ui<D>
function ui<const S extends Spec>(spec: S): Ui<InferSpec<S>, S>
function ui(spec?: unknown): Ui<Def, unknown> {
  const view = node<object, object>()
  return {
    spec,
    state: field("state", []) as State<Def["state"]>,
    action: actions<Def["action"]>(),
    view,
    plan: (root) => ({ root }),
    each,
    slot: named,
    text: (template, args) => bind({ kind: "text", template, args: props(args) }),
  }
}

export { Fragment, jsx, jsxs, p, part, ui, valueKinds }
export type {
  Act,
  Actions,
  ArraySchema,
  BaseSchema,
  Call,
  Child,
  Collection,
  Def,
  Each,
  Evt,
  Expr,
  Field,
  Input,
  Infer,
  InferSchema,
  Item,
  KindFor,
  KindOfSchema,
  LeafKind,
  LeafSchema,
  NamedSlot,
  Node,
  NodeFn,
  Nodes,
  ObjectSchema,
  Part,
  PartConfig,
  Plan,
  Ref,
  Schema,
  Slot,
  SlotInput,
  Spec,
  Standard,
  State,
  Tree,
  Ui,
  Val,
  ValueKind,
}

import type {
  BaseSchema,
  JsonExpr,
  JsonNode,
  JsonSpec,
  KindFor,
  PathMap,
  SlotSpec,
  ValueKind,
} from "./contract"

type Kinded<K extends ValueKind> = { readonly __kind: K }
type StateBind<P extends string, K extends ValueKind> = { readonly state: P } & Kinded<K>
type ItemBind<K extends ValueKind> = { readonly item: string } & Kinded<K>
type EventBind<K extends ValueKind> = { readonly event: string } & Kinded<K>
type TemplateBind = { readonly template: string; readonly args: Record<string, JsonExpr> } & Kinded<"nullableString">

type LiteralFor<K extends ValueKind> =
  K extends "string" ? string :
    K extends "number" ? number :
      K extends "boolean" ? boolean :
        K extends "nullableString" ? null :
          never

type Bind<K extends ValueKind> =
  | LiteralFor<K>
  | StateBind<string, K>
  | ItemBind<K>
  | EventBind<K>
  | (K extends "nullableString" ? TemplateBind : never)

type DisplayKind = Exclude<ValueKind, "array" | "object">
type DisplayArg =
  | string
  | number
  | boolean
  | null
  | StateBind<string, DisplayKind>
  | ItemBind<DisplayKind>
  | EventBind<DisplayKind>
  | TemplateBind

type CondLiteral<K extends ValueKind> =
  K extends "string" ? string :
    K extends "number" ? number :
      K extends "boolean" ? boolean :
        K extends "nullableString" ? string | null :
          never

type CatalogComponent = {
  props: Record<string, ValueKind>
  slots: Record<string, SlotSpec>
  events: Record<string, Record<string, ValueKind>>
  capabilities: readonly string[]
}
type Catalog = Record<string, CatalogComponent>
type ActionShape = { params: Record<string, ValueKind> }
type Registry = Record<string, ActionShape>

type PropsBind<P extends Record<string, ValueKind>> = { [K in keyof P]: Bind<P[K]> }

type EventHandler<R extends Registry> = {
  [FK in keyof R & string]: { readonly flow: FK; readonly params: PropsBind<R[FK]["params"]> }
}[keyof R & string]

type EventAccessor<Shape extends Record<string, ValueKind>> =
  <F extends keyof Shape & string>(field: F) => EventBind<Shape[F]>

type Path<Schema extends BaseSchema> = keyof PathMap<Schema> & string
type PathKind<Schema extends BaseSchema, P extends Path<Schema>> = KindFor<PathMap<Schema>[P]>

type ItemAccessorFromPath<Schema extends BaseSchema, P extends string> =
  PathMap<Schema>[P & keyof PathMap<Schema>] extends readonly (infer E)[]
    ? <Field extends keyof E & string>(field: Field) => ItemBind<KindFor<E[Field]>>
    : never

type VisibleBind<Schema extends BaseSchema> = {
  [P in Path<Schema>]: { readonly state: P; readonly eq?: CondLiteral<PathKind<Schema, P>> }
}[Path<Schema>]

type RepeatSlots<C extends Catalog, T extends keyof C> =
  { [S in keyof C[T]["slots"]]-?: C[T]["slots"][S] extends { repeats: string } ? S : never }[keyof C[T]["slots"]]
type PlainSlots<C extends Catalog, T extends keyof C> = Exclude<keyof C[T]["slots"], RepeatSlots<C, T>>

type HasRepeatSlot<C extends Catalog, T extends keyof C> = [RepeatSlots<C, T>] extends [never] ? false : true

type Authored<F extends boolean> = JsonNode & { readonly __hasRepeatInSubtree?: F }
type ContainsTrue<U> = true extends U ? true : false
type SlotsContainRepeat<S> = ContainsTrue<{
  [K in keyof S]: S[K] extends readonly Authored<infer F>[] ? ContainsTrue<F> : false
}[keyof S]>
type NodeFlag<C extends Catalog, T extends keyof C, S> =
  HasRepeatSlot<C, T> extends true ? true : SlotsContainRepeat<S>

type ItemAccessorForSlot<
  C extends Catalog,
  Schema extends BaseSchema,
  T extends keyof C,
  S extends keyof C[T]["slots"],
  P,
> =
  C[T]["slots"][S] extends { repeats: infer Prop extends string }
    ? P[Prop & keyof P] extends StateBind<infer Pth extends string, ValueKind>
      ? ItemAccessorFromPath<Schema, Pth>
      : never
    : never

type SlotConfig<C extends Catalog, Schema extends BaseSchema, T extends keyof C, P> =
  & { [S in PlainSlots<C, T>]?: readonly Authored<boolean>[] }
  & { [S in RepeatSlots<C, T>]?: (it: ItemAccessorForSlot<C, Schema, T, S, P>) => readonly Authored<false>[] }

type NodeConfig<C extends Catalog, R extends Registry, Schema extends BaseSchema, T extends keyof C, P> = {
  readonly props: P
  readonly slots?: SlotConfig<C, Schema, T, P>
  readonly on?: { [E in keyof C[T]["events"]]?: (ev: EventAccessor<C[T]["events"][E]>) => EventHandler<R> }
  readonly watch?: Partial<Record<Path<Schema>, EventHandler<R>>>
  readonly visible?: VisibleBind<Schema>
}

interface Author<C extends Catalog, R extends Registry, Schema extends BaseSchema> {
  spec(root: JsonNode): JsonSpec
  node<
    T extends keyof C & string,
    const P extends PropsBind<C[T]["props"]>,
    const S extends SlotConfig<C, Schema, T, P> = {},
  >(
    type: T,
    config: NodeConfig<C, R, Schema, T, P> & { readonly slots?: S }
  ): Authored<NodeFlag<C, T, S>>
  state<P extends Path<Schema>>(path: P): StateBind<P, PathKind<Schema, P>>
  template(template: string, args: Record<string, DisplayArg>): TemplateBind
}

const eventAccessor = ((field: string) => ({ event: field })) as unknown
const itemAccessor = ((field: string) => ({ item: field })) as unknown

function createAuthor<
  const C extends Catalog,
  const R extends Registry,
  Schema extends BaseSchema,
>(_deps: { catalog: C; registry: R; schema: Schema }): Author<C, R, Schema> {
  type AnySlot = readonly JsonNode[] | ((it: unknown) => readonly JsonNode[])
  type AnyConfig = {
    props: Record<string, JsonExpr>
    slots?: Record<string, AnySlot>
    on?: Record<string, (ev: unknown) => { flow: string; params: Record<string, JsonExpr> }>
    watch?: Record<string, { flow: string; params: Record<string, JsonExpr> }>
    visible?: JsonNode["visible"]
  }

  const node = (type: string, config: AnyConfig): JsonNode => {
    const out: JsonNode = { type, props: { ...config.props } }
    if (config.slots) {
      const slots: Record<string, JsonNode[]> = {}
      for (const [slot, value] of Object.entries(config.slots)) {
        slots[slot] = typeof value === "function" ? [...value(itemAccessor)] : [...value]
      }
      out.slots = slots
    }
    if (config.on) {
      const on: Record<string, { flow: string; params: Record<string, JsonExpr> }> = {}
      for (const [event, handler] of Object.entries(config.on)) on[event] = handler(eventAccessor)
      out.on = on
    }
    if (config.watch) out.watch = config.watch
    if (config.visible) out.visible = config.visible
    return out
  }

  return {
    spec: (root) => ({ root }),
    node: node as Author<C, R, Schema>["node"],
    state: ((path: string) => ({ state: path })) as unknown as Author<C, R, Schema>["state"],
    template: (template, args) => ({ template, args }) as unknown as TemplateBind,
  }
}

export { createAuthor }
export type { Author }

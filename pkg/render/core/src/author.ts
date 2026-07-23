import type {
  ArraySchema,
  Assert,
  BaseSchema,
  CondLiteral,
  DisplayKind,
  Equal,
  KindFor,
  KindOfSchema,
  ObjectSchema,
  ValueKind,
} from "./schema"
import type { JsonExpr, JsonNode, JsonSpec, RepeatSlot, SlotSpec } from "./spec"
import type { PathMap } from "./tokens"

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

type DisplayArg =
  | string
  | number
  | boolean
  | null
  | StateBind<string, DisplayKind>
  | ItemBind<DisplayKind>
  | EventBind<DisplayKind>
  | TemplateBind

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

type WatchBind<K extends ValueKind> =
  | LiteralFor<K>
  | StateBind<string, K>
  | (K extends "nullableString" ? TemplateBind : never)
type WatchPropsBind<P extends Record<string, ValueKind>> = { [K in keyof P]: WatchBind<P[K]> }
type WatchHandler<R extends Registry> = {
  [FK in keyof R & string]: { readonly flow: FK; readonly params: WatchPropsBind<R[FK]["params"]> }
}[keyof R & string]

type EventAccessor<Shape extends Record<string, ValueKind>> =
  <F extends keyof Shape & string>(field: F) => EventBind<Shape[F]>

type Path<Schema extends BaseSchema> = keyof PathMap<Schema> & string
type PathKind<Schema extends BaseSchema, P extends Path<Schema>> = KindFor<PathMap<Schema>[P]>

type SchemaWalk<S extends BaseSchema, Segs extends string> =
  Segs extends `${infer Head}/${infer Tail}`
    ? S extends ObjectSchema<infer F>
      ? Head extends keyof F ? SchemaWalk<F[Head], Tail> : never
      : never
    : S extends ObjectSchema<infer F>
      ? Segs extends keyof F ? F[Segs] : never
      : never
type SchemaAtPath<S extends BaseSchema, P extends string> =
  P extends `/${infer Rest}` ? SchemaWalk<S, Rest> : never
type ElementSchemaAtPath<S extends BaseSchema, P extends string> =
  SchemaAtPath<S, P> extends ArraySchema<infer I> ? I : never
type ItemFieldsOf<E extends BaseSchema> =
  [E] extends [never] ? {} :
    [E] extends [ObjectSchema<infer F>] ? { [K in keyof F & string]: KindOfSchema<F[K]> } : {}
type ItemAccessorFor<Fields extends Record<string, ValueKind>> =
  <Field extends keyof Fields & string>(field: Field) => ItemBind<Fields[Field]>
type ItemAccessorFromPath<Schema extends BaseSchema, P extends string> =
  ItemAccessorFor<ItemFieldsOf<ElementSchemaAtPath<Schema, P>>>

type VisibleBind<Schema extends BaseSchema> = {
  [P in Path<Schema>]: { readonly state: P; readonly eq?: CondLiteral<PathKind<Schema, P>> }
}[Path<Schema>]

type RepeatSlots<C extends Catalog, T extends keyof C> =
  { [S in keyof C[T]["slots"]]-?: C[T]["slots"][S] extends RepeatSlot ? S : never }[keyof C[T]["slots"]]
type PlainSlots<C extends Catalog, T extends keyof C> = Exclude<keyof C[T]["slots"], RepeatSlots<C, T>>

type HasRepeatSlot<C extends Catalog, T extends keyof C> = [RepeatSlots<C, T>] extends [never] ? false : true

/** Phantom flag carried on every authored node: true iff its subtree contains a repeating slot. Type-only, never serialized. */
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
  C[T]["slots"][S] extends RepeatSlot
    ? C[T]["slots"][S] extends { repeats: infer Prop extends string }
      ? P[Prop & keyof P] extends StateBind<infer Pth extends string, "array">
        ? ItemAccessorFromPath<Schema, Pth>
        : never
      : never
    : never

type RepeatBuilder<Acc> = [Acc] extends [never] ? never : (it: Acc) => readonly Authored<false>[]

/** Agreement assert: a repeat slot is unprovidable (its builder collapses to `never`) when its `it` accessor is `never`. */
type ItNeverEdgeUnconstructible = Assert<Equal<RepeatBuilder<never>, never>>

type SlotConfig<C extends Catalog, Schema extends BaseSchema, T extends keyof C, P> =
  & { [S in PlainSlots<C, T>]?: readonly Authored<boolean>[] }
  & { [S in RepeatSlots<C, T>]?: RepeatBuilder<ItemAccessorForSlot<C, Schema, T, S, P>> }

type NodeConfig<C extends Catalog, R extends Registry, Schema extends BaseSchema, T extends keyof C, P> = {
  readonly props: P
  readonly slots?: SlotConfig<C, Schema, T, P>
  readonly on?: { [E in keyof C[T]["events"]]?: (ev: EventAccessor<C[T]["events"][E]>) => EventHandler<R> }
  readonly watch?: Partial<Record<Path<Schema>, WatchHandler<R>>>
  readonly visible?: VisibleBind<Schema>
}

/** Provides typed JSON-spec authoring over a catalog, action registry, and state schema. */
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

/** Builds the typed authoring surface over a catalog, action registry, and state schema. */
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
export type { Author, Authored, ItNeverEdgeUnconstructible }

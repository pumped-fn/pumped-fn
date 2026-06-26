import type {
  BaseSchema,
  JsonExpr,
  JsonNode,
  JsonSpec,
  KindFor,
  KindOfSchema,
  PathMap,
  SlotSpec,
  ValueKind,
} from "./contract"

type Kinded<K extends ValueKind> = { readonly __kind: K }
type StateBind<K extends ValueKind> = { readonly state: string } & Kinded<K>
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
  | StateBind<K>
  | ItemBind<K>
  | EventBind<K>
  | (K extends "nullableString" ? TemplateBind : never)

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

type ItemAccessor<Item extends BaseSchema> =
  Item extends { fields: infer F extends Record<string, BaseSchema> }
    ? <K extends keyof F & string>(field: K) => ItemBind<KindOfSchema<F[K]>>
    : never

type Path<Schema extends BaseSchema> = keyof PathMap<Schema> & string
type PathKind<Schema extends BaseSchema, P extends Path<Schema>> = KindFor<PathMap<Schema>[P]>

type VisibleBind<Schema extends BaseSchema> = {
  [P in Path<Schema>]: { readonly state: P; readonly eq?: CondLiteral<PathKind<Schema, P>> }
}[Path<Schema>]

type NodeConfig<C extends Catalog, R extends Registry, Schema extends BaseSchema, T extends keyof C> = {
  readonly props: PropsBind<C[T]["props"]>
  readonly slots?: { [S in keyof C[T]["slots"]]?: readonly JsonNode[] }
  readonly on?: { [E in keyof C[T]["events"]]?: (ev: EventAccessor<C[T]["events"][E]>) => EventHandler<R> }
  readonly watch?: Partial<Record<Path<Schema>, EventHandler<R>>>
  readonly visible?: VisibleBind<Schema>
}

interface Author<C extends Catalog, R extends Registry, Schema extends BaseSchema> {
  spec(root: JsonNode): JsonSpec
  node<T extends keyof C & string>(type: T, config: NodeConfig<C, R, Schema, T>): JsonNode
  state<P extends Path<Schema>>(path: P): StateBind<PathKind<Schema, P>>
  template(template: string, args: Record<string, JsonExpr>): TemplateBind
  repeat<Item extends BaseSchema>(
    item: Item,
    build: (it: ItemAccessor<Item>) => readonly JsonNode[]
  ): JsonNode[]
}

const eventAccessor = ((field: string) => ({ event: field })) as unknown
const itemAccessor = ((field: string) => ({ item: field })) as unknown

function createAuthor<
  const C extends Catalog,
  const R extends Registry,
  Schema extends BaseSchema,
>(_deps: { catalog: C; registry: R; schema: Schema }): Author<C, R, Schema> {
  type AnyConfig = {
    props: Record<string, JsonExpr>
    slots?: Record<string, JsonNode[]>
    on?: Record<string, (ev: unknown) => { flow: string; params: Record<string, JsonExpr> }>
    watch?: Record<string, { flow: string; params: Record<string, JsonExpr> }>
    visible?: JsonNode["visible"]
  }

  const node = (type: string, config: AnyConfig): JsonNode => {
    const out: JsonNode = { type, props: { ...config.props } }
    if (config.slots) out.slots = config.slots
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
    repeat: ((_item: unknown, build: (it: unknown) => readonly JsonNode[]) =>
      [...build(itemAccessor)]) as Author<C, R, Schema>["repeat"],
  }
}

export { createAuthor }
export type { Author }

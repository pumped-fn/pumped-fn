import { flow, typed, type Lite } from "@pumped-fn/lite"
import { scopedValue } from "@pumped-fn/lite-react"
import { createAuthor } from "./authoring"

type ValueKind = "string" | "number" | "boolean" | "nullableString" | "array" | "object"
type KindFor<T> =
  [T] extends [readonly unknown[]] ? "array" :
    [null] extends [T] ? "nullableString" :
      [T] extends [string] ? "string" :
        [T] extends [number] ? "number" :
          [T] extends [boolean] ? "boolean" :
            never
type FieldsKindOf<T> = {
  [K in keyof T]: KindFor<T[K]>
}
type KindOfSchema<S extends BaseSchema> =
  S extends LeafSchema<infer T> ? KindFor<T> :
    S extends { node: "array" } ? "array" :
      S extends { node: "object" } ? "object" :
        never
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Assert<T extends true> = T

interface BaseSchema {
  readonly node: "leaf" | "array" | "object"
  readonly _type: (value: never) => unknown
}
interface LeafSchema<T> extends BaseSchema {
  readonly node: "leaf"
  readonly kind: ValueKind
  readonly _type: (value: T) => T
}
interface ArraySchema<I extends BaseSchema> extends BaseSchema {
  readonly node: "array"
  readonly item: I
  readonly _type: (value: Infer<I>[]) => Infer<I>[]
}
interface ObjectSchema<F extends Record<string, BaseSchema>> extends BaseSchema {
  readonly node: "object"
  readonly fields: F
  readonly _type: (value: { [K in keyof F]: Infer<F[K]> }) => { [K in keyof F]: Infer<F[K]> }
}
type Infer<S extends BaseSchema> = S extends { readonly _type: (value: infer T) => unknown } ? T : never

const leaf = <T>(kind: KindFor<T>): LeafSchema<T> => ({ node: "leaf", kind, _type: (value) => value })

const k = {
  string: leaf<string>("string"),
  number: leaf<number>("number"),
  boolean: leaf<boolean>("boolean"),
  nullableString: leaf<string | null>("nullableString"),
  array: <I extends BaseSchema>(item: I): ArraySchema<I> => ({ node: "array", item, _type: (value) => value }),
  object: <const F extends Record<string, BaseSchema>>(fields: F): ObjectSchema<F> => ({ node: "object", fields, _type: (value) => value }),
}

type JsonValue = string | number | boolean | null
type JsonExpr =
  | JsonValue
  | { state: string }
  | { item: string }
  | { event: string }
  | { template: string; args: Record<string, JsonExpr> }
type JsonAction = {
  flow: string
  params: Record<string, JsonExpr>
}
type JsonCondition = {
  state: string
  eq?: JsonValue
}
type JsonNode = {
  type: string
  props: Record<string, JsonExpr>
  slots?: Record<string, JsonNode[]>
  on?: Record<string, JsonAction>
  watch?: Record<string, JsonAction>
  visible?: JsonCondition
}
type JsonSpec = {
  root: JsonNode
}
type SlotSpec = true | { repeats: string }
type ComponentSchema = {
  props: Record<string, ValueKind>
  slots: Record<string, SlotSpec>
  events: Record<string, Record<string, ValueKind>>
  capabilities: string[]
}
type ItemContext = {
  fields: Record<string, ValueKind>
}
type StateToken = {
  path: string
  kind: ValueKind
  item?: ItemContext
}
type ActionToken = {
  flow: Lite.Flow<any, any>
  params: Record<string, ValueKind>
}
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

function objectFields(schema: BaseSchema): Record<string, BaseSchema> {
  return (schema as ObjectSchema<Record<string, BaseSchema>>).fields
}

function kindOf(schema: BaseSchema): ValueKind {
  if (schema.node === "leaf") return (schema as LeafSchema<unknown>).kind
  if (schema.node === "object") return "object"
  return "array"
}

function fieldsKindOf(schema: BaseSchema): Record<string, ValueKind> {
  return Object.fromEntries(Object.entries(objectFields(schema)).map(([field, child]) => [field, kindOf(child)]))
}

function itemContextOf(item: BaseSchema): ItemContext {
  return item.node === "object" ? { fields: fieldsKindOf(item) } : { fields: {} }
}

function collectTokens(schema: BaseSchema, prefix: string, tokens: Record<string, StateToken>): void {
  if (schema.node === "object") {
    for (const [field, child] of Object.entries(objectFields(schema))) {
      collectTokens(child, `${prefix}/${field}`, tokens)
    }
    return
  }
  if (schema.node === "array") {
    tokens[prefix] = { path: prefix, kind: "array", item: itemContextOf((schema as ArraySchema<BaseSchema>).item) }
    return
  }
  tokens[prefix] = { path: prefix, kind: (schema as LeafSchema<unknown>).kind }
}

function buildStateTokens(schema: BaseSchema): Record<string, StateToken> {
  const tokens: Record<string, StateToken> = {}
  collectTokens(schema, "", tokens)
  return tokens
}

type CatalogInput = Record<string, {
  props: Record<string, BaseSchema>
  slots: Record<string, SlotSpec>
  events: Record<string, Record<string, ValueKind>>
  capabilities: string[]
}>
type TypedCatalog<C extends CatalogInput> = {
  [N in keyof C]: {
    props: { [P in keyof C[N]["props"]]: KindOfSchema<C[N]["props"][P]> }
    slots: C[N]["slots"]
    events: C[N]["events"]
    capabilities: string[]
  }
}

function defineCatalog<const C extends CatalogInput>(catalog: C): TypedCatalog<C> {
  return Object.fromEntries(Object.entries(catalog).map(([name, entry]) => [name, {
    props: Object.fromEntries(Object.entries(entry.props).map(([prop, schema]) => [prop, kindOf(schema)])),
    slots: entry.slots,
    events: entry.events,
    capabilities: entry.capabilities,
  }])) as TypedCatalog<C>
}

type PathEntry<S extends BaseSchema, P extends string> =
  S extends LeafSchema<infer T> ? { key: P; value: T } :
    S extends ArraySchema<infer I> ? { key: P; value: Infer<I>[] } | PathEntry<I, `${P}/${number}`> :
      S extends ObjectSchema<infer F> ? { [K in keyof F & string]: PathEntry<F[K], `${P}/${K}`> }[keyof F & string] :
        never
type PathMap<S extends BaseSchema> = { [E in PathEntry<S, ""> as E["key"]]: E["value"] }

const cardSchema = k.object({
  id: k.string,
  title: k.string,
  columnId: k.string,
  done: k.boolean,
})
const columnSchema = k.object({
  id: k.string,
  title: k.string,
})
const boardSchema = k.object({
  board: k.object({
    columns: k.array(columnSchema),
    cards: k.array(cardSchema),
    selectedCardId: k.nullableString,
    showDone: k.boolean,
    summary: k.object({
      lastMove: k.nullableString,
    }),
    metrics: k.object({
      total: k.number,
      done: k.number,
    }),
  }),
})

type BoardState = Infer<typeof boardSchema>
type Card = Infer<typeof cardSchema>
type BoardPaths = PathMap<typeof boardSchema>
type Path = keyof BoardPaths & string
type PathValue<P extends Path> = BoardPaths[P]

function statePath<S extends BaseSchema>() {
  return <P extends keyof PathMap<S> & string>(path: P): P => path
}

const path = statePath<typeof boardSchema>()

const board = scopedValue({
  name: "typed-render-board",
  initial: (): BoardState => ({
    board: {
      columns: [
        { id: "todo", title: "Todo" },
        { id: "done", title: "Done" },
      ],
      cards: [
        { id: "card-1", title: "Write brief", columnId: "todo", done: false },
        { id: "card-2", title: "Review layout", columnId: "done", done: true },
      ],
      selectedCardId: null,
      showDone: true,
      summary: {
        lastMove: null,
      },
      metrics: {
        total: 2,
        done: 1,
      },
    },
  }),
})

const moveCardInput = k.object({
  cardId: k.string,
  fromColumnId: k.string,
  toColumnId: k.string,
  toIndex: k.number,
})
const loadCardInput = k.object({
  cardId: k.nullableString,
})

type MoveCardInput = Infer<typeof moveCardInput>
type LoadCardInput = Infer<typeof loadCardInput>
type RenderActionInput = {
  action: JsonAction
  event?: MoveCardInput
}

const moveCard = flow({
  name: "typed-render-move-card",
  parse: typed<MoveCardInput>(),
  deps: { access: board },
  factory: (ctx, { access }) => {
    access.update((state) => {
      const cards = state.board.cards.map((card) => card.id === ctx.input.cardId
        ? { ...card, columnId: ctx.input.toColumnId, done: ctx.input.toColumnId === "done" }
        : card)
      return {
        ...state,
        board: {
          ...state.board,
          cards,
          selectedCardId: ctx.input.cardId,
          metrics: {
            total: cards.length,
            done: cards.filter((card) => card.done).length,
          },
        },
      }
    })
  },
})

const loadCardDetails = flow({
  name: "typed-render-load-card-details",
  parse: typed<LoadCardInput>(),
  deps: { access: board },
  factory: (ctx, { access }) => {
    const card = access.get().board.cards.find((candidate) => candidate.id === ctx.input.cardId)
    access.update((state) => ({
      ...state,
      board: {
        ...state.board,
        summary: {
          ...state.board.summary,
          lastMove: card ? `Loaded ${card.title}` : null,
        },
      },
    }))
  },
})

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

const actionRegistry = {
  moveCard: action(moveCard, moveCardInput),
  loadCardDetails: action(loadCardDetails, loadCardInput),
} satisfies Record<string, ActionToken>

const runJsonAction = flow({
  name: "typed-render-run-json-action",
  parse: typed<RenderActionInput>(),
  deps: { access: board },
  factory: (ctx, { access }) => {
    const target = actionRegistry[ctx.input.action.flow as keyof typeof actionRegistry]
    if (!target) throw new Error(`Unknown verified flow ${ctx.input.action.flow}`)
    return ctx.exec({ flow: target.flow, rawInput: actionParams(ctx.input.action, access.get(), undefined, ctx.input.event) })
  },
})

const stateTokens = buildStateTokens(boardSchema)

const components = defineCatalog({
  Stack: {
    props: { direction: k.string },
    slots: { children: true },
    events: {},
    capabilities: ["layout.stack"],
  },
  Text: {
    props: { text: k.nullableString },
    slots: {},
    events: {},
    capabilities: ["text"],
  },
  SortableList: {
    props: { items: k.array(cardSchema) },
    slots: { item: { repeats: "items" } },
    events: {
      move: actionRegistry.moveCard.params,
    },
    capabilities: ["interaction.sortable"],
  },
  Card: {
    props: { title: k.string, done: k.boolean },
    slots: {},
    events: {},
    capabilities: ["surface.card"],
  },
  Summary: {
    props: { heading: k.string },
    slots: { items: true },
    events: {},
    capabilities: ["layout.summary"],
  },
  Stat: {
    props: { label: k.string, value: k.number },
    slots: {},
    events: {},
    capabilities: ["display.stat"],
  },
  Badge: {
    props: { text: k.nullableString, tone: k.string },
    slots: {},
    events: {},
    capabilities: ["display.badge"],
  },
})

const context: VerifyContext = {
  state: stateTokens,
  components,
  actions: actionRegistry,
  rendererCapabilities: new Set([
    "layout.stack",
    "text",
    "interaction.sortable",
    "surface.card",
    "layout.summary",
    "display.stat",
    "display.badge",
  ]),
}

const boardSpec: JsonSpec = {
  root: {
    type: "Stack",
    props: {
      direction: "vertical",
    },
    watch: {
      "/board/selectedCardId": {
        flow: "loadCardDetails",
        params: {
          cardId: { state: "/board/selectedCardId" },
        },
      },
    },
    slots: {
      children: [
        {
          type: "Text",
          props: {
            text: {
              template: "Status: {lastMove}",
              args: {
                lastMove: { state: "/board/summary/lastMove" },
              },
            },
          },
        },
        {
          type: "SortableList",
          props: {
            items: { state: "/board/cards" },
          },
          on: {
            move: {
              flow: "moveCard",
              params: {
                cardId: { event: "cardId" },
                fromColumnId: { event: "fromColumnId" },
                toColumnId: { event: "toColumnId" },
                toIndex: { event: "toIndex" },
              },
            },
          },
          slots: {
            item: [
              {
                type: "Card",
                props: {
                  title: { item: "title" },
                  done: { item: "done" },
                },
                visible: {
                  state: "/board/showDone",
                  eq: true,
                },
              },
            ],
          },
        },
      ],
    },
  },
}

const summarySpec: JsonSpec = {
  root: {
    type: "Summary",
    props: {
      heading: "Board metrics",
    },
    slots: {
      items: [
        {
          type: "Stat",
          props: {
            label: "Total",
            value: { state: "/board/metrics/total" },
          },
        },
        {
          type: "Stat",
          props: {
            label: "Done",
            value: { state: "/board/metrics/done" },
          },
        },
        {
          type: "Badge",
          props: {
            text: {
              template: "Last move: {move}",
              args: {
                move: { state: "/board/summary/lastMove" },
              },
            },
            tone: "info",
          },
          visible: {
            state: "/board/summary/lastMove",
          },
        },
      ],
    },
  },
}

const author = createAuthor({ catalog: components, registry: actionRegistry, schema: boardSchema })

const visibilitySpec: JsonSpec = author.spec(
  author.node("Stack", {
    props: { direction: "vertical" },
    slots: {
      children: [
        author.node("Badge", {
          props: {
            text: author.template("Done count: {count}", { count: author.state("/board/metrics/done") }),
            tone: "info",
          },
          visible: { state: "/board/showDone", eq: true },
        }),
        author.node("Badge", {
          props: {
            text: author.state("/board/summary/lastMove"),
            tone: "muted",
          },
          visible: { state: "/board/showDone", eq: false },
        }),
      ],
    },
  })
)

const authoredBoardSpec: JsonSpec = author.spec(
  author.node("Stack", {
    props: { direction: "vertical" },
    watch: {
      "/board/selectedCardId": {
        flow: "loadCardDetails",
        params: { cardId: author.state("/board/selectedCardId") },
      },
    },
    slots: {
      children: [
        author.node("Text", {
          props: {
            text: author.template("Status: {lastMove}", { lastMove: author.state("/board/summary/lastMove") }),
          },
        }),
        author.node("SortableList", {
          props: { items: author.state("/board/cards") },
          on: {
            move: (ev) => ({
              flow: "moveCard",
              params: {
                cardId: ev("cardId"),
                fromColumnId: ev("fromColumnId"),
                toColumnId: ev("toColumnId"),
                toIndex: ev("toIndex"),
              },
            }),
          },
          slots: {
            item: author.repeat(cardSchema, (it) => [
              author.node("Card", {
                props: { title: it("title"), done: it("done") },
                visible: { state: "/board/showDone", eq: true },
              }),
            ]),
          },
        }),
      ],
    },
  })
)

function verifySpec(spec: JsonSpec, ctx: VerifyContext = context): VerificationResult {
  const errors: VerificationError[] = []
  verifyNode(spec.root, "$.root", ctx, undefined, errors)
  return errors.length === 0 ? { ok: true, spec } : { ok: false, errors }
}

function verifyNode(
  node: JsonNode,
  location: string,
  ctx: VerifyContext,
  item: ItemContext | undefined,
  errors: VerificationError[]
): void {
  const component = ctx.components[node.type]
  if (!component) {
    errors.push({ code: "unknown_component", path: `${location}.type`, message: `Unknown component ${node.type}` })
    return
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
    verifyAction(action, `${location}.watch.${watchedPath}`, ctx, item, undefined, errors)
  }
  if (node.visible) verifyCondition(node.visible, `${location}.visible`, ctx, errors)
  for (const [slot, children] of Object.entries(node.slots ?? {})) {
    const slotSpec = component.slots[slot]
    const childItem = slotSpec && slotSpec !== true
      ? repeatItemContext(node, slotSpec, ctx, errors, `${location}.slots.${slot}`)
      : item
    children.forEach((child, index) => verifyNode(child, `${location}.slots.${slot}.${index}`, ctx, childItem, errors))
  }
}

function repeatItemContext(
  node: JsonNode,
  slot: { repeats: string },
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
    exprKind(arg, ctx, item, event, `${location}.args.${name}`, errors)
  }
  return "nullableString"
}

function templatePlaceholders(template: string): Set<string> {
  return new Set(Array.from(template.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)).map((match) => match[1]!))
}

function literalMatches(value: JsonValue, kind: ValueKind): boolean {
  if (kind === "string") return typeof value === "string"
  if (kind === "number") return typeof value === "number"
  if (kind === "boolean") return typeof value === "boolean"
  if (kind === "nullableString") return value === null || typeof value === "string"
  return false
}

function readPath(state: BoardState, path: string): unknown {
  return path.split("/").filter(Boolean).reduce<unknown>((value, segment) => {
    if (value === undefined || value === null) return undefined
    if (Array.isArray(value)) return value[Number(segment)]
    return (value as Record<string, unknown>)[segment]
  }, state)
}

function resolveExpr(expr: JsonExpr, state: BoardState, item?: Card, event?: MoveCardInput): unknown {
  if (typeof expr !== "object" || expr === null) return expr
  if ("state" in expr) return readPath(state, expr.state)
  if ("item" in expr) return item?.[expr.item as keyof Card]
  if ("event" in expr) return event?.[expr.event as keyof MoveCardInput]
  return Object.entries(expr.args).reduce((text, [name, value]) => text.replace(`{${name}}`, String(resolveExpr(value, state, item, event) ?? "None")), expr.template)
}

function actionParams(action: JsonAction, state: BoardState, item?: Card, event?: MoveCardInput): Record<string, unknown> {
  return Object.fromEntries(Object.entries(action.params).map(([key, expr]) => [key, resolveExpr(expr, state, item, event)]))
}

type ShowDoneKindIsBoolean = Assert<Equal<KindFor<PathValue<"/board/showDone">>, "boolean">>
type MissingPathRejected = Assert<Equal<"/board/missing" extends Path ? true : false, false>>
type CardTitlePathIsString = Assert<Equal<PathValue<"/board/cards/0/title">, string>>
type ShowDoneIsNotString = Assert<Equal<PathValue<"/board/showDone"> extends string ? true : false, false>>
type CardsPathKindIsArray = Assert<Equal<KindFor<PathValue<"/board/cards">>, "array">>
type MetricsTotalKindIsNumber = Assert<Equal<KindFor<PathValue<"/board/metrics/total">>, "number">>
type StateTypeMatchesSchema = Assert<Equal<BoardState["board"]["metrics"]["done"], number>>
type MovePayloadColumnKindIsString = Assert<Equal<FieldsKindOf<MoveCardInput>["toColumnId"], "string">>
type MoveInputDerivedFromSchema = Assert<Equal<MoveCardInput, Infer<typeof moveCardInput>>>
type BoardSchemaKindIsObject = Assert<Equal<KindOfSchema<typeof boardSchema>, "object">>
type CardSchemaKindIsObject = Assert<Equal<KindOfSchema<typeof cardSchema>, "object">>
type ObjectSchemaIsNotArrayKind = Assert<Equal<KindOfSchema<typeof boardSchema> extends "array" ? true : false, false>>
type SummaryNestedObjectKindIsObject = Assert<Equal<KindOfSchema<typeof columnSchema>, "object">>

export {
  board,
  loadCardDetails,
  moveCard,
  moveCardInput,
  loadCardInput,
  action,
  actionRegistry,
  boardSchema,
  cardSchema,
  author,
  leaf,
  kindOf,
  path,
  runJsonAction,
  readPath,
  resolveExpr,
  actionParams,
  boardSpec,
  summarySpec,
  visibilitySpec,
  authoredBoardSpec,
  verifySpec,
}
export type {
  BoardState,
  Card,
  JsonAction,
  JsonExpr,
  JsonNode,
  JsonSpec,
  LoadCardInput,
  MoveCardInput,
  RenderActionInput,
  KindFor,
  KindOfSchema,
  FieldsKindOf,
  Infer,
  Path,
  PathValue,
  ValueKind,
  BaseSchema,
  LeafSchema,
  ArraySchema,
  ObjectSchema,
  PathMap,
  SlotSpec,
  BoardSchemaKindIsObject,
  CardSchemaKindIsObject,
  ObjectSchemaIsNotArrayKind,
  SummaryNestedObjectKindIsObject,
  ShowDoneKindIsBoolean,
  MissingPathRejected,
  CardTitlePathIsString,
  ShowDoneIsNotString,
  CardsPathKindIsArray,
  MetricsTotalKindIsNumber,
  StateTypeMatchesSchema,
  MovePayloadColumnKindIsString,
  MoveInputDerivedFromSchema,
}

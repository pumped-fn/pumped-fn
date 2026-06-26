import { flow, typed, type Lite } from "@pumped-fn/lite"
import { scopedValue } from "@pumped-fn/lite-react"

type Path<T> = T extends BoardState ? keyof BoardPaths & string : never
type PathValue<T, P extends Path<T>> = T extends BoardState
  ? P extends keyof BoardPaths
    ? BoardPaths[P]
    : never
  : never
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Assert<T extends true> = T

type ValueKind = "string" | "number" | "boolean" | "nullableString" | "cardArray"
type KindFor<T> =
  T extends readonly Card[] ? "cardArray" :
    [T] extends [string | null] ? null extends T ? "nullableString" : "string" :
        T extends number ? "number" :
          T extends boolean ? "boolean" :
            never
type FieldsKindOf<T> = {
  [K in keyof T]: KindFor<T[K]>
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
type ComponentSchema = {
  props: Record<string, ValueKind>
  slots: Record<string, true | { repeats: string }>
  events: Record<string, Record<string, ValueKind>>
  capabilities: string[]
}
type StateToken = {
  path: string
  kind: ValueKind
  item?: ItemContext
}
type ItemContext = {
  fields: Record<string, ValueKind>
}
type VerifyContext = {
  state: Record<string, StateToken>
  components: Record<string, ComponentSchema>
  actions: Record<string, ActionToken>
  rendererCapabilities: Set<string>
}
type ActionToken = {
  flow: Lite.Flow<any, any>
  params: Record<string, ValueKind>
}
type VerificationError = {
  code: string
  path: string
  message: string
}
type VerificationResult =
  | { ok: true; spec: JsonSpec }
  | { ok: false; errors: VerificationError[] }
type Card = {
  id: string
  title: string
  columnId: string
  done: boolean
}
type Column = {
  id: string
  title: string
}
type BoardState = {
  board: {
    columns: Column[]
    cards: Card[]
    selectedCardId: string | null
    showDone: boolean
    summary: {
      lastMove: string | null
    }
  }
}
type BoardPaths = {
  "/board/cards": Card[]
  "/board/selectedCardId": string | null
  "/board/showDone": boolean
  "/board/summary/lastMove": string | null
} & Record<`/board/cards/${number}/id`, string>
  & Record<`/board/cards/${number}/title`, string>
  & Record<`/board/cards/${number}/columnId`, string>
  & Record<`/board/cards/${number}/done`, boolean>
type MoveCardInput = {
  cardId: string
  fromColumnId: string
  toColumnId: string
  toIndex: number
}
type LoadCardInput = {
  cardId: string | null
}
type RenderActionInput = {
  action: JsonAction
  event?: MoveCardInput
}
type ShowDoneKindIsBoolean = Assert<Equal<KindFor<PathValue<BoardState, "/board/showDone">>, "boolean">>
type MissingPathRejected = Assert<Equal<"/board/missing" extends Path<BoardState> ? true : false, false>>
type CardTitlePathIsString = Assert<Equal<PathValue<BoardState, "/board/cards/0/title">, string>>
type ShowDoneIsNotString = Assert<Equal<PathValue<BoardState, "/board/showDone"> extends string ? true : false, false>>
type MovePayloadRequiresStringColumn = Assert<Equal<{ toColumnId: boolean } extends Pick<MoveCardInput, "toColumnId"> ? true : false, false>>
type MovePayloadColumnKindIsString = Assert<Equal<FieldsKindOf<MoveCardInput>["toColumnId"], "string">>

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
    },
  }),
})

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

function statePath<T>() {
  return <P extends Path<T>>(path: P) => path
}

function pathToken<T, P extends Path<T>>(
  path: P,
  kind: KindFor<PathValue<T, P>>,
  item?: PathValue<T, P> extends readonly (infer Item)[] ? ItemContext & { fields: FieldsKindOf<Item> } : never
): StateToken {
  return item ? { path, kind, item } : { path, kind }
}

function action<F extends Lite.Flow<any, any>>(
  flow: F,
  params: FieldsKindOf<Lite.Utils.FlowInput<F>>
): ActionToken {
  return { flow, params }
}

function defineActions<const R extends Record<string, ActionToken>>(actions: R): R & Record<string, ActionToken> {
  return actions
}

const path = statePath<BoardState>()

const stateTokens = {
  cards: pathToken<BoardState, "/board/cards">(path("/board/cards"), "cardArray", {
    fields: {
      id: "string",
      title: "string",
      columnId: "string",
      done: "boolean",
    },
  }),
  selectedCardId: pathToken<BoardState, "/board/selectedCardId">(path("/board/selectedCardId"), "nullableString"),
  showDone: pathToken<BoardState, "/board/showDone">(path("/board/showDone"), "boolean"),
  lastMove: pathToken<BoardState, "/board/summary/lastMove">(path("/board/summary/lastMove"), "nullableString"),
} satisfies Record<string, StateToken>

const actions = defineActions({
  moveCard: action(moveCard, {
    cardId: "string",
    fromColumnId: "string",
    toColumnId: "string",
    toIndex: "number",
  }),
  loadCardDetails: action(loadCardDetails, {
    cardId: "nullableString",
  }),
})

const runJsonAction = flow({
  name: "typed-render-run-json-action",
  parse: typed<RenderActionInput>(),
  deps: { access: board },
  factory: (ctx, { access }) => {
    const target = actions[ctx.input.action.flow]
    if (!target) throw new Error(`Unknown verified flow ${ctx.input.action.flow}`)
    return ctx.exec({ flow: target.flow, rawInput: actionParams(ctx.input.action, access.get(), undefined, ctx.input.event) })
  },
})

const components = {
  Stack: {
    props: { direction: "string" },
    slots: { children: true },
    events: {},
    capabilities: ["layout.stack"],
  },
  Text: {
    props: { text: "nullableString" },
    slots: {},
    events: {},
    capabilities: ["text"],
  },
  SortableList: {
    props: { items: "cardArray" },
    slots: { item: { repeats: "items" } },
    events: {
      move: actions.moveCard.params,
    },
    capabilities: ["interaction.sortable"],
  },
  Card: {
    props: { title: "string", done: "boolean" },
    slots: {},
    events: {},
    capabilities: ["surface.card"],
  },
} satisfies Record<string, ComponentSchema>

const validSpec: JsonSpec = {
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

const context: VerifyContext = {
  state: Object.fromEntries(Object.values(stateTokens).map((token) => [token.path, token])),
  components,
  actions,
  rendererCapabilities: new Set(["layout.stack", "text", "interaction.sortable", "surface.card"]),
}

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

export {
  board,
  loadCardDetails,
  moveCard,
  runJsonAction,
  readPath,
  resolveExpr,
  actionParams,
  validSpec,
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
  FieldsKindOf,
  Path,
  PathValue,
  VerificationError,
  VerificationResult,
  ShowDoneKindIsBoolean,
  MissingPathRejected,
  CardTitlePathIsString,
  ShowDoneIsNotString,
  MovePayloadRequiresStringColumn,
  MovePayloadColumnKindIsString,
}

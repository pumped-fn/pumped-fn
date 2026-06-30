import { flow, typed } from "@pumped-fn/lite"
import {
  action,
  buildStateTokens,
  createAuthor,
  createRunJsonAction,
  defineCatalog,
  k,
  statePath,
  type Assert,
  type Equal,
  type FieldsKindOf,
  type Infer,
  type KindFor,
  type KindOfSchema,
  type NoObjectKindStatePath,
  type PathMap,
  type StateTokenKeysMirrorPathSet,
  type VerifyContext,
} from "../src"
import { stateResource } from "./state-resource"

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

const path = statePath<typeof boardSchema>()

const board = stateResource((): BoardState => ({
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
    summary: { lastMove: null },
    metrics: { total: 2, done: 1 },
  },
}))

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

const moveCard = flow({
  name: "board-move-card",
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
          metrics: { total: cards.length, done: cards.filter((card) => card.done).length },
        },
      }
    })
  },
})

const loadCardDetails = flow({
  name: "board-load-card-details",
  parse: typed<LoadCardInput>(),
  deps: { access: board },
  factory: (ctx, { access }) => {
    const card = access.get().board.cards.find((candidate) => candidate.id === ctx.input.cardId)
    access.update((state) => ({
      ...state,
      board: { ...state.board, summary: { ...state.board.summary, lastMove: card ? `Loaded ${card.title}` : null } },
    }))
  },
})

const actionRegistry = {
  moveCard: action(moveCard, moveCardInput),
  loadCardDetails: action(loadCardDetails, loadCardInput),
}

const runJsonAction = createRunJsonAction({ registry: actionRegistry, state: board })

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
    events: { move: actionRegistry.moveCard.params },
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

const author = createAuthor({ catalog: components, registry: actionRegistry, schema: boardSchema })

const boardSpec = author.spec(
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
          props: { text: author.template("Status: {lastMove}", { lastMove: author.state("/board/summary/lastMove") }) },
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
            item: (it) => [
              author.node("Card", {
                props: { title: it("title"), done: it("done") },
                visible: { state: "/board/showDone", eq: true },
              }),
            ],
          },
        }),
      ],
    },
  })
)

const summarySpec = author.spec(
  author.node("Summary", {
    props: { heading: "Board metrics" },
    slots: {
      items: [
        author.node("Stat", { props: { label: "Total", value: author.state("/board/metrics/total") } }),
        author.node("Stat", { props: { label: "Done", value: author.state("/board/metrics/done") } }),
        author.node("Badge", {
          props: {
            text: author.template("Last move: {move}", { move: author.state("/board/summary/lastMove") }),
            tone: "info",
          },
          visible: { state: "/board/summary/lastMove" },
        }),
      ],
    },
  })
)

const visibilitySpec = author.spec(
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
          props: { text: author.state("/board/summary/lastMove"), tone: "muted" },
          visible: { state: "/board/showDone", eq: false },
        }),
      ],
    },
  })
)

const authoredBoardSpec = boardSpec

const watchSpec = author.spec(
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
          props: { text: author.template("Watch: {lastMove}", { lastMove: author.state("/board/summary/lastMove") }) },
        }),
      ],
    },
  })
)

type StateTokenKeysMirror = Assert<StateTokenKeysMirrorPathSet<typeof boardSchema>>
type NoObjectStatePath = Assert<NoObjectKindStatePath<typeof boardSchema>>
type ShowDoneKindIsBoolean = Assert<Equal<KindFor<PathValue<"/board/showDone">>, "boolean">>
type MissingPathRejected = Assert<Equal<"/board/missing" extends Path ? true : false, false>>
type IndexedCardPathRejected = Assert<Equal<"/board/cards/0/title" extends Path ? true : false, false>>
type CardsPathValueIsCardArray = Assert<Equal<PathValue<"/board/cards">, Card[]>>
type ShowDoneIsNotString = Assert<Equal<PathValue<"/board/showDone"> extends string ? true : false, false>>
type CardsPathKindIsArray = Assert<Equal<KindFor<PathValue<"/board/cards">>, "array">>
type MetricsTotalKindIsNumber = Assert<Equal<KindFor<PathValue<"/board/metrics/total">>, "number">>
type StateTypeMatchesSchema = Assert<Equal<BoardState["board"]["metrics"]["done"], number>>
type MovePayloadColumnKindIsString = Assert<Equal<FieldsKindOf<MoveCardInput>["toColumnId"], "string">>
type MoveInputDerivedFromSchema = Assert<Equal<MoveCardInput, Infer<typeof moveCardInput>>>
type BoardSchemaKindIsObject = Assert<Equal<KindOfSchema<typeof boardSchema>, "object">>
type CardSchemaKindIsObject = Assert<Equal<KindOfSchema<typeof cardSchema>, "object">>
type ObjectSchemaIsNotArrayKind = Assert<Equal<KindOfSchema<typeof boardSchema> extends "array" ? true : false, false>>
type ColumnSchemaKindIsObject = Assert<Equal<KindOfSchema<typeof columnSchema>, "object">>

export {
  board,
  boardSchema,
  cardSchema,
  columnSchema,
  context,
  author,
  path,
  moveCard,
  loadCardDetails,
  moveCardInput,
  loadCardInput,
  actionRegistry,
  runJsonAction,
  boardSpec,
  summarySpec,
  visibilitySpec,
  authoredBoardSpec,
  watchSpec,
}
export type {
  BoardState,
  Card,
  Path,
  PathValue,
  MoveCardInput,
  LoadCardInput,
  StateTokenKeysMirror,
  NoObjectStatePath,
  ShowDoneKindIsBoolean,
  MissingPathRejected,
  IndexedCardPathRejected,
  CardsPathValueIsCardArray,
  ShowDoneIsNotString,
  CardsPathKindIsArray,
  MetricsTotalKindIsNumber,
  StateTypeMatchesSchema,
  MovePayloadColumnKindIsString,
  MoveInputDerivedFromSchema,
  BoardSchemaKindIsObject,
  CardSchemaKindIsObject,
  ObjectSchemaIsNotArrayKind,
  ColumnSchemaKindIsObject,
}

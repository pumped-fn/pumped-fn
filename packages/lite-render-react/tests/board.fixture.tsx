import { flow, typed } from "@pumped-fn/lite"
import { scopedValue } from "@pumped-fn/lite-react"
import {
  action,
  buildStateTokens,
  createAuthor,
  createRunJsonAction,
  defineCatalog,
  k,
  type Infer,
  type VerifyContext,
} from "@pumped-fn/lite-render-core"
import { defineComponents, type NodeRenderProps } from "../src"

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
    summary: k.object({ lastMove: k.nullableString }),
    metrics: k.object({ total: k.number, done: k.number }),
  }),
})

type BoardState = Infer<typeof boardSchema>

const board = scopedValue({
  name: "render-react-board",
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
      summary: { lastMove: null },
      metrics: { total: 2, done: 1 },
    },
  }),
})

const moveCardInput = k.object({
  cardId: k.string,
  fromColumnId: k.string,
  toColumnId: k.string,
  toIndex: k.number,
})
const loadCardInput = k.object({ cardId: k.nullableString })

type MoveCardInput = Infer<typeof moveCardInput>
type LoadCardInput = Infer<typeof loadCardInput>

const moveCard = flow({
  name: "render-react-move-card",
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
  name: "render-react-load-card-details",
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
  state: buildStateTokens(boardSchema),
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

function StackView({ props, slots }: NodeRenderProps<(typeof components)["Stack"]>) {
  return (
    <section aria-label="typed render board" data-direction={props.direction}>
      {slots.children}
    </section>
  )
}

function TextView({ props }: NodeRenderProps<(typeof components)["Text"]>) {
  return <output aria-label="board status">{String(props.text ?? "")}</output>
}

function SortableListView({ slots, on }: NodeRenderProps<(typeof components)["SortableList"]>) {
  return (
    <div>
      <ul>
        {slots.item.map((node, index) => (
          <li key={index}>{node}</li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => on.move({ cardId: "card-2", fromColumnId: "done", toColumnId: "todo", toIndex: 0 })}
      >
        Move Review layout to Todo
      </button>
    </div>
  )
}

function CardView({ props }: NodeRenderProps<(typeof components)["Card"]>) {
  return (
    <article aria-label={String(props.title)} data-done={String(props.done)}>
      {String(props.title)}
    </article>
  )
}

function SummaryView({ props, slots }: NodeRenderProps<(typeof components)["Summary"]>) {
  return (
    <section aria-label="board summary" data-heading={String(props.heading)}>
      {slots.items}
    </section>
  )
}

function StatView({ props }: NodeRenderProps<(typeof components)["Stat"]>) {
  return (
    <div role="status" aria-label={String(props.label)}>
      {String(props.value)}
    </div>
  )
}

function BadgeView({ props }: NodeRenderProps<(typeof components)["Badge"]>) {
  return (
    <span aria-label="board badge" data-tone={String(props.tone)}>
      {String(props.text ?? "")}
    </span>
  )
}

const renderComponents = defineComponents(components, {
  Stack: StackView,
  Text: TextView,
  SortableList: SortableListView,
  Card: CardView,
  Summary: SummaryView,
  Stat: StatView,
  Badge: BadgeView,
})

export {
  board,
  components,
  context,
  renderComponents,
  runJsonAction,
  boardSpec,
  summarySpec,
  visibilitySpec,
  watchSpec,
}
export type { BoardState, MoveCardInput, LoadCardInput }

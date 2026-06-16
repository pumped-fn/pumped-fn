import {
  ExecutionContextProvider,
  useAtom,
  useController,
  useExecutionContext,
  useResource,
  useScopedValue,
  useSelect,
} from "@pumped-fn/lite-react"
import {
  boardFilters,
  boardSession,
  boardView,
  cardDraft,
  editingCardId,
  moveCard,
  saveCardDraft,
  type CardView,
} from "./board"

function ignoreFlowFailure(): void {}

function CardEditor({ card }: { card: CardView }) {
  const ctx = useExecutionContext()
  const draft = useScopedValue(cardDraft, { suspense: false })

  if (draft.status !== "ready") return <div>draft {card.id}</div>

  return (
    <div>
      <label>
        title {card.id}
        <input
          aria-label={`title ${card.id}`}
          value={draft.data.snapshot.title}
          onChange={(e) => draft.data.actions.setTitle(e.currentTarget.value)}
        />
      </label>
      <label>
        points {card.id}
        <input
          aria-label={`points ${card.id}`}
          type="number"
          value={draft.data.snapshot.points}
          onChange={(e) => draft.data.actions.setPoints(Number(e.currentTarget.value))}
        />
      </label>
      <button
        aria-label={`save ${card.id}`}
        onClick={() => {
          void ctx.exec({ flow: saveCardDraft }).catch(ignoreFlowFailure)
        }}
      >
        save
      </button>
    </div>
  )
}

function CardRow({ card }: { card: CardView }) {
  const ctx = useExecutionContext()

  return (
    <article>
      <h3>{card.title}</h3>
      <span>{card.priority}</span>
      <span>{card.points} points</span>
      <span>{card.assigneeName}</span>
      <span>{card.reviewerName}</span>
      <span>{card.blocked ? "blocked" : "clear"}</span>
      <button
        aria-label={`move ${card.id} to done`}
        onClick={() => {
          void ctx.exec({ flow: moveCard, input: { cardId: card.id, toLaneId: "done", toIndex: 99 } }).catch(ignoreFlowFailure)
        }}
      >
        done
      </button>
      <ExecutionContextProvider tags={[editingCardId(card.id)]}>
        <CardEditor card={card} />
      </ExecutionContextProvider>
    </article>
  )
}

export function KanbanBoard() {
  const viewState = useAtom(boardView, { suspense: false, resolve: true })
  const summaryState = useSelect(boardView, (value) => value.summary, { suspense: false, resolve: true })
  const filtersState = useAtom(boardFilters, { suspense: false, resolve: true })
  const sessionState = useResource(boardSession, { suspense: false })
  const filterControl = useController(boardFilters)

  if (!viewState.data || !summaryState.data || !filtersState.data || sessionState.status !== "ready") {
    return <div>loading kanban</div>
  }

  const view = viewState.data
  const summary = summaryState.data
  const filters = filtersState.data
  const session = sessionState.data

  return (
    <section>
      <header>
        <span>{session.workspaceId}</span>
        <span>{session.actorId}</span>
        <h1>{view.project.name}</h1>
        <span>cards {summary.cards}</span>
        <span>blocked {summary.blocked}</span>
        <span>points {summary.points}</span>
      </header>
      <label>
        search cards
        <input
          aria-label="search cards"
          value={filters.query}
          onChange={(e) => {
            filterControl.set({ ...filters, query: e.currentTarget.value })
          }}
        />
      </label>
      <section aria-label="warnings">
        {view.warnings.map((warning) => (
          <div key={warning}>{warning}</div>
        ))}
      </section>
      <div>
        {view.lanes.map((lane) => (
          <section key={lane.id} aria-label={lane.title}>
            <h2>{lane.title}</h2>
            <span>
              {lane.count}/{lane.limit}
            </span>
            <span>{lane.overLimit ? "over limit" : "within limit"}</span>
            {lane.cards.map((card) => (
              <CardRow key={card.id} card={card} />
            ))}
          </section>
        ))}
      </div>
    </section>
  )
}

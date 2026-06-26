import { useCallback, useEffect, useRef, type ReactNode } from "react"
import { useFlow, useScopedValue } from "@pumped-fn/lite-react"
import {
  board,
  boardSpec,
  readPath,
  resolveExpr,
  runJsonAction,
  summarySpec,
  verifySpec,
  visibilitySpec,
  type BoardState,
  type Card,
  type JsonAction,
  type JsonNode,
  type JsonSpec,
  type MoveCardInput,
} from "./contract"

const verifiedSpecs = new Map<JsonSpec, JsonSpec>()

function getVerifiedSpec(spec: JsonSpec): JsonSpec {
  const cached = verifiedSpecs.get(spec)
  if (cached) return cached
  const result = verifySpec(spec)
  if (!result.ok) {
    throw new Error(result.errors.map((error) => error.message).join("\n"))
  }
  verifiedSpecs.set(spec, result.spec)
  return result.spec
}

function useExecute() {
  const { execute: runVerifiedAction } = useFlow(runJsonAction)
  return useCallback((action: JsonAction, event?: MoveCardInput) => {
    runVerifiedAction(event === undefined ? { action } : { action, event })
  }, [runVerifiedAction])
}

function TypedRenderBoard() {
  const spec = getVerifiedSpec(boardSpec)
  const access = useScopedValue(board)
  const execute = useExecute()
  const selected = readPath(access.snapshot, "/board/selectedCardId")
  const previousSelected = useRef(selected)
  const selectedWatchAction = spec.root.watch?.["/board/selectedCardId"]

  useEffect(() => {
    if (previousSelected.current === selected) return
    previousSelected.current = selected
    if (selectedWatchAction) execute(selectedWatchAction)
  }, [execute, selected, selectedWatchAction])

  return <>{renderNode(spec.root, access.snapshot, execute)}</>
}

function TypedRenderSummary() {
  const spec = getVerifiedSpec(summarySpec)
  const access = useScopedValue(board)
  const execute = useExecute()
  return <>{renderNode(spec.root, access.snapshot, execute)}</>
}

function TypedRenderVisibility() {
  const spec = getVerifiedSpec(visibilitySpec)
  const access = useScopedValue(board)
  const execute = useExecute()
  return <>{renderNode(spec.root, access.snapshot, execute)}</>
}

function renderNode(
  node: JsonNode,
  state: BoardState,
  execute: (action: JsonAction, event?: MoveCardInput) => void,
  item?: Card
): ReactNode {
  if (node.visible) {
    const actual = readPath(state, node.visible.state)
    if (node.visible.eq !== undefined && actual !== node.visible.eq) return null
    if (node.visible.eq === undefined && !actual) return null
  }

  if (node.type === "Stack") {
    return (
      <section aria-label="typed render board" data-direction={resolveExpr(node.props["direction"]!, state, item) as string}>
        {node.slots?.["children"]?.map((child, index) => <FragmentNode key={index}>{renderNode(child, state, execute, item)}</FragmentNode>)}
      </section>
    )
  }

  if (node.type === "Text") {
    return <output aria-label="board status">{String(resolveExpr(node.props["text"]!, state, item) ?? "")}</output>
  }

  if (node.type === "SortableList") {
    const cards = resolveExpr(node.props["items"]!, state, item) as Card[]
    const action = node.on?.["move"]
    return (
      <div>
        <ul>
          {cards.map((card) => (
            <li key={card.id}>
              {node.slots?.["item"]?.map((child, index) => <FragmentNode key={index}>{renderNode(child, state, execute, card)}</FragmentNode>)}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => action && execute(action, { cardId: "card-2", fromColumnId: "done", toColumnId: "todo", toIndex: 0 })}
        >
          Move Review layout to Todo
        </button>
      </div>
    )
  }

  if (node.type === "Card") {
    return (
      <article aria-label={String(resolveExpr(node.props["title"]!, state, item))} data-done={String(resolveExpr(node.props["done"]!, state, item))}>
        {String(resolveExpr(node.props["title"]!, state, item))}
      </article>
    )
  }

  if (node.type === "Summary") {
    return (
      <section aria-label="board summary" data-heading={String(resolveExpr(node.props["heading"]!, state, item))}>
        {node.slots?.["items"]?.map((child, index) => <FragmentNode key={index}>{renderNode(child, state, execute, item)}</FragmentNode>)}
      </section>
    )
  }

  if (node.type === "Stat") {
    return (
      <div role="status" aria-label={String(resolveExpr(node.props["label"]!, state, item))}>
        {String(resolveExpr(node.props["value"]!, state, item))}
      </div>
    )
  }

  if (node.type === "Badge") {
    return (
      <span aria-label="board badge" data-tone={String(resolveExpr(node.props["tone"]!, state, item))}>
        {String(resolveExpr(node.props["text"]!, state, item) ?? "")}
      </span>
    )
  }

  return null
}

function FragmentNode({ children }: { children: ReactNode }) {
  return <>{children}</>
}

export { TypedRenderBoard, TypedRenderSummary, TypedRenderVisibility }

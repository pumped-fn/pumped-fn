import type { ComponentMap } from "../src"
import { components } from "./board.fixture"

// @ts-expect-error Card.done is boolean in the catalog; an impl whose props expect number cannot satisfy the mirror
const badCardProp: ComponentMap<typeof components>["Card"] = (
  _props: { props: { title: string; done: number }; slots: Record<string, never>; on: Record<string, never> }
) => null

// @ts-expect-error move.toIndex is number in the catalog event; an impl expecting string cannot satisfy the mirror
const badSortableEvent: ComponentMap<typeof components>["SortableList"] = (
  _props: {
    props: { items: readonly unknown[] }
    slots: { item: unknown[] }
    on: { move: (event: { cardId: string; fromColumnId: string; toColumnId: string; toIndex: string }) => void }
  }
) => null

export { badCardProp, badSortableEvent }

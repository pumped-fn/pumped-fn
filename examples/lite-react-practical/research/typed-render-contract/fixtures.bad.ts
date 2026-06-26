import {
  action,
  actionRegistry,
  author,
  cardSchema,
  leaf,
  loadCardInput,
  moveCard,
  path,
  type KindFor,
  type PathValue,
} from "./contract"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Assert<T extends true> = T

// @ts-expect-error /board/nope is not a schema-derived state path
export const badPath = path("/board/nope")

// @ts-expect-error loadCardInput is not the moveCard input schema
export const badActionPayload = action(moveCard, loadCardInput)

// @ts-expect-error missingFlow is not a member of the shared action registry
export const badActionKey = actionRegistry.missingFlow

// @ts-expect-error the ValueKind derived from a number PathValue is "number", not "string"
export type BadValueKind = Assert<Equal<KindFor<PathValue<"/board/metrics/total">>, "string">>

// @ts-expect-error a leaf for number cannot be labeled "string" (KindFor<number> is "number")
export const badLeafLabel = leaf<number>("string")

// @ts-expect-error /board/nope is not a schema-derived state path on the typed author surface
export const badAuthoredStateExpr = author.state("/board/nope")

// @ts-expect-error /board/cards/0/title is an indexed array-element path the verifier never tokenizes
export const badAuthoredIndexedStatePath = author.state("/board/cards/0/title")

export const badAuthoredPropKind = author.node("Stat", {
  props: {
    label: "Total",
    // @ts-expect-error a nullableString state cannot fill the numeric Stat.value prop
    value: author.state("/board/summary/lastMove"),
  },
})

export const badAuthoredUnknownAction = author.node("SortableList", {
  props: { items: author.state("/board/cards") },
  on: {
    // @ts-expect-error missingFlow is not a member of the shared action registry
    move: () => ({ flow: "missingFlow", params: {} }),
  },
})

export const badAuthoredFlowPayload = author.node("SortableList", {
  props: { items: author.state("/board/cards") },
  on: {
    // @ts-expect-error the numeric toIndex event field cannot fill the string cardId param
    move: (ev) => ({
      flow: "moveCard",
      params: {
        cardId: ev("toIndex"),
        fromColumnId: ev("fromColumnId"),
        toColumnId: ev("toColumnId"),
        toIndex: ev("toIndex"),
      },
    }),
  },
})

export const badAuthoredRepeatField = author.node("SortableList", {
  props: { items: author.state("/board/cards") },
  slots: {
    item: author.repeat(cardSchema, (it) => [
      author.node("Card", {
        props: {
          // @ts-expect-error "nope" is not a field of the repeat item schema
          title: it("nope"),
          done: it("done"),
        },
      }),
    ]),
  },
})

export const badAuthoredTemplateArrayArg = author.node("Text", {
  props: {
    // @ts-expect-error an array-kind state path is not displayable and cannot be a template arg
    text: author.template("Cards: {cards}", { cards: author.state("/board/cards") }),
  },
})

export const badAuthoredVisibleEqKind = author.node("Badge", {
  props: { text: null, tone: "info" },
  // @ts-expect-error showDone is boolean, so the visibility literal must be boolean
  visible: { state: "/board/showDone", eq: "yes" },
})

export const badAuthoredVisiblePath = author.node("Badge", {
  props: { text: null, tone: "info" },
  // @ts-expect-error /board/nope is not a schema-derived state path
  visible: { state: "/board/nope", eq: true },
})

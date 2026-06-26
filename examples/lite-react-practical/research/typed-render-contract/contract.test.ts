import { describe, expect, test } from "vitest"
import { createScope } from "@pumped-fn/lite"
import {
  author,
  authoredBoardSpec,
  board,
  boardSchema,
  boardSpec,
  context,
  kindOf,
  runJsonAction,
  summarySpec,
  verifySpec,
  visibilitySpec,
  type JsonNode,
  type JsonSpec,
} from "./contract"

function clone(spec: JsonSpec): JsonSpec {
  return JSON.parse(JSON.stringify(spec)) as JsonSpec
}

function codes(spec: JsonSpec): string[] {
  const result = verifySpec(spec)
  return result.ok ? [] : result.errors.map((error) => error.code)
}

describe("typed render contract verifier", () => {
  test("accepts the valid board spec at detail level", () => {
    expect(verifySpec(boardSpec)).toEqual({ ok: true, spec: boardSpec })
  })

  test("rejects a bad state path", () => {
    const spec = clone(boardSpec)
    spec.root.slots!["children"]![1]!.props["items"] = { state: "/board/missing" }

    expect(codes(spec)).toContain("unknown_state_path")
  })

  test("rejects a prop value with the wrong kind", () => {
    const spec = clone(boardSpec)
    spec.root.slots!["children"]![0]!.props["text"] = 12

    expect(codes(spec)).toContain("kind_mismatch")
  })

  test("rejects an unknown slot", () => {
    const spec = clone(boardSpec)
    spec.root.slots!["footer"] = []

    expect(codes(spec)).toContain("unknown_slot")
  })

  test("rejects an unknown event", () => {
    const spec = clone(boardSpec)
    spec.root.slots!["children"]![1]!.on!["dragged"] = spec.root.slots!["children"]![1]!.on!["move"]!

    expect(codes(spec)).toContain("unknown_event")
  })

  test("rejects an unknown flow action", () => {
    const spec = clone(boardSpec)
    spec.root.slots!["children"]![1]!.on!["move"]!.flow = "missingFlow"

    expect(codes(spec)).toContain("unknown_flow")
  })

  test("rejects a flow payload wired from the wrong event field kind", () => {
    const spec = clone(boardSpec)
    spec.root.slots!["children"]![1]!.on!["move"]!.params["toColumnId"] = { event: "toIndex" }

    expect(codes(spec)).toContain("kind_mismatch")
  })

  test("rejects an unbound template placeholder", () => {
    const spec = clone(boardSpec)
    spec.root.slots!["children"]![0]!.props["text"] = {
      template: "Status: {missing}",
      args: {
        lastMove: { state: "/board/summary/lastMove" },
      },
    }

    expect(codes(spec)).toContain("unbound_template_placeholder")
  })

  test("rejects an unreferenced template arg", () => {
    const spec = clone(boardSpec)
    spec.root.slots!["children"]![0]!.props["text"] = {
      template: "Status",
      args: {
        lastMove: { state: "/board/summary/lastMove" },
      },
    }

    expect(codes(spec)).toContain("unreferenced_template_arg")
  })

  test("rejects repeat item fields outside the catalog-derived item scope", () => {
    const spec = clone(boardSpec)
    spec.root.slots!["children"]![1]!.slots!["item"]![0]!.props["title"] = { item: "missing" }

    expect(codes(spec)).toContain("unknown_item_path")
  })
})

describe("typed render contract second component family (summary)", () => {
  test("accepts the valid summary spec at detail level", () => {
    expect(verifySpec(summarySpec)).toEqual({ ok: true, spec: summarySpec })
  })

  test("rejects a string state bound to the numeric Stat value prop", () => {
    const spec = clone(summarySpec)
    spec.root.slots!["items"]![0]!.props["value"] = { state: "/board/summary/lastMove" }

    expect(codes(spec)).toContain("kind_mismatch")
  })

  test("rejects an unknown component in the summary family", () => {
    const spec = clone(summarySpec)
    spec.root.slots!["items"]![2]!.type = "Gauge"

    expect(codes(spec)).toContain("unknown_component")
  })

  test("rejects a Stat bound to a non-existent state path", () => {
    const spec = clone(summarySpec)
    spec.root.slots!["items"]![1]!.props["value"] = { state: "/board/metrics/missing" }

    expect(codes(spec)).toContain("unknown_state_path")
  })
})

describe("typed render contract schema kind soundness", () => {
  test("classifies an object schema node as object, not array", () => {
    expect(kindOf(boardSchema)).toBe("object")
    expect(kindOf(boardSchema)).not.toBe("array")
  })
})

describe("typed render contract compile-typed authoring surface", () => {
  test("the authored conditional-visibility spec passes the runtime verifier", () => {
    expect(verifySpec(visibilitySpec)).toEqual({ ok: true, spec: visibilitySpec })
  })

  test("the authored spec is portable JSON with no brand leakage", () => {
    expect(JSON.parse(JSON.stringify(visibilitySpec))).toEqual(visibilitySpec)
  })

  test("the typed builder emits the exact JSON artifact the verifier consumes (no semantic fork)", () => {
    expect(authoredBoardSpec).toEqual(boardSpec)
    expect(verifySpec(authoredBoardSpec)).toEqual({ ok: true, spec: authoredBoardSpec })
  })
})

describe("typed render contract shared action registry", () => {
  test("verifier rejects an action outside the shared registry", () => {
    const spec = clone(summarySpec)
    spec.root.on = { tapped: { flow: "missingFlow", params: {} } }

    expect(codes(spec)).toContain("unknown_event")
  })

  test("dispatcher rejects an action outside the shared registry the verifier guards", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    await board.resolve(ctx)

    await expect(
      ctx.exec({ flow: runJsonAction, input: { action: { flow: "missingFlow", params: {} } } })
    ).rejects.toThrow(/Unknown verified flow/)

    await ctx.close()
    await scope.dispose()
  })
})

describe("typed render contract template arg kind check", () => {
  test("verifier rejects an array state path interpolated into a text template", () => {
    const spec = clone(boardSpec)
    spec.root.slots!["children"]![0]!.props["text"] = {
      template: "Cards: {cards}",
      args: { cards: { state: "/board/cards" } },
    }

    expect(codes(spec)).toContain("non_displayable_template_arg")
  })

  test("verifier still accepts a number state path interpolated into a text template", () => {
    const spec = clone(boardSpec)
    spec.root.slots!["children"]![0]!.props["text"] = {
      template: "Total: {total}",
      args: { total: { state: "/board/metrics/total" } },
    }

    expect(verifySpec(spec)).toEqual({ ok: true, spec })
  })
})

describe("typed render contract nested-repeat restriction", () => {
  function innerList(): JsonNode {
    return {
      type: "SortableList",
      props: { items: { state: "/board/cards" } },
      slots: { item: [{ type: "Card", props: { title: { item: "title" }, done: { item: "done" } } }] },
    }
  }

  test("verifier rejects a repeating-slot component nested directly inside a repeating slot", () => {
    const spec: JsonSpec = {
      root: {
        type: "SortableList",
        props: { items: { state: "/board/cards" } },
        slots: { item: [innerList()] },
      },
    }
    expect(codes(spec)).toContain("nested_repeat_forbidden")
  })

  test("verifier rejects a repeating-slot component nested transitively (SortableList -> Stack -> SortableList)", () => {
    const spec: JsonSpec = {
      root: {
        type: "SortableList",
        props: { items: { state: "/board/cards" } },
        slots: {
          item: [
            { type: "Stack", props: { direction: "vertical" }, slots: { children: [innerList()] } },
          ],
        },
      },
    }
    expect(codes(spec)).toContain("nested_repeat_forbidden")
  })

  test("verifier still accepts a top-level repeating-slot component (a repeat not inside another repeat)", () => {
    expect(verifySpec(boardSpec)).toEqual({ ok: true, spec: boardSpec })
  })
})

describe("typed render contract mirror-agreement battery", () => {
  test("compile-acceptance and verifier-acceptance agree across the candidate binding battery", () => {
    const verdict = (spec: JsonSpec): "accept" | "reject" => (verifySpec(spec).ok ? "accept" : "reject")
    const rows: { binding: string; compile: "accept" | "reject"; verifier: "accept" | "reject" }[] = []

    const wholeArray = author.spec(author.node("Badge", {
      props: { text: null, tone: "info" },
      visible: { state: "/board/cards" },
    }))
    rows.push({ binding: "state /board/cards (whole array)", compile: "accept", verifier: verdict(wholeArray) })

    const leafBoolean = author.spec(author.node("Badge", {
      props: { text: null, tone: "info" },
      visible: { state: "/board/showDone" },
    }))
    rows.push({ binding: "state /board/showDone (leaf boolean)", compile: "accept", verifier: verdict(leafBoolean) })

    const leafNullable = author.spec(author.node("Badge", {
      props: { text: null, tone: "info" },
      visible: { state: "/board/summary/lastMove" },
    }))
    rows.push({ binding: "state /board/summary/lastMove (leaf nullableString)", compile: "accept", verifier: verdict(leafNullable) })

    const leafNumber = author.spec(author.node("Badge", {
      props: { text: null, tone: "info" },
      visible: { state: "/board/metrics/total" },
    }))
    rows.push({ binding: "state /board/metrics/total (leaf number)", compile: "accept", verifier: verdict(leafNumber) })

    const indexedElement = author.spec(author.node("Badge", {
      props: { text: null, tone: "info" },
      // @ts-expect-error indexed array-element paths are not on the typed author surface
      visible: { state: "/board/cards/0/title" },
    }))
    rows.push({ binding: "state /board/cards/0/title (indexed element)", compile: "reject", verifier: verdict(indexedElement) })

    const unknownPath = author.spec(author.node("Badge", {
      props: { text: null, tone: "info" },
      // @ts-expect-error /board/nope is not a schema-derived state path
      visible: { state: "/board/nope" },
    }))
    rows.push({ binding: "state /board/nope (unknown)", compile: "reject", verifier: verdict(unknownPath) })

    const stringArg = author.spec(author.node("Text", {
      props: { text: author.template("v {a}", { a: author.state("/board/summary/lastMove") }) },
    }))
    rows.push({ binding: "template arg string (/board/summary/lastMove)", compile: "accept", verifier: verdict(stringArg) })

    const numberArg = author.spec(author.node("Text", {
      props: { text: author.template("v {a}", { a: author.state("/board/metrics/done") }) },
    }))
    rows.push({ binding: "template arg number (/board/metrics/done)", compile: "accept", verifier: verdict(numberArg) })

    const arrayArg = author.spec(author.node("Text", {
      props: {
        // @ts-expect-error an array-kind state path is not a displayable template arg
        text: author.template("v {a}", { a: author.state("/board/cards") }),
      },
    }))
    rows.push({ binding: "template arg array (/board/cards)", compile: "reject", verifier: verdict(arrayArg) })

    const objectArgSpec: JsonSpec = {
      root: { type: "Text", props: { text: { template: "v {a}", args: { a: { state: "/synthetic/object" } } } } },
    }
    const objectCtx = {
      ...context,
      state: { ...context.state, "/synthetic/object": { path: "/synthetic/object", kind: "object" } as const },
    }
    rows.push({
      binding: "template arg object (synthetic object token)",
      compile: "reject",
      verifier: verifySpec(objectArgSpec, objectCtx).ok ? "accept" : "reject",
    })

    const repeatItemOnBoundArray = author.spec(author.node("SortableList", {
      props: { items: author.state("/board/cards") },
      slots: { item: (it) => [author.node("Card", { props: { title: it("title"), done: it("done") } })] },
    }))
    rows.push({ binding: "repeat-item it(done) on bound /board/cards", compile: "accept", verifier: verdict(repeatItemOnBoundArray) })

    const repeatItemForkedFromBoundArray = author.spec(author.node("SortableList", {
      props: { items: author.state("/board/columns") },
      slots: {
        item: (it) => [author.node("Card", {
          props: {
            title: it("title"),
            // @ts-expect-error /board/columns elements have no "done"; the item accessor derives from props[slot.repeats]
            done: it("done"),
          },
        })],
      },
    }))
    rows.push({ binding: "repeat-item it(done) forked onto /board/columns", compile: "reject", verifier: verdict(repeatItemForkedFromBoundArray) })

    const eventMoveAligned = author.spec(author.node("SortableList", {
      props: { items: author.state("/board/cards") },
      on: {
        move: (ev) => ({
          flow: "moveCard",
          params: { cardId: ev("cardId"), fromColumnId: ev("fromColumnId"), toColumnId: ev("toColumnId"), toIndex: ev("toIndex") },
        }),
      },
      slots: { item: (it) => [author.node("Card", { props: { title: it("title"), done: it("done") } })] },
    }))
    rows.push({ binding: "event move handler (aligned event fields)", compile: "accept", verifier: verdict(eventMoveAligned) })

    const eventFieldKindForked = author.spec(author.node("SortableList", {
      props: { items: author.state("/board/cards") },
      on: {
        // @ts-expect-error toIndex is a number event field; the cardId param is string
        move: (ev) => ({
          flow: "moveCard",
          params: { cardId: ev("toIndex"), fromColumnId: ev("fromColumnId"), toColumnId: ev("toColumnId"), toIndex: ev("toIndex") },
        }),
      },
      slots: { item: (it) => [author.node("Card", { props: { title: it("title"), done: it("done") } })] },
    }))
    rows.push({ binding: "event move cardId<-toIndex (field kind fork)", compile: "reject", verifier: verdict(eventFieldKindForked) })

    const actionParamKindForked = author.spec(author.node("SortableList", {
      props: { items: author.state("/board/cards") },
      on: {
        // @ts-expect-error toIndex param is number; a string literal cannot fill it
        move: (ev) => ({
          flow: "moveCard",
          params: { cardId: ev("cardId"), fromColumnId: ev("fromColumnId"), toColumnId: ev("toColumnId"), toIndex: "first" },
        }),
      },
      slots: { item: (it) => [author.node("Card", { props: { title: it("title"), done: it("done") } })] },
    }))
    rows.push({ binding: "action-param toIndex<-string literal (kind fork)", compile: "reject", verifier: verdict(actionParamKindForked) })

    const visibleEqAligned = author.spec(author.node("Badge", {
      props: { text: null, tone: "info" },
      visible: { state: "/board/showDone", eq: true },
    }))
    rows.push({ binding: "visible /board/showDone eq true (boolean literal)", compile: "accept", verifier: verdict(visibleEqAligned) })

    const visibleEqKindForked = author.spec(author.node("Badge", {
      props: { text: null, tone: "info" },
      // @ts-expect-error showDone is boolean; the visibility literal must be boolean, not string
      visible: { state: "/board/showDone", eq: "yes" },
    }))
    rows.push({ binding: "visible /board/showDone eq 'yes' (literal kind fork)", compile: "reject", verifier: verdict(visibleEqKindForked) })

    const watchAligned = author.spec(author.node("Stack", {
      props: { direction: "vertical" },
      watch: { "/board/selectedCardId": { flow: "loadCardDetails", params: { cardId: author.state("/board/selectedCardId") } } },
      slots: { children: [] },
    }))
    rows.push({ binding: "watch /board/selectedCardId -> loadCardDetails", compile: "accept", verifier: verdict(watchAligned) })

    const watchPathForked = author.spec(author.node("Stack", {
      props: { direction: "vertical" },
      // @ts-expect-error /board/nope is not a schema-derived watch path
      watch: { "/board/nope": { flow: "loadCardDetails", params: { cardId: author.state("/board/selectedCardId") } } },
      slots: { children: [] },
    }))
    rows.push({ binding: "watch /board/nope (unknown path fork)", compile: "reject", verifier: verdict(watchPathForked) })

    const nestedRepeatDirect = author.spec(author.node("SortableList", {
      props: { items: author.state("/board/cards") },
      slots: {
        // @ts-expect-error a repeating-slot component cannot be nested directly inside a repeating slot
        item: () => [
          author.node("SortableList", {
            props: { items: author.state("/board/cards") },
            slots: { item: (inner) => [author.node("Card", { props: { title: inner("title"), done: inner("done") } })] },
          }),
        ],
      },
    }))
    rows.push({ binding: "nested repeat direct (SortableList in SortableList item)", compile: "reject", verifier: verdict(nestedRepeatDirect) })

    const nestedRepeatTransitive = author.spec(author.node("SortableList", {
      props: { items: author.state("/board/cards") },
      slots: {
        // @ts-expect-error a repeating-slot component reached transitively (SortableList -> Stack -> SortableList) cannot appear inside a repeating slot
        item: () => [
          author.node("Stack", {
            props: { direction: "vertical" },
            slots: {
              children: [
                author.node("SortableList", {
                  props: { items: author.state("/board/cards") },
                  slots: { item: (inner) => [author.node("Card", { props: { title: inner("title"), done: inner("done") } })] },
                }),
              ],
            },
          }),
        ],
      },
    }))
    rows.push({ binding: "nested repeat transitive (SortableList -> Stack -> SortableList)", compile: "reject", verifier: verdict(nestedRepeatTransitive) })

    for (const row of rows) {
      expect(row.compile, `${row.binding}: compile=${row.compile} verifier=${row.verifier}`).toBe(row.verifier)
    }
    expect(rows.every((row) => row.compile === row.verifier)).toBe(true)
    expect(rows).toHaveLength(21)
  })
})

describe("typed render contract state-token runtime mirror", () => {
  test("the runtime state token table emits exactly the schema-derived path set (no extra, indexed, or object-node keys)", () => {
    expect(Object.keys(context.state).sort()).toEqual([
      "/board/cards",
      "/board/columns",
      "/board/metrics/done",
      "/board/metrics/total",
      "/board/selectedCardId",
      "/board/showDone",
      "/board/summary/lastMove",
    ])
  })
})

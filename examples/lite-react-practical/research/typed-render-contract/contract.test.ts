import { describe, expect, test } from "vitest"
import { createScope } from "@pumped-fn/lite"
import {
  authoredBoardSpec,
  board,
  boardSchema,
  boardSpec,
  kindOf,
  runJsonAction,
  summarySpec,
  verifySpec,
  visibilitySpec,
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

import { describe, expect, test } from "vitest"
import { validSpec, verifySpec, type JsonSpec } from "./contract"

function clone(spec: JsonSpec): JsonSpec {
  return JSON.parse(JSON.stringify(spec)) as JsonSpec
}

function codes(spec: JsonSpec): string[] {
  const result = verifySpec(spec)
  return result.ok ? [] : result.errors.map((error) => error.code)
}

describe("typed render contract verifier", () => {
  test("accepts the valid spec at detail level", () => {
    expect(verifySpec(validSpec)).toEqual({ ok: true, spec: validSpec })
  })

  test("rejects a bad state path", () => {
    const spec = clone(validSpec)
    spec.root.slots!["children"]![1]!.props["items"] = { state: "/board/missing" }

    expect(codes(spec)).toContain("unknown_state_path")
  })

  test("rejects a prop value with the wrong kind", () => {
    const spec = clone(validSpec)
    spec.root.slots!["children"]![0]!.props["text"] = 12

    expect(codes(spec)).toContain("kind_mismatch")
  })

  test("rejects an unknown slot", () => {
    const spec = clone(validSpec)
    spec.root.slots!["footer"] = []

    expect(codes(spec)).toContain("unknown_slot")
  })

  test("rejects an unknown event", () => {
    const spec = clone(validSpec)
    spec.root.slots!["children"]![1]!.on!["dragged"] = spec.root.slots!["children"]![1]!.on!["move"]!

    expect(codes(spec)).toContain("unknown_event")
  })

  test("rejects an unknown flow action", () => {
    const spec = clone(validSpec)
    spec.root.slots!["children"]![1]!.on!["move"]!.flow = "missingFlow"

    expect(codes(spec)).toContain("unknown_flow")
  })

  test("rejects a flow payload wired from the wrong event field kind", () => {
    const spec = clone(validSpec)
    spec.root.slots!["children"]![1]!.on!["move"]!.params["toColumnId"] = { event: "toIndex" }

    expect(codes(spec)).toContain("kind_mismatch")
  })

  test("rejects an unbound template placeholder", () => {
    const spec = clone(validSpec)
    spec.root.slots!["children"]![0]!.props["text"] = {
      template: "Status: {missing}",
      args: {
        lastMove: { state: "/board/summary/lastMove" },
      },
    }

    expect(codes(spec)).toContain("unbound_template_placeholder")
  })

  test("rejects an unreferenced template arg", () => {
    const spec = clone(validSpec)
    spec.root.slots!["children"]![0]!.props["text"] = {
      template: "Status",
      args: {
        lastMove: { state: "/board/summary/lastMove" },
      },
    }

    expect(codes(spec)).toContain("unreferenced_template_arg")
  })

  test("rejects repeat item fields outside the catalog-derived item scope", () => {
    const spec = clone(validSpec)
    spec.root.slots!["children"]![1]!.slots!["item"]![0]!.props["title"] = { item: "missing" }

    expect(codes(spec)).toContain("unknown_item_path")
  })
})

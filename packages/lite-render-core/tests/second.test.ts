import { describe, expect, test } from "vitest"
import { verifySpec, type JsonNode, type JsonSpec } from "../src"
import { author, context, dashboardSpec } from "./second.fixture"

function codes(spec: JsonSpec): string[] {
  const result = verifySpec(spec, context)
  return result.ok ? [] : result.errors.map((error) => error.code)
}

function rowList(): JsonNode {
  return {
    type: "RowList",
    props: { rows: { state: "/dashboard/rows" } },
    slots: { row: [{ type: "RowCard", props: { name: { item: "name" }, active: { item: "active" } } }] },
  }
}
function menuList(): JsonNode {
  return {
    type: "MenuList",
    props: { items: { state: "/dashboard/menu" } },
    slots: { entry: [{ type: "MenuEntry", props: { label: { item: "label" }, count: { item: "count" } } }] },
  }
}

describe("second fixture (dashboard) — multi-repeating-component generalization", () => {
  test("accepts the authored dashboard spec (five repeating-slot components side by side)", () => {
    expect(verifySpec(dashboardSpec, context)).toEqual({ ok: true, spec: dashboardSpec })
  })

  test("nested-repeat ban: RowList inside RowList.row (A-in-A)", () => {
    const spec: JsonSpec = { root: { type: "RowList", props: { rows: { state: "/dashboard/rows" } }, slots: { row: [rowList()] } } }
    expect(codes(spec)).toContain("nested_repeat_forbidden")
  })

  test("nested-repeat ban: MenuList inside RowList.row (cross B-in-A)", () => {
    const spec: JsonSpec = { root: { type: "RowList", props: { rows: { state: "/dashboard/rows" } }, slots: { row: [menuList()] } } }
    expect(codes(spec)).toContain("nested_repeat_forbidden")
  })

  test("nested-repeat ban: RowList inside MenuList.entry (cross A-in-B)", () => {
    const spec: JsonSpec = { root: { type: "MenuList", props: { items: { state: "/dashboard/menu" } }, slots: { entry: [rowList()] } } }
    expect(codes(spec)).toContain("nested_repeat_forbidden")
  })

  test("nested-repeat ban: RowList reached transitively through Panel inside MenuList.entry", () => {
    const spec: JsonSpec = {
      root: {
        type: "MenuList",
        props: { items: { state: "/dashboard/menu" } },
        slots: { entry: [{ type: "Panel", props: { heading: "x" }, slots: { body: [rowList()] } }] },
      },
    }
    expect(codes(spec)).toContain("nested_repeat_forbidden")
  })

  test("accepts two top-level repeating-slot components side by side (a repeat not inside another repeat)", () => {
    const spec: JsonSpec = { root: { type: "Panel", props: { heading: "x" }, slots: { body: [rowList(), menuList()] } } }
    expect(verifySpec(spec, context)).toEqual({ ok: true, spec })
  })
})

describe("second fixture — mirror-agreement battery (every element shape agrees)", () => {
  test("compile-acceptance and verifier-acceptance agree across the candidate bindings", () => {
    const verdict = (spec: JsonSpec): "accept" | "reject" => (verifySpec(spec, context).ok ? "accept" : "reject")
    const rows: { binding: string; compile: "accept" | "reject"; verifier: "accept" | "reject" }[] = []

    // --- state-path dimension ---
    const wholeArray = author.spec(author.node("Label", { props: { text: null }, visible: { state: "/dashboard/labels" } }))
    rows.push({ binding: "state /dashboard/labels (whole primitive array)", compile: "accept", verifier: verdict(wholeArray) })

    const wholeGrid = author.spec(author.node("Label", { props: { text: null }, visible: { state: "/dashboard/grid" } }))
    rows.push({ binding: "state /dashboard/grid (whole array-of-arrays)", compile: "accept", verifier: verdict(wholeGrid) })

    const leafBoolean = author.spec(author.node("Label", { props: { text: null }, visible: { state: "/dashboard/expanded" } }))
    rows.push({ binding: "state /dashboard/expanded (leaf boolean)", compile: "accept", verifier: verdict(leafBoolean) })

    const leafString = author.spec(author.node("Label", { props: { text: null }, visible: { state: "/dashboard/title" } }))
    rows.push({ binding: "state /dashboard/title (leaf string)", compile: "accept", verifier: verdict(leafString) })

    const leafNumber = author.spec(author.node("Label", { props: { text: null }, visible: { state: "/dashboard/count" } }))
    rows.push({ binding: "state /dashboard/count (leaf number)", compile: "accept", verifier: verdict(leafNumber) })

    const unknownPath = author.spec(author.node("Label", {
      props: { text: null },
      // @ts-expect-error /dashboard/nope is not a schema-derived state path
      visible: { state: "/dashboard/nope" },
    }))
    rows.push({ binding: "state /dashboard/nope (unknown)", compile: "reject", verifier: verdict(unknownPath) })

    // --- template-arg dimension ---
    const stringArg = author.spec(author.node("Label", {
      props: { text: author.template("v {a}", { a: author.state("/dashboard/title") }) },
    }))
    rows.push({ binding: "template arg string (/dashboard/title)", compile: "accept", verifier: verdict(stringArg) })

    const numberArg = author.spec(author.node("Label", {
      props: { text: author.template("v {a}", { a: author.state("/dashboard/count") }) },
    }))
    rows.push({ binding: "template arg number (/dashboard/count)", compile: "accept", verifier: verdict(numberArg) })

    const arrayArg = author.spec(author.node("Label", {
      props: {
        // @ts-expect-error an array-kind state path is not a displayable template arg
        text: author.template("v {a}", { a: author.state("/dashboard/labels") }),
      },
    }))
    rows.push({ binding: "template arg array (/dashboard/labels)", compile: "reject", verifier: verdict(arrayArg) })

    // --- event / action-param dimension ---
    const eventAligned = author.spec(author.node("RowList", {
      props: { rows: author.state("/dashboard/rows") },
      on: { select: (ev) => ({ flow: "selectRow", params: { rowId: ev("rowId") } }) },
      slots: { row: (it) => [author.node("RowCard", { props: { name: it("name"), active: it("active") } })] },
    }))
    rows.push({ binding: "event select rowId<-ev(rowId) (aligned)", compile: "accept", verifier: verdict(eventAligned) })

    const actionParamForked = author.spec(author.node("RowList", {
      props: { rows: author.state("/dashboard/rows") },
      // @ts-expect-error rowId param is string; a number literal cannot fill it
      on: { select: () => ({ flow: "selectRow", params: { rowId: 5 } }) },
      slots: { row: (it) => [author.node("RowCard", { props: { name: it("name"), active: it("active") } })] },
    }))
    rows.push({ binding: "action-param rowId<-number literal (kind fork)", compile: "reject", verifier: verdict(actionParamForked) })

    // --- visible dimension ---
    const visibleEqAligned = author.spec(author.node("Label", {
      props: { text: null },
      visible: { state: "/dashboard/expanded", eq: true },
    }))
    rows.push({ binding: "visible /dashboard/expanded eq true (boolean literal)", compile: "accept", verifier: verdict(visibleEqAligned) })

    const visibleEqForked = author.spec(author.node("Label", {
      props: { text: null },
      // @ts-expect-error expanded is boolean; the visibility literal must be boolean
      visible: { state: "/dashboard/expanded", eq: "yes" },
    }))
    rows.push({ binding: "visible /dashboard/expanded eq 'yes' (literal kind fork)", compile: "reject", verifier: verdict(visibleEqForked) })

    // --- watch dimension ---
    const watchAligned = author.spec(author.node("Panel", {
      props: { heading: "x" },
      watch: { "/dashboard/filter": { flow: "selectRow", params: { rowId: author.state("/dashboard/title") } } },
      slots: { body: [] },
    }))
    rows.push({ binding: "watch /dashboard/filter -> selectRow (aligned)", compile: "accept", verifier: verdict(watchAligned) })

    const watchForked = author.spec(author.node("Panel", {
      props: { heading: "x" },
      // @ts-expect-error /dashboard/nope is not a schema-derived watch path
      watch: { "/dashboard/nope": { flow: "selectRow", params: { rowId: author.state("/dashboard/title") } } },
      slots: { body: [] },
    }))
    rows.push({ binding: "watch /dashboard/nope (unknown path fork)", compile: "reject", verifier: verdict(watchForked) })

    // --- repeat-item dimension: OBJECT element ---
    const objectAligned = author.spec(author.node("RowList", {
      props: { rows: author.state("/dashboard/rows") },
      slots: { row: (it) => [author.node("RowCard", { props: { name: it("name"), active: it("active") } })] },
    }))
    rows.push({ binding: "object element it(name)/it(active) aligned", compile: "accept", verifier: verdict(objectAligned) })

    const objectNestedObjectIntoObjectProp = author.spec(author.node("RowList", {
      props: { rows: author.state("/dashboard/rows") },
      slots: { row: (it) => [author.node("MetaCard", { props: { info: it("meta") } })] },
    }))
    rows.push({ binding: "object element it(meta) [object kind] into object prop", compile: "accept", verifier: verdict(objectNestedObjectIntoObjectProp) })

    const objectNestedObjectIntoScalarProp = author.spec(author.node("RowList", {
      props: { rows: author.state("/dashboard/rows") },
      slots: {
        row: (it) => [author.node("RowCard", {
          props: {
            // @ts-expect-error nested-object field "meta" has kind object, not the string name prop (mirrors verifier kind_mismatch)
            name: it("meta"),
            active: it("active"),
          },
        })],
      },
    }))
    rows.push({ binding: "object element it(meta) [object kind] into scalar prop", compile: "reject", verifier: verdict(objectNestedObjectIntoScalarProp) })

    const objectPrototypeMember = author.spec(author.node("RowList", {
      props: { rows: author.state("/dashboard/rows") },
      slots: {
        row: (it) => [author.node("NumberTag", {
          props: {
            // @ts-expect-error "length" is not a declared field of the row element schema (mirrors verifier unknown_item_path)
            value: it("length"),
          },
        })],
      },
    }))
    rows.push({ binding: "object element it(length) [prototype member, not a schema field]", compile: "reject", verifier: verdict(objectPrototypeMember) })

    const objectForkedOntoAnotherArray = author.spec(author.node("RowList", {
      props: { rows: author.state("/dashboard/menu") },
      slots: {
        row: (it) => [author.node("NumberTag", {
          props: {
            // @ts-expect-error /dashboard/menu elements have no "name"; the item accessor derives from props[slot.repeats]
            value: it("name"),
          },
        })],
      },
    }))
    rows.push({ binding: "object element it(name) forked onto /dashboard/menu", compile: "reject", verifier: verdict(objectForkedOntoAnotherArray) })

    // --- repeat-item dimension: PRIMITIVE array element (string[]) ---
    const primitiveNoItem = author.spec(author.node("TagList", {
      props: { labels: author.state("/dashboard/labels") },
      slots: { tag: () => [author.node("Label", { props: { text: author.state("/dashboard/filter") } })] },
    }))
    rows.push({ binding: "primitive array element, child does not use item", compile: "accept", verifier: verdict(primitiveNoItem) })

    const primitiveItemUse = author.spec(author.node("TagList", {
      props: { labels: author.state("/dashboard/labels") },
      slots: {
        tag: (it) => [author.node("NumberTag", {
          props: {
            // @ts-expect-error a primitive (string) array element exposes no item fields (mirrors verifier unknown_item_path)
            value: it("0"),
          },
        })],
      },
    }))
    rows.push({ binding: "primitive array element it(0) [no item fields]", compile: "reject", verifier: verdict(primitiveItemUse) })

    // --- repeat-item dimension: ARRAY-OF-ARRAYS element (number[][]) ---
    const gridNoItem = author.spec(author.node("GridList", {
      props: { grid: author.state("/dashboard/grid") },
      slots: { cell: () => [author.node("Label", { props: { text: author.state("/dashboard/filter") } })] },
    }))
    rows.push({ binding: "array-of-arrays element, child does not use item", compile: "accept", verifier: verdict(gridNoItem) })

    const gridItemUse = author.spec(author.node("GridList", {
      props: { grid: author.state("/dashboard/grid") },
      slots: {
        cell: (it) => [author.node("NumberTag", {
          props: {
            // @ts-expect-error an array (number[]) array element exposes no item fields (mirrors verifier unknown_item_path)
            value: it("0"),
          },
        })],
      },
    }))
    rows.push({ binding: "array-of-arrays element it(0) [no item fields]", compile: "reject", verifier: verdict(gridItemUse) })

    // --- repeat-item dimension: ARRAY-OF-ARRAYS-OF-OBJECTS element (rowSchema[][]) ---
    const matrixNoItem = author.spec(author.node("MatrixList", {
      props: { matrix: author.state("/dashboard/matrix") },
      slots: { line: () => [author.node("Label", { props: { text: author.state("/dashboard/filter") } })] },
    }))
    rows.push({ binding: "array-of-arrays-of-objects element, child does not use item", compile: "accept", verifier: verdict(matrixNoItem) })

    const matrixItemUse = author.spec(author.node("MatrixList", {
      props: { matrix: author.state("/dashboard/matrix") },
      slots: {
        line: (it) => [author.node("NumberTag", {
          props: {
            // @ts-expect-error the matrix element is an array (rowSchema[]), not an object; its object fields are one repeat level deeper, so it exposes no item fields (mirrors verifier unknown_item_path)
            value: it("0"),
          },
        })],
      },
    }))
    rows.push({ binding: "array-of-arrays-of-objects element it(0) [no item fields one level down]", compile: "reject", verifier: verdict(matrixItemUse) })

    // --- nested-repeat dimension ---
    const nestedRepeatDirect = author.spec(author.node("RowList", {
      props: { rows: author.state("/dashboard/rows") },
      slots: {
        // @ts-expect-error a repeating-slot component cannot be nested directly inside a repeating slot
        row: () => [author.node("RowList", {
          props: { rows: author.state("/dashboard/rows") },
          slots: { row: (inner) => [author.node("RowCard", { props: { name: inner("name"), active: inner("active") } })] },
        })],
      },
    }))
    rows.push({ binding: "nested repeat direct (RowList in RowList.row)", compile: "reject", verifier: verdict(nestedRepeatDirect) })

    const nestedRepeatCross = author.spec(author.node("RowList", {
      props: { rows: author.state("/dashboard/rows") },
      slots: {
        // @ts-expect-error a different repeating-slot component cannot be nested inside a repeating slot either
        row: () => [author.node("MenuList", {
          props: { items: author.state("/dashboard/menu") },
          slots: { entry: (inner) => [author.node("MenuEntry", { props: { label: inner("label"), count: inner("count") } })] },
        })],
      },
    }))
    rows.push({ binding: "nested repeat cross (MenuList in RowList.row)", compile: "reject", verifier: verdict(nestedRepeatCross) })

    for (const row of rows) {
      expect(row.compile, `${row.binding}: compile=${row.compile} verifier=${row.verifier}`).toBe(row.verifier)
    }
    expect(rows.every((row) => row.compile === row.verifier)).toBe(true)
    expect(rows).toHaveLength(28)
  })
})

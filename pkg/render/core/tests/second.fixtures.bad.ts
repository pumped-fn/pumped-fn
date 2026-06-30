import { k } from "../src"
import { author } from "./second.fixture"

// @ts-expect-error a field key containing "/" is forbidden: the path delimiter cannot disambiguate a field named "a/b" from nesting a -> b
export const badSlashFieldKey = k.object({ "a/b": k.string })

export const badNestedObjectItemIntoScalar = author.node("RowList", {
  props: { rows: author.state("/dashboard/rows") },
  slots: {
    row: (it) => [
      author.node("RowCard", {
        props: {
          // @ts-expect-error nested-object element field "meta" has kind object; it cannot fill the string name prop (the item accessor now mirrors the verifier's schema-derived item kind)
          name: it("meta"),
          active: it("active"),
        },
      }),
    ],
  },
})

export const badPrototypeMemberItem = author.node("RowList", {
  props: { rows: author.state("/dashboard/rows") },
  slots: {
    row: (it) => [
      author.node("NumberTag", {
        props: {
          // @ts-expect-error "length" is a prototype member of the inferred element type, not a declared schema field; the item accessor is keyed by the element ObjectSchema only
          value: it("length"),
        },
      }),
    ],
  },
})

export const badPrimitiveArrayItem = author.node("TagList", {
  props: { labels: author.state("/dashboard/labels") },
  slots: {
    tag: (it) => [
      author.node("NumberTag", {
        props: {
          // @ts-expect-error a primitive (string) array element has no named fields; the item accessor exposes none (mirrors the verifier always rejecting an item binding here)
          value: it("0"),
        },
      }),
    ],
  },
})

export const badArrayOfArraysItem = author.node("GridList", {
  props: { grid: author.state("/dashboard/grid") },
  slots: {
    cell: (it) => [
      author.node("NumberTag", {
        props: {
          // @ts-expect-error an array (number[]) array element has no named fields; the item accessor exposes none
          value: it("0"),
        },
      }),
    ],
  },
})

export const badArrayOfArraysOfObjectsItem = author.node("MatrixList", {
  props: { matrix: author.state("/dashboard/matrix") },
  slots: {
    line: (it) => [
      author.node("NumberTag", {
        props: {
          // @ts-expect-error the matrix element is an array (rowSchema[]), not an object; its object fields are one repeat level deeper, so the accessor exposes none
          value: it("0"),
        },
      }),
    ],
  },
})

export const badWatchItemParam = author.node("RowList", {
  props: { rows: author.state("/dashboard/rows") },
  slots: {
    row: (it) => [
      author.node("RowCard", {
        props: { name: it("name"), active: it("active") },
        watch: {
          "/dashboard/filter": {
            flow: "selectRow",
            // @ts-expect-error a watch action param cannot bind to the repeat item; watches are global change-detection (one per authored node, fired on the absolute state path), not per-row
            params: { rowId: it("name") },
          },
        },
      }),
    ],
  },
})

import { describe, expect, test } from "vitest"
import {
  buildStateTokens,
  createAuthor,
  defineCatalog,
  k,
  verifySpec,
  type ArraySchema,
  type LeafSchema,
  type ObjectSchema,
  type VerifyContext,
} from "../src"

/**
 * A schema whose field name literally contains "/", built by cast to BYPASS the `k.object` slash-key ban,
 * so this test isolates the item-accessor closure from the source-level ban. The runtime `fields` really
 * carry the "a/b" key, so `buildStateTokens` emits the flat "/a/b" token (mirroring `collectTokens`).
 */
const slashSchema = {
  node: "object",
  fields: { "a/b": k.array(k.string) },
  _type: (value: { "a/b": string[] }) => value,
} as unknown as ObjectSchema<{ "a/b": ArraySchema<LeafSchema<string>> }>

const components = defineCatalog({
  SlashList: { props: { src: k.array(k.string) }, slots: { item: { repeats: "src" } }, events: {}, capabilities: ["x"] },
  Label: { props: { text: k.nullableString }, slots: {}, events: {}, capabilities: ["text"] },
})

const context: VerifyContext = {
  state: buildStateTokens(slashSchema),
  components,
  actions: {},
  rendererCapabilities: new Set(["x", "text"]),
}

const author = createAuthor({ catalog: components, registry: {}, schema: slashSchema })

describe("slash-named field key — closed at the source", () => {
  test("k.object rejects a field key containing '/' (the path delimiter is reserved)", () => {
    // @ts-expect-error a field key containing "/" is forbidden: a JSON-pointer path cannot disambiguate the field "a/b" from nesting a -> b
    const bad = k.object({ "a/b": k.string })
    expect(bad.node).toBe("object")
  })

  test("the runtime token table for a slash-keyed schema is the flat join, not the re-split", () => {
    expect(Object.keys(context.state)).toEqual(["/a/b"])
  })
})

describe("slash-named field key — author item accessor mirrors the verifier", () => {
  test("over a (cast) slash-keyed schema the item accessor is uncallable AND the verifier rejects (agreement)", () => {
    const spec = author.spec(author.node("SlashList", {
      props: { src: author.state("/a/b") },
      slots: {
        item: (it) => [author.node("Label", {
          props: {
            // @ts-expect-error a slash field name desyncs the author path walk; the element resolves to no item fields (mirrors verifier unknown_item_path)
            text: it("ghost"),
          },
        })],
      },
    }))
    const result = verifySpec(spec, context)
    expect(result.ok).toBe(false)
    expect(result.ok ? [] : result.errors.map((e) => e.code)).toContain("unknown_item_path")
  })

  test("a slash-keyed repeat whose child does not use the item accessor still verifies (accept === accept)", () => {
    const spec = author.spec(author.node("SlashList", {
      props: { src: author.state("/a/b") },
      slots: { item: () => [author.node("Label", { props: { text: null } })] },
    }))
    expect(verifySpec(spec, context)).toEqual({ ok: true, spec })
  })
})

/** Hunt: a numeric-looking field key is a single path segment (no "/"), so the author walk and the token walk agree. */
describe("numeric-looking field key — no path desync", () => {
  const numericSchema = k.object({ "0": k.array(k.string) })
  const numComponents = defineCatalog({
    NumList: { props: { src: k.array(k.string) }, slots: { item: { repeats: "src" } }, events: {}, capabilities: ["x"] },
    Label: { props: { text: k.nullableString }, slots: {}, events: {}, capabilities: ["text"] },
  })
  const numContext: VerifyContext = {
    state: buildStateTokens(numericSchema),
    components: numComponents,
    actions: {},
    rendererCapabilities: new Set(["x", "text"]),
  }
  const numAuthor = createAuthor({ catalog: numComponents, registry: {}, schema: numericSchema })

  test("token table is the single-segment path /0", () => {
    expect(Object.keys(numContext.state)).toEqual(["/0"])
  })

  test("a primitive-array element under a numeric key exposes no item fields (agreement)", () => {
    const spec = numAuthor.spec(numAuthor.node("NumList", {
      props: { src: numAuthor.state("/0") },
      slots: {
        item: (it) => [numAuthor.node("Label", {
          props: {
            // @ts-expect-error the /0 array element is a primitive (string); it exposes no item fields (mirrors verifier unknown_item_path)
            text: it("ghost"),
          },
        })],
      },
    }))
    const result = verifySpec(spec, numContext)
    expect(result.ok).toBe(false)
    expect(result.ok ? [] : result.errors.map((e) => e.code)).toContain("unknown_item_path")
  })
})

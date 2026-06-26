import { describe, expect, test } from "vitest"
import { createScope, flow, typed } from "@pumped-fn/lite"
import {
  action,
  buildStateTokens,
  createAuthor,
  createRunJsonAction,
  defineCatalog,
  k,
  resolveExpr,
  verifySpec,
  type Infer,
  type JsonSpec,
  type VerifyContext,
} from "../src"
import { stateResource } from "./state-resource"

describe("BUG 1 — template placeholder reuse resolves in every position", () => {
  test("a reused placeholder is substituted in all occurrences, not just the first", () => {
    expect(
      resolveExpr({ template: "{name} removed. Undo {name}?", args: { name: { state: "/title" } } }, { title: "Card" })
    ).toBe("Card removed. Undo Card?")
  })

  test("distinct reused placeholders each substitute fully", () => {
    expect(
      resolveExpr(
        { template: "{a}-{b}-{a}-{b}", args: { a: { state: "/x" }, b: { state: "/y" } } },
        { x: "1", y: "2" }
      )
    ).toBe("1-2-1-2")
  })
})

const itemSchema = k.object({ id: k.string, title: k.string })
const listSchema = k.object({ items: k.array(itemSchema) })
type ListState = Infer<typeof listSchema>

const store = stateResource((): ListState => ({
  items: [
    { id: "a", title: "Alpha" },
    { id: "b", title: "Beta" },
  ],
}))

const removeInput = k.object({ id: k.string })
const removeItem = flow({
  name: "per-item-remove",
  parse: typed<Infer<typeof removeInput>>(),
  deps: { access: store },
  factory: (ctx, { access }) => {
    access.update((state) => ({ items: state.items.filter((entry) => entry.id !== ctx.input.id) }))
    return ctx.input.id
  },
})

const registry = { removeItem: action(removeItem, removeInput) }

const components = defineCatalog({
  List: { props: { items: k.array(itemSchema) }, slots: { row: { repeats: "items" } }, events: {}, capabilities: ["list"] },
  Row: { props: { title: k.string }, slots: {}, events: { remove: registry.removeItem.params }, capabilities: ["row"] },
})

const context: VerifyContext = {
  state: buildStateTokens(listSchema),
  components,
  actions: registry,
  rendererCapabilities: new Set(["list", "row"]),
}

const author = createAuthor({ catalog: components, registry, schema: listSchema })
const runAction = createRunJsonAction({ registry, state: store })

const itemActionSpec: JsonSpec = author.spec(
  author.node("List", {
    props: { items: author.state("/items") },
    slots: {
      row: (it) => [
        author.node("Row", {
          props: { title: it("title") },
          on: { remove: () => ({ flow: "removeItem", params: { id: it("id") } }) },
        }),
      ],
    },
  })
)

describe("BUG 3 — item-bound action params dispatch the supplied repeat item", () => {
  test("resolveExpr resolves an {item} expr from the supplied item", () => {
    expect(resolveExpr({ item: "id" }, {}, { id: "b" })).toBe("b")
  })

  test("verifySpec accepts a per-item action whose param binds to {item:'id'}", () => {
    expect(verifySpec(itemActionSpec, context)).toEqual({ ok: true, spec: itemActionSpec })
  })

  test("the dispatcher resolves an {item} action param from the supplied item (not undefined)", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    await ctx.resolve(store)

    const removed = await ctx.exec({
      flow: runAction,
      input: {
        action: { flow: "removeItem", params: { id: { item: "id" } } },
        item: { id: "b", title: "Beta" },
      },
    })

    expect(removed).toBe("b")
    const access = await ctx.resolve(store)
    expect(access.get().items.map((entry) => entry.id)).toEqual(["a"])

    await ctx.close()
    await scope.dispose()
  })

  test("an item-less action still dispatches (no regression)", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    await ctx.resolve(store)

    const removed = await ctx.exec({
      flow: runAction,
      input: { action: { flow: "removeItem", params: { id: "a" } } },
    })

    expect(removed).toBe("a")

    await ctx.close()
    await scope.dispose()
  })
})

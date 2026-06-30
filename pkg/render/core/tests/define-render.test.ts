import { describe, expect, test } from "vitest"
import { createScope, flow, typed } from "@pumped-fn/lite"
import { action, buildStateTokens, defineCatalog, defineRender, k, verifySpec, type Infer } from "../src"
import { stateResource } from "./state-resource"

const cardSchema = k.object({ id: k.string, label: k.string, done: k.boolean })
const boardSchema = k.object({
  board: k.object({ cards: k.array(cardSchema), heading: k.string }),
})

const store = stateResource(() => ({
  board: { cards: [{ id: "c1", label: "First", done: false }], heading: "Tasks" },
}))

const toggleInput = k.object({ id: k.string })
const toggle = flow({
  name: "define-render-toggle",
  parse: typed<Infer<typeof toggleInput>>(),
  deps: { access: store },
  factory: (ctx) => ctx.input.id,
})
const actions = { toggle: action(toggle, toggleInput) }

const render = defineRender({
  schema: boardSchema,
  state: store,
  catalog: {
    Board: {
      props: { heading: k.string, cards: k.array(cardSchema) },
      slots: { rows: { repeats: "cards" } },
      events: {},
      capabilities: ["layout.board"],
    },
    Card: {
      props: { label: k.string, done: k.boolean },
      slots: {},
      events: { toggle: actions.toggle.params },
      capabilities: ["surface.card"],
    },
  },
  actions,
})

const spec = render.author.spec(
  render.author.node("Board", {
    props: { heading: "Tasks", cards: render.author.state("/board/cards") },
    slots: {
      rows: (it) => [
        render.author.node("Card", {
          props: { label: it("label"), done: it("done") },
          on: { toggle: () => ({ flow: "toggle", params: { id: it("id") } }) },
        }),
      ],
    },
  })
)

describe("defineRender — one inferred contract, zero authoring annotations", () => {
  test("a spec authored + verified + dispatched through defineRender works (no type annotations)", async () => {
    expect(render.verify(spec)).toEqual({ ok: true, spec })

    const scope = createScope()
    const ctx = scope.createContext()
    await ctx.resolve(store)
    const toggled = await ctx.exec({
      flow: render.dispatch,
      input: { action: { flow: "toggle", params: { id: { item: "id" } } }, item: { id: "c1" } },
    })
    expect(toggled).toBe("c1")
    await ctx.close()
    await scope.dispose()
  })

  test("auto-derives rendererCapabilities as the union of catalog capabilities (no hand-written Set)", () => {
    expect(render.context.rendererCapabilities).toEqual(new Set(["layout.board", "surface.card"]))
  })

  test("is equivalent to manual buildStateTokens + defineCatalog + verifySpec wiring (no drift)", () => {
    const manualContext = {
      state: buildStateTokens(boardSchema),
      components: defineCatalog({
        Board: {
          props: { heading: k.string, cards: k.array(cardSchema) },
          slots: { rows: { repeats: "cards" } },
          events: {},
          capabilities: ["layout.board"],
        },
        Card: {
          props: { label: k.string, done: k.boolean },
          slots: {},
          events: { toggle: actions.toggle.params },
          capabilities: ["surface.card"],
        },
      }),
      actions,
      rendererCapabilities: new Set(["layout.board", "surface.card"]),
    }
    expect(render.verify(spec)).toEqual(verifySpec(spec, manualContext))
  })

  test("a bad binding still fails verification", () => {
    const bad = JSON.parse(JSON.stringify(spec))
    bad.root.props.heading = { state: "/board/cards" }
    expect(render.verify(bad).ok).toBe(false)
  })
})

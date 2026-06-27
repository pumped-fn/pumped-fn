import { flow, typed } from "@pumped-fn/lite"
import { scopedValue } from "@pumped-fn/lite-react"
import { action, defineRender, k, type Author, type Infer } from "@pumped-fn/lite-render-core"
import { type NodeRenderProps } from "../src"

const itemSchema = k.object({ id: k.string, label: k.string, done: k.boolean })
const boardSchema = k.object({ items: k.array(itemSchema) })
type BoardState = Infer<typeof boardSchema>

const boardState = scopedValue({
  name: "view-board-state",
  initial: (): BoardState => ({
    items: [
      { id: "a", label: "Alpha", done: false },
      { id: "b", label: "Beta", done: true },
    ],
  }),
})

const toggleInput = k.object({ id: k.string })
type ToggleInput = Infer<typeof toggleInput>

const toggle = flow({
  name: "view-toggle",
  parse: typed<ToggleInput>(),
  deps: { access: boardState },
  factory: (ctx, { access }) => {
    access.update((state) => ({
      ...state,
      items: state.items.map((item) => (item.id === ctx.input.id ? { ...item, done: !item.done } : item)),
    }))
  },
})

const render = defineRender({
  schema: boardSchema,
  state: boardState,
  catalog: {
    Board: {
      props: { title: k.string, cards: k.array(itemSchema) },
      slots: { rows: { repeats: "cards" } },
      events: {},
      capabilities: ["board"],
    },
    Card: {
      props: { label: k.string, done: k.boolean },
      slots: {},
      events: { toggle: {} },
      capabilities: ["card"],
    },
  },
  actions: { toggle: action(toggle, toggleInput) },
})

type BoardCatalog = typeof render extends { author: Author<infer Cat, any, any> } ? Cat : never

const spec = render.author.spec(
  render.author.node("Board", {
    props: { title: "Tasks", cards: render.author.state("/items") },
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

function BoardView({ props, slots }: NodeRenderProps<BoardCatalog["Board"]>) {
  return (
    <section aria-label="tasks board" data-title={props.title}>
      {slots.rows}
    </section>
  )
}

function CardView({ props, on }: NodeRenderProps<BoardCatalog["Card"]>) {
  return (
    <article aria-label={props.label} data-done={String(props.done)}>
      <button type="button" aria-label={`toggle ${props.label}`} onClick={() => on.toggle({})}>
        toggle
      </button>
    </article>
  )
}

export { render, boardState, spec, BoardView, CardView }
export type { BoardState, BoardCatalog }

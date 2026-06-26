import { flow, typed } from "@pumped-fn/lite"
import { scopedValue } from "@pumped-fn/lite-react"
import {
  action,
  buildStateTokens,
  createAuthor,
  createRunJsonAction,
  defineCatalog,
  k,
  type Infer,
  type VerifyContext,
} from "@pumped-fn/lite-render-core"
import { defineComponents, type NodeRenderProps } from "../src"

// --- Sibling-watch scenario (regression for the per-path watch collapse) -------------------------

const watchSchema = k.object({
  trigger: k.nullableString,
  outA: k.nullableString,
  outB: k.nullableString,
})
type WatchState = Infer<typeof watchSchema>

const watchState = scopedValue({
  name: "regression-watch-state",
  initial: (): WatchState => ({ trigger: null, outA: null, outB: null }),
})

const valueInput = k.object({ value: k.nullableString })
type ValueInput = Infer<typeof valueInput>

const writeA = flow({
  name: "regression-write-a",
  parse: typed<ValueInput>(),
  deps: { access: watchState },
  factory: (ctx, { access }) => {
    access.update((state) => ({ ...state, outA: `A:${ctx.input.value}` }))
  },
})

const writeB = flow({
  name: "regression-write-b",
  parse: typed<ValueInput>(),
  deps: { access: watchState },
  factory: (ctx, { access }) => {
    access.update((state) => ({ ...state, outB: `B:${ctx.input.value}` }))
  },
})

const watchRegistry = {
  writeA: action(writeA, valueInput),
  writeB: action(writeB, valueInput),
}

const watchRunAction = createRunJsonAction({ registry: watchRegistry, state: watchState })

const watchCatalog = defineCatalog({
  Group: { props: {}, slots: { children: true }, events: {}, capabilities: ["group"] },
  Marker: { props: { label: k.string, text: k.nullableString }, slots: {}, events: {}, capabilities: ["marker"] },
})

const watchContext: VerifyContext = {
  state: buildStateTokens(watchSchema),
  components: watchCatalog,
  actions: watchRegistry,
  rendererCapabilities: new Set(["group", "marker"]),
}

const watchAuthor = createAuthor({ catalog: watchCatalog, registry: watchRegistry, schema: watchSchema })

const siblingWatchSpec = watchAuthor.spec(
  watchAuthor.node("Group", {
    props: {},
    slots: {
      children: [
        watchAuthor.node("Marker", {
          props: { label: "out-a", text: watchAuthor.state("/outA") },
          watch: { "/trigger": { flow: "writeA", params: { value: watchAuthor.state("/trigger") } } },
        }),
        watchAuthor.node("Marker", {
          props: { label: "out-b", text: watchAuthor.state("/outB") },
          watch: { "/trigger": { flow: "writeB", params: { value: watchAuthor.state("/trigger") } } },
        }),
      ],
    },
  })
)

function GroupView({ slots }: NodeRenderProps<(typeof watchCatalog)["Group"]>) {
  return <div>{slots.children}</div>
}

function MarkerView({ props }: NodeRenderProps<(typeof watchCatalog)["Marker"]>) {
  return <span aria-label={props.label}>{props.text ?? ""}</span>
}

const watchComponents = defineComponents(watchCatalog, { Group: GroupView, Marker: MarkerView })

// --- Item-dispatch scenario (regression for the repeat item not reaching dispatch) ---------------

const rowSchema = k.object({ id: k.string, label: k.string })
const listSchema = k.object({ rows: k.array(rowSchema) })
type ListState = Infer<typeof listSchema>

const listState = scopedValue({
  name: "regression-list-state",
  initial: (): ListState => ({
    rows: [
      { id: "a", label: "row-a" },
      { id: "b", label: "row-b" },
    ],
  }),
})

const removeInput = k.object({ id: k.string })
type RemoveInput = Infer<typeof removeInput>

const removeRow = flow({
  name: "regression-remove-row",
  parse: typed<RemoveInput>(),
  deps: { access: listState },
  factory: (ctx, { access }) => {
    access.update((state) => ({ ...state, rows: state.rows.filter((row) => row.id !== ctx.input.id) }))
  },
})

const listRegistry = { removeRow: action(removeRow, removeInput) }

const listRunAction = createRunJsonAction({ registry: listRegistry, state: listState })

const listCatalog = defineCatalog({
  RowList: {
    props: { items: k.array(rowSchema) },
    slots: { row: { repeats: "items" } },
    events: {},
    capabilities: ["list"],
  },
  RowButton: {
    props: { label: k.string },
    slots: {},
    events: { remove: {} },
    capabilities: ["row.button"],
  },
})

const listContext: VerifyContext = {
  state: buildStateTokens(listSchema),
  components: listCatalog,
  actions: listRegistry,
  rendererCapabilities: new Set(["list", "row.button"]),
}

const listAuthor = createAuthor({ catalog: listCatalog, registry: listRegistry, schema: listSchema })

const listSpec = listAuthor.spec(
  listAuthor.node("RowList", {
    props: { items: listAuthor.state("/rows") },
    slots: {
      row: (it) => [
        listAuthor.node("RowButton", {
          props: { label: it("label") },
          on: { remove: () => ({ flow: "removeRow", params: { id: it("id") } }) },
        }),
      ],
    },
  })
)

function RowListView({ slots }: NodeRenderProps<(typeof listCatalog)["RowList"]>) {
  return (
    <ul>
      {slots.row.map((node, index) => (
        <li key={index}>{node}</li>
      ))}
    </ul>
  )
}

function RowButtonView({ props, on }: NodeRenderProps<(typeof listCatalog)["RowButton"]>) {
  return (
    <button type="button" aria-label={props.label} onClick={() => on.remove({})}>
      Remove
    </button>
  )
}

const listComponents = defineComponents(listCatalog, { RowList: RowListView, RowButton: RowButtonView })

export {
  watchState,
  watchContext,
  watchComponents,
  watchRunAction,
  siblingWatchSpec,
  listState,
  listContext,
  listComponents,
  listRunAction,
  listSpec,
}
export type { WatchState, ListState }

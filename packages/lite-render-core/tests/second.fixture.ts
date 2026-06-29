import { flow, typed } from "@pumped-fn/lite"
import {
  action,
  buildStateTokens,
  createAuthor,
  defineCatalog,
  k,
  type Assert,
  type Infer,
  type NoObjectKindStatePath,
  type StateTokenKeysMirrorPathSet,
  type VerifyContext,
} from "../src"
import { stateResource } from "./state-resource"

const rowMetaSchema = k.object({ owner: k.string, priority: k.number })
const rowSchema = k.object({
  id: k.string,
  name: k.string,
  active: k.boolean,
  meta: rowMetaSchema,
})
const menuItemSchema = k.object({
  id: k.string,
  label: k.string,
  count: k.number,
})
const dashboardSchema = k.object({
  dashboard: k.object({
    rows: k.array(rowSchema),
    menu: k.array(menuItemSchema),
    labels: k.array(k.string),
    grid: k.array(k.array(k.number)),
    matrix: k.array(k.array(rowSchema)),
    title: k.string,
    filter: k.nullableString,
    expanded: k.boolean,
    count: k.number,
  }),
})

type DashboardState = Infer<typeof dashboardSchema>

const dashboard = stateResource((): DashboardState => ({
  dashboard: {
    rows: [
      { id: "r1", name: "First", active: true, meta: { owner: "ada", priority: 1 } },
      { id: "r2", name: "Second", active: false, meta: { owner: "lin", priority: 2 } },
    ],
    menu: [
      { id: "m1", label: "Home", count: 3 },
      { id: "m2", label: "Inbox", count: 9 },
    ],
    labels: ["alpha", "beta"],
    grid: [[1, 2], [3, 4]],
    matrix: [[{ id: "x", name: "X", active: true, meta: { owner: "ada", priority: 1 } }]],
    title: "Dashboard",
    filter: null,
    expanded: true,
    count: 2,
  },
}))

const selectRowInput = k.object({ rowId: k.string })
type SelectRowInput = Infer<typeof selectRowInput>

const selectRow = flow({
  name: "dashboard-select-row",
  parse: typed<SelectRowInput>(),
  deps: { access: dashboard },
  factory: (ctx, { access }) => {
    access.update((state) => ({ ...state, dashboard: { ...state.dashboard, filter: ctx.input.rowId } }))
  },
})

const registry = {
  selectRow: action(selectRow, selectRowInput),
}

const components = defineCatalog({
  Panel: {
    props: { heading: k.string },
    slots: { body: true },
    events: {},
    capabilities: ["layout.panel"],
  },
  RowList: {
    props: { rows: k.array(rowSchema) },
    slots: { row: { repeats: "rows" } },
    events: { select: registry.selectRow.params },
    capabilities: ["interaction.rows"],
  },
  MenuList: {
    props: { items: k.array(menuItemSchema) },
    slots: { entry: { repeats: "items" } },
    events: {},
    capabilities: ["interaction.menu"],
  },
  TagList: {
    props: { labels: k.array(k.string) },
    slots: { tag: { repeats: "labels" } },
    events: {},
    capabilities: ["interaction.tags"],
  },
  GridList: {
    props: { grid: k.array(k.array(k.number)) },
    slots: { cell: { repeats: "grid" } },
    events: {},
    capabilities: ["interaction.grid"],
  },
  MatrixList: {
    props: { matrix: k.array(k.array(rowSchema)) },
    slots: { line: { repeats: "matrix" } },
    events: {},
    capabilities: ["interaction.matrix"],
  },
  RowCard: {
    props: { name: k.string, active: k.boolean },
    slots: {},
    events: {},
    capabilities: ["surface.row"],
  },
  MetaCard: {
    props: { info: rowMetaSchema },
    slots: {},
    events: {},
    capabilities: ["surface.meta"],
  },
  MenuEntry: {
    props: { label: k.string, count: k.number },
    slots: {},
    events: {},
    capabilities: ["surface.menu"],
  },
  Label: {
    props: { text: k.nullableString },
    slots: {},
    events: {},
    capabilities: ["text"],
  },
  NumberTag: {
    props: { value: k.number },
    slots: {},
    events: {},
    capabilities: ["display.number"],
  },
})

const context: VerifyContext = {
  state: buildStateTokens(dashboardSchema),
  components,
  actions: registry,
  rendererCapabilities: new Set([
    "layout.panel",
    "interaction.rows",
    "interaction.menu",
    "interaction.tags",
    "interaction.grid",
    "interaction.matrix",
    "surface.row",
    "surface.meta",
    "surface.menu",
    "text",
    "display.number",
  ]),
}

const author = createAuthor({ catalog: components, registry, schema: dashboardSchema })

const dashboardSpec = author.spec(
  author.node("Panel", {
    props: { heading: "Overview" },
    slots: {
      body: [
        author.node("RowList", {
          props: { rows: author.state("/dashboard/rows") },
          on: { select: (ev) => ({ flow: "selectRow", params: { rowId: ev("rowId") } }) },
          slots: {
            row: (it) => [
              author.node("RowCard", { props: { name: it("name"), active: it("active") } }),
              author.node("MetaCard", { props: { info: it("meta") } }),
            ],
          },
        }),
        author.node("MenuList", {
          props: { items: author.state("/dashboard/menu") },
          slots: { entry: (it) => [author.node("MenuEntry", { props: { label: it("label"), count: it("count") } })] },
        }),
        author.node("TagList", {
          props: { labels: author.state("/dashboard/labels") },
          slots: { tag: () => [author.node("Label", { props: { text: author.state("/dashboard/filter") } })] },
        }),
        author.node("GridList", {
          props: { grid: author.state("/dashboard/grid") },
          slots: { cell: () => [author.node("Label", { props: { text: author.state("/dashboard/filter") } })] },
        }),
        author.node("MatrixList", {
          props: { matrix: author.state("/dashboard/matrix") },
          slots: { line: () => [author.node("Label", { props: { text: author.state("/dashboard/filter") } })] },
        }),
      ],
    },
  })
)

type StateTokenKeysMirror = Assert<StateTokenKeysMirrorPathSet<typeof dashboardSchema>>
type NoObjectStatePath = Assert<NoObjectKindStatePath<typeof dashboardSchema>>

export { author, context, dashboard, dashboardSchema, dashboardSpec, registry, selectRow }
export type { DashboardState, SelectRowInput, StateTokenKeysMirror, NoObjectStatePath }

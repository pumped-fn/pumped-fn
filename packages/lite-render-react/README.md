# @pumped-fn/lite-render-react

React adapter for the `@pumped-fn/lite-render-core` render contract.

This is the **react** half of a core/react split (mirroring json-render): core owns the portable spec, the
schema vocabulary, the typed authoring surface, and the runtime verifier; this package lowers a **verified**
spec to React over a Lite scope. It is generic over an arbitrary catalog plus a component-implementation map —
there is no board (or any other) domain in `src`.

React is an observer here. Durable state and async stay in Lite flows; this adapter only reads state reactively
through `useScopedValue` and dispatches `on` / `watch` actions through the core dispatcher flow.

## When to Use

Use this to render a `@pumped-fn/lite-render-core` spec in React: the catalog's components become React
implementations, and the verified spec drives them. The timing is the integration edge — after the spec,
schema, and flows have clear owners in core and Lite.

If the UI is hand-authored React, do not route it through a spec; render from `useScopedValue` and mutate
through scoped actions directly. Reach for this when the spec is the artifact you ship.

## Install

```bash
npm install @pumped-fn/lite @pumped-fn/lite-react @pumped-fn/lite-render-core @pumped-fn/lite-render-react
```

## Usage

Pair a core `defineRender(...)` contract with your React implementations and get a one-prop `<View>`. The
implementations are type-checked against the contract's catalog; the contract binds context, state, and the
dispatcher — so the call site needs no type annotations.

```tsx
import { defineRender, type NodeRenderProps } from "@pumped-fn/lite-render-core"
import { defineView } from "@pumped-fn/lite-render-react"

const render = defineRender({ schema, state, catalog, actions }) // core: one inferred contract

function BoardView({ props, slots }: NodeRenderProps<(typeof catalog)["Board"]>) {
  return <section aria-label={String(props.heading)}>{slots.rows}</section>
}
function CardView({ props, on }: NodeRenderProps<(typeof catalog)["Card"]>) {
  return <button data-done={String(props.done)} onClick={() => on.toggle({ id: "..." })}>{String(props.label)}</button>
}

const View = defineView(render, { Board: BoardView, Card: CardView }) // react: one bound component

// <View spec={spec} /> — only `spec`; context / state / dispatch / components all bound from the contract.
```

A `BoardView` / `CardView` whose prop or event kind disagrees with the contract's catalog fails to compile.
`JsonRender` and `defineComponents` remain exported for advanced / manual wiring (`JsonRender` takes `spec`,
`context`, `components`, `state`, and `dispatch` explicitly).

Mount it under the Lite providers, exactly as any `@pumped-fn/lite-react` tree:

```tsx
<ScopeProvider scope={scope}>
  <ExecutionContextProvider ctx={ctx}>
    <View spec={spec} />
  </ExecutionContextProvider>
</ScopeProvider>
```

## Behavior Surface

`defineView` (and `defineComponents`) bind a React implementation to every catalog component. The renderer
hands each implementation three groups, all derived from the catalog:

- `props` — each declared prop resolved to its kind-typed value (`string`, `number`, `boolean`, `string | null`,
  `readonly unknown[]`, `Record<string, unknown>`).
- `slots` — each slot lowered to rendered children; a repeating slot renders once per resolved array element
  with that element bound as the item context.
- `on` — each catalog event lowered to a dispatcher whose payload is the kind-typed event shape. Inside a
  repeating slot the renderer threads the current element as the dispatch `item`, so item-bound action params
  (`{ item: "id" }`) resolve through the core dispatcher; nodes outside any repeat dispatch with no item. Two
  sibling nodes watching the same state path each fire their own action.

Because React props are checked contravariantly, an implementation whose prop or event kind disagrees with the
catalog fails to type-check at the bind — the renderer cannot drift from the catalog the verifier guards.
Verification runs lazily inside `<JsonRender>` (cached per context+spec identity, so the same spec re-verifies
under a different context), so there is no import-time work.

**Honest boundary.** The mirror catches *wrong-kinded* props/events, not an implementation that accepts a
*narrower* set of props — ignoring a declared prop is sound structural subtyping. The `"array"` prop kind
erases its element type to `readonly unknown[]` at the impl boundary (repeating slots, not props, carry
per-element rendering). Both are coarseness that cannot drift, not gaps the verifier would otherwise catch.

## Exports

- `defineView(contract, impls)` — binds a core contract and its catalog implementations into a
  `React.FC<{ spec: JsonSpec }>`; `impls` is type-checked against the contract's catalog with no call-site
  annotations.
- `JsonRender` — the generic renderer (advanced / manual): props `spec`, `context`, `components`, `state`,
  `dispatch`.
- `defineComponents(catalog, impls)` — binds and kind-checks a component-implementation map to a catalog.
- Types: `RenderContract`, `JsonRenderProps`, `ComponentMap`, `NodeRenderProps`, `EventPayload`, `ValueForKind`,
  `RenderCatalog`, `RenderCatalogComponent`.

## Testing

Render the real adapter in a browser test under `ScopeProvider` and `ExecutionContextProvider` over a
`createScope()` scope, then assert DOM output and that component events run their Lite flows — no module mocks,
the scope is the only seam. Spec authoring and verification can be unit-tested in `@pumped-fn/lite-render-core`
without React.

## License

MIT

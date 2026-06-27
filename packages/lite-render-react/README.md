# @pumped-fn/lite-render-react

React adapter for the `@pumped-fn/lite-render-core` render contract. This is the **react** half of a
core/react split (mirroring json-render): core owns the portable spec, the schema vocabulary, the typed
authoring surface, and the runtime verifier; this package lowers a **verified** spec to React over a Lite
scope. It is generic over an arbitrary catalog plus a component-implementation map — there is no board (or
any other) domain in `src`.

React is an observer here. Durable state and async stay in Lite flows; this adapter only reads state
reactively and dispatches `on`/`watch` actions through the core dispatcher flow.

## Quick start: `defineView`

Pair a core `defineRender(...)` contract with your React implementations and get a one-prop `<View>`. The
implementations are type-checked against the contract's catalog; the contract binds context, state, and the
dispatcher — so the call site needs no type annotations.

```tsx
import { defineRender } from "@pumped-fn/lite-render-core"
import { defineView } from "@pumped-fn/lite-render-react"

const render = defineRender({ schema, state, catalog, actions })   // core: one inferred contract

const View = defineView(render, { Board: BoardView, Card: CardView })  // react: one bound component

// <View spec={spec} /> — only `spec`; context/state/dispatch/components all bound from the contract.
```

A `BoardView`/`CardView` whose prop or event kind disagrees with the contract's catalog fails to compile.
`JsonRender` and `defineComponents` (below) remain exported for advanced/manual wiring.

## Pipeline

```
@pumped-fn/lite-render-core
  verifySpec(spec, ctx) ─> verified JsonSpec ──┐
  resolveExpr / readPath (binding resolvers)   │
  isRepeatingSlot (repeat lowering)            │
  createRunJsonAction({registry,state})        │  dispatcher flow
                                               │
defineComponents(catalog, impls)               │  ComponentMap<Catalog>
  └─ each impl: ComponentType<NodeRenderProps<Catalog[N]>>   (props kind-checked vs catalog)
                                               │
<JsonRender spec context components state dispatch />
  ├─ verifyCached(spec, ctx)        lazy, cached by spec identity — no import-time verify
  ├─ useScopedValue(state).snapshot reactive Lite state
  ├─ useFlow(dispatch).execute      on/watch actions run as Lite flows ({action, item?, event?})
  ├─ useWatchEffects(root, …)       watch lowering (per-entry diff of watched paths -> dispatch)
  └─ renderNode(...)                resolve props, render slots/repeats, apply visible, wire events
        └─> <Impl props slots on />  (the catalog component's React implementation)
```

## Public API

- `defineView(contract, impls)` — the headline. Binds a core `defineRender(...)` contract and its catalog
  implementations into a `React.FC<{ spec: JsonSpec }>`. The catalog is recovered from the contract, so
  `impls` is type-checked against it with no call-site annotations.
- `JsonRender` — the generic renderer (advanced/manual). Props: `spec` (a core `JsonSpec`), `context` (the
  core `VerifyContext` it verifies against, lazily and cached), `components` (a `ComponentMap`), `state` (a
  `lite-react` `ScopedValue`), and `dispatch` (a `createRunJsonAction` flow).
- `defineComponents(catalog, impls)` — binds a React implementation to every catalog component and
  type-checks each impl's props against the catalog's declared prop kinds.
- Types: `RenderContract`, `JsonRenderProps`, `ComponentMap`, `NodeRenderProps`, `EventPayload`,
  `ValueForKind`, `RenderCatalog`, `RenderCatalogComponent`.

## The component-implementation map mirrors the catalog

`ComponentMap<C>` maps each catalog component name to a `ComponentType<NodeRenderProps<C[N]>>`. The renderer
hands every implementation three groups, all derived from the catalog:

- `props` — each declared prop resolved to its kind-typed value (`string`, `number`, `boolean`,
  `string | null`, `readonly unknown[]`, `Record<string, unknown>`).
- `slots` — each slot lowered to rendered children (`ReactNode[]`); a repeating slot is rendered once per
  resolved array element with that element bound as the item context.
- `on` — each catalog event lowered to a dispatcher whose payload is the catalog event shape, kind-typed. For
  a node inside a repeating slot, the renderer threads the current element as the dispatch `item`, so
  item-bound action params (`{ item: "id" }`) resolve through the core dispatcher; nodes outside any repeat
  dispatch with no item. Two sibling nodes watching the same state path each fire their own action (the watch
  diff is keyed per entry, not per path).

Because React props are checked contravariantly, an implementation whose prop or event kind disagrees with
the catalog fails to type-check at `defineComponents`. The renderer cannot drift from the catalog the
verifier guards.

**Honest boundary.** The mirror catches *wrong-kinded* props/events. It does not (and should not) reject an
implementation that accepts a *narrower* set of props — ignoring a declared prop is sound structural
subtyping. The `"array"` prop kind erases the element type to `readonly unknown[]`: the catalog prop schema
records only the kind, not the element schema, so an array prop's elements are `unknown` at the impl
boundary (repeating slots, not props, carry per-element rendering). Both are coarseness that cannot drift,
not gaps the verifier would otherwise catch.

## Install

```bash
npm install @pumped-fn/lite @pumped-fn/lite-react @pumped-fn/lite-render-core @pumped-fn/lite-render-react
```

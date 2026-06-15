# F01 — State / derived soup → graph + observer

## The smell

A component owns its UI state with `useState`, derives values inline during render, and the derivation
logic is trapped inside the component. `before.tsx` filters and sorts a product list in the render body,
keyed off two `useState` cells.

## Harm

The filter/sort logic — the part with actual rules — is only reachable by rendering the component. It
cannot be unit-tested, cannot be reused, and re-runs in full on every keystroke. As the component grows,
more state cells and more inline derivations tangle together with no seam to test them through.

## Transformation

State and derivation move into the graph: `query` and `sortBy` are atoms; `products` is the source atom
(preset in tests); `visibleProducts` is a derived atom that watches `query` and `sortBy` and recomputes
only when they change. The component (`view.tsx`) becomes a pure observer — it reads `visibleProducts`
via `useAtom` and writes `query`/`sortBy` via `useController`. It owns no logic.

## Lens coverage

- **inside-out** (`after.test.ts`, node env — no DOM): the filter and sort rules are tested directly
  against the graph through the scope seam. Preset `products`, drive `query`/`sortBy` controllers, assert
  `visibleProducts`. The entire logic of the feature is verified without React.
- **outside-in** (`view.dom.test.tsx`, jsdom): the component is rendered under `ScopeProvider` with the
  source preset at the edge; interactions go through `fireEvent`, and the projection is asserted from the
  DOM. This covers wiring (which atom each control reads/writes), not logic.
- **effect-managed**: folded into the inside-out cascade tests — re-derivation on `query`/`sortBy` change
  is the only effect, drained with `scope.flush()`; there is no owned resource to tear down.

## Why 100%

`after.ts` branches are the `name`/`price` sort ternary (both covered: IO1 name, IO3 price) and the
filter predicate (matching and empty results: IO1/IO2/IO4). The `products` default factory is real
initial state, covered by IO5 resolving it without a preset. `view.tsx` is pure projection — every line
(the two `onChange` handlers, the fallbacks, the row map) is exercised by the three observer tests. No
branch exists that a public-API test cannot reach, because no logic lives in the component.

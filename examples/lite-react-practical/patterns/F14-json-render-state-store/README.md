# F14 - json-render external store points at component state

## The smell

A json-render integration owns a separate external store beside the application graph. The generated UI
can read and write state, but those writes bypass the scope seam, provider-owned execution context, and
node-testable frontend state.

## Harm

The app now has two state owners. Lite flows and scoped values cannot see json-render form edits unless
React glue copies them across, and tests must render json-render just to prove state behavior. That
recreates the local-state mirror problem at an integration boundary.

## Transformation

`orderDraft` is a Lite `scopedValue`, owned by the current execution context. `view.tsx` adapts that
scoped value with `@pumped-fn/lite-react-json-render` `scopedValueStateStore` and passes the returned
store to `@json-render/react` `JSONUIProvider`. json-render still uses its normal `$bindState` and
`$state` expressions; the source of truth is the Lite graph.

## Lens coverage

- **inside-out** (`after.test.ts`, node): resolve the scoped value through `createScope`, adapt it, and
  prove JSON Pointer writes update the scoped draft without React.
- **outside-in** (`view.browser.test.tsx`, browser mode): render the real `@json-render/react`
  `StateProvider` and `Renderer` under `ScopeProvider` and `ExecutionContextProvider`, then prove a
  `$bindState` input updates the DOM and the scoped value.

## Why 100%

The state model is declared once in `after.ts`. The adapter behavior is verified through the same
`StateStore` shape that json-render's official external-store packages consume. The rendered observer
test covers the real provider stack instead of replacing json-render with a fake.

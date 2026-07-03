# F14 - json-render bridge points at Lite graph

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

The example also adapts json-render action handlers with `useFlowHandlers`. The generated spec emits
a `submitOrder` action through its normal `on.press` binding, json-render resolves params from `$state`,
and the adapter executes the Lite `submitOrder` flow. Because scoped values are current-owned resources, the
integration boundary passes the resolved draft access through a tag so the flow mutates the actual draft
instead of resolving a second action-local draft.

## Timing

Reach for this only when the rendering boundary is genuinely json-render: generated UI, remote specs,
schema-driven editors, or a surface that must speak json-render state bindings and action events. The adapter
belongs at that edge after the state and action flows have Lite owners.

For ordinary React forms and drafts, stay with `useScopedValue`. Use `useResource` when an integration
boundary needs the resolved access object. The adapter is not a new default state path; it is the bridge that
prevents a real json-render boundary from creating a second owner.

## Lens coverage

- **inside-out** (`after.test.ts`, node): resolve the scoped value through `createScope`, adapt it, and
  prove JSON Pointer writes plus json-render action params update the scoped draft without React.
- **outside-in** (`view.browser.test.tsx`, browser mode): render the real `@json-render/react`
  `JSONUIProvider` and `Renderer` under `ScopeProvider` and `ExecutionContextProvider`, then prove a
  `$bindState` input updates the DOM and a json-render event executes the Lite flow.

## Why 100%

The state model and submit flow are declared once in `after.ts`. The adapter behavior is verified through
the same `StateStore` and `ActionHandler` shapes that json-render consumes. The rendered observer test
covers the real provider stack instead of replacing json-render with a fake.

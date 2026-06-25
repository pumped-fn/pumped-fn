# @pumped-fn/lite-react-json-render

json-render `StateStore` adapter for `@pumped-fn/lite-react` scoped values.

Use this package when a json-render spec should bind to Lite-owned frontend state. `@pumped-fn/lite-react`
still owns the scope, execution context, and scoped value; json-render reads and writes through its normal
controlled `StateProvider` store prop.

## When to Use

Use this adapter when json-render is already the right UI boundary: generated specs, server-authored forms,
schema-driven editors, or embedded surfaces that need json-render's `$state` and `$bindState` expressions.
The timing is the integration edge, after the draft/form/editor state has a clear Lite owner.

Do not use it to make ordinary React components more indirect. If the UI is hand-authored React, render forms
and drafts from `useScopedValue` and mutate through scoped actions. Use `useResource` when an integration
boundary needs the resolved access object. If json-render should own isolated state that never needs Lite
flows, resources, resets, or tests, use json-render's own store instead.

## Install

```bash
npm install @pumped-fn/lite @pumped-fn/lite-react @pumped-fn/lite-react-json-render
npm install @json-render/core @json-render/react zod
```

## Usage

```tsx
import { StateProvider } from "@json-render/react"
import { scopedValue, useResource } from "@pumped-fn/lite-react"
import { scopedValueStateStore } from "@pumped-fn/lite-react-json-render"
import { useMemo } from "react"

const orderDraft = scopedValue({
  name: "order-draft",
  initial: () => ({ order: { item: "Coffee", quantity: 1 } }),
})

function GeneratedOrder({ children }: { children: React.ReactNode }) {
  const draft = useResource(orderDraft)
  const store = useMemo(() => scopedValueStateStore({ value: draft }), [draft])

  return (
    <StateProvider store={store}>
      {children}
    </StateProvider>
  )
}
```

The adapter exposes json-render's `StateStore` shape: JSON Pointer `get`, `set`, batched `update`,
`getSnapshot`, server snapshot, and `subscribe`.

## Nested Slices

For a nested state model, pass a selector and updater:

```ts
const store = scopedValueStateStore({
  value: appDraft,
  selector: (state) => state.ui,
  updater: (next, value) => value.set({ ...value.getSnapshot(), ui: next as { count: number } }),
})
```

The updater is required for selected slices so unrelated graph-owned state is not replaced by the
json-render slice.

## Testing

Logic tests can resolve the scoped value through `createScope`, adapt it, and assert `StateStore`
behavior without React. Browser observer tests should render the real json-render provider under
`ScopeProvider` and `ExecutionContextProvider`.

## License

MIT

# @pumped-fn/lite-react-json-render

json-render `StateStore` adapter for `@pumped-fn/lite-react` scoped values.

Use this package when a json-render spec should bind to Lite-owned frontend state. `@pumped-fn/lite-react`
still owns the scope, execution context, and scoped value; json-render reads and writes through its normal
controlled `StateProvider` store prop.

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

const orderDraft = scopedValue({
  name: "order-draft",
  initial: () => ({ order: { item: "Coffee", quantity: 1 } }),
})

function GeneratedOrder({ children }: { children: React.ReactNode }) {
  const draft = useResource(orderDraft)

  return (
    <StateProvider store={scopedValueStateStore({ value: draft })}>
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

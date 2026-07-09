# @pumped-fn/lite-react-json-render

> **Status: sunset.** This package bridges the external `@json-render/*` renderer to Lite-owned state and
> actions. It is superseded by the owned, strict render contract — **`@pumped-fn/lite-render-core`** +
> **`@pumped-fn/lite-render-react`** — which give you a typed authoring surface and a compile↔runtime verifier
> instead of adapting an external renderer. Prefer the new packages for new work; this bridge remains only as
> json-render compatibility / prior art and will not receive new features.

json-render state and action adapters for `@pumped-fn/lite-react`.

Use this package when a json-render spec should bind to Lite-owned frontend state and emit actions into
Lite-owned flows. `@pumped-fn/lite-react` still owns the scope, execution context, scoped value, resources,
tags, presets, and tests; json-render reads, writes, and emits through its normal provider contracts.

## When to Use

Use these adapters when json-render is already the right UI boundary: generated specs, server-authored
forms, schema-driven editors, or embedded surfaces that need json-render's `$state`, `$bindState`, `on`,
or `watch` contracts. The timing is the integration edge, after the draft/form/editor state and action
flows have clear Lite owners.

Do not use it to make ordinary React components more indirect. If the UI is hand-authored React, render forms
and drafts from `useScopedValue` and mutate through scoped actions. Use `useResource` when an integration
boundary needs the resolved access object. If json-render should own isolated state that never needs Lite
flows, resources, resets, or tests, use json-render's own store and handlers instead.

## Install

```bash
npm install @pumped-fn/lite @pumped-fn/lite-react @pumped-fn/lite-react-json-render
npm install @json-render/core @json-render/react zod
```

## Usage

```tsx
import { JSONUIProvider, type ComponentRegistry } from "@json-render/react"
import { flow, tag } from "@pumped-fn/lite"
import { scopedValue, type ScopedValueAccess, useResource } from "@pumped-fn/lite-react"
import { flowAction, scopedValueStateStore, useFlowHandlers } from "@pumped-fn/lite-react-json-render"
import { useMemo } from "react"
import { z } from "zod"

interface OrderState {
  order: {
    item: string
    quantity: number
  }
  submission: {
    message: string
  } | null
}

const submitOrderInput = z.object({
  item: z.string(),
  quantity: z.number(),
})

const currentOrderDraft = tag<ScopedValueAccess<OrderState>>({
  label: "current.order-draft",
})

const orderDraft = scopedValue({
  name: "order-draft",
  initial: (): OrderState => ({
    order: { item: "Coffee", quantity: 1 },
    submission: null,
  }),
})

const submitOrder = flow({
  name: "submit-order",
  parse: submitOrderInput.parse,
  factory: (ctx) => {
    const draft = ctx.data.getTag(currentOrderDraft)!
    const message = `Submitted ${ctx.input.item} x ${ctx.input.quantity}`
    draft.patch({ submission: { message } })
    return message
  },
})

function GeneratedOrder(
  { registry, children }: { registry: ComponentRegistry; children: React.ReactNode }
) {
  const draft = useResource(orderDraft)

  return (
    <OrderBridge registry={registry} draft={draft}>
      {children}
    </OrderBridge>
  )
}

function OrderBridge(
  { registry, draft, children }: {
    registry: ComponentRegistry
    draft: ScopedValueAccess<OrderState>
    children: React.ReactNode
  }
) {
  const store = useMemo(() => scopedValueStateStore({ value: draft }), [draft])
  const actions = useMemo(() => ({
    submitOrder: flowAction({
      flow: submitOrder,
      tags: [currentOrderDraft(draft)],
    }),
  }), [draft])
  const handlers = useFlowHandlers(actions)

  return (
    <JSONUIProvider registry={registry} store={store} handlers={handlers}>
      {children}
    </JSONUIProvider>
  )
}
```

The adapter exposes json-render's `StateStore` shape: JSON Pointer `get`, `set`, batched `update`,
`getSnapshot`, server snapshot, and `subscribe`.

`flowHandlers` returns json-render `ActionHandler` functions. Bare flows receive resolved
json-render params as `rawInput`, so a flow parser can validate generated params. Use `flowAction` when
the boundary needs to map input, set an execution name, or pass tags.

`useFlowHandlers` returns stable proxy handlers that read the latest Lite context and action
configuration. That matches json-render's action provider, which registers the handler map at provider mount.

## Behavior Surface

Pass the returned `handlers` to `JSONUIProvider` for json-render `on` and `watch` bindings. json-render
continues to own event binding, action param resolution, confirmation, `onSuccess`, `onError`, and loading
state; Lite owns the executed flows and their resources/tags/extensions.

json-render also accepts `navigate`, `validationFunctions`, `functions`, and `directives`. Keep those as
native `JSONUIProvider` props. Validation and computed functions are synchronous json-render contracts, so
do not hide async Lite flows behind them. If they need Lite-owned data, adapt already-resolved graph values
into sync functions at the integration boundary, or have action flows write derived results back into the
scoped value.

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

Logic tests can resolve the scoped value through `createScope`, adapt it, call action handlers, and assert
`StateStore` plus flow behavior without React. Browser observer tests should render the real json-render
provider under `ScopeProvider` and `ExecutionContextProvider`.

## License

MIT

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).

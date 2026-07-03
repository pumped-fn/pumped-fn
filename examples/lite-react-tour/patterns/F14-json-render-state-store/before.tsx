import { StateProvider } from "@json-render/react"

const localStore = {
  get: () => undefined,
  set: () => undefined,
  update: () => undefined,
  getSnapshot: () => ({ order: { item: "Coffee", quantity: 1 } }),
  subscribe: () => () => undefined,
}

export function JsonRenderOrder() {
  return (
    <StateProvider store={localStore}>
      <div>Order</div>
    </StateProvider>
  )
}

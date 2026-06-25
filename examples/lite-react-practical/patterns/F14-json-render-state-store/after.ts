import { scopedValue } from "@pumped-fn/lite-react"

export interface OrderState {
  order: {
    item: string
    quantity: number
  }
}

export const orderDraft = scopedValue({
  name: "json-render-order-draft",
  initial: (): OrderState => ({
    order: {
      item: "Coffee",
      quantity: 1,
    },
  }),
})

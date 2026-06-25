import { flow, tag } from "@pumped-fn/lite"
import { scopedValue } from "@pumped-fn/lite-react"
import type { ScopedValueAccess } from "@pumped-fn/lite-react"
import { z } from "zod"

const submitOrderInput = z.object({
  item: z.string(),
  quantity: z.number(),
})

export interface OrderState {
  order: {
    item: string
    quantity: number
  }
  submission: {
    message: string
  } | null
}

export const currentOrderDraft = tag<ScopedValueAccess<OrderState>>({
  label: "json-render.current-order-draft",
})

export const orderDraft = scopedValue({
  name: "json-render-order-draft",
  initial: (): OrderState => ({
    order: {
      item: "Coffee",
      quantity: 1,
    },
    submission: null,
  }),
})

export const submitOrder = flow({
  name: "json-render-submit-order",
  parse: submitOrderInput.parse,
  factory: (ctx) => {
    const draft = ctx.data.getTag(currentOrderDraft)!
    const message = `Submitted ${ctx.input.item} x ${ctx.input.quantity}`
    draft.update((state) => ({
      ...state,
      submission: {
        message,
      },
    }))
    return message
  },
})

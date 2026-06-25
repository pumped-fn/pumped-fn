import { describe, expect, test } from "vitest"
import { createScope } from "@pumped-fn/lite"
import { flowAction, flowActionHandlers, scopedValueStateStore } from "@pumped-fn/lite-react-json-render"
import { currentOrderDraft, orderDraft, submitOrder } from "./after"

describe("inside-out", () => {
  test("IO1: json-render store writes stay inside the execution-scoped draft", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    const draft = await orderDraft.resolve(ctx)
    const store = scopedValueStateStore({ value: draft })

    expect(store.get("/order/item")).toBe("Coffee")
    expect(store.get("/order/quantity")).toBe(1)

    store.set("/order/quantity", 2)
    store.update({ "/order/item": "Tea", "/order/quantity": 3 })

    expect(draft.getSnapshot()).toEqual({
      order: {
        item: "Tea",
        quantity: 3,
      },
      submission: null,
    })

    await ctx.close()
    await scope.dispose()
  })

  test("IO2: json-render action params execute a Lite flow against the scoped draft", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    const draft = await orderDraft.resolve(ctx)
    const handlers = flowActionHandlers({
      ctx,
      actions: {
        submitOrder: flowAction({
          flow: submitOrder,
          tags: [currentOrderDraft(draft)],
        }),
      },
    })

    await handlers.submitOrder({ item: "Tea", quantity: 3 })

    expect(draft.getSnapshot()).toEqual({
      order: {
        item: "Coffee",
        quantity: 1,
      },
      submission: {
        message: "Submitted Tea x 3",
      },
    })

    await ctx.close()
    await scope.dispose()
  })
})

import { describe, expect, test } from "vitest"
import { createScope } from "@pumped-fn/lite"
import { scopedValueStateStore } from "@pumped-fn/lite-react-json-render"
import { orderDraft } from "./after"

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
    })

    await ctx.close()
    await scope.dispose()
  })
})

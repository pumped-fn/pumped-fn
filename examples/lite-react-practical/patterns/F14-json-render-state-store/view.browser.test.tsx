import { describe, expect, test } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { createScope } from "@pumped-fn/lite"
import { ExecutionContextProvider, ScopeProvider } from "@pumped-fn/lite-react"
import { orderDraft } from "./after"
import { JsonRenderOrder } from "./view"

describe("outside-in", () => {
  test("OI1: json-render waits for the Lite scoped value boundary", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    const view = render(
      <ScopeProvider scope={scope}>
        <ExecutionContextProvider ctx={ctx}>
          <JsonRenderOrder />
        </ExecutionContextProvider>
      </ScopeProvider>
    )

    expect(view.container).toBeEmptyDOMElement()

    view.unmount()
    await ctx.close()
    await scope.dispose()
  })

  test("OI2: json-render reads and writes a Lite scoped value through StateProvider", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    await orderDraft.resolve(ctx)
    let view: ReturnType<typeof render>

    await act(async () => {
      view = render(
        <ScopeProvider scope={scope}>
          <ExecutionContextProvider ctx={ctx}>
            <JsonRenderOrder />
          </ExecutionContextProvider>
        </ScopeProvider>
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const quantity = await screen.findByRole("spinbutton", { name: "Quantity" })
    expect(quantity).toHaveValue(1)
    expect(await screen.findByLabelText("order summary")).toHaveTextContent("Coffee: 1")

    await act(async () => {
      fireEvent.change(quantity, { target: { value: "4" } })
      await Promise.resolve()
    })
    expect(await screen.findByLabelText("order summary")).toHaveTextContent("Coffee: 4")

    const draft = await orderDraft.resolve(ctx)
    expect(draft.getSnapshot()).toEqual({
      order: {
        item: "Coffee",
        quantity: 4,
      },
    })

    view!.unmount()
    await ctx.close()
    await scope.dispose()
  })
})

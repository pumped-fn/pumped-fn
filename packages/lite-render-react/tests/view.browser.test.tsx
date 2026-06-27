import { describe, expect, test } from "vitest"
import { act, fireEvent, render as renderDom, screen, waitFor } from "@testing-library/react"
import { createScope } from "@pumped-fn/lite"
import { ExecutionContextProvider, ScopeProvider } from "@pumped-fn/lite-react"
import { defineView } from "../src"
import { render, boardState, spec, BoardView, CardView } from "./view.fixture"

describe("lite-render-react defineView", () => {
  test("a contract + impls bind into a one-prop <View spec={spec} /> with no annotations, and a flow dispatches", async () => {
    const View = defineView(render, { Board: BoardView, Card: CardView })

    const scope = createScope()
    const ctx = scope.createContext()
    await boardState.resolve(ctx)
    let view: ReturnType<typeof renderDom>

    await act(async () => {
      view = renderDom(
        <ScopeProvider scope={scope}>
          <ExecutionContextProvider ctx={ctx}>
            <View spec={spec} />
          </ExecutionContextProvider>
        </ScopeProvider>
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(await screen.findByLabelText("tasks board")).toHaveAttribute("data-title", "Tasks")
    expect(screen.getByLabelText("Alpha")).toHaveAttribute("data-done", "false")
    expect(screen.getByLabelText("Beta")).toHaveAttribute("data-done", "true")

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "toggle Alpha" }))
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.getByLabelText("Alpha")).toHaveAttribute("data-done", "true"))
    expect(screen.getByLabelText("Beta")).toHaveAttribute("data-done", "true")

    view!.unmount()
    await ctx.close()
    await scope.dispose()
  })
})

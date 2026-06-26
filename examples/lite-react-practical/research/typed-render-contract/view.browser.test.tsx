import { describe, expect, test } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createScope } from "@pumped-fn/lite"
import { ExecutionContextProvider, ScopeProvider } from "@pumped-fn/lite-react"
import { TypedRenderBoard } from "./view"
import { board } from "./contract"

describe("typed render contract React lowering", () => {
  test("renders the verified spec and executes Lite flows from normalized component events", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    await board.resolve(ctx)
    let view: ReturnType<typeof render>

    await act(async () => {
      view = render(
        <ScopeProvider scope={scope}>
          <ExecutionContextProvider ctx={ctx}>
            <TypedRenderBoard />
          </ExecutionContextProvider>
        </ScopeProvider>
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(await screen.findByLabelText("board status")).toHaveTextContent("Status: None")
    expect(await screen.findByLabelText("Write brief")).toHaveAttribute("data-done", "false")
    expect(await screen.findByLabelText("Review layout")).toHaveAttribute("data-done", "true")

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Move Review layout to Todo" }))
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.getByLabelText("board status")).toHaveTextContent("Status: Loaded Review layout"))
    expect(screen.getByLabelText("Review layout")).toHaveAttribute("data-done", "false")

    view!.unmount()
    await ctx.close()
    await scope.dispose()
  })
})

import { describe, expect, test } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createScope } from "@pumped-fn/lite"
import { ExecutionContextProvider, ScopeProvider } from "@pumped-fn/lite-react"
import { TypedRenderBoard, TypedRenderSummary, TypedRenderVisibility } from "./view"
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

  test("renders the second component family (summary) through React over the same Lite state", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    await board.resolve(ctx)
    let view: ReturnType<typeof render>

    await act(async () => {
      view = render(
        <ScopeProvider scope={scope}>
          <ExecutionContextProvider ctx={ctx}>
            <TypedRenderBoard />
            <TypedRenderSummary />
          </ExecutionContextProvider>
        </ScopeProvider>
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(await screen.findByLabelText("board summary")).toHaveAttribute("data-heading", "Board metrics")
    expect(screen.getByLabelText("Total")).toHaveTextContent("2")
    expect(screen.getByLabelText("Done")).toHaveTextContent("1")
    expect(screen.queryByLabelText("board badge")).toBeNull()

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Move Review layout to Todo" }))
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.getByLabelText("Done")).toHaveTextContent("0"))
    expect(screen.getByLabelText("Total")).toHaveTextContent("2")
    expect(screen.getByLabelText("board badge")).toHaveTextContent("Last move: Loaded Review layout")

    view!.unmount()
    await ctx.close()
    await scope.dispose()
  })

  test("renders the authored conditional-visibility spec and flips visibility on Lite state change", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    const access = await board.resolve(ctx)
    let view: ReturnType<typeof render>

    await act(async () => {
      view = render(
        <ScopeProvider scope={scope}>
          <ExecutionContextProvider ctx={ctx}>
            <TypedRenderVisibility />
          </ExecutionContextProvider>
        </ScopeProvider>
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(await screen.findByLabelText("board badge")).toHaveAttribute("data-tone", "info")
    expect(screen.getByLabelText("board badge")).toHaveTextContent("Done count: 1")

    await act(async () => {
      access.update((state) => ({ ...state, board: { ...state.board, showDone: false } }))
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.getByLabelText("board badge")).toHaveAttribute("data-tone", "muted"))
    expect(screen.getByLabelText("board badge")).not.toHaveTextContent("Done count")

    view!.unmount()
    await ctx.close()
    await scope.dispose()
  })
})

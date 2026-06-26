import { describe, expect, test } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createScope } from "@pumped-fn/lite"
import { ExecutionContextProvider, ScopeProvider } from "@pumped-fn/lite-react"
import { JsonRender } from "../src"
import type { JsonSpec } from "@pumped-fn/lite-render-core"
import { board, context, renderComponents, runJsonAction, boardSpec, summarySpec, visibilitySpec, watchSpec } from "./board.fixture"

function Render({ spec }: { spec: JsonSpec }) {
  return (
    <JsonRender
      spec={spec}
      context={context}
      components={renderComponents}
      state={board}
      dispatch={runJsonAction}
    />
  )
}

describe("lite-render-react generic lowering", () => {
  test("renders the verified board spec and executes Lite flows from normalized component events", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    await board.resolve(ctx)
    let view: ReturnType<typeof render>

    await act(async () => {
      view = render(
        <ScopeProvider scope={scope}>
          <ExecutionContextProvider ctx={ctx}>
            <Render spec={boardSpec} />
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

  test("renders a second component family (summary) through React over the same Lite state", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    await board.resolve(ctx)
    let view: ReturnType<typeof render>

    await act(async () => {
      view = render(
        <ScopeProvider scope={scope}>
          <ExecutionContextProvider ctx={ctx}>
            <Render spec={boardSpec} />
            <Render spec={summarySpec} />
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
            <Render spec={visibilitySpec} />
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

  test("renders the standalone watch spec and the watch-triggered Lite flow updates derived state", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    const access = await board.resolve(ctx)
    let view: ReturnType<typeof render>

    await act(async () => {
      view = render(
        <ScopeProvider scope={scope}>
          <ExecutionContextProvider ctx={ctx}>
            <Render spec={watchSpec} />
          </ExecutionContextProvider>
        </ScopeProvider>
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(await screen.findByLabelText("board status")).toHaveTextContent("Watch: None")

    await act(async () => {
      access.update((state) => ({ ...state, board: { ...state.board, selectedCardId: "card-1" } }))
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.getByLabelText("board status")).toHaveTextContent("Watch: Loaded Write brief"))

    view!.unmount()
    await ctx.close()
    await scope.dispose()
  })
})

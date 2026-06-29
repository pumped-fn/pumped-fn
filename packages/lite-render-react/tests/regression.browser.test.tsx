import { describe, expect, test } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createScope } from "@pumped-fn/lite"
import { ExecutionContextProvider, ScopeProvider } from "@pumped-fn/lite-react"
import { JsonRender } from "../src"
import {
  watchState,
  watchContext,
  watchContextNoMarker,
  watchComponents,
  watchRunAction,
  siblingWatchSpec,
  listState,
  listContext,
  listComponents,
  listRunAction,
  listSpec,
} from "./regression.fixture"

describe("lite-render-react regressions", () => {
  test("two sibling nodes watching the same state path both dispatch their own action on a change", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    const access = await watchState.resolve(ctx)
    let view: ReturnType<typeof render>

    await act(async () => {
      view = render(
        <ScopeProvider scope={scope}>
          <ExecutionContextProvider ctx={ctx}>
            <JsonRender
              spec={siblingWatchSpec}
              context={watchContext}
              components={watchComponents}
              state={watchState}
              dispatch={watchRunAction}
            />
          </ExecutionContextProvider>
        </ScopeProvider>
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(await screen.findByLabelText("out-a")).toHaveTextContent("")
    expect(screen.getByLabelText("out-b")).toHaveTextContent("")

    await act(async () => {
      access.update((state) => ({ ...state, trigger: "x" }))
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.getByLabelText("out-a")).toHaveTextContent("A:x"))
    await waitFor(() => expect(screen.getByLabelText("out-b")).toHaveTextContent("B:x"))

    view!.unmount()
    await ctx.close()
    await scope.dispose()
  })

  test("a per-row action dispatches with the current repeat element as item (item reaches dispatch)", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    await listState.resolve(ctx)
    let view: ReturnType<typeof render>

    await act(async () => {
      view = render(
        <ScopeProvider scope={scope}>
          <ExecutionContextProvider ctx={ctx}>
            <JsonRender
              spec={listSpec}
              context={listContext}
              components={listComponents}
              state={listState}
              dispatch={listRunAction}
            />
          </ExecutionContextProvider>
        </ScopeProvider>
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(await screen.findByLabelText("row-a")).toBeInTheDocument()
    expect(screen.getByLabelText("row-b")).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByLabelText("row-b"))
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.queryByLabelText("row-b")).toBeNull())
    expect(screen.getByLabelText("row-a")).toBeInTheDocument()

    view!.unmount()
    await ctx.close()
    await scope.dispose()
  })

  test("the same spec object re-verifies under a different context (verify cache is keyed by context, not spec alone)", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    await watchState.resolve(ctx)
    let view: ReturnType<typeof render>

    await act(async () => {
      view = render(
        <ScopeProvider scope={scope}>
          <ExecutionContextProvider ctx={ctx}>
            <JsonRender
              spec={siblingWatchSpec}
              context={watchContext}
              components={watchComponents}
              state={watchState}
              dispatch={watchRunAction}
            />
          </ExecutionContextProvider>
        </ScopeProvider>
      )
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(await screen.findByLabelText("out-a")).toBeInTheDocument()

    expect(() =>
      render(
        <ScopeProvider scope={scope}>
          <ExecutionContextProvider ctx={ctx}>
            <JsonRender
              spec={siblingWatchSpec}
              context={watchContextNoMarker}
              components={watchComponents}
              state={watchState}
              dispatch={watchRunAction}
            />
          </ExecutionContextProvider>
        </ScopeProvider>
      )
    ).toThrow(/needs marker/i)

    view!.unmount()
    await ctx.close()
    await scope.dispose()
  })
})

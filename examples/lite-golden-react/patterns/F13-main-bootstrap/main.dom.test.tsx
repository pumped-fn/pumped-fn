// @vitest-environment jsdom
import { describe, expect, test } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createScope, preset, type Lite } from "@pumped-fn/lite"
import { ExecutionContextProvider, ScopeProvider } from "@pumped-fn/lite-react"
import { bootCount, increment } from "./after"
import { mountMain } from "./main"
import { CounterApp } from "./view"

function recordFlowClose(target: Lite.AnyFlow, closes: Lite.CloseResult[]): Lite.Extension {
  return {
    name: "record-flow-close",
    wrapExec: async (next, executed, ctx) => {
      if (executed === target) {
        ctx.onClose((result) => {
          closes.push(result)
        })
      }
      return next()
    },
  }
}

describe("outside-in", () => {
  test("OI1: main creates the scope once and renders the observer under ScopeProvider", async () => {
    document.body.innerHTML = '<div id="root"></div>'
    let mounted: ReturnType<typeof mountMain>
    await act(async () => {
      mounted = mountMain()
    })
    const app = mounted!

    expect(await screen.findByRole("button", { name: "count 0" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "count 0" }))
    expect(await screen.findByRole("button", { name: "count 1" })).toBeInTheDocument()
    expect(await app.scope.resolve(bootCount)).toBe(1)

    await act(async () => {
      await app.unmount()
    })
    expect(document.getElementById("root")?.textContent).toBe("")
  })

  test("OI2: missing root is an adapter error at bootstrap", () => {
    document.body.innerHTML = ""
    expect(() => mountMain()).toThrow("root container missing")
  })

  test("OI3: failed UI exec closes the flow execution context with ok false", async () => {
    const closes: Lite.CloseResult[] = []
    const scope = createScope({
      extensions: [recordFlowClose(increment, closes)],
      presets: [
        preset(increment, async () => {
          throw new Error("increment failed")
        }),
      ],
    })
    render(
      <ScopeProvider scope={scope}>
        <ExecutionContextProvider>
          <CounterApp />
        </ExecutionContextProvider>
      </ScopeProvider>
    )

    expect(await screen.findByRole("button", { name: "count 0" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "count 0" }))

    await waitFor(() => {
      expect(closes.map((result) => result.ok)).toEqual([false])
    })
    const [result] = closes
    if (result?.ok === false) expect(result.error).toMatchObject({ message: "increment failed" })
    await scope.dispose()
  })
})

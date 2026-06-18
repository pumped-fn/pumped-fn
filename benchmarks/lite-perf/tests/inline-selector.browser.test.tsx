import { describe, expect, it } from "vitest"
import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { atom, createScope, type Lite } from "@pumped-fn/lite"
import { ScopeProvider, useSelect } from "@pumped-fn/lite-react"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function setup(consumers: number) {
  const scope = createScope()
  const a = atom({ factory: () => ({ hot: 0, cold: 0 }) })
  await scope.resolve(a)

  let renders = 0
  function Inline() {
    renders++
    const h = useSelect(a, (v) => v.hot)
    return <i>{h}</i>
  }

  const container = document.createElement("div")
  const root = createRoot(container)
  act(() =>
    root.render(
      <ScopeProvider scope={scope}>
        <React.Suspense fallback={null}>
          {Array.from({ length: consumers }, (_, i) => (
            <Inline key={i} />
          ))}
        </React.Suspense>
      </ScopeProvider>
    )
  )

  return {
    scope,
    ctrl: scope.controller(a),
    container,
    root,
    renderCount: () => renders,
  }
}

async function setHot(scope: Lite.Scope, ctrl: Lite.Controller<{ hot: number; cold: number }>, hot: number) {
  await act(async () => {
    ctrl.set({ hot, cold: 0 })
    await scope.flush()
  })
}

describe("useSelect with inline selector (handle churn per render)", () => {
  it("single consumer keeps updating across selector recreation", async () => {
    const { scope, ctrl, container, root } = await setup(1)
    expect(container.textContent).toBe("0")

    await setHot(scope, ctrl, 1)
    expect(container.textContent).toBe("1")

    await setHot(scope, ctrl, 2)
    expect(container.textContent).toBe("2")

    act(() => root.unmount())
  })

  it("100 consumers keep updating across equal-count listener churn", async () => {
    const { scope, ctrl, container, root, renderCount } = await setup(100)
    expect(renderCount()).toBe(100)

    for (let hot = 1; hot <= 3; hot++) {
      const before = renderCount()
      await setHot(scope, ctrl, hot)
      expect(renderCount() - before).toBe(100)
    }
    expect(container.textContent).toBe("3".repeat(100))

    act(() => root.unmount())
  })
})

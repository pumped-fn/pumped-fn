// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { atom, createScope } from "@pumped-fn/lite"
import { ScopeProvider, useAtom, useSelect } from "@pumped-fn/lite-react"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe("re-render behavior probe", () => {
  it("counts renders per scenario", async () => {
    const scope = createScope()
    const atomX = atom({ factory: () => ({ hot: 0, cold: 0 }) })
    const atomY = atom({ factory: () => 0 })
    await Promise.all([scope.resolve(atomX), scope.resolve(atomY)])
    const ctrlX = scope.controller(atomX)
    const ctrlY = scope.controller(atomY)

    const counts = { atomReader: 0, selectReader: 0, otherReader: 0 }
    const hotSelector = (v: { hot: number; cold: number }) => v.hot

    function AtomReader() {
      counts.atomReader++
      const v = useAtom(atomX)
      return <i>{v.hot}</i>
    }
    function SelectReader() {
      counts.selectReader++
      const h = useSelect(atomX, hotSelector)
      return <i>{h}</i>
    }
    function OtherReader() {
      counts.otherReader++
      const v = useAtom(atomY)
      return <i>{v}</i>
    }

    const root = createRoot(document.createElement("div"))
    act(() =>
      root.render(
        <ScopeProvider scope={scope}>
          <React.Suspense fallback={null}>
            <AtomReader />
            <SelectReader />
            <OtherReader />
          </React.Suspense>
        </ScopeProvider>
      )
    )

    const snap = () => ({ ...counts })
    const mounted = snap()

    const run = async (label: string, fn: () => void) => {
      const before = snap()
      await act(async () => {
        fn()
        await scope.flush()
      })
      const after = snap()
      const delta = {
        atomReader: after.atomReader - before.atomReader,
        selectReader: after.selectReader - before.selectReader,
        otherReader: after.otherReader - before.otherReader,
      }
      console.log(`${label}: useAtom(X)+${delta.atomReader} useSelect(X.hot)+${delta.selectReader} useAtom(Y)+${delta.otherReader}`)
      return delta
    }

    console.log(`mount renders: useAtom(X)=${mounted.atomReader} useSelect(X.hot)=${mounted.selectReader} useAtom(Y)=${mounted.otherReader}`)

    const hotChange = await run("set X {hot+1}", () => ctrlX.set({ hot: 1, cold: 0 }))
    const coldChange = await run("set X {cold+1} (hot unchanged)", () => ctrlX.set({ hot: 1, cold: 1 }))
    const identicalSet = await run("set X identical reference", () => ctrlX.set(ctrlX.get()))
    const yChange = await run("set Y", () => ctrlY.set(1))
    await run("invalidate X (factory re-runs, fresh object)", () => ctrlX.invalidate())

    expect(hotChange.atomReader).toBeGreaterThan(0)
    expect(hotChange.otherReader).toBe(0)
    expect(coldChange.selectReader).toBe(0)
    expect(identicalSet.atomReader).toBe(0)
    expect(yChange.atomReader).toBe(0)

    act(() => root.unmount())
  })
})

// @vitest-environment jsdom
import { bench, describe } from "vitest"
import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { atom, createScope } from "@pumped-fn/lite"
import { ScopeProvider, useAtom, useSelect } from "@pumped-fn/lite-react"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const scope = createScope()

const fanAtom = atom({ factory: () => ({ hot: 0, cold: 0 }) })
const selAtom = atom({ factory: () => ({ hot: 0, cold: 0 }) })
const inlineAtom = atom({ factory: () => ({ hot: 0, cold: 0 }) })
await Promise.all([scope.resolve(fanAtom), scope.resolve(selAtom), scope.resolve(inlineAtom)])
const fanCtrl = scope.controller(fanAtom)
const selCtrl = scope.controller(selAtom)
const inlineCtrl = scope.controller(inlineAtom)

function AtomReader() {
  const v = useAtom(fanAtom)
  return <i>{v.hot}</i>
}

const hotSelector = (v: { hot: number; cold: number }) => v.hot

function SelectReader() {
  const h = useSelect(selAtom, hotSelector)
  return <i>{h}</i>
}

function InlineSelectReader() {
  const h = useSelect(inlineAtom, (v) => v.hot)
  return <i>{h}</i>
}

function Many({ n, C }: { n: number; C: React.ComponentType }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <C key={i} />
      ))}
    </>
  )
}

let forceParent: () => void = () => {}

function Parent() {
  const [, force] = React.useReducer((x: number) => x + 1, 0)
  forceParent = force
  return <Many n={100} C={AtomReader} />
}

function wrap(node: React.ReactNode) {
  return (
    <ScopeProvider scope={scope}>
      <React.Suspense fallback={null}>{node}</React.Suspense>
    </ScopeProvider>
  )
}

function mount(node: React.ReactNode) {
  const root = createRoot(document.createElement("div"))
  act(() => root.render(wrap(node)))
  return root
}

mount(
  <>
    <Parent />
    <Many n={100} C={SelectReader} />
    <Many n={100} C={InlineSelectReader} />
  </>
)

let fanHot = 0
let selHot = 0
let selCold = 0
let inlineHot = 0

describe("update propagation (act + set + flush)", () => {
  bench("100 useAtom consumers re-render", async () => {
    await act(async () => {
      fanCtrl.set({ hot: ++fanHot, cold: 0 })
      await scope.flush()
    })
  })

  bench("100 useAtom consumers, identical value set (no re-render)", async () => {
    await act(async () => {
      fanCtrl.set(fanCtrl.get())
      await scope.flush()
    })
  })

  bench("100 useSelect consumers, selector hits (re-render)", async () => {
    await act(async () => {
      selCtrl.set({ hot: ++selHot, cold: selCold })
      await scope.flush()
    })
  })

  bench("100 useSelect consumers, selector misses (no re-render)", async () => {
    await act(async () => {
      selCtrl.set({ hot: selHot, cold: ++selCold })
      await scope.flush()
    })
  })

  bench("100 useSelect consumers, inline selector, hits", async () => {
    await act(async () => {
      inlineCtrl.set({ hot: ++inlineHot, cold: 0 })
      await scope.flush()
    })
  })

  bench("parent re-render, 100 useAtom children, value unchanged", () => {
    act(() => forceParent())
  })
})

describe("mount/unmount", () => {
  bench("mount + unmount 100 useAtom consumers", () => {
    const root = createRoot(document.createElement("div"))
    act(() => root.render(wrap(<Many n={100} C={AtomReader} />)))
    act(() => root.unmount())
  })

  bench("mount + unmount 100 useSelect consumers", () => {
    const root = createRoot(document.createElement("div"))
    act(() => root.render(wrap(<Many n={100} C={SelectReader} />)))
    act(() => root.unmount())
  })
})

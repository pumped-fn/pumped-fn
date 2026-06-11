import { bench, describe } from "vitest"
import { noop, resolvedController } from "./graphs"

const { scope, atom: objAtom, ctrl } = await resolvedController(() => ({ hot: 0, cold: 0 }))

const selector = (v: { hot: number; cold: number }) => v.hot
const handles = Array.from({ length: 100 }, () => scope.select(objAtom, selector))
for (const h of handles) h.subscribe(noop)

let hot = 0
let cold = 0

describe("scope.select — 100 active handles", () => {
  bench("set: selected value changes (all fire)", async () => {
    ctrl.set({ hot: ++hot, cold })
    await scope.flush()
  })

  bench("set: selected value unchanged (all suppressed)", async () => {
    ctrl.set({ hot, cold: ++cold })
    await scope.flush()
  })
})

const { scope: churnScope, atom: churnAtom, ctrl: churnCtrl } = await resolvedController(() => 1)
const churnSelector = (v: number) => v

describe("subscription churn", () => {
  bench("ctrl.on + unsubscribe", () => {
    churnCtrl.on("resolved", noop)()
  })

  bench("scope.on + unsubscribe", () => {
    churnScope.on("resolved", churnAtom, noop)()
  })

  bench("select handle create + subscribe + dispose", () => {
    const h = churnScope.select(churnAtom, churnSelector)
    h.subscribe(noop)
    h.dispose()
  })
})

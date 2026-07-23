import { bench, describe } from "vitest"
import { noop, resolvedController, watchChain, watchFanout, watchFanoutSuppressed } from "./graphs"
import { createScope } from "@pumped-fn/lite"

const { ctrl: c0 } = await resolvedController(() => 0)
let i0 = 0

const { ctrl: c1 } = await resolvedController(() => 0)
c1.on("resolved", noop)
let i1 = 0

const { ctrl: c100 } = await resolvedController(() => 0)
let listenerHits = 0
for (let i = 0; i < 100; i++) c100.on("resolved", () => { listenerHits += i })
let i100 = 0
const increment = (value: number, amount = 1) => value + amount

describe("controller.set — no dependents", () => {
  bench("set, 0 listeners", () => {
    c0.set(i0++)
  })

  bench("set, 1 listener", () => {
    c1.set(i1++)
  })

  bench("set, 100 listeners", () => {
    c100.set(i100++)
  })

  bench("set identical value, 100 listeners", () => {
    c100.set(i100)
  })

  bench("update(fn), 0 listeners", () => {
    c0.update(increment)
  })
})

const chainScope10 = createScope()
const chain10 = watchChain(10)
await chainScope10.resolve(chain10.leaf)
const chainHead10 = chainScope10.controller(chain10.head)
let ci10 = 0

const chainScope50 = createScope()
const chain50 = watchChain(50)
await chainScope50.resolve(chain50.leaf)
const chainHead50 = chainScope50.controller(chain50.head)
let ci50 = 0

const fanScope = createScope()
const fan100 = watchFanout(100)
await Promise.all(fan100.dependents.map((d) => fanScope.resolve(d)))
const fanSrc = fanScope.controller(fan100.src)
let fi = 0

const supScope = createScope()
const sup100 = watchFanoutSuppressed(100)
await Promise.all(sup100.dependents.map((d) => supScope.resolve(d)))
const supSrc = supScope.controller(sup100.src)
let si = 0

const { scope: invScope, ctrl: invCtrl } = await resolvedController(() => 0)

describe("invalidation cascade (set + flush)", () => {
  bench("watch chain depth 10", async () => {
    chainHead10.set(++ci10)
    await chainScope10.flush()
  })

  bench("watch chain depth 50", async () => {
    chainHead50.set(++ci50)
    await chainScope50.flush()
  })

  bench("watch fan-out 100 dependents", async () => {
    fanSrc.set(++fi)
    await fanScope.flush()
  })

  bench("watch fan-out 100, eq suppresses all", async () => {
    supSrc.set({ v: ++si })
    await supScope.flush()
  })

  bench("invalidate single atom + flush", async () => {
    invCtrl.invalidate()
    await invScope.flush()
  })
})

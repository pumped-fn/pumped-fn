/**
 * Isolated scope.select bench for deep profiling. Single scenario only.
 */
import { atom, createScope } from '@pumped-fn/lite'

const KEY_COUNT = 100
const UPDATES = 100
const ITERS = Number(process.env.ITERS ?? '2000')
const KEYS = Array.from({ length: KEY_COUNT }, (_, i) => `k${i}`)
const HOT_KEY = 'k7'

function makeState() {
  const s = {}
  for (const k of KEYS) s[k] = 0
  return s
}

const a = atom({ factory: () => makeState() })
const scope = createScope()
await scope.resolve(a)
const ctrl = scope.controller(a)
for (const k of KEYS) {
  const h = scope.select(a, (s) => s[k])
  h.subscribe(() => {})
}

// Warm-up
for (let i = 0; i < 50; i++) {
  ctrl.set({ ...ctrl.get(), [HOT_KEY]: i })
}

const t0 = performance.now()
for (let n = 0; n < ITERS; n++) {
  for (let i = 0; i < UPDATES; i++) {
    ctrl.set({ ...ctrl.get(), [HOT_KEY]: i + 1 })
  }
}
const totalMs = performance.now() - t0
const hz = (ITERS * 1000) / totalMs
console.log(`scope_select_100handles_hz=${hz.toFixed(3)}  (${totalMs.toFixed(1)}ms, ${ITERS} iters)`)

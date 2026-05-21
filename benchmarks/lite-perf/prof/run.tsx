/**
 * Standalone profiler-friendly bench runner.
 *
 * Run with:
 *   pnpm -F '@pumped-fn/lite-perf-bench' prof:react
 * or explicitly:
 *   NODE_OPTIONS="--cpu-prof --cpu-prof-dir=./prof/out" tsx prof/run.tsx
 *
 * Emits METRIC name=value lines for autoresearch.sh to parse. The script runs
 * each scenario in a tight loop (ITERATIONS env var) to give the profiler
 * plenty of samples in the hot paths.
 */
import 'global-jsdom/register'
import * as React from 'react'
import { act, render } from '@testing-library/react'
import { Suspense } from 'react'
import { atom, createScope, type Lite } from '@pumped-fn/lite'
import {
  ScopeProvider as LR_ScopeProvider,
  useAtom as LR_useAtom,
  useSelect as LR_useSelect,
} from '@pumped-fn/lite-react'
import { observer } from '@legendapp/state/react'
import {
  ScopeProvider as LL_ScopeProvider,
  useAtomObs as LL_useAtomObs,
} from '@pumped-fn/lite-legend'

type State = Record<string, number>

const KEY_COUNT_SMALL = 20
const UPDATES_SMALL = 50
const KEY_COUNT_LARGE = 100
const UPDATES_LARGE = 100
const HOT_KEY = 'k7'
const ITERATIONS = Number(process.env.ITERATIONS ?? '200')

function makeKeys(n: number) {
  return Array.from({ length: n }, (_, i) => `k${i}`)
}

function makeState(keys: string[]): State {
  const s: State = {}
  for (const k of keys) s[k] = 0
  return s
}

interface Harness {
  atom: Lite.Atom<State>
  scope: Lite.Scope
  unmount: () => void
}

async function setupLiteReact(strategy: 'useAtom' | 'useSelect', keys: string[]): Promise<Harness> {
  const a = atom<State>({ factory: () => makeState(keys) })
  const scope = createScope()
  await scope.resolve(a)

  const Row = ({ k }: { k: string }) => {
    if (strategy === 'useAtom') {
      const v = LR_useAtom(a)
      return <span>{v[k]}</span>
    }
    const v = LR_useSelect(a, (s) => s[k] as number)
    return <span>{v}</span>
  }
  const App = () => (
    <>{keys.map((k) => <Row key={k} k={k} />)}</>
  )

  const result = render(
    <LR_ScopeProvider scope={scope}>
      <Suspense fallback={<span>…</span>}>
        <App />
      </Suspense>
    </LR_ScopeProvider>
  )
  return { atom: a, scope, unmount: () => result.unmount() }
}

async function setupLiteLegend(keys: string[]): Promise<Harness> {
  const a = atom<State>({ factory: () => makeState(keys) })
  const scope = createScope()
  await scope.resolve(a)

  const Row = observer(({ k }: { k: string }) => {
    const obs = LL_useAtomObs(a)
    const leaf = (obs as unknown as Record<string, { get: () => number }>)[k]!
    return <span>{leaf.get()}</span>
  })
  const App = () => (
    <>{keys.map((k) => <Row key={k} k={k} />)}</>
  )

  const result = render(
    <LL_ScopeProvider scope={scope}>
      <Suspense fallback={<span>…</span>}>
        <App />
      </Suspense>
    </LL_ScopeProvider>
  )
  return { atom: a, scope, unmount: () => result.unmount() }
}

function mutateKey(h: Harness, key: string, value: number) {
  const ctrl = h.scope.controller(h.atom)
  ctrl.set({ ...ctrl.get(), [key]: value })
}

async function runIteration(h: Harness, updates: number) {
  for (let i = 0; i < updates; i++) {
    await act(async () => {
      mutateKey(h, HOT_KEY, i + 1)
      await h.scope.flush()
    })
  }
}

async function timeScenario(
  label: string,
  setup: () => Promise<Harness>,
  updates: number,
  iterations: number
): Promise<{ label: string; iters: number; totalMs: number; hz: number }> {
  // Warm-up — a few iterations to let V8 specialize.
  {
    const h = await setup()
    await runIteration(h, Math.min(updates, 50))
    h.unmount()
  }
  // Measured run — each iteration does a fresh setup+teardown.
  const t0 = performance.now()
  for (let i = 0; i < iterations; i++) {
    const h = await setup()
    await runIteration(h, updates)
    h.unmount()
  }
  const totalMs = performance.now() - t0
  const hz = (iterations * 1000) / totalMs
  return { label, iters: iterations, totalMs, hz }
}

async function main() {
  const keysSmall = makeKeys(KEY_COUNT_SMALL)
  const keysLarge = makeKeys(KEY_COUNT_LARGE)

  // Only run the scenario requested via SCENARIO env, to keep profiler
  // output focused. Default: large + legend large (the hottest paths).
  const scenario = process.env.SCENARIO ?? 'all'

  const results: Array<{ label: string; hz: number }> = []

  async function run(
    name: string,
    fn: () => Promise<{ label: string; hz: number }>
  ) {
    if (scenario === 'all' || scenario === name) {
      const r = await fn()
      console.error(`[${r.label}] ${r.hz.toFixed(2)} hz (${ITERATIONS} iters)`)
      results.push(r)
    }
  }

  await run('select-large', async () => {
    const r = await timeScenario(
      'select-large',
      () => setupLiteReact('useSelect', keysLarge),
      UPDATES_LARGE,
      ITERATIONS,
    )
    return { label: 'select_large_hz', hz: r.hz }
  })

  await run('select-small', async () => {
    const r = await timeScenario(
      'select-small',
      () => setupLiteReact('useSelect', keysSmall),
      UPDATES_SMALL,
      ITERATIONS,
    )
    return { label: 'select_small_hz', hz: r.hz }
  })

  await run('useatom-large', async () => {
    const r = await timeScenario(
      'useatom-large',
      () => setupLiteReact('useAtom', keysLarge),
      UPDATES_LARGE,
      ITERATIONS,
    )
    return { label: 'useatom_large_hz', hz: r.hz }
  })

  await run('useatom-small', async () => {
    const r = await timeScenario(
      'useatom-small',
      () => setupLiteReact('useAtom', keysSmall),
      UPDATES_SMALL,
      ITERATIONS,
    )
    return { label: 'useatom_small_hz', hz: r.hz }
  })

  await run('legend-large', async () => {
    const r = await timeScenario(
      'legend-large',
      () => setupLiteLegend(keysLarge),
      UPDATES_LARGE,
      ITERATIONS,
    )
    return { label: 'legend_large_hz', hz: r.hz }
  })

  await run('legend-small', async () => {
    const r = await timeScenario(
      'legend-small',
      () => setupLiteLegend(keysSmall),
      UPDATES_SMALL,
      ITERATIONS,
    )
    return { label: 'legend_small_hz', hz: r.hz }
  })

  for (const r of results) {
    process.stdout.write(`METRIC ${r.label}=${r.hz.toFixed(3)}\n`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

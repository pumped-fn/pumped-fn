/**
 * Granular reactivity benchmark: lite-react vs lite-legend.
 *
 * Scenario: an object atom with N=20 keys. 20 components each read one key.
 * We mutate a single key K=50 times and measure total render count + ops/sec.
 *
 * Expected:
 * - lite-react/useAtom subscribes the whole component to the atom, so every
 *   key mutation re-renders every observer → ~N*K renders.
 * - lite-react/useSelect with default Object.is equality reduces to ~K renders
 *   (only the component reading the mutated key).
 * - lite-legend observer + per-key .get() tracks the specific key via Legend's
 *   proxy, so only ~K renders.
 */
import { bench, describe } from 'vitest'
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
} from '../src'

type State = Record<string, number>
const KEY_COUNT = 20
const KEYS = Array.from({ length: KEY_COUNT }, (_, i) => `k${i}`)
const UPDATES = 50
const HOT_KEY = 'k7'

function makeState(): State {
  const s: State = {}
  for (const k of KEYS) s[k] = 0
  return s
}

interface Harness {
  atom: Lite.Atom<State>
  scope: Lite.Scope
  renders: { count: number }
  unmount: () => void
}

async function setupLiteReact(strategy: 'useAtom' | 'useSelect'): Promise<Harness> {
  const a = atom<State>({ factory: () => makeState() })
  const scope = createScope()
  await scope.resolve(a)
  const renders = { count: 0 }

  const Row = ({ k }: { k: string }) => {
    renders.count++
    if (strategy === 'useAtom') {
      const v = LR_useAtom(a)
      return <span>{v[k]}</span>
    }
    const v = LR_useSelect(a, (s) => s[k] as number)
    return <span>{v}</span>
  }
  const App = () => (
    <>
      {KEYS.map((k) => (
        <Row key={k} k={k} />
      ))}
    </>
  )

  const result = render(
    <LR_ScopeProvider scope={scope}>
      <Suspense fallback={<span>…</span>}>
        <App />
      </Suspense>
    </LR_ScopeProvider>
  )
  return {
    atom: a,
    scope,
    renders,
    unmount: () => result.unmount(),
  }
}

async function setupLiteLegend(): Promise<Harness> {
  const a = atom<State>({ factory: () => makeState() })
  const scope = createScope()
  await scope.resolve(a)
  const renders = { count: 0 }

  const Row = observer(({ k }: { k: string }) => {
    renders.count++
    const obs = LL_useAtomObs(a)
    const leaf = (obs as unknown as Record<string, { get: () => number }>)[k]!
    return <span>{leaf.get()}</span>
  })
  const App = () => (
    <>
      {KEYS.map((k) => (
        <Row key={k} k={k} />
      ))}
    </>
  )

  const result = render(
    <LL_ScopeProvider scope={scope}>
      <Suspense fallback={<span>…</span>}>
        <App />
      </Suspense>
    </LL_ScopeProvider>
  )
  return {
    atom: a,
    scope,
    renders,
    unmount: () => result.unmount(),
  }
}

function mutateKey(h: Harness, key: string, value: number) {
  const ctrl = h.scope.controller(h.atom)
  ctrl.set({ ...ctrl.get(), [key]: value })
}

describe('Granular updates: mutate 1 of 20 keys, 50 times', () => {
  bench('lite-react / useAtom (whole-atom subscription)', async () => {
    const h = await setupLiteReact('useAtom')
    try {
      for (let i = 0; i < UPDATES; i++) {
        await act(async () => {
          mutateKey(h, HOT_KEY, i + 1)
          await h.scope.flush()
        })
      }
    } finally {
      h.unmount()
    }
  })

  bench('lite-react / useSelect (fine-grained selector)', async () => {
    const h = await setupLiteReact('useSelect')
    try {
      for (let i = 0; i < UPDATES; i++) {
        await act(async () => {
          mutateKey(h, HOT_KEY, i + 1)
          await h.scope.flush()
        })
      }
    } finally {
      h.unmount()
    }
  })

  bench('lite-legend / observer + obs.key.get() (proxy tracking)', async () => {
    const h = await setupLiteLegend()
    try {
      for (let i = 0; i < UPDATES; i++) {
        await act(async () => {
          mutateKey(h, HOT_KEY, i + 1)
          await h.scope.flush()
        })
      }
    } finally {
      h.unmount()
    }
  })
})

// ── Larger scale: 100 components × 100 mutations, fixed hot key ──
const BIG_UPDATES = 100
const BIG_KEYS = Array.from({ length: 100 }, (_, i) => `k${i}`)

function makeBigState(): State {
  const s: State = {}
  for (const k of BIG_KEYS) s[k] = 0
  return s
}

async function setupBigLiteReact(strategy: 'useAtom' | 'useSelect'): Promise<Harness> {
  const a = atom<State>({ factory: () => makeBigState() })
  const scope = createScope()
  await scope.resolve(a)
  const renders = { count: 0 }
  const Row = ({ k }: { k: string }) => {
    renders.count++
    if (strategy === 'useAtom') {
      const v = LR_useAtom(a)
      return <span>{v[k]}</span>
    }
    const v = LR_useSelect(a, (s) => s[k] as number)
    return <span>{v}</span>
  }
  const App = () => (
    <>
      {BIG_KEYS.map((k) => (
        <Row key={k} k={k} />
      ))}
    </>
  )
  const result = render(
    <LR_ScopeProvider scope={scope}>
      <Suspense fallback={<span>…</span>}>
        <App />
      </Suspense>
    </LR_ScopeProvider>
  )
  return { atom: a, scope, renders, unmount: () => result.unmount() }
}

async function setupBigLiteLegend(): Promise<Harness> {
  const a = atom<State>({ factory: () => makeBigState() })
  const scope = createScope()
  await scope.resolve(a)
  const renders = { count: 0 }
  const Row = observer(({ k }: { k: string }) => {
    renders.count++
    const obs = LL_useAtomObs(a)
    const leaf = (obs as unknown as Record<string, { get: () => number }>)[k]!
    return <span>{leaf.get()}</span>
  })
  const App = () => (
    <>
      {BIG_KEYS.map((k) => (
        <Row key={k} k={k} />
      ))}
    </>
  )
  const result = render(
    <LL_ScopeProvider scope={scope}>
      <Suspense fallback={<span>…</span>}>
        <App />
      </Suspense>
    </LL_ScopeProvider>
  )
  return { atom: a, scope, renders, unmount: () => result.unmount() }
}

describe('Large scale: 100 components × 100 mutations of 1 hot key', () => {
  bench('lite-react / useAtom', async () => {
    const h = await setupBigLiteReact('useAtom')
    try {
      for (let i = 0; i < BIG_UPDATES; i++) {
        await act(async () => {
          mutateKey(h, HOT_KEY, i + 1)
          await h.scope.flush()
        })
      }
    } finally {
      h.unmount()
    }
  })

  bench('lite-react / useSelect', async () => {
    const h = await setupBigLiteReact('useSelect')
    try {
      for (let i = 0; i < BIG_UPDATES; i++) {
        await act(async () => {
          mutateKey(h, HOT_KEY, i + 1)
          await h.scope.flush()
        })
      }
    } finally {
      h.unmount()
    }
  })

  bench('lite-legend / observer', async () => {
    const h = await setupBigLiteLegend()
    try {
      for (let i = 0; i < BIG_UPDATES; i++) {
        await act(async () => {
          mutateKey(h, HOT_KEY, i + 1)
          await h.scope.flush()
        })
      }
    } finally {
      h.unmount()
    }
  })
})

describe('Render-count sanity', () => {
  bench('lite-react / useAtom render-count', async () => {
    const h = await setupLiteReact('useAtom')
    const start = h.renders.count
    try {
      for (let i = 0; i < UPDATES; i++) {
        await act(async () => {
          mutateKey(h, HOT_KEY, i + 1)
          await h.scope.flush()
        })
      }
    } finally {
      // eslint-disable-next-line no-console
      console.log(
        `[lite-react/useAtom] renders after ${UPDATES} single-key mutations: ${h.renders.count - start} (expected ≈${KEY_COUNT * UPDATES})`
      )
      h.unmount()
    }
  })

  bench('lite-react / useSelect render-count', async () => {
    const h = await setupLiteReact('useSelect')
    const start = h.renders.count
    try {
      for (let i = 0; i < UPDATES; i++) {
        await act(async () => {
          mutateKey(h, HOT_KEY, i + 1)
          await h.scope.flush()
        })
      }
    } finally {
      // eslint-disable-next-line no-console
      console.log(
        `[lite-react/useSelect] renders after ${UPDATES} single-key mutations: ${h.renders.count - start} (expected ≈${UPDATES})`
      )
      h.unmount()
    }
  })

  bench('lite-legend render-count', async () => {
    const h = await setupLiteLegend()
    const start = h.renders.count
    try {
      for (let i = 0; i < UPDATES; i++) {
        await act(async () => {
          mutateKey(h, HOT_KEY, i + 1)
          await h.scope.flush()
        })
      }
    } finally {
      // eslint-disable-next-line no-console
      console.log(
        `[lite-legend] renders after ${UPDATES} single-key mutations: ${h.renders.count - start} (expected ≈${UPDATES})`
      )
      h.unmount()
    }
  })
})

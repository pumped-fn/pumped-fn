import { describe, it, expect } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { Component, type ReactNode, Suspense } from 'react'
import { atom, createScope } from '@pumped-fn/lite'
import { syncState } from '@legendapp/state'
import { observer } from '@legendapp/state/react'
import {
  ScopeProvider,
  useScope,
  useAtom,
  useAtomObs,
  atomObs,
  invalidate,
} from '../src'

class ErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  override render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}

describe('ScopeProvider + useScope', () => {
  it('provides scope and throws outside provider', () => {
    const scope = createScope()
    let captured: unknown = null
    function Capture() {
      captured = useScope()
      return <div>ok</div>
    }
    render(
      <ScopeProvider scope={scope}>
        <Capture />
      </ScopeProvider>
    )
    expect(captured).toBe(scope)

    function NoProvider() {
      useScope()
      return null
    }
    expect(() => render(<NoProvider />)).toThrow('useScope must be used within a ScopeProvider')
  })
})

describe('atomObs bridge', () => {
  it('caches per (scope, atom)', () => {
    const a = atom({ factory: () => 1 })
    const scope = createScope()
    expect(atomObs(scope, a)).toBe(atomObs(scope, a))

    const scope2 = createScope()
    expect(atomObs(scope2, a)).not.toBe(atomObs(scope, a))
  })

  it('reads through to controller value once resolved', async () => {
    const a = atom({ factory: () => 'hello' })
    const scope = createScope()
    await scope.resolve(a)
    const obs = atomObs(scope, a)
    expect(obs.get()).toBe('hello')
  })
})

describe('useAtom', () => {
  it('suspends on idle async atom and resolves via Suspense', async () => {
    const a = atom({ factory: async () => 'lazy' })
    const scope = createScope()

    function C() {
      return <div>{useAtom(a)}</div>
    }

    render(
      <ScopeProvider scope={scope}>
        <Suspense fallback={<div>Loading…</div>}>
          <C />
        </Suspense>
      </ScopeProvider>
    )

    expect(screen.getByText('Loading…')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('lazy')).toBeInTheDocument())
  })

  it('re-renders on ctrl.set via the bridge', async () => {
    const a = atom({ factory: () => 'a' })
    const scope = createScope()
    await scope.resolve(a)

    function C() {
      return <div data-testid="v">{useAtom(a)}</div>
    }

    render(
      <ScopeProvider scope={scope}>
        <C />
      </ScopeProvider>
    )

    expect(screen.getByTestId('v').textContent).toBe('a')
    await act(async () => {
      scope.controller(a).set('b')
      await Promise.resolve()
    })
    expect(screen.getByTestId('v').textContent).toBe('b')
  })

  it('surfaces failed atom via syncState(obs).error (Legend contract)', async () => {
    // Legend's synced() routes async errors through syncState(obs).error
    // rather than re-throwing to ErrorBoundary. Consumers that want
    // ErrorBoundary semantics should read state.error in their component.
    const a = atom({
      factory: async () => {
        throw new Error('boom')
      },
    })
    const scope = createScope()
    const obs = atomObs(scope, a)
    const state = syncState(obs)

    // Observe the obs to activate Legend's synced get, which awaits ctrl.resolve().
    obs.get()
    await scope.resolve(a).catch(() => {})

    await waitFor(() => {
      const err = state.error.get()
      expect(err?.message).toBe('boom')
    })
  })
})

describe('observer + useAtomObs fine-grained', () => {
  it('tracks per-key reads on object atoms', async () => {
    type User = { name: string; age: number }
    const u = atom<User>({ factory: () => ({ name: 'a', age: 1 }) })
    const scope = createScope()
    await scope.resolve(u)

    let nameRenders = 0
    let ageRenders = 0

    const Name = observer(() => {
      const obs = useAtomObs(u)
      nameRenders++
      return <div data-testid="name">{obs.name.get()}</div>
    })
    const Age = observer(() => {
      const obs = useAtomObs(u)
      ageRenders++
      return <div data-testid="age">{obs.age.get()}</div>
    })

    render(
      <ScopeProvider scope={scope}>
        <Name />
        <Age />
      </ScopeProvider>
    )

    const nameStart = nameRenders
    const ageStart = ageRenders

    // Mutate only `age` via the controller; Name should NOT re-render.
    await act(async () => {
      scope.controller(u).set({ name: 'a', age: 2 })
      await Promise.resolve()
    })

    expect(screen.getByTestId('age').textContent).toBe('2')
    expect(screen.getByTestId('name').textContent).toBe('a')
    expect(ageRenders).toBeGreaterThan(ageStart)
    expect(nameRenders).toBe(nameStart)
  })
})

describe('invalidate()', () => {
  it('reruns factory and pushes the new value through', async () => {
    let counter = 0
    const a = atom({ factory: () => ++counter })
    const scope = createScope()
    await scope.resolve(a)

    function C() {
      return <div data-testid="v">{useAtom(a)}</div>
    }

    render(
      <ScopeProvider scope={scope}>
        <Suspense fallback={<div>…</div>}>
          <C />
        </Suspense>
      </ScopeProvider>
    )

    expect(screen.getByTestId('v').textContent).toBe('1')
    await act(async () => {
      invalidate(scope, a)
      await Promise.resolve()
    })
    await waitFor(() => expect(screen.getByTestId('v').textContent).toBe('2'))
  })
})

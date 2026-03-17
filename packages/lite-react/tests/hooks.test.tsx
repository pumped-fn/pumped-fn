import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { Component, type ReactNode, Suspense } from 'react'
import { atom, createScope, preset, type Lite } from '@pumped-fn/lite'
import { ScopeProvider, useScope, useAtom, useSelect, useController } from '../src'

class ErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean; error: unknown }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, error }
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}

describe('ScopeProvider + useScope', () => {
  it('provides scope, nests, and throws outside provider', () => {
    const scope = createScope()
    let capturedScope: Lite.Scope | null = null
    function CaptureScope() { capturedScope = useScope(); return <div>test</div> }
    render(<ScopeProvider scope={scope}><CaptureScope /></ScopeProvider>)
    expect(capturedScope).toBe(scope)

    const parentScope = createScope()
    const childScope = createScope()
    let capturedParent: Lite.Scope | null = null
    let capturedChild: Lite.Scope | null = null
    function CaptureParent() { capturedParent = useScope(); return <div>parent</div> }
    function CaptureChild() { capturedChild = useScope(); return <div>child</div> }
    render(
      <ScopeProvider scope={parentScope}>
        <CaptureParent />
        <ScopeProvider scope={childScope}><CaptureChild /></ScopeProvider>
      </ScopeProvider>
    )
    expect(capturedParent).toBe(parentScope)
    expect(capturedChild).toBe(childScope)

    function NoProvider() { useScope(); return <div>test</div> }
    expect(() => { render(<NoProvider />) }).toThrow('useScope must be used within a ScopeProvider')
  })
})

describe('useAtom - state handling', () => {
  it('auto-resolves and suspends when atom is in idle state', async () => {
    const testAtom = atom({
      factory: async () => 'lazy resolved value',
    })

    const scope = createScope()

    function TestComponent() {
      const value = useAtom(testAtom)
      return <div>{value}</div>
    }

    render(
      <ScopeProvider scope={scope}>
        <Suspense fallback={<div>Loading...</div>}>
          <TestComponent />
        </Suspense>
      </ScopeProvider>
    )

    expect(screen.getByText('Loading...')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('lazy resolved value')).toBeInTheDocument()
    })
  })

  it('suspends when atom is in resolving state', async () => {
    let resolveFactory: (value: string) => void
    const promise = new Promise<string>((resolve) => {
      resolveFactory = resolve
    })

    const testAtom = atom({
      factory: async () => promise,
    })

    const scope = createScope()
    scope.resolve(testAtom)

    function TestComponent() {
      const value = useAtom(testAtom)
      return <div>{value}</div>
    }

    render(
      <ScopeProvider scope={scope}>
        <Suspense fallback={<div>Loading...</div>}>
          <TestComponent />
        </Suspense>
      </ScopeProvider>
    )

    expect(screen.getByText('Loading...')).toBeInTheDocument()

    await act(async () => {
      resolveFactory!('resolved value')
      await promise
    })

    await waitFor(() => {
      expect(screen.getByText('resolved value')).toBeInTheDocument()
    })
  })

  it('returns value when atom is in resolved state', async () => {
    const testAtom = atom({
      factory: async () => 'resolved value',
    })

    const scope = createScope()
    await scope.resolve(testAtom)

    function TestComponent() {
      const value = useAtom(testAtom)
      return <div>{value}</div>
    }

    render(
      <ScopeProvider scope={scope}>
        <TestComponent />
      </ScopeProvider>
    )

    expect(screen.getByText('resolved value')).toBeInTheDocument()
  })

  it('throws error when atom is in failed state', async () => {
    const testError = new Error('Test error')
    const testAtom = atom({
      factory: async () => {
        throw testError
      },
    })

    const scope = createScope()
    await scope.resolve(testAtom).catch(() => {})

    function TestComponent() {
      useAtom(testAtom)
      return <div>test</div>
    }

    let errorCaught = false
    render(
      <ScopeProvider scope={scope}>
        <ErrorBoundary fallback={<div>Error caught</div>}>
          <TestComponent />
        </ErrorBoundary>
      </ScopeProvider>
    )

    errorCaught = screen.getByText('Error caught') !== null
    expect(errorCaught).toBe(true)
  })

  it('throws error when atom is idle and resolve: false', () => {
    const testAtom = atom({
      factory: async () => 'value',
    })

    const scope = createScope()
    // Note: NOT resolving the atom

    function TestComponent() {
      useAtom(testAtom, { resolve: false })
      return <div>test</div>
    }

    render(
      <ScopeProvider scope={scope}>
        <ErrorBoundary fallback={<div>Error caught</div>}>
          <TestComponent />
        </ErrorBoundary>
      </ScopeProvider>
    )

    expect(screen.getByText('Error caught')).toBeInTheDocument()
  })

  it('suspends when resolving with resolve: false (already started)', async () => {
    let resolveFactory: (value: string) => void
    const promise = new Promise<string>((resolve) => {
      resolveFactory = resolve
    })

    const testAtom = atom({
      factory: async () => promise,
    })

    const scope = createScope()
    scope.resolve(testAtom) // Start resolution externally

    function TestComponent() {
      const value = useAtom(testAtom, { resolve: false })
      return <div>{value}</div>
    }

    render(
      <ScopeProvider scope={scope}>
        <Suspense fallback={<div>Loading...</div>}>
          <TestComponent />
        </Suspense>
      </ScopeProvider>
    )

    // Should suspend because it's resolving
    expect(screen.getByText('Loading...')).toBeInTheDocument()

    await act(async () => {
      resolveFactory!('resolved value')
      await promise
    })

    await waitFor(() => {
      expect(screen.getByText('resolved value')).toBeInTheDocument()
    })
  })
})

describe('useAtom - invalidation', () => {
  it('returns stale value during re-resolution without Suspense flash', async () => {
    let callCount = 0
    const testAtom = atom({
      factory: async () => {
        callCount++
        return `value-${callCount}`
      },
    })

    const scope = createScope()
    await scope.resolve(testAtom)

    function TestComponent() {
      const value = useAtom(testAtom)
      const ctrl = useController(testAtom)
      return (
        <div>
          <span data-testid="value">{value}</span>
          <button onClick={() => ctrl.invalidate()}>Invalidate</button>
        </div>
      )
    }

    render(
      <ScopeProvider scope={scope}>
        <Suspense fallback={<div>Loading...</div>}>
          <TestComponent />
        </Suspense>
      </ScopeProvider>
    )

    expect(screen.getByTestId('value')).toHaveTextContent('value-1')

    await act(async () => {
      screen.getByText('Invalidate').click()
      await scope.flush()
    })

    await waitFor(() => {
      expect(screen.getByTestId('value')).toHaveTextContent('value-2')
    })
  })

  it('re-renders when atom value changes', async () => {
    const testAtom = atom({
      factory: () => 0,
    })

    const scope = createScope()
    await scope.resolve(testAtom)

    function TestComponent() {
      const value = useAtom(testAtom)
      const ctrl = useController(testAtom)
      return (
        <div>
          <span data-testid="value">{value}</span>
          <button onClick={() => ctrl.set(value + 1)}>Increment</button>
        </div>
      )
    }

    render(
      <ScopeProvider scope={scope}>
        <TestComponent />
      </ScopeProvider>
    )

    expect(screen.getByTestId('value')).toHaveTextContent('0')

    await act(async () => {
      screen.getByText('Increment').click()
      await scope.flush()
    })

    await waitFor(() => {
      expect(screen.getByTestId('value')).toHaveTextContent('1')
    })

    await act(async () => {
      screen.getByText('Increment').click()
      await scope.flush()
    })

    await waitFor(() => {
      expect(screen.getByTestId('value')).toHaveTextContent('2')
    })
  })
})

describe('useSelect - equality filtering', () => {
  it('only re-renders when selected value changes', async () => {
    type User = { name: string; age: number }
    const userAtom = atom<User>({
      factory: async () => ({ name: 'Alice', age: 30 }),
    })

    const scope = createScope()
    await scope.resolve(userAtom)

    let renderCount = 0

    function TestComponent() {
      const name = useSelect(userAtom, (user) => user.name)
      const ctrl = useController(userAtom)
      renderCount++

      return (
        <div>
          <span data-testid="name">{name}</span>
          <span data-testid="renders">{renderCount}</span>
          <button onClick={() => ctrl.update((u) => ({ ...u, age: u.age + 1 }))}>
            Update Age
          </button>
          <button onClick={() => ctrl.update((u) => ({ ...u, name: 'Bob' }))}>
            Update Name
          </button>
        </div>
      )
    }

    render(
      <ScopeProvider scope={scope}>
        <TestComponent />
      </ScopeProvider>
    )

    expect(screen.getByTestId('name')).toHaveTextContent('Alice')
    expect(screen.getByTestId('renders')).toHaveTextContent('1')

    await act(async () => {
      screen.getByText('Update Age').click()
      await scope.flush()
    })

    expect(screen.getByTestId('renders')).toHaveTextContent('1')
    expect(screen.getByTestId('name')).toHaveTextContent('Alice')

    await act(async () => {
      screen.getByText('Update Name').click()
      await scope.flush()
    })

    expect(screen.getByTestId('renders')).toHaveTextContent('2')
    expect(screen.getByTestId('name')).toHaveTextContent('Bob')
  })

  it('uses custom equality function', async () => {
    type Item = { id: string; count: number }
    type State = { items: Item[] }

    const stateAtom = atom<State>({
      factory: async () => ({
        items: [
          { id: '1', count: 5 },
          { id: '2', count: 10 },
        ],
      }),
    })

    const scope = createScope()
    await scope.resolve(stateAtom)

    let renderCount = 0

    function TestComponent() {
      const totalCount = useSelect(
        stateAtom,
        (state) => state.items.reduce((sum, item) => sum + item.count, 0),
        (a, b) => a === b
      )
      const ctrl = useController(stateAtom)
      renderCount++

      return (
        <div>
          <span data-testid="total">{totalCount}</span>
          <span data-testid="renders">{renderCount}</span>
          <button
            onClick={() =>
              ctrl.update((s) => ({
                items: [...s.items, { id: '3', count: 0 }],
              }))
            }
          >
            Add Zero Item
          </button>
          <button
            onClick={() =>
              ctrl.update((s) => ({
                items: [...s.items, { id: '4', count: 5 }],
              }))
            }
          >
            Add Item
          </button>
        </div>
      )
    }

    render(
      <ScopeProvider scope={scope}>
        <TestComponent />
      </ScopeProvider>
    )

    expect(screen.getByTestId('total')).toHaveTextContent('15')
    expect(screen.getByTestId('renders')).toHaveTextContent('1')

    await act(async () => {
      screen.getByText('Add Zero Item').click()
      await scope.flush()
    })

    expect(screen.getByTestId('renders')).toHaveTextContent('1')
    expect(screen.getByTestId('total')).toHaveTextContent('15')

    await act(async () => {
      screen.getByText('Add Item').click()
      await scope.flush()
    })

    expect(screen.getByTestId('renders')).toHaveTextContent('2')
    expect(screen.getByTestId('total')).toHaveTextContent('20')
  })

  it('works with inline selector functions', async () => {
    type User = { name: string; email: string }
    const userAtom = atom<User>({
      factory: async () => ({ name: 'Alice', email: 'alice@example.com' }),
    })

    const scope = createScope()
    await scope.resolve(userAtom)

    function TestComponent() {
      const name = useSelect(userAtom, (user) => user.name)
      return <div data-testid="name">{name}</div>
    }

    const { rerender } = render(
      <ScopeProvider scope={scope}>
        <TestComponent />
      </ScopeProvider>
    )

    expect(screen.getByTestId('name')).toHaveTextContent('Alice')

    rerender(
      <ScopeProvider scope={scope}>
        <TestComponent />
      </ScopeProvider>
    )

    expect(screen.getByTestId('name')).toHaveTextContent('Alice')
  })

  it('caches derived object snapshots when the store has not changed', async () => {
    type User = { name: string }
    const userAtom = atom<User>({
      factory: async () => ({ name: 'Alice' }),
    })

    const scope = createScope()
    await scope.resolve(userAtom)

    const seen: Array<{ name: string }> = []
    const selectName = (user: User) => ({ name: user.name })

    function TestComponent({ label }: { label: string }) {
      const value = useSelect(userAtom, selectName)
      seen.push(value)
      return <div data-testid="value">{label}:{value.name}</div>
    }

    const { rerender } = render(
      <ScopeProvider scope={scope}>
        <TestComponent label="first" />
      </ScopeProvider>
    )

    expect(screen.getByTestId('value')).toHaveTextContent('first:Alice')

    rerender(
      <ScopeProvider scope={scope}>
        <TestComponent label="second" />
      </ScopeProvider>
    )

    expect(screen.getByTestId('value')).toHaveTextContent('second:Alice')
    expect(seen).toHaveLength(2)
    expect(seen[0]).toBe(seen[1])
  })

  it('recomputes when selector semantics change without an atom update', async () => {
    type User = { name: string; email: string }
    const userAtom = atom<User>({
      factory: async () => ({ name: 'Alice', email: 'alice@example.com' }),
    })

    const scope = createScope()
    await scope.resolve(userAtom)

    function TestComponent({ field }: { field: 'name' | 'email' }) {
      const value = useSelect(userAtom, (user) => user[field])
      return <div data-testid="value">{value}</div>
    }

    const { rerender } = render(
      <ScopeProvider scope={scope}>
        <TestComponent field="name" />
      </ScopeProvider>
    )

    expect(screen.getByTestId('value')).toHaveTextContent('Alice')

    rerender(
      <ScopeProvider scope={scope}>
        <TestComponent field="email" />
      </ScopeProvider>
    )

    expect(screen.getByTestId('value')).toHaveTextContent('alice@example.com')
  })

  it('recomputes when selector semantics change under a custom equality function', async () => {
    type Value = { id: string; label: string }
    type State = { a: Value; b: Value }
    const stateAtom = atom<State>({
      factory: async () => ({
        a: { id: '1', label: 'A' },
        b: { id: '1', label: 'B' },
      }),
    })

    const scope = createScope()
    await scope.resolve(stateAtom)

    function TestComponent({ field }: { field: keyof State }) {
      const value = useSelect(
        stateAtom,
        (state) => state[field],
        (left, right) => left.id === right.id
      )
      return <div data-testid="value">{value.label}</div>
    }

    const { rerender } = render(
      <ScopeProvider scope={scope}>
        <TestComponent field="a" />
      </ScopeProvider>
    )

    expect(screen.getByTestId('value')).toHaveTextContent('A')

    rerender(
      <ScopeProvider scope={scope}>
        <TestComponent field="b" />
      </ScopeProvider>
    )

    expect(screen.getByTestId('value')).toHaveTextContent('B')
  })
})

describe('useSelect - state handling', () => {
  it('auto-resolves and suspends when atom is in idle state', async () => {
    const testAtom = atom({
      factory: async () => 'lazy selected value',
    })

    const scope = createScope()

    function TestComponent() {
      const value = useSelect(testAtom, (v) => v)
      return <div>{value}</div>
    }

    render(
      <ScopeProvider scope={scope}>
        <Suspense fallback={<div>Loading...</div>}>
          <TestComponent />
        </Suspense>
      </ScopeProvider>
    )

    expect(screen.getByText('Loading...')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('lazy selected value')).toBeInTheDocument()
    })
  })

  it('suspends when atom is in resolving state', async () => {
    let resolveFactory: (value: string) => void
    const promise = new Promise<string>((resolve) => {
      resolveFactory = resolve
    })

    const testAtom = atom({
      factory: async () => promise,
    })

    const scope = createScope()
    scope.resolve(testAtom)

    function TestComponent() {
      const value = useSelect(testAtom, (v) => v)
      return <div>{value}</div>
    }

    render(
      <ScopeProvider scope={scope}>
        <Suspense fallback={<div>Loading...</div>}>
          <TestComponent />
        </Suspense>
      </ScopeProvider>
    )

    expect(screen.getByText('Loading...')).toBeInTheDocument()

    await act(async () => {
      resolveFactory!('resolved value')
      await promise
    })

    await waitFor(() => {
      expect(screen.getByText('resolved value')).toBeInTheDocument()
    })
  })

  it('throws error when atom is in failed state', async () => {
    const testError = new Error('Test error')
    const testAtom = atom({
      factory: async () => {
        throw testError
      },
    })

    const scope = createScope()
    await scope.resolve(testAtom).catch(() => {})

    function TestComponent() {
      useSelect(testAtom, (v) => v)
      return <div>test</div>
    }

    render(
      <ScopeProvider scope={scope}>
        <ErrorBoundary fallback={<div>Error caught</div>}>
          <TestComponent />
        </ErrorBoundary>
      </ScopeProvider>
    )

    expect(screen.getByText('Error caught')).toBeInTheDocument()
  })

  it('surfaces refresh failures after a previously resolved value', async () => {
    let callCount = 0
    const testAtom = atom({
      factory: async () => {
        callCount++
        if (callCount === 1) {
          return 'ok'
        }
        throw new Error('Refresh failed')
      },
    })

    const scope = createScope()
    await scope.resolve(testAtom)

    function TestComponent() {
      const value = useSelect(testAtom, (v) => v)
      const ctrl = useController(testAtom)

      return (
        <div>
          <span data-testid="value">{value}</span>
          <button onClick={() => ctrl.invalidate()}>Refresh</button>
        </div>
      )
    }

    render(
      <ScopeProvider scope={scope}>
        <ErrorBoundary fallback={<div>Error caught</div>}>
          <Suspense fallback={<div>Loading...</div>}>
            <TestComponent />
          </Suspense>
        </ErrorBoundary>
      </ScopeProvider>
    )

    expect(screen.getByTestId('value')).toHaveTextContent('ok')

    await act(async () => {
      screen.getByText('Refresh').click()
      await scope.flush().catch(() => {})
    })

    await waitFor(() => {
      expect(screen.getByText('Error caught')).toBeInTheDocument()
    })
  })

  it('returns stale selection for a fresh subscriber while re-resolving', async () => {
    let resolveNext: ((value: string) => void) | null = null
    let callCount = 0
    const testAtom = atom({
      factory: async () => {
        callCount++
        if (callCount === 1) {
          return 'value-1'
        }
        return new Promise<string>((resolve) => {
          resolveNext = resolve
        })
      },
    })

    const scope = createScope()
    await scope.resolve(testAtom)
    const ctrl = scope.controller(testAtom)
    ctrl.invalidate()

    await waitFor(() => {
      expect(ctrl.state).toBe('resolving')
      expect(resolveNext).not.toBeNull()
    })

    function TestComponent() {
      const value = useSelect(testAtom, (v) => v)
      return <div data-testid="value">{value}</div>
    }

    render(
      <ScopeProvider scope={scope}>
        <Suspense fallback={<div>Loading...</div>}>
          <TestComponent />
        </Suspense>
      </ScopeProvider>
    )

    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    expect(screen.getByTestId('value')).toHaveTextContent('value-1')

    await act(async () => {
      resolveNext?.('value-2')
      await scope.flush()
    })

    await waitFor(() => {
      expect(screen.getByTestId('value')).toHaveTextContent('value-2')
    })
  })
})

describe('preset injection pattern', () => {
  it('preset values, set() override, and multiple presets', async () => {
    type User = { id: string; name: string }
    const userAtom = atom<User>({
      factory: async () => { throw new Error('Should not call factory with preset') },
    })
    const scope1 = createScope({ presets: [preset(userAtom, { id: '123', name: 'Test User' })] })
    await scope1.resolve(userAtom)
    function ShowUser() {
      const user = useAtom(userAtom)
      return <div><span data-testid="id">{user.id}</span><span data-testid="name">{user.name}</span></div>
    }
    render(<ScopeProvider scope={scope1}><ShowUser /></ScopeProvider>)
    expect(screen.getByTestId('id')).toHaveTextContent('123')
    expect(screen.getByTestId('name')).toHaveTextContent('Test User')

    const counterAtom = atom({ factory: async () => 0 })
    const scope2 = createScope({ presets: [preset(counterAtom, 10)] })
    await scope2.resolve(counterAtom)
    function Counter() {
      const count = useAtom(counterAtom)
      const ctrl = useController(counterAtom)
      return <div><span data-testid="count">{count}</span><button onClick={() => ctrl.set(count + 1)}>Increment</button></div>
    }
    render(<ScopeProvider scope={scope2}><Counter /></ScopeProvider>)
    expect(screen.getByTestId('count')).toHaveTextContent('10')
    await act(async () => { screen.getByText('Increment').click(); await scope2.flush() })
    expect(screen.getByTestId('count')).toHaveTextContent('11')

    type Config = { apiUrl: string }
    const configAtom = atom<Config>({ factory: async () => ({ apiUrl: '' }) })
    const userAtom2 = atom<{ name: string }>({ factory: async () => ({ name: '' }) })
    const scope3 = createScope({ presets: [preset(configAtom, { apiUrl: 'http://test.com' }), preset(userAtom2, { name: 'Multi User' })] })
    await scope3.resolve(configAtom)
    await scope3.resolve(userAtom2)
    function Multi() {
      const config = useAtom(configAtom)
      const user = useAtom(userAtom2)
      return <div><span data-testid="url">{config.apiUrl}</span><span data-testid="mname">{user.name}</span></div>
    }
    render(<ScopeProvider scope={scope3}><Multi /></ScopeProvider>)
    expect(screen.getByTestId('url')).toHaveTextContent('http://test.com')
    expect(screen.getByTestId('mname')).toHaveTextContent('Multi User')
  })
})

describe('useAtom - non-Suspense mode', () => {
  it('returns state object with suspense: false', async () => {
    const testAtom = atom({
      factory: async () => 'resolved value',
    })

    const scope = createScope()
    await scope.resolve(testAtom)

    function TestComponent() {
      const { data, loading, error, controller } = useAtom(testAtom, { suspense: false })
      return (
        <div>
          <span data-testid="data">{data}</span>
          <span data-testid="loading">{loading.toString()}</span>
          <span data-testid="error">{error?.message ?? 'none'}</span>
          <span data-testid="has-controller">{controller ? 'yes' : 'no'}</span>
        </div>
      )
    }

    render(
      <ScopeProvider scope={scope}>
        <TestComponent />
      </ScopeProvider>
    )

    expect(screen.getByTestId('data')).toHaveTextContent('resolved value')
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
    expect(screen.getByTestId('error')).toHaveTextContent('none')
    expect(screen.getByTestId('has-controller')).toHaveTextContent('yes')
  })

  it('returns idle state for unresolved atom', () => {
    const testAtom = atom({
      factory: async () => 'value',
    })

    const scope = createScope()

    function TestComponent() {
      const { data, loading, error } = useAtom(testAtom, { suspense: false })
      return (
        <div>
          <span data-testid="data">{data ?? 'undefined'}</span>
          <span data-testid="loading">{loading.toString()}</span>
          <span data-testid="error">{error?.message ?? 'none'}</span>
        </div>
      )
    }

    render(
      <ScopeProvider scope={scope}>
        <TestComponent />
      </ScopeProvider>
    )

    expect(screen.getByTestId('data')).toHaveTextContent('undefined')
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
    expect(screen.getByTestId('error')).toHaveTextContent('none')
  })

  it('shows loading state during resolution', async () => {
    let resolveFactory: (value: string) => void
    const promise = new Promise<string>((resolve) => {
      resolveFactory = resolve
    })

    const testAtom = atom({
      factory: async () => promise,
    })

    const scope = createScope()
    scope.resolve(testAtom) // Start resolution

    function TestComponent() {
      const { data, loading, error } = useAtom(testAtom, { suspense: false })
      return (
        <div>
          <span data-testid="data">{data ?? 'undefined'}</span>
          <span data-testid="loading">{loading.toString()}</span>
          <span data-testid="error">{error?.message ?? 'none'}</span>
        </div>
      )
    }

    render(
      <ScopeProvider scope={scope}>
        <TestComponent />
      </ScopeProvider>
    )

    expect(screen.getByTestId('loading')).toHaveTextContent('true')

    await act(async () => {
      resolveFactory!('resolved')
      await promise
    })

    await waitFor(() => {
      expect(screen.getByTestId('data')).toHaveTextContent('resolved')
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })
  })

  it('shows error state for failed atom', async () => {
    const testError = new Error('Test failure')
    const testAtom = atom({
      factory: async () => {
        throw testError
      },
    })

    const scope = createScope()
    await scope.resolve(testAtom).catch(() => {})

    function TestComponent() {
      const { data, loading, error } = useAtom(testAtom, { suspense: false })
      return (
        <div>
          <span data-testid="data">{data ?? 'undefined'}</span>
          <span data-testid="loading">{loading.toString()}</span>
          <span data-testid="error">{error?.message ?? 'none'}</span>
        </div>
      )
    }

    render(
      <ScopeProvider scope={scope}>
        <TestComponent />
      </ScopeProvider>
    )

    expect(screen.getByTestId('data')).toHaveTextContent('undefined')
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
    expect(screen.getByTestId('error')).toHaveTextContent('Test failure')
  })

  it('auto-resolves with resolve: true', async () => {
    const testAtom = atom({
      factory: async () => 'auto resolved',
    })

    const scope = createScope()

    function TestComponent() {
      const { data, loading } = useAtom(testAtom, { suspense: false, resolve: true })
      return (
        <div>
          <span data-testid="data">{data ?? 'undefined'}</span>
          <span data-testid="loading">{loading.toString()}</span>
        </div>
      )
    }

    render(
      <ScopeProvider scope={scope}>
        <TestComponent />
      </ScopeProvider>
    )

    // Initially loading
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('true')
    })

    // Eventually resolved
    await waitFor(() => {
      expect(screen.getByTestId('data')).toHaveTextContent('auto resolved')
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })
  })

  it('does not emit unhandledRejection when auto-resolve fails', async () => {
    const testAtom = atom({
      factory: async () => {
        throw new Error('auto resolve failed')
      },
    })

    const scope = createScope()
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason)
    }

    process.on('unhandledRejection', onUnhandled)

    try {
      function TestComponent() {
        const { error, loading } = useAtom(testAtom, { suspense: false, resolve: true })
        return (
          <div>
            <span data-testid="loading">{loading.toString()}</span>
            <span data-testid="error">{error?.message ?? 'none'}</span>
          </div>
        )
      }

      render(
        <ScopeProvider scope={scope}>
          <TestComponent />
        </ScopeProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false')
        expect(screen.getByTestId('error')).toHaveTextContent('auto resolve failed')
      })

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      expect(unhandled).toHaveLength(0)
    } finally {
      process.removeListener('unhandledRejection', onUnhandled)
    }
  })

  it('does not emit unhandledRejection when a manual refresh fails', async () => {
    let callCount = 0
    const testAtom = atom({
      factory: async () => {
        callCount++
        if (callCount === 1) {
          return 'value-1'
        }
        throw new Error('refresh failed')
      },
    })

    const scope = createScope()
    await scope.resolve(testAtom)
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason)
    }

    process.on('unhandledRejection', onUnhandled)

    try {
      function TestComponent() {
        const { data, error, loading, controller } = useAtom(testAtom, { suspense: false, resolve: true })
        return (
          <div>
            <span data-testid="data">{data ?? 'undefined'}</span>
            <span data-testid="loading">{loading.toString()}</span>
            <span data-testid="error">{error?.message ?? 'none'}</span>
            <button onClick={() => controller.invalidate()}>Refresh</button>
          </div>
        )
      }

      render(
        <ScopeProvider scope={scope}>
          <TestComponent />
        </ScopeProvider>
      )

      expect(screen.getByTestId('data')).toHaveTextContent('value-1')
      expect(screen.getByTestId('error')).toHaveTextContent('none')

      await act(async () => {
        screen.getByText('Refresh').click()
        await Promise.resolve()
      })

      await waitFor(() => {
        expect(screen.getByTestId('data')).toHaveTextContent('undefined')
        expect(screen.getByTestId('loading')).toHaveTextContent('false')
        expect(screen.getByTestId('error')).toHaveTextContent('refresh failed')
      })

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      expect(unhandled).toHaveLength(0)
    } finally {
      process.removeListener('unhandledRejection', onUnhandled)
    }
  })

  it('updates when controller.invalidate() is called', async () => {
    let callCount = 0
    const testAtom = atom({
      factory: async () => {
        callCount++
        return `value-${callCount}`
      },
    })

    const scope = createScope()
    await scope.resolve(testAtom)

    function TestComponent() {
      const { data, loading, controller } = useAtom(testAtom, { suspense: false })
      return (
        <div>
          <span data-testid="data">{data}</span>
          <span data-testid="loading">{loading.toString()}</span>
          <button onClick={() => controller.invalidate()}>Refresh</button>
        </div>
      )
    }

    render(
      <ScopeProvider scope={scope}>
        <TestComponent />
      </ScopeProvider>
    )

    expect(screen.getByTestId('data')).toHaveTextContent('value-1')

    await act(async () => {
      screen.getByText('Refresh').click()
      await scope.flush()
    })

    await waitFor(() => {
      expect(screen.getByTestId('data')).toHaveTextContent('value-2')
    })
  })

  it('keeps stale data visible while refresh is in flight', async () => {
    let resolveNext: ((value: string) => void) | null = null
    let callCount = 0
    const testAtom = atom({
      factory: async () => {
        callCount++
        if (callCount === 1) {
          return 'value-1'
        }
        return new Promise<string>((resolve) => {
          resolveNext = resolve
        })
      },
    })

    const scope = createScope()
    await scope.resolve(testAtom)

    function TestComponent() {
      const { data, loading, controller } = useAtom(testAtom, { suspense: false })
      return (
        <div>
          <span data-testid="data">{data ?? 'undefined'}</span>
          <span data-testid="loading">{loading.toString()}</span>
          <button onClick={() => controller.invalidate()}>Refresh</button>
        </div>
      )
    }

    render(
      <ScopeProvider scope={scope}>
        <TestComponent />
      </ScopeProvider>
    )

    expect(screen.getByTestId('data')).toHaveTextContent('value-1')
    expect(screen.getByTestId('loading')).toHaveTextContent('false')

    await act(async () => {
      screen.getByText('Refresh').click()
      await Promise.resolve()
    })

    expect(screen.getByTestId('data')).toHaveTextContent('value-1')
    expect(screen.getByTestId('loading')).toHaveTextContent('true')

    await act(async () => {
      resolveNext?.('value-2')
      await scope.flush()
    })

    await waitFor(() => {
      expect(screen.getByTestId('data')).toHaveTextContent('value-2')
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })
  })

  it('returns the current scope controller when the provider changes with identical data', async () => {
    const testAtom = atom({
      factory: async () => 'shared value',
    })

    const scopeA = createScope()
    const scopeB = createScope()
    await scopeA.resolve(testAtom)
    await scopeB.resolve(testAtom)

    const seen: Lite.Controller<string>[] = []

    function TestComponent() {
      const { controller } = useAtom(testAtom, { suspense: false })
      seen.push(controller)
      return <div>test</div>
    }

    const { rerender } = render(
      <ScopeProvider scope={scopeA}>
        <TestComponent />
      </ScopeProvider>
    )

    rerender(
      <ScopeProvider scope={scopeB}>
        <TestComponent />
      </ScopeProvider>
    )

    expect(seen).toHaveLength(2)
    expect(seen[0]).toBe(scopeA.controller(testAtom))
    expect(seen[1]).toBe(scopeB.controller(testAtom))
  })
})

describe('useController', () => {
  it('memoized, Suspense resolve, and already-resolved', async () => {
    const memoAtom = atom({ factory: async () => 'value' })
    const scope1 = createScope()
    await scope1.resolve(memoAtom)
    const controllers: Lite.Controller<string>[] = []
    function MemoTest() { const ctrl = useController(memoAtom); controllers.push(ctrl); return <div>test</div> }
    const { rerender } = render(<ScopeProvider scope={scope1}><MemoTest /></ScopeProvider>)
    rerender(<ScopeProvider scope={scope1}><MemoTest /></ScopeProvider>)
    expect(controllers.length).toBe(2)
    expect(controllers[0]).toBe(controllers[1])

    const susAtom = atom({ factory: async () => 'resolved value' })
    const scope2 = createScope()
    function SusTest() { const ctrl = useController(susAtom, { resolve: true }); return <div>{ctrl.get()}</div> }
    render(<ScopeProvider scope={scope2}><Suspense fallback={<div>Loading...</div>}><SusTest /></Suspense></ScopeProvider>)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
    await waitFor(() => { expect(screen.getByText('resolved value')).toBeInTheDocument() })

    const preAtom = atom({ factory: async () => 'pre-value' })
    const scope3 = createScope()
    await scope3.resolve(preAtom)
    let capturedCtrl: Lite.Controller<string> | null = null
    function PreTest() { const ctrl = useController(preAtom, { resolve: true }); capturedCtrl = ctrl; return <div>{ctrl.get()}</div> }
    render(<ScopeProvider scope={scope3}><PreTest /></ScopeProvider>)
    expect(screen.getByText('pre-value')).toBeInTheDocument()
    expect(capturedCtrl!.state).toBe('resolved')
  })

  it('set() and update() manipulate values', async () => {
    const setAtom = atom({ factory: () => 0 })
    const scope1 = createScope()
    await scope1.resolve(setAtom)
    function SetTest() {
      const count = useAtom(setAtom)
      const ctrl = useController(setAtom)
      return <div><span data-testid="count">{count}</span><button onClick={() => ctrl.set(42)}>Set to 42</button></div>
    }
    render(<ScopeProvider scope={scope1}><SetTest /></ScopeProvider>)
    expect(screen.getByTestId('count')).toHaveTextContent('0')
    await act(async () => { screen.getByText('Set to 42').click(); await scope1.flush() })
    await waitFor(() => { expect(screen.getByTestId('count')).toHaveTextContent('42') })

    const updAtom = atom({ factory: () => 5 })
    const scope2 = createScope()
    await scope2.resolve(updAtom)
    function UpdTest() {
      const count = useAtom(updAtom)
      const ctrl = useController(updAtom)
      return <div><span data-testid="ucount">{count}</span><button onClick={() => ctrl.update((n) => n * 2)}>Double</button></div>
    }
    render(<ScopeProvider scope={scope2}><UpdTest /></ScopeProvider>)
    expect(screen.getByTestId('ucount')).toHaveTextContent('5')
    await act(async () => { screen.getByText('Double').click(); await scope2.flush() })
    await waitFor(() => { expect(screen.getByTestId('ucount')).toHaveTextContent('10') })
  })
})

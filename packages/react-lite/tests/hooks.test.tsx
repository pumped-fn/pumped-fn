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

describe('ScopeProvider', () => {
  it('provides scope to descendants', () => {
    const scope = createScope()
    let capturedScope: Lite.Scope | null = null

    function TestComponent() {
      capturedScope = useScope()
      return <div>test</div>
    }

    render(
      <ScopeProvider scope={scope}>
        <TestComponent />
      </ScopeProvider>
    )

    expect(capturedScope).toBe(scope)
  })

  it('works with nested providers', () => {
    const parentScope = createScope()
    const childScope = createScope()
    let capturedParent: Lite.Scope | null = null
    let capturedChild: Lite.Scope | null = null

    function ParentComponent() {
      capturedParent = useScope()
      return <div>parent</div>
    }

    function ChildComponent() {
      capturedChild = useScope()
      return <div>child</div>
    }

    render(
      <ScopeProvider scope={parentScope}>
        <ParentComponent />
        <ScopeProvider scope={childScope}>
          <ChildComponent />
        </ScopeProvider>
      </ScopeProvider>
    )

    expect(capturedParent).toBe(parentScope)
    expect(capturedChild).toBe(childScope)
  })
})

describe('useScope', () => {
  it('throws error when used outside ScopeProvider', () => {
    function TestComponent() {
      useScope()
      return <div>test</div>
    }

    expect(() => {
      render(<TestComponent />)
    }).toThrow('useScope must be used within a ScopeProvider')
  })
})

describe('useAtom - state handling', () => {
  it('throws error when atom is in idle state', async () => {
    const testAtom = atom({
      factory: async () => 'value',
    })

    const scope = createScope()

    function TestComponent() {
      useAtom(testAtom)
      return <div>test</div>
    }

    expect(() => {
      render(
        <ScopeProvider scope={scope}>
          <TestComponent />
        </ScopeProvider>
      )
    }).toThrow('Atom not resolved. Call scope.resolve() before rendering.')
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
})

describe('useAtom - invalidation', () => {
  it.skip('suspends during invalidation and re-resolution', async () => {
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
      await waitFor(() => {
        expect(screen.getByText('Loading...')).toBeInTheDocument()
      })
    })

    await waitFor(() => {
      expect(screen.getByTestId('value')).toHaveTextContent('value-2')
    })
  })

  it.skip('re-renders when atom value changes', async () => {
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
})

describe('useSelect - state handling', () => {
  it('throws error when atom is in idle state', () => {
    const testAtom = atom({
      factory: async () => 'value',
    })

    const scope = createScope()

    function TestComponent() {
      useSelect(testAtom, (v) => v)
      return <div>test</div>
    }

    expect(() => {
      render(
        <ScopeProvider scope={scope}>
          <TestComponent />
        </ScopeProvider>
      )
    }).toThrow('Atom not resolved. Call scope.resolve() before rendering.')
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
})

describe('preset injection pattern', () => {
  it('works with preset values in tests', async () => {
    type User = { id: string; name: string }
    const userAtom = atom<User>({
      factory: async () => {
        throw new Error('Should not call factory with preset')
      },
    })

    const scope = createScope({
      presets: [preset(userAtom, { id: '123', name: 'Test User' })],
    })

    await scope.resolve(userAtom)

    function TestComponent() {
      const user = useAtom(userAtom)
      return (
        <div>
          <span data-testid="id">{user.id}</span>
          <span data-testid="name">{user.name}</span>
        </div>
      )
    }

    render(
      <ScopeProvider scope={scope}>
        <TestComponent />
      </ScopeProvider>
    )

    expect(screen.getByTestId('id')).toHaveTextContent('123')
    expect(screen.getByTestId('name')).toHaveTextContent('Test User')
  })

  it('allows presets to be overridden with set()', async () => {
    const counterAtom = atom({
      factory: async () => 0,
    })

    const scope = createScope({
      presets: [preset(counterAtom, 10)],
    })

    await scope.resolve(counterAtom)

    function TestComponent() {
      const count = useAtom(counterAtom)
      const ctrl = useController(counterAtom)

      return (
        <div>
          <span data-testid="count">{count}</span>
          <button onClick={() => ctrl.set(count + 1)}>Increment</button>
        </div>
      )
    }

    render(
      <ScopeProvider scope={scope}>
        <TestComponent />
      </ScopeProvider>
    )

    expect(screen.getByTestId('count')).toHaveTextContent('10')

    await act(async () => {
      screen.getByText('Increment').click()
      await scope.flush()
    })

    expect(screen.getByTestId('count')).toHaveTextContent('11')
  })

  it('supports multiple presets', async () => {
    type Config = { apiUrl: string }
    type User = { name: string }

    const configAtom = atom<Config>({
      factory: async () => ({ apiUrl: '' }),
    })

    const userAtom = atom<User>({
      factory: async () => ({ name: '' }),
    })

    const scope = createScope({
      presets: [
        preset(configAtom, { apiUrl: 'http://test.com' }),
        preset(userAtom, { name: 'Test User' }),
      ],
    })

    await scope.resolve(configAtom)
    await scope.resolve(userAtom)

    function TestComponent() {
      const config = useAtom(configAtom)
      const user = useAtom(userAtom)

      return (
        <div>
          <span data-testid="url">{config.apiUrl}</span>
          <span data-testid="name">{user.name}</span>
        </div>
      )
    }

    render(
      <ScopeProvider scope={scope}>
        <TestComponent />
      </ScopeProvider>
    )

    expect(screen.getByTestId('url')).toHaveTextContent('http://test.com')
    expect(screen.getByTestId('name')).toHaveTextContent('Test User')
  })
})

describe('useController', () => {
  it('returns memoized controller', async () => {
    const testAtom = atom({
      factory: async () => 'value',
    })

    const scope = createScope()
    await scope.resolve(testAtom)

    const controllers: Lite.Controller<string>[] = []

    function TestComponent() {
      const ctrl = useController(testAtom)
      controllers.push(ctrl)
      return <div>test</div>
    }

    const { rerender } = render(
      <ScopeProvider scope={scope}>
        <TestComponent />
      </ScopeProvider>
    )

    rerender(
      <ScopeProvider scope={scope}>
        <TestComponent />
      </ScopeProvider>
    )

    expect(controllers.length).toBe(2)
    expect(controllers[0]).toBe(controllers[1])
  })

  it.skip('allows direct value manipulation with set()', async () => {
    const counterAtom = atom({
      factory: () => 0,
    })

    const scope = createScope()
    await scope.resolve(counterAtom)

    function TestComponent() {
      const count = useAtom(counterAtom)
      const ctrl = useController(counterAtom)

      return (
        <div>
          <span data-testid="count">{count}</span>
          <button onClick={() => ctrl.set(42)}>Set to 42</button>
        </div>
      )
    }

    render(
      <ScopeProvider scope={scope}>
        <TestComponent />
      </ScopeProvider>
    )

    expect(screen.getByTestId('count')).toHaveTextContent('0')

    await act(async () => {
      screen.getByText('Set to 42').click()
      await scope.flush()
    })

    await waitFor(() => {
      expect(screen.getByTestId('count')).toHaveTextContent('42')
    })
  })

  it.skip('allows updating with update() function', async () => {
    const counterAtom = atom({
      factory: () => 5,
    })

    const scope = createScope()
    await scope.resolve(counterAtom)

    function TestComponent() {
      const count = useAtom(counterAtom)
      const ctrl = useController(counterAtom)

      return (
        <div>
          <span data-testid="count">{count}</span>
          <button onClick={() => ctrl.update((n) => n * 2)}>Double</button>
        </div>
      )
    }

    render(
      <ScopeProvider scope={scope}>
        <TestComponent />
      </ScopeProvider>
    )

    expect(screen.getByTestId('count')).toHaveTextContent('5')

    await act(async () => {
      screen.getByText('Double').click()
      await scope.flush()
    })

    await waitFor(() => {
      expect(screen.getByTestId('count')).toHaveTextContent('10')
    })
  })
})

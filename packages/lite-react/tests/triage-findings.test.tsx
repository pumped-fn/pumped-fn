import { describe, it, expect } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { Component, type ReactNode, Suspense } from 'react'
import { atom, createScope } from '@pumped-fn/lite'
import { ScopeProvider, useSelect, useController } from '../src'

describe('Triage regression tests', () => {
  it('F6: ErrorBoundary recovery — failed atom retries on reset', async () => {
    let callCount = 0
    let shouldSucceed = false

    const retryAtom = atom({
      factory: () => {
        callCount++
        if (!shouldSucceed) throw new Error('intentional failure')
        return 'success'
      },
    })

    const scope = createScope()
    const ctrl = scope.controller(retryAtom)
    try { await ctrl.resolve() } catch {}

    expect(callCount).toBe(1)

    let resetFn: (() => void) | null = null

    class ResettableErrorBoundary extends Component<
      { children: ReactNode },
      { hasError: boolean }
    > {
      constructor(props: { children: ReactNode }) {
        super(props)
        this.state = { hasError: false }
        resetFn = () => this.setState({ hasError: false })
      }

      static getDerivedStateFromError() {
        return { hasError: true }
      }

      override render() {
        if (this.state.hasError) {
          return <div data-testid="error-resettable">Error</div>
        }
        return this.props.children
      }
    }

    function Display() {
      const controller = useController(retryAtom, { resolve: true })
      return <div data-testid="value">{String(controller.get())}</div>
    }

    render(
      <ScopeProvider scope={scope}>
        <ResettableErrorBoundary>
          <Suspense fallback={<div data-testid="loading">Loading</div>}>
            <Display />
          </Suspense>
        </ResettableErrorBoundary>
      </ScopeProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('error-resettable')).toBeInTheDocument()
    })

    expect(callCount).toBeGreaterThanOrEqual(2)

    shouldSucceed = true
    const countBefore = callCount
    await act(async () => {
      resetFn!()
      await new Promise((r) => setTimeout(r, 100))
    })

    await waitFor(() => {
      expect(screen.getByTestId('value')).toHaveTextContent('success')
    })

    expect(callCount).toBeGreaterThan(countBefore)
  })

  it('F7: useSelect with suspense:false returns UseSelectState', async () => {
    const testAtom = atom({
      factory: () => Promise.resolve({ name: 'test', age: 42 }),
    })

    const scope = createScope()
    await scope.resolve(testAtom)

    function Display() {
      const state = useSelect(testAtom, v => v.name, { suspense: false })
      return <div data-testid="state">{JSON.stringify(state)}</div>
    }

    render(
      <ScopeProvider scope={scope}>
        <Display />
      </ScopeProvider>
    )

    const stateEl = screen.getByTestId('state')
    const parsed = JSON.parse(stateEl.textContent!)
    expect(parsed.data).toBe('test')
    expect(parsed.loading).toBe(false)
    expect(parsed.error).toBeUndefined()
  })

  it('useSelect non-suspense: auto-resolves idle atom with resolve:true', async () => {
    const testAtom = atom({
      factory: async () => ({ name: 'lazy', score: 100 }),
    })

    const scope = createScope()

    function Display() {
      const state = useSelect(testAtom, v => v.name, { suspense: false, resolve: true })
      return (
        <div>
          <span data-testid="data">{state.data ?? 'undefined'}</span>
          <span data-testid="loading">{state.loading.toString()}</span>
          <span data-testid="error">{state.error?.message ?? 'none'}</span>
        </div>
      )
    }

    render(
      <ScopeProvider scope={scope}>
        <Display />
      </ScopeProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('true')
    })

    await waitFor(() => {
      expect(screen.getByTestId('data')).toHaveTextContent('lazy')
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })
  })

  it('useSelect non-suspense: shows error for failed atom', async () => {
    const testAtom = atom({
      factory: async () => { throw new Error('select fail') },
    })

    const scope = createScope()
    await scope.resolve(testAtom).catch(() => {})

    function Display() {
      const state = useSelect(testAtom, v => v, { suspense: false })
      return (
        <div>
          <span data-testid="data">{state.data ?? 'undefined'}</span>
          <span data-testid="error">{state.error?.message ?? 'none'}</span>
        </div>
      )
    }

    render(
      <ScopeProvider scope={scope}>
        <Display />
      </ScopeProvider>
    )

    expect(screen.getByTestId('data')).toHaveTextContent('undefined')
    expect(screen.getByTestId('error')).toHaveTextContent('select fail')
  })

  it('useSelect non-suspense: keeps stale selection during refresh and surfaces refresh error', async () => {
    let callCount = 0
    const testAtom = atom({
      factory: async () => {
        callCount++
        if (callCount === 1) return { name: 'first' }
        throw new Error('refresh failed')
      },
    })

    const scope = createScope()
    await scope.resolve(testAtom)

    function Display() {
      const state = useSelect(testAtom, v => v.name, { suspense: false })
      return (
        <div>
          <span data-testid="data">{state.data ?? 'undefined'}</span>
          <span data-testid="loading">{state.loading.toString()}</span>
          <span data-testid="error">{state.error?.message ?? 'none'}</span>
        </div>
      )
    }

    render(
      <ScopeProvider scope={scope}>
        <Display />
      </ScopeProvider>
    )

    expect(screen.getByTestId('data')).toHaveTextContent('first')

    await act(async () => {
      scope.controller(testAtom).invalidate()
      await new Promise(r => setTimeout(r, 10))
    })

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('refresh failed')
    })
  })
})

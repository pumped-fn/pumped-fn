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
})

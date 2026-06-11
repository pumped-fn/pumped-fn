import { describe, it, expect } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { act, StrictMode, Suspense } from 'react'
import { atom, createScope, ScopeProvider, useSelect } from '../src'

describe('StrictMode', () => {
  it('useSelect does not leak subscriptions from discarded renders', async () => {
    const scope = createScope()
    const a = atom({ factory: () => ({ hot: 0 }) })
    await scope.resolve(a)
    const ctrl = scope.controller(a)

    let selectorCalls = 0
    const selector = (v: { hot: number }) => {
      selectorCalls++
      return v.hot
    }

    function Reader() {
      const h = useSelect(a, selector)
      return <div>{h}</div>
    }

    const { unmount, container } = render(
      <StrictMode>
        <ScopeProvider scope={scope}>
          <Suspense fallback={null}>
            <Reader />
          </Suspense>
        </ScopeProvider>
      </StrictMode>
    )
    expect(container.textContent).toBe('0')

    await act(async () => {
      ctrl.set({ hot: 1 })
      await scope.flush()
    })
    expect(container.textContent).toBe('1')

    unmount()
    cleanup()

    selectorCalls = 0
    await act(async () => {
      ctrl.set({ hot: 2 })
      await scope.flush()
    })
    expect(selectorCalls).toBe(0)
  })

  it('useSelect keeps updating across StrictMode effect remount cycles', async () => {
    const scope = createScope()
    const a = atom({ factory: () => ({ hot: 0 }) })
    await scope.resolve(a)
    const ctrl = scope.controller(a)
    const selector = (v: { hot: number }) => v.hot

    function Reader() {
      const h = useSelect(a, selector)
      return <div>{h}</div>
    }

    const { container, unmount } = render(
      <StrictMode>
        <ScopeProvider scope={scope}>
          <Suspense fallback={null}>
            <Reader />
          </Suspense>
        </ScopeProvider>
      </StrictMode>
    )

    for (let hot = 1; hot <= 3; hot++) {
      await act(async () => {
        ctrl.set({ hot })
        await scope.flush()
      })
      expect(container.textContent).toBe(String(hot))
    }
    unmount()
  })
})

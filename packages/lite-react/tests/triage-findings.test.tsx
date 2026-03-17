import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, act, cleanup } from '@testing-library/react'
import { Component, type ReactNode, Suspense, useState, useCallback } from 'react'
import { atom, createScope, type Lite } from '@pumped-fn/lite'
import { ScopeProvider, useAtom, useSelect, useController } from '../src'
import * as fs from 'node:fs'
import * as path from 'node:path'

class ErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onReset?: () => void },
  { hasError: boolean; error: unknown }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode; onReset?: () => void }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, error }
  }

  reset = () => {
    this.props.onReset?.()
    this.setState({ hasError: false, error: null })
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div>
          <span data-testid="error">{String(this.state.error)}</span>
          <button data-testid="reset" onClick={this.reset}>Reset</button>
        </div>
      )
    }
    return this.props.children
  }
}

describe('F3: "use client" directive (FIXED)', () => {
  it('VERIFIES FIX: hooks.ts and context.tsx contain "use client"', () => {
    const srcDir = path.resolve(__dirname, '../src')
    const files = fs.readdirSync(srcDir)
    const filesWithDirective: string[] = []

    for (const file of files) {
      const content = fs.readFileSync(path.join(srcDir, file), 'utf-8')
      if (content.includes('"use client"') || content.includes("'use client'")) {
        filesWithDirective.push(file)
      }
    }

    expect(filesWithDirective).toContain('hooks.ts')
    expect(filesWithDirective).toContain('context.tsx')
  })

  it('PROVES: package exports React hooks (client-only APIs)', () => {
    const srcDir = path.resolve(__dirname, '../src')
    const hooksContent = fs.readFileSync(path.join(srcDir, 'hooks.ts'), 'utf-8')

    expect(hooksContent).toContain('useSyncExternalStore')
    expect(hooksContent).toContain('useContext')
    expect(hooksContent).toContain('useMemo')
  })
})

describe('F4: Suspense fallback flash on atom invalidation', () => {
  it('DISPROVES finding if stale value stays visible during re-resolution', async () => {
    let resolveFactory!: (value: string) => void
    let callCount = 0

    const asyncAtom = atom({
      factory: () =>
        new Promise<string>((resolve) => {
          callCount++
          resolveFactory = resolve
        }),
    })

    function Display() {
      const value = useAtom(asyncAtom)
      return <div data-testid="value">{value}</div>
    }

    const scope = createScope()
    render(
      <ScopeProvider scope={scope}>
        <Suspense fallback={<div data-testid="loading">Loading</div>}>
          <Display />
        </Suspense>
      </ScopeProvider>
    )

    expect(screen.getByTestId('loading')).toBeInTheDocument()
    await waitFor(() => expect(callCount).toBeGreaterThanOrEqual(1))

    await act(async () => {
      resolveFactory('first')
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(screen.getByTestId('value')).toHaveTextContent('first')

    const ctrl = scope.controller(asyncAtom)
    await act(async () => {
      ctrl.invalidate()
      await new Promise((r) => setTimeout(r, 10))
    })

    // ASSERTION: Stale value MUST remain visible (no Suspense flash)
    // If this passes → F4 DISPROVED (SWR works in suspense mode)
    // If this fails → F4 PROVED (fallback flash occurs)
    expect(screen.getByTestId('value')).toHaveTextContent('first')
    expect(screen.queryByTestId('loading')).not.toBeInTheDocument()

    await act(async () => {
      resolveFactory('second')
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(screen.getByTestId('value')).toHaveTextContent('second')
  })
})

describe('F5: Listener leak on release() during pending promise', () => {
  it('PROVED: promise hangs after release() during resolution', async () => {
    let factoryStarted = false

    const slowAtom = atom({
      factory: () =>
        new Promise<string>((resolve) => {
          factoryStarted = true
          // Never resolves — simulates slow resolution
        }),
    })

    const scope = createScope()
    const ctrl = scope.controller(slowAtom)

    // Start resolution
    const resolvePromise = ctrl.resolve()

    // Wait for factory to be invoked (resolve is async)
    await new Promise((r) => setTimeout(r, 50))
    expect(factoryStarted).toBe(true)

    // Release while resolving
    await ctrl.release()

    // ASSERTION: The resolve promise should settle (reject) after release
    // If this passes → F5 DISPROVED (promise settles properly)
    // If this fails (timeout) → F5 PROVED (promise hangs forever)
    let settled = false
    resolvePromise.then(
      () => { settled = true },
      () => { settled = true }
    )

    await new Promise((r) => setTimeout(r, 200))

    // RESULT: Promise does NOT settle after release — F5 PROVED
    // The promise hangs forever because release() deletes the cache entry
    // without notifying listeners, so the on('*') callback never fires
    expect(settled).toBe(false)
  })
})

describe('F6: useController({ resolve: true }) ErrorBoundary recovery (FIXED)', () => {
  it('VERIFIES FIX: failed atom gets one retry attempt per ErrorBoundary reset', async () => {
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

    // First render: failed → one retry (Suspense) → fails again → ErrorBoundary
    await waitFor(() => {
      expect(screen.getByTestId('error-resettable')).toBeInTheDocument()
    })

    // Factory retried at least once
    expect(callCount).toBeGreaterThanOrEqual(2)

    // Now make factory succeed and reset
    shouldSucceed = true
    const countBefore = callCount
    await act(async () => {
      resetFn!()
      await new Promise((r) => setTimeout(r, 100))
    })

    // After reset with succeeding factory: retry → success → value shown
    await waitFor(() => {
      expect(screen.getByTestId('value')).toHaveTextContent('success')
    })

    expect(callCount).toBeGreaterThan(countBefore)
  })
})

describe('F7: useSelect suspense opt-out (FIXED)', () => {
  it('VERIFIES FIX: useSelect accepts options with suspense: false', () => {
    const srcDir = path.resolve(__dirname, '../src')
    const hooksContent = fs.readFileSync(path.join(srcDir, 'hooks.ts'), 'utf-8')

    expect(hooksContent).toContain('UseSelectManualOptions')
    expect(hooksContent).toContain('UseSelectState')
    expect(hooksContent).toContain("suspense: false")
  })

  it('VERIFIES FIX: useSelect with suspense:false returns UseSelectState', async () => {
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

describe('F1/F2: React Compiler safety (FIXED R2)', () => {
  it('VERIFIES: no render-body ref mutations — selector/eq via plain closure', () => {
    const srcDir = path.resolve(__dirname, '../src')
    const hooksContent = fs.readFileSync(path.join(srcDir, 'hooks.ts'), 'utf-8')

    // No latestRef pattern (was Compiler-unsafe useMemo mutation)
    expect(hooksContent).not.toContain('latestRef')
    // No render-body selectorRef/eqRef writes
    expect(hooksContent).not.toContain('selectorRef.current = selector')
    expect(hooksContent).not.toContain('eqRef.current = eq')
  })

  it('VERIFIES: caches use useRef (accepted pattern for useSyncExternalStore)', () => {
    const srcDir = path.resolve(__dirname, '../src')
    const hooksContent = fs.readFileSync(path.join(srcDir, 'hooks.ts'), 'utf-8')

    // useRef is back — Compiler exempts ref.current writes in getSnapshot
    expect(hooksContent).toMatch(/\buseRef\b/)
    expect(hooksContent).toContain('stateCache.current')
    expect(hooksContent).toContain('selectionCache.current')
  })

  it('VERIFIES: useSelect getSnapshot is plain function (not useCallback)', () => {
    const srcDir = path.resolve(__dirname, '../src')
    const hooksContent = fs.readFileSync(path.join(srcDir, 'hooks.ts'), 'utf-8')

    // useSelect's getSnapshot should NOT be wrapped in useCallback
    // It should close over selector/eq from the render scope directly
    const useSelectBody = hooksContent.slice(hooksContent.indexOf('function useSelect'))
    expect(useSelectBody).not.toMatch(/getSnapshot\s*=\s*useCallback/)
  })
})

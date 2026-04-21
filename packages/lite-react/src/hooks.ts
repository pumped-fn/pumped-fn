'use client'

import { useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { type Lite } from '@pumped-fn/lite'
import { ScopeContext } from './context'

interface UseAtomSuspenseOptions {
  suspense?: true
  /** @default true */
  resolve?: boolean
}

interface UseAtomManualOptions {
  suspense: false
  /** @default false */
  resolve?: boolean
}

type UseAtomOptions = UseAtomSuspenseOptions | UseAtomManualOptions

interface UseAtomState<T> {
  data: T | undefined
  loading: boolean
  error: Error | undefined
  controller: Lite.Controller<T>
}

interface UseControllerOptions {
  resolve?: boolean
}

interface UseSelectSuspenseOptions<S> {
  suspense?: true
  resolve?: boolean
  eq?: (a: S, b: S) => boolean
}

interface UseSelectManualOptions<S> {
  suspense: false
  resolve?: boolean
  eq?: (a: S, b: S) => boolean
}

type UseSelectOptions<S> = UseSelectSuspenseOptions<S> | UseSelectManualOptions<S>

interface UseSelectState<S> {
  data: S | undefined
  loading: boolean
  error: Error | undefined
}

const pendingPromises = new WeakMap<Lite.Controller<unknown>, Promise<unknown>>()
const retriedControllers = new WeakSet<Lite.Controller<unknown>>()

function getOrCreatePendingPromise<T>(ctrl: Lite.Controller<T>): Promise<T> {
  let pending = pendingPromises.get(ctrl) as Promise<T> | undefined
  if (!pending) {
    if (ctrl.state === 'resolving') {
      pending = new Promise<T>((resolve, reject) => {
        const unsub = ctrl.on('*', () => {
          if (ctrl.state === 'resolved') {
            unsub()
            resolve(ctrl.get())
          } else if (ctrl.state === 'failed') {
            unsub()
            try { ctrl.get() } catch (e) { reject(e) }
          } else if (ctrl.state === 'idle') {
            unsub()
            reject(new Error('Atom was released during resolution'))
          }
        })
      })
    } else {
      pending = ctrl.resolve()
    }
    pendingPromises.set(ctrl, pending)
    void pending.catch(() => {})
    pending.then(
      () => pendingPromises.delete(ctrl),
      () => pendingPromises.delete(ctrl)
    )
  }
  return pending
}

/**
 * Access the current Lite.Scope from context.
 *
 * @returns The current Lite.Scope instance from context
 * @throws When called outside of a ScopeProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const scope = useScope()
 *   const handleClick = () => scope.resolve(myAtom)
 * }
 * ```
 */
function useScope(): Lite.Scope {
  const scope = useContext(ScopeContext)
  if (!scope) {
    throw new Error("useScope must be used within a ScopeProvider")
  }
  return scope
}

/**
 * Get a memoized controller for an atom.
 *
 * @example
 * ```tsx
 * const ctrl = useController(counterAtom)
 * ctrl.set(ctrl.get() + 1)
 * ```
 */
function useController<T>(atom: Lite.Atom<T>): Lite.Controller<T>
function useController<T>(atom: Lite.Atom<T>, options: UseControllerOptions): Lite.Controller<T>
function useController<T>(atom: Lite.Atom<T>, options?: UseControllerOptions): Lite.Controller<T> {
  const scope = useScope()
  // scope.controller() is idempotent (caches by atom in a Map), so calling it
  // every render is free and lets us skip a useMemo cell in the hook fiber.
  const ctrl = scope.controller(atom)

  if (options?.resolve) {
    if (ctrl.state === 'idle' || ctrl.state === 'resolving') {
      retriedControllers.delete(ctrl)
      throw getOrCreatePendingPromise(ctrl)
    }
    if (ctrl.state === 'failed') {
      if (retriedControllers.has(ctrl)) {
        retriedControllers.delete(ctrl)
        ctrl.get()
      }
      retriedControllers.add(ctrl)
      pendingPromises.delete(ctrl)
      throw getOrCreatePendingPromise(ctrl)
    }
    retriedControllers.delete(ctrl)
  }

  return ctrl
}

/**
 * Subscribe to atom value with Suspense/ErrorBoundary integration.
 *
 * @example
 * ```tsx
 * const user = useAtom(userAtom)
 * const { data, loading, error } = useAtom(userAtom, { suspense: false })
 * ```
 */
function useAtom<T>(atom: Lite.Atom<T>): T
function useAtom<T>(atom: Lite.Atom<T>, options: UseAtomSuspenseOptions): T
function useAtom<T>(atom: Lite.Atom<T>, options: UseAtomManualOptions): UseAtomState<T>
function useAtom<T>(atom: Lite.Atom<T>, options?: UseAtomOptions): T | UseAtomState<T> {
  const ctrl = useController(atom)
  const ctrlState = ctrl.state

  const isSuspense = options?.suspense !== false
  const autoResolve = isSuspense ? options?.resolve !== false : !!options?.resolve

  const stateCache = useRef<{
    ctrl: Lite.Controller<T>
    ctrlState: Lite.Controller<T>['state']
    data: T | undefined
    error: Error | undefined
    loading: boolean
    result: UseAtomState<T>
  } | null>(null)

  useEffect(() => {
    if (!isSuspense && (ctrlState === 'resolving' || (autoResolve && ctrlState === 'idle'))) {
      void getOrCreatePendingPromise(ctrl).catch(() => {})
    }
  }, [ctrl, ctrlState, autoResolve, isSuspense])

  const getSnapshot = (): T | UseAtomState<T> => {
    if (isSuspense) {
      if (ctrl.state === 'idle') {
        if (autoResolve) {
          throw getOrCreatePendingPromise(ctrl)
        }
        throw new Error('Atom is not resolved. Set resolve: true or resolve the atom before rendering.')
      }
      if (ctrl.state === 'failed') {
        throw ctrl.get()
      }
      try {
        return ctrl.get()
      } catch {
        throw getOrCreatePendingPromise(ctrl)
      }
    }

    let data: T | undefined
    let error: Error | undefined

    if (ctrl.state === 'resolved' || ctrl.state === 'resolving') {
      try {
        data = ctrl.get()
      } catch {}
    } else if (ctrl.state === 'failed') {
      try {
        ctrl.get()
      } catch (e) {
        error = e instanceof Error ? e : new Error(String(e))
      }
    }

    const loading = ctrl.state === 'resolving' || (autoResolve && ctrl.state === 'idle')

    if (
      stateCache.current &&
      stateCache.current.ctrl === ctrl &&
      stateCache.current.ctrlState === ctrl.state &&
      stateCache.current.data === data &&
      stateCache.current.error === error &&
      stateCache.current.loading === loading
    ) {
      return stateCache.current.result
    }

    const result: UseAtomState<T> = {
      data,
      loading,
      error,
      controller: ctrl,
    }

    stateCache.current = { ctrl, ctrlState: ctrl.state, data, error, loading, result }
    return result
  }

  const subscribe = useCallback((onStoreChange: () => void) => {
    if (isSuspense) return ctrl.on('*', onStoreChange)
    return ctrl.on('*', () => {
      if (ctrl.state === 'resolving') {
        void getOrCreatePendingPromise(ctrl).catch(() => {})
      }
      onStoreChange()
    })
  }, [ctrl, isSuspense])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Select a derived value from an atom with fine-grained reactivity.
 * Only re-renders when the selected value changes per equality function.
 *
 * @param atom - The atom to select from
 * @param selector - Function to extract a derived value
 * @param eq - Optional equality function
 * @returns The selected value
 *
 * @example
 * ```tsx
 * const name = useSelect(userAtom, user => user.name)
 * ```
 */
function useSelect<T, S>(atom: Lite.Atom<T>, selector: (value: T) => S, eq?: (a: S, b: S) => boolean): S
function useSelect<T, S>(atom: Lite.Atom<T>, selector: (value: T) => S, options: UseSelectManualOptions<S>): UseSelectState<S>
function useSelect<T, S>(atom: Lite.Atom<T>, selector: (value: T) => S, options: UseSelectSuspenseOptions<S>): S
function useSelect<T, S>(
  atom: Lite.Atom<T>,
  selector: (value: T) => S,
  eqOrOptions?: ((a: S, b: S) => boolean) | UseSelectOptions<S>
): S | UseSelectState<S> {
  const ctrl = useController(atom)

  const isOptions = typeof eqOrOptions === 'object' && eqOrOptions !== null
  const isSuspense = isOptions ? (eqOrOptions as UseSelectOptions<S>).suspense !== false : true
  const autoResolve = isOptions ? !!(eqOrOptions as UseSelectOptions<S>).resolve : true
  const eq = isOptions ? (eqOrOptions as UseSelectOptions<S>).eq : eqOrOptions as ((a: S, b: S) => boolean) | undefined
  const eqFn = eq ?? Object.is

  const selectionCache = useRef<{
    ctrl: Lite.Controller<T>
    ctrlState: Lite.Controller<T>['state']
    source: T
    selector: (value: T) => S
    eq: ((a: S, b: S) => boolean) | undefined
    value: S
  } | null>(null)

  const selectStateCache = useRef<{
    ctrl: Lite.Controller<T>
    data: S | undefined
    loading: boolean
    error: Error | undefined
    result: UseSelectState<S>
  } | null>(null)

  useEffect(() => {
    if (!isSuspense && (ctrl.state === 'resolving' || (autoResolve && ctrl.state === 'idle'))) {
      void getOrCreatePendingPromise(ctrl).catch(() => {})
    }
  }, [ctrl, ctrl.state, autoResolve, isSuspense])

  const getSnapshot = (): S | UseSelectState<S> => {
    if (isSuspense) {
      const state = ctrl.state
      if (state === 'idle') {
        if (autoResolve) throw getOrCreatePendingPromise(ctrl)
        throw new Error('Atom is not resolved. Set resolve: true or resolve the atom before rendering.')
      }
      if (state === 'failed') throw ctrl.get()
      let value: T
      try { value = ctrl.get() } catch { throw getOrCreatePendingPromise(ctrl) }

      const current = selectionCache.current
      if (
        current &&
        current.ctrl === ctrl &&
        current.ctrlState === state &&
        Object.is(current.source, value) &&
        current.selector === selector &&
        current.eq === eq
      ) {
        return current.value
      }

      const nextValue = selector(value)
      const selectedValue = current &&
        current.ctrl === ctrl &&
        current.selector === selector &&
        eqFn(current.value, nextValue)
        ? current.value
        : nextValue

      selectionCache.current = {
        ctrl,
        ctrlState: state,
        source: value,
        selector,
        eq,
        value: selectedValue,
      }

      return selectedValue
    }

    let data: S | undefined
    let error: Error | undefined

    if (ctrl.state === 'resolved' || ctrl.state === 'resolving') {
      try {
        const value = ctrl.get()
        const current = selectionCache.current
        if (
          current &&
          current.ctrl === ctrl &&
          current.ctrlState === ctrl.state &&
          Object.is(current.source, value) &&
          current.selector === selector &&
          current.eq === eq
        ) {
          data = current.value
        } else {
          const nextValue = selector(value)
          const selectedValue = current &&
            current.ctrl === ctrl &&
            current.selector === selector &&
            eqFn(current.value, nextValue)
            ? current.value
            : nextValue

          selectionCache.current = {
            ctrl,
            ctrlState: ctrl.state,
            source: value,
            selector,
            eq,
            value: selectedValue,
          }
          data = selectedValue
        }
      } catch (e) {
        if (ctrl.state !== 'resolving') {
          error = e instanceof Error ? e : new Error(String(e))
        }
      }
    } else if (ctrl.state === 'failed') {
      try { ctrl.get() } catch (e) { error = e instanceof Error ? e : new Error(String(e)) }
    }

    const loading = ctrl.state === 'resolving' || (autoResolve && ctrl.state === 'idle')

    if (
      selectStateCache.current &&
      selectStateCache.current.ctrl === ctrl &&
      selectStateCache.current.data === data &&
      selectStateCache.current.error === error &&
      selectStateCache.current.loading === loading
    ) {
      return selectStateCache.current.result
    }

    const result: UseSelectState<S> = { data, loading, error }
    selectStateCache.current = { ctrl, data, loading, error, result }
    return result
  }

  const subscribe = useCallback((onStoreChange: () => void) => {
    if (isSuspense) return ctrl.on('*', onStoreChange)
    return ctrl.on('*', () => {
      if (ctrl.state === 'resolving') void getOrCreatePendingPromise(ctrl).catch(() => {})
      onStoreChange()
    })
  }, [ctrl, isSuspense])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export { useScope, useController, useAtom, useSelect }
export type { UseAtomSuspenseOptions, UseAtomManualOptions, UseAtomOptions, UseAtomState, UseControllerOptions, UseSelectSuspenseOptions, UseSelectManualOptions, UseSelectOptions, UseSelectState }

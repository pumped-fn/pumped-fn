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

const pendingPromises = new WeakMap<Lite.Controller<unknown>, Promise<unknown>>()

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
  const ctrl = useMemo(() => scope.controller(atom), [scope, atom])

  if (options?.resolve) {
    if (ctrl.state === 'idle' || ctrl.state === 'resolving') {
      throw getOrCreatePendingPromise(ctrl)
    }
    if (ctrl.state === 'failed') {
      throw ctrl.get()
    }
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
function useSelect<T, S>(
  atom: Lite.Atom<T>,
  selector: (value: T) => S,
  eq?: (a: S, b: S) => boolean
): S {
  const ctrl = useController(atom)

  const selectorRef = useRef(selector)
  const eqRef = useRef(eq)
  selectorRef.current = selector
  eqRef.current = eq

  const selectionCache = useRef<{
    ctrl: Lite.Controller<T>
    ctrlState: Lite.Controller<T>['state']
    source: T
    selector: (value: T) => S
    eq: ((a: S, b: S) => boolean) | undefined
    value: S
  } | null>(null)

  const getSnapshot = useCallback((): S => {
    const state = ctrl.state
    if (state === 'idle') {
      throw getOrCreatePendingPromise(ctrl)
    }
    if (state === 'failed') {
      throw ctrl.get()
    }
    let value: T
    try {
      value = ctrl.get()
    } catch {
      throw getOrCreatePendingPromise(ctrl)
    }

    const nextSelector = selectorRef.current
    const nextEq = eqRef.current
    const current = selectionCache.current
    if (
      current &&
      current.ctrl === ctrl &&
      current.ctrlState === state &&
      Object.is(current.source, value) &&
      current.selector === nextSelector &&
      current.eq === nextEq
    ) {
      return current.value
    }

    const nextValue = nextSelector(value)
    const selectedValue = current &&
      current.ctrl === ctrl &&
      current.selector === nextSelector &&
      (nextEq ?? Object.is)(current.value, nextValue)
      ? current.value
      : nextValue

    selectionCache.current = {
      ctrl,
      ctrlState: state,
      source: value,
      selector: nextSelector,
      eq: nextEq,
      value: selectedValue,
    }

    return selectedValue
  }, [ctrl])

  const subscribe = useCallback((onStoreChange: () => void) => {
    return ctrl.on('*', onStoreChange)
  }, [ctrl])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export { useScope, useController, useAtom, useSelect }
export type { UseAtomSuspenseOptions, UseAtomManualOptions, UseAtomOptions, UseAtomState, UseControllerOptions }

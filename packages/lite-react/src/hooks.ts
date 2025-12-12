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

const pendingPromises = new WeakMap<Lite.Atom<unknown>, Promise<unknown>>()

function getOrCreatePendingPromise<T>(atom: Lite.Atom<T>, ctrl: Lite.Controller<T>): Promise<T> {
  let pending = pendingPromises.get(atom) as Promise<T> | undefined
  if (!pending) {
    pending = ctrl.resolve()
    pendingPromises.set(atom, pending)
    pending.finally(() => pendingPromises.delete(atom))
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
 * const scope = useScope()
 * await scope.resolve(myAtom)
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
      throw getOrCreatePendingPromise(atom, ctrl)
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
  const atomRef = useRef(atom)
  atomRef.current = atom

  if (options?.suspense === false) {
    return useAtomState(atom, ctrl, options.resolve ?? false)
  }

  const autoResolve = options?.resolve !== false

  const getSnapshot = useCallback((): T => {
    if (ctrl.state === 'idle') {
      if (autoResolve) {
        throw getOrCreatePendingPromise(atomRef.current, ctrl)
      }
      throw new Error('Atom is not resolved. Set resolve: true or resolve the atom before rendering.')
    }
    if (ctrl.state === 'resolving') {
      throw getOrCreatePendingPromise(atomRef.current, ctrl)
    }
    if (ctrl.state === 'failed') {
      throw ctrl.get()
    }
    return ctrl.get()
  }, [ctrl, autoResolve])

  const subscribe = useCallback(
    (onStoreChange: () => void) => ctrl.on('resolved', onStoreChange),
    [ctrl]
  )

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

function useAtomState<T>(
  atom: Lite.Atom<T>,
  ctrl: Lite.Controller<T>,
  autoResolve: boolean
): UseAtomState<T> {
  const stateCache = useRef<{
    ctrlState: Lite.Controller<T>['state']
    data: T | undefined
    error: Error | undefined
    result: UseAtomState<T>
  } | null>(null)

  useEffect(() => {
    if (autoResolve && (ctrl.state === 'idle' || ctrl.state === 'resolving')) {
      getOrCreatePendingPromise(atom, ctrl)
    }
  }, [atom, ctrl, autoResolve])

  const getSnapshot = useCallback((): UseAtomState<T> => {
    let data: T | undefined
    let error: Error | undefined

    if (ctrl.state === 'resolved') {
      data = ctrl.get()
    } else if (ctrl.state === 'failed') {
      try {
        ctrl.get()
      } catch (e) {
        error = e instanceof Error ? e : new Error(String(e))
      }
    }

    if (
      stateCache.current &&
      stateCache.current.ctrlState === ctrl.state &&
      stateCache.current.data === data &&
      stateCache.current.error === error
    ) {
      return stateCache.current.result
    }

    const result: UseAtomState<T> = {
      data,
      loading: ctrl.state === 'resolving',
      error,
      controller: ctrl,
    }

    stateCache.current = { ctrlState: ctrl.state, data, error, result }
    return result
  }, [ctrl])

  const subscribe = useCallback(
    (onStoreChange: () => void) => ctrl.on('*', onStoreChange),
    [ctrl]
  )

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
  const scope = useScope()
  const ctrl = useController(atom)

  const atomRef = useRef(atom)
  atomRef.current = atom

  const selectorRef = useRef(selector)
  const eqRef = useRef(eq)
  selectorRef.current = selector
  eqRef.current = eq

  const handleRef = useRef<{
    scope: Lite.Scope
    atom: Lite.Atom<T>
    handle: Lite.SelectHandle<S>
  } | null>(null)

  const getOrCreateHandle = useCallback(() => {
    if (
      !handleRef.current ||
      handleRef.current.scope !== scope ||
      handleRef.current.atom !== atom
    ) {
      const handle = scope.select(atom, selectorRef.current, { eq: eqRef.current })
      handleRef.current = { scope, atom, handle }
    }
    return handleRef.current.handle
  }, [scope, atom])

  const getSnapshot = useCallback((): S => {
    const state = ctrl.state
    if (state === 'idle' || state === 'resolving') {
      throw getOrCreatePendingPromise(atomRef.current, ctrl)
    }
    if (state === 'failed') {
      throw ctrl.get()
    }
    return getOrCreateHandle().get()
  }, [ctrl, getOrCreateHandle])

  const subscribe = useCallback((onStoreChange: () => void) => {
    if (ctrl.state !== 'resolved') {
      return () => {}
    }
    return getOrCreateHandle().subscribe(onStoreChange)
  }, [ctrl, getOrCreateHandle])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export { useScope, useController, useAtom, useSelect }
export type { UseAtomSuspenseOptions, UseAtomManualOptions, UseAtomOptions, UseAtomState, UseControllerOptions }

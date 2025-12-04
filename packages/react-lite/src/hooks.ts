import { useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { type Lite } from '@pumped-fn/lite'
import { ScopeContext } from './context'

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
 * @param atom - The atom to create a controller for
 * @returns A memoized Lite.Controller instance
 *
 * @example
 * ```tsx
 * const ctrl = useController(counterAtom)
 * ctrl.set(ctrl.get() + 1)
 * ```
 */
function useController<T>(atom: Lite.Atom<T>): Lite.Controller<T> {
  const scope = useScope()
  return useMemo(() => scope.controller(atom), [scope, atom])
}

/**
 * Subscribe to atom value with Suspense/ErrorBoundary integration.
 * Throws Promise when resolving (Suspense), throws Error when failed (ErrorBoundary).
 *
 * @param atom - The atom to read
 * @returns The current value of the atom
 *
 * @example
 * ```tsx
 * function UserProfile() {
 *   const user = useAtom(userAtom)
 *   return <div>{user.name}</div>
 * }
 * ```
 */
function useAtom<T>(atom: Lite.Atom<T>): T {
  const ctrl = useController(atom)

  const getSnapshot = useCallback((): T => {
    switch (ctrl.state) {
      case 'idle':
        throw new Error("Atom not resolved. Call scope.resolve() before rendering.")
      case 'resolving':
        throw ctrl.resolve()
      case 'failed':
        throw ctrl.get()
      case 'resolved':
        return ctrl.get()
      default: {
        const _exhaustive: never = ctrl.state
        throw new Error(`Unhandled state: ${_exhaustive}`)
      }
    }
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

  const selectorRef = useRef(selector)
  const eqRef = useRef(eq)
  selectorRef.current = selector
  eqRef.current = eq

  const handleRef = useRef<Lite.SelectHandle<S> | null>(null)

  useEffect(() => {
    return () => {
      handleRef.current = null
    }
  }, [scope, atom])

  const getOrCreateHandle = useCallback(() => {
    if (!handleRef.current) {
      handleRef.current = scope.select(atom, selectorRef.current, { eq: eqRef.current })
    }
    return handleRef.current
  }, [scope, atom])

  const getSnapshot = useCallback((): S => {
    switch (ctrl.state) {
      case 'idle':
        throw new Error("Atom not resolved. Call scope.resolve() before rendering.")
      case 'resolving':
        throw ctrl.resolve()
      case 'failed':
        throw ctrl.get()
      case 'resolved':
        return getOrCreateHandle().get()
      default: {
        const _exhaustive: never = ctrl.state
        throw new Error(`Unhandled state: ${_exhaustive}`)
      }
    }
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

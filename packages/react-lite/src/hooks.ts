import { useCallback, useContext, useMemo, useSyncExternalStore } from 'react'
import { type Lite } from '@pumped-fn/lite'
import { ScopeContext } from './context'

/**
 * React hook to access the current Lite.Scope from context.
 *
 * @remarks
 * This hook must be called within a component that is a descendant of a
 * ScopeProvider. It provides access to the scope instance that was passed
 * to the nearest parent ScopeProvider.
 *
 * @example
 * ```tsx
 * import { useScope } from '@pumped-fn/react-lite'
 *
 * function MyComponent() {
 *   const scope = useScope()
 *
 *   // Use scope to create controllers or child scopes
 *   const childScope = scope.createChild()
 *
 *   return <div>...</div>
 * }
 * ```
 *
 * @returns The current Lite.Scope instance from context
 *
 * @throws {Error} When called outside of a ScopeProvider
 *
 * @public
 */
function useScope(): Lite.Scope {
  const scope = useContext(ScopeContext)
  if (!scope) {
    throw new Error("useScope must be used within a ScopeProvider")
  }
  return scope
}

/**
 * React hook to create a memoized controller for an atom.
 *
 * @remarks
 * This hook must be called within a component that is a descendant of a
 * ScopeProvider. It creates a controller for the given atom using the current
 * scope and memoizes it to prevent unnecessary recreations.
 *
 * @example
 * ```tsx
 * import { useController } from '@pumped-fn/react-lite'
 * import { counterAtom } from './atoms'
 *
 * function Counter() {
 *   const controller = useController(counterAtom)
 *
 *   const handleIncrement = () => {
 *     controller.set(controller.get() + 1)
 *   }
 *
 *   return <button onClick={handleIncrement}>Increment</button>
 * }
 * ```
 *
 * @typeParam T - The type of value stored in the atom
 * @param atom - The atom to create a controller for
 * @returns A memoized Lite.Controller instance for the atom
 *
 * @throws {Error} When called outside of a ScopeProvider
 *
 * @public
 */
function useController<T>(atom: Lite.Atom<T>): Lite.Controller<T> {
  const scope = useScope()
  return useMemo(() => scope.controller(atom), [scope, atom])
}

/**
 * React hook to read atom values with automatic subscription and Suspense integration.
 *
 * @remarks
 * This hook integrates with React Suspense and Error Boundaries to handle async state:
 * - `idle` state: Throws Error - atom must be resolved before rendering
 * - `resolving` state: Throws Promise - Suspense catches and shows fallback
 * - `resolved` state: Returns value - normal rendering
 * - `failed` state: Throws error - ErrorBoundary catches
 *
 * The hook automatically subscribes to atom changes and triggers re-renders when
 * the atom value updates. It uses React's useSyncExternalStore for optimal
 * concurrent rendering behavior.
 *
 * @example
 * Basic usage with Suspense
 * ```tsx
 * import { Suspense } from 'react'
 * import { useAtom } from '@pumped-fn/react-lite'
 * import { userAtom } from './atoms'
 *
 * function UserProfile() {
 *   const user = useAtom(userAtom)
 *   return <div>Hello {user.name}</div>
 * }
 *
 * function App() {
 *   return (
 *     <ScopeProvider scope={scope}>
 *       <Suspense fallback={<div>Loading...</div>}>
 *         <UserProfile />
 *       </Suspense>
 *     </ScopeProvider>
 *   )
 * }
 * ```
 *
 * @example
 * With ErrorBoundary for error handling
 * ```tsx
 * import { Suspense } from 'react'
 * import { ErrorBoundary } from 'react-error-boundary'
 * import { useAtom } from '@pumped-fn/react-lite'
 * import { dataAtom } from './atoms'
 *
 * function DataDisplay() {
 *   const data = useAtom(dataAtom)
 *   return <div>{data.content}</div>
 * }
 *
 * function App() {
 *   return (
 *     <ScopeProvider scope={scope}>
 *       <ErrorBoundary fallback={<div>Error loading data</div>}>
 *         <Suspense fallback={<div>Loading...</div>}>
 *           <DataDisplay />
 *         </Suspense>
 *       </ErrorBoundary>
 *     </ScopeProvider>
 *   )
 * }
 * ```
 *
 * @typeParam T - The type of value stored in the atom
 * @param atom - The atom to read
 * @returns The current value of the atom
 *
 * @throws {Error} When atom is in idle state (not resolved)
 * @throws {Promise} When atom is resolving (caught by Suspense)
 * @throws {Error} When atom resolution failed (caught by ErrorBoundary)
 *
 * @public
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
    }
  }, [ctrl])

  const subscribe = useCallback(
    (onStoreChange: () => void) => ctrl.on('*', onStoreChange),
    [ctrl]
  )

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export { useScope, useController, useAtom }

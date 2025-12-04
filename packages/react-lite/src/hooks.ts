import { useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
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
      default: {
        const exhaustiveCheck: never = ctrl.state
        throw new Error(`Unhandled atom state: ${exhaustiveCheck}`)
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
 * React hook to select and subscribe to a derived value from an atom with fine-grained reactivity.
 *
 * @remarks
 * This hook provides fine-grained subscriptions by memoizing a selected portion of an atom's value.
 * It only triggers re-renders when the selected value changes according to the equality function.
 * This is useful for optimizing components that only need part of an atom's state.
 *
 * The selector function is stabilized using refs, allowing inline selector functions without
 * causing unnecessary re-subscriptions. The hook integrates with React Suspense and Error
 * Boundaries just like useAtom.
 *
 * @example
 * Basic selection with default equality
 * ```tsx
 * import { useSelect } from '@pumped-fn/react-lite'
 * import { userAtom } from './atoms'
 *
 * function UserName() {
 *   // Only re-renders when user.name changes
 *   const name = useSelect(userAtom, (user) => user.name)
 *   return <div>{name}</div>
 * }
 * ```
 *
 * @example
 * Custom equality function for complex selections
 * ```tsx
 * import { useSelect } from '@pumped-fn/react-lite'
 * import { storeAtom } from './atoms'
 *
 * function CartCount() {
 *   const cart = useSelect(
 *     storeAtom,
 *     (state) => state.cart,
 *     (a, b) => a.length === b.length
 *   )
 *   return <div>Items: {cart.length}</div>
 * }
 * ```
 *
 * @example
 * With Suspense and ErrorBoundary
 * ```tsx
 * import { Suspense } from 'react'
 * import { ErrorBoundary } from 'react-error-boundary'
 * import { useSelect } from '@pumped-fn/react-lite'
 * import { dataAtom } from './atoms'
 *
 * function DataTitle() {
 *   const title = useSelect(dataAtom, (data) => data.title)
 *   return <h1>{title}</h1>
 * }
 *
 * function App() {
 *   return (
 *     <ScopeProvider scope={scope}>
 *       <ErrorBoundary fallback={<div>Error loading data</div>}>
 *         <Suspense fallback={<div>Loading...</div>}>
 *           <DataTitle />
 *         </Suspense>
 *       </ErrorBoundary>
 *     </ScopeProvider>
 *   )
 * }
 * ```
 *
 * @typeParam T - The type of value stored in the atom
 * @typeParam S - The type of the selected value
 * @param atom - The atom to select from
 * @param selector - Function to extract a derived value from the atom
 * @param eq - Optional equality function to determine if the selected value changed
 * @returns The current selected value
 *
 * @throws {Error} When atom is in idle state (not resolved)
 * @throws {Promise} When atom is resolving (caught by Suspense)
 * @throws {Error} When atom resolution failed (caught by ErrorBoundary)
 *
 * @public
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
  useEffect(() => {
    selectorRef.current = selector
    eqRef.current = eq
  })

  const handleRef = useRef<Lite.SelectHandle<S> | null>(null)

  const getSnapshot = useCallback((): S => {
    switch (ctrl.state) {
      case 'idle':
        throw new Error("Atom not resolved. Call scope.resolve() before rendering.")
      case 'resolving':
        throw ctrl.resolve()
      case 'failed':
        throw ctrl.get()
      case 'resolved':
        if (!handleRef.current) {
          handleRef.current = scope.select(atom, selectorRef.current, { eq: eqRef.current })
        }
        return handleRef.current.get()
      default: {
        const exhaustiveCheck: never = ctrl.state
        throw new Error(`Unhandled atom state: ${exhaustiveCheck}`)
      }
    }
  }, [scope, atom, ctrl])

  const subscribe = useCallback((onStoreChange: () => void) => {
    if (ctrl.state !== 'resolved') {
      return () => {}
    }
    if (!handleRef.current) {
      handleRef.current = scope.select(atom, selectorRef.current, { eq: eqRef.current })
    }
    return handleRef.current.subscribe(onStoreChange)
  }, [scope, atom, ctrl])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export { useScope, useController, useAtom, useSelect }

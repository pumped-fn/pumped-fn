import { useContext, useMemo } from 'react'
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

export { useScope, useController }

import { useContext } from 'react'
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

export { useScope }

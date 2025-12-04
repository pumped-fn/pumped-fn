import { createContext, type ReactNode } from 'react'
import { type Lite } from '@pumped-fn/lite'

/**
 * React context for providing a Lite.Scope to child components.
 *
 * @remarks
 * This context enables components to access a shared scope instance
 * throughout the component tree. Components can consume this context
 * using hooks like useScope or useController.
 *
 * @defaultValue null
 *
 * @public
 */
const ScopeContext = createContext<Lite.Scope | null>(null)

/**
 * Props for the ScopeProvider component.
 *
 * @public
 */
interface ScopeProviderProps {
  /**
   * The Lite.Scope instance to provide to child components.
   */
  scope: Lite.Scope

  /**
   * Child components that will have access to the scope.
   */
  children: ReactNode
}

/**
 * Provider component that makes a Lite.Scope available to child components.
 *
 * @remarks
 * Use this component to wrap parts of your component tree that need
 * access to a shared scope. Child components can access the scope
 * using hooks like useScope or useController.
 *
 * @example
 * ```tsx
 * const rootScope = Lite.Scope()
 *
 * function App() {
 *   return (
 *     <ScopeProvider scope={rootScope}>
 *       <YourComponents />
 *     </ScopeProvider>
 *   )
 * }
 * ```
 *
 * @param props - The component props
 * @returns A React element that provides the scope to children
 *
 * @public
 */
function ScopeProvider({ scope, children }: ScopeProviderProps) {
  return (
    <ScopeContext.Provider value={scope}>
      {children}
    </ScopeContext.Provider>
  )
}

export { ScopeContext, ScopeProvider }
export type { ScopeProviderProps }

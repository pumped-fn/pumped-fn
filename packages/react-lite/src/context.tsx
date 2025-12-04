import { createContext, type ReactNode } from 'react'
import { type Lite } from '@pumped-fn/lite'

/**
 * React context for Lite.Scope.
 */
const ScopeContext = createContext<Lite.Scope | null>(null)

interface ScopeProviderProps {
  scope: Lite.Scope
  children: ReactNode
}

/**
 * Provider component for Lite.Scope.
 *
 * @example
 * ```tsx
 * <ScopeProvider scope={scope}>
 *   <App />
 * </ScopeProvider>
 * ```
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

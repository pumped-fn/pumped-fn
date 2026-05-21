'use client'

import { createContext, type ReactNode } from 'react'
import { type Lite } from '@pumped-fn/lite'

const ScopeContext = createContext<Lite.Scope | null>(null)

interface ScopeProviderProps {
  scope: Lite.Scope
  children: ReactNode
}

function ScopeProvider({ scope, children }: ScopeProviderProps) {
  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>
}

export { ScopeContext, ScopeProvider }
export type { ScopeProviderProps }

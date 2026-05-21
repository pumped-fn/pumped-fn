'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { type Lite } from '@pumped-fn/lite'

/**
 * React context for Lite.Scope.
 */
const ScopeContext = createContext<Lite.Scope | null>(null)
const ExecutionContextContext = createContext<Lite.ExecutionContext | null>(null)

type OwnedExecutionContext = {
  scope: Lite.Scope
  tags: Lite.Tagged<any>[] | undefined
  ctx: Lite.ExecutionContext
}

interface ScopeProviderProps {
  scope: Lite.Scope
  children: ReactNode
}

type ExecutionContextProviderProps =
  | {
      ctx: Lite.ExecutionContext
      tags?: never
      children: ReactNode
    }
  | {
      ctx?: undefined
      tags?: Lite.Tagged<any>[]
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

function ExecutionContextProvider({ children, ...props }: ExecutionContextProviderProps) {
  const scope = useContext(ScopeContext)
  const explicitCtx = 'ctx' in props && props.ctx ? props.ctx : undefined
  const tags = explicitCtx ? undefined : props.tags
  const [owned, setOwned] = useState<OwnedExecutionContext | null>(null)

  useEffect(() => {
    if (explicitCtx) return
    if (!scope) return
    const next: OwnedExecutionContext = {
      scope,
      tags,
      ctx: scope.createContext({ tags }),
    }
    setOwned(next)
    return () => {
      setOwned(current => current === next ? null : current)
      void next.ctx.close()
    }
  }, [scope, tags, explicitCtx])

  if (!explicitCtx && !scope) {
    throw new Error("ExecutionContextProvider managed mode requires a ScopeProvider")
  }

  const ctx = explicitCtx ?? (
    owned?.scope === scope && owned.tags === tags ? owned.ctx : null
  )

  if (!ctx) return null

  return (
    <ExecutionContextContext.Provider value={ctx}>
      {children}
    </ExecutionContextContext.Provider>
  )
}

export { ScopeContext, ScopeProvider, ExecutionContextContext, ExecutionContextProvider }
export type { ScopeProviderProps, ExecutionContextProviderProps }

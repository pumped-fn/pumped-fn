'use client'
'use no memo'

import { createContext, useContext, useEffect, useId, type ReactNode } from 'react'
import { type Lite } from '@pumped-fn/lite'
import { pendingCtxWork } from './pending-work'

/**
 * React context for Lite.Scope.
 */
const ScopeContext = createContext<Lite.Scope | null>(null)
const ExecutionContextContext = createContext<Lite.ExecutionContext | null>(null)

type ManagedEntry = {
  ctx: Lite.ExecutionContext
  tags: Lite.Tagged<any>[] | undefined
  commits: number
  closed: boolean
  orphanTimer: ReturnType<typeof setTimeout> | null
}

const managedContexts = new WeakMap<Lite.Scope, Map<string, ManagedEntry>>()

const ORPHAN_GRACE_MS = 50

function managedMapFor(scope: Lite.Scope): Map<string, ManagedEntry> {
  let map = managedContexts.get(scope)
  if (!map) {
    map = new Map()
    managedContexts.set(scope, map)
  }
  return map
}

function sameTags(a: Lite.Tagged<any>[] | undefined, b: Lite.Tagged<any>[] | undefined): boolean {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.key !== b[i]!.key || !Object.is(a[i]!.value, b[i]!.value)) return false
  }
  return true
}

function closeEntry(map: Map<string, ManagedEntry>, id: string, entry: ManagedEntry): void {
  if (entry.closed) return
  entry.closed = true
  if (entry.orphanTimer) {
    clearTimeout(entry.orphanTimer)
    entry.orphanTimer = null
  }
  if (map.get(id) === entry) map.delete(id)
  void entry.ctx.close()
}

// Renders that suspend before commit never get effects, so entries created
// during render are reclaimed by a grace timer once their in-flight resource
// work settles without a retry committing the provider.
function scheduleOrphanCheck(map: Map<string, ManagedEntry>, id: string, entry: ManagedEntry): void {
  if (entry.orphanTimer) clearTimeout(entry.orphanTimer)
  entry.orphanTimer = setTimeout(() => {
    entry.orphanTimer = null
    if (entry.commits > 0 || entry.closed) return
    const pending = pendingCtxWork(entry.ctx)
    if (pending) {
      void pending.then(() => {
        if (entry.commits === 0 && !entry.closed && !entry.orphanTimer) {
          scheduleOrphanCheck(map, id, entry)
        }
      })
      return
    }
    closeEntry(map, id, entry)
  }, ORPHAN_GRACE_MS)
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
  const id = useId()
  const explicitCtx = 'ctx' in props && props.ctx ? props.ctx : undefined
  const tags = explicitCtx ? undefined : props.tags

  if (!explicitCtx && !scope) {
    throw new Error("ExecutionContextProvider managed mode requires a ScopeProvider")
  }

  // Managed contexts are created synchronously during render so the subtree
  // renders on the server, where effects never run. The useId-keyed cache
  // makes creation idempotent across StrictMode double-renders and Suspense
  // retries.
  let entry: ManagedEntry | null = null
  let map: Map<string, ManagedEntry> | null = null
  if (!explicitCtx && scope) {
    map = managedMapFor(scope)
    const existing = map.get(id)
    if (existing && !existing.closed && sameTags(existing.tags, tags)) {
      entry = existing
    } else {
      entry = {
        ctx: scope.createContext({ tags }),
        tags,
        commits: 0,
        closed: false,
        orphanTimer: null,
      }
      map.set(id, entry)
    }
    if (entry.commits === 0) scheduleOrphanCheck(map, id, entry)
  }

  useEffect(() => {
    if (!entry || !map) return
    const currentEntry = entry
    const currentMap = map
    // A count, not a flag: useId values repeat across React roots, so two
    // providers sharing a scope can land on the same entry.
    currentEntry.commits++
    if (currentEntry.orphanTimer) {
      clearTimeout(currentEntry.orphanTimer)
      currentEntry.orphanTimer = null
    }
    return () => {
      currentEntry.commits--
      // Deferred so StrictMode's mount→cleanup→mount cycle can re-commit
      // before the context is closed.
      queueMicrotask(() => {
        if (currentEntry.commits === 0) closeEntry(currentMap, id, currentEntry)
      })
    }
  }, [entry, map, id])

  const ctx = explicitCtx ?? entry?.ctx ?? null
  if (!ctx) return null

  return (
    <ExecutionContextContext.Provider value={ctx}>
      {children}
    </ExecutionContextContext.Provider>
  )
}

export { ScopeContext, ScopeProvider, ExecutionContextContext, ExecutionContextProvider }
export type { ScopeProviderProps, ExecutionContextProviderProps }

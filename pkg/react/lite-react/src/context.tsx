'use client'
'use no memo'

import { createContext, useContext, useEffect, useId, useMemo, type ReactNode } from 'react'
import { type Lite } from '@pumped-fn/lite'
import { pendingCtxWork } from './pending-work'

/**
 * React context for Lite.Scope.
 */
const ScopeContext = createContext<Lite.Scope | null>(null)
const ExecutionContextContext = createContext<Lite.ExecutionContext | null>(null)
const ManagedRootContext = createContext<object | null>(null)

type ManagedEntry = {
  ctx: Lite.ExecutionContext
  parent: Lite.ExecutionContext | undefined
  tags: Lite.Tagged<any>[] | undefined
  commits: number
  closed: boolean
  orphanTimer: ReturnType<typeof setTimeout> | null
}

const managedContexts = new WeakMap<Lite.Scope, Map<string, ManagedEntry>>()
const managedParentIds = new WeakMap<Lite.ExecutionContext, number>()
const managedRootIds = new WeakMap<object, number>()
let nextManagedParentId = 1
let nextManagedRootId = 1

const ORPHAN_GRACE_MS = 50

function managedMapFor(scope: Lite.Scope): Map<string, ManagedEntry> {
  let map = managedContexts.get(scope)
  if (!map) {
    map = new Map()
    managedContexts.set(scope, map)
  }
  return map
}

function managedParentKey(parent: Lite.ExecutionContext | undefined): string {
  if (!parent) return 'root'
  let key = managedParentIds.get(parent)
  if (!key) {
    key = nextManagedParentId++
    managedParentIds.set(parent, key)
  }
  return String(key)
}

function managedRootKey(root: object): string {
  let key = managedRootIds.get(root)
  if (!key) {
    key = nextManagedRootId++
    managedRootIds.set(root, key)
  }
  return String(key)
}

function sameTags(a: Lite.Tagged<any>[] | undefined, b: Lite.Tagged<any>[] | undefined): boolean {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (!a[i]!.tag.same(a[i]!, b[i]!)) return false
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
  void entry.ctx.close().catch((error: unknown) => {
    console.error("managed context settlement failed", error)
  })
}

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
  const root = useMemo(() => ({}), [])
  return (
    <ScopeContext.Provider value={scope}>
      <ManagedRootContext.Provider value={root}>
        {children}
      </ManagedRootContext.Provider>
    </ScopeContext.Provider>
  )
}

function ExecutionContextProvider({ children, ...props }: ExecutionContextProviderProps) {
  const scope = useContext(ScopeContext)
  const root = useContext(ManagedRootContext)
  const inheritedCtx = useContext(ExecutionContextContext)
  const id = useId()
  const explicitCtx = 'ctx' in props && props.ctx ? props.ctx : undefined
  const tags = explicitCtx ? undefined : props.tags
  const parent = !explicitCtx && inheritedCtx?.scope === scope ? inheritedCtx : undefined
  const entryId = !explicitCtx && root ? `${managedRootKey(root)}:${id}:${managedParentKey(parent)}` : id

  if (!explicitCtx && (!scope || !root)) {
    throw new Error("ExecutionContextProvider managed mode requires a ScopeProvider")
  }

  let entry: ManagedEntry | null = null
  let map: Map<string, ManagedEntry> | null = null
  if (!explicitCtx && scope) {
    map = managedMapFor(scope)
    const existing = map.get(entryId)
    if (existing && !existing.closed && existing.parent === parent && sameTags(existing.tags, tags)) {
      entry = existing
    } else {
      entry = {
        ctx: scope.createContext({ parent, tags }),
        parent,
        tags,
        commits: 0,
        closed: false,
        orphanTimer: null,
      }
      map.set(entryId, entry)
    }
    if (entry.commits === 0) scheduleOrphanCheck(map, entryId, entry)
  }

  useEffect(() => {
    if (!entry || !map) return
    const currentEntry = entry
    const currentMap = map
    currentEntry.commits++
    if (currentEntry.orphanTimer) {
      clearTimeout(currentEntry.orphanTimer)
      currentEntry.orphanTimer = null
    }
    return () => {
      currentEntry.commits--
      queueMicrotask(() => {
        if (currentEntry.commits === 0) closeEntry(currentMap, entryId, currentEntry)
      })
    }
  }, [entry, map, entryId])

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

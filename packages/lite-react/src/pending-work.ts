'use client'
'use no memo'

import { type Lite } from '@pumped-fn/lite'

const pendingWork = new WeakMap<Lite.ExecutionContext, Set<Promise<unknown>>>()

export function trackPendingWork(ctx: Lite.ExecutionContext, promise: Promise<unknown>): void {
  const tracked = new Set<Set<Promise<unknown>>>()
  let current: Lite.ExecutionContext | undefined = ctx
  while (current) {
    let set = pendingWork.get(current)
    if (!set) {
      set = new Set()
      pendingWork.set(current, set)
    }
    set.add(promise)
    tracked.add(set)
    current = current.parent
  }
  const remove = () => {
    for (const set of tracked) set.delete(promise)
  }
  promise.then(remove, remove)
}

export function pendingCtxWork(ctx: Lite.ExecutionContext): Promise<unknown> | null {
  const set = pendingWork.get(ctx)
  if (!set || set.size === 0) return null
  return Promise.allSettled([...set])
}

'use client'
'use no memo'

import { type Lite } from '@pumped-fn/lite'

const pendingWork = new WeakMap<Lite.ExecutionContext, Set<Promise<unknown>>>()

export function trackPendingWork(ctx: Lite.ExecutionContext, promise: Promise<unknown>): void {
  let set = pendingWork.get(ctx)
  if (!set) {
    set = new Set()
    pendingWork.set(ctx, set)
  }
  set.add(promise)
  const remove = () => set!.delete(promise)
  promise.then(remove, remove)
}

export function pendingCtxWork(ctx: Lite.ExecutionContext): Promise<unknown> | null {
  const set = pendingWork.get(ctx)
  if (!set || set.size === 0) return null
  return Promise.allSettled([...set])
}

import type { Lite } from '@pumped-fn/lite'

let currentScope: Lite.Scope | null = null

export function setCurrentScope(scope: Lite.Scope | null): Lite.Scope | null {
  const prev = currentScope
  currentScope = scope
  return prev
}

export function useScope(): Lite.Scope {
  if (!currentScope) throw new Error('useScope() called outside of mount()')
  return currentScope
}

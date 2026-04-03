import type { Lite } from '@pumped-fn/lite'

const scopeStack: Lite.Scope[] = []

export function pushScope(scope: Lite.Scope): void {
  scopeStack.push(scope)
}

export function popScope(): void {
  scopeStack.pop()
}

export function useScope(): Lite.Scope {
  if (scopeStack.length === 0) throw new Error('useScope(): no scope — pass scope to mount() or wrap in ScopeProvider')
  return scopeStack[scopeStack.length - 1]!
}

export function currentScopeOrNull(): Lite.Scope | null {
  return scopeStack.length > 0 ? scopeStack[scopeStack.length - 1]! : null
}

import { createScope } from '@pumped-fn/lite'
import type { Lite } from '@pumped-fn/lite'

let explicitScope: Lite.Scope | null = null
let defaultScope: Lite.Scope | null = null

export function setCurrentScope(scope: Lite.Scope | null): Lite.Scope | null {
  const prev = explicitScope
  explicitScope = scope
  return prev
}

export function useScope(): Lite.Scope {
  if (explicitScope) return explicitScope
  if (!defaultScope) defaultScope = createScope()
  return defaultScope
}

export function resetDefaultScope(): void {
  defaultScope = null
}

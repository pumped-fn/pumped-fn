/**
 * Legend-State v3 bridge for @pumped-fn/lite.
 *
 * Maps each Lite.Controller onto a Legend observable via `synced({ get, set,
 * subscribe })`. Renders use Legend's `observer()` HOC or `use$()` hook for
 * fine-grained reactivity; Lite retains scope lifecycle, DI, flows and GC.
 */
export { atomObs, invalidate } from './bridge'
export { ScopeProvider, ScopeContext } from './context'
export type { ScopeProviderProps } from './context'
export { useScope, useAtomObs, useAtom } from './hooks'
export type { UseAtomOptions } from './hooks'

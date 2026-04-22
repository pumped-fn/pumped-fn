'use client'

import { useContext, useMemo } from 'react'
import type { Lite } from '@pumped-fn/lite'
import { syncState, type Observable, type ObservableParam } from '@legendapp/state'
import { use$ } from '@legendapp/state/react'
import { ScopeContext } from './context'
import { atomObs } from './bridge'

interface UseAtomOptions {
  /** Suspend on loading states (default: true). */
  suspense?: boolean
}

function useScope(): Lite.Scope {
  const scope = useContext(ScopeContext)
  if (!scope) throw new Error('useScope must be used within a ScopeProvider')
  return scope
}

/**
 * Get the Legend observable for an atom, bound to the current scope.
 * The same (scope, atom) pair always returns the same Observable.
 */
function useAtomObs<T>(atom: Lite.Atom<T>): Observable<T> {
  const scope = useScope()
  return useMemo(() => atomObs(scope, atom), [scope, atom])
}

/**
 * Read-through hook: returns the atom's current value and subscribes the
 * component to changes. Suspense-compatible by default; errors surface via
 * the nearest ErrorBoundary.
 */
function useAtom<T>(atom: Lite.Atom<T>, options?: UseAtomOptions): T {
  const obs = useAtomObs(atom)
  const suspense = options?.suspense !== false
  // Legend's syncState expects `ObservableParam`; our generic `Observable<T>`
  // is compatible at runtime but TS can't narrow the union back. Cast here is
  // the library-boundary exception noted in CLAUDE.md.
  const state = syncState(obs as ObservableParam<T>)
  const err = use$(state.error) as Error | undefined
  if (err) throw err
  return use$(obs, { suspense }) as T
}

export { useScope, useAtomObs, useAtom }
export type { UseAtomOptions }

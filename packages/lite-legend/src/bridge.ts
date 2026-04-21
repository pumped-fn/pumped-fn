import type { Lite } from '@pumped-fn/lite'
import { observable, type Observable } from '@legendapp/state'
import { synced } from '@legendapp/state/sync'

const cache = new WeakMap<Lite.Scope, WeakMap<Lite.Atom<unknown>, Observable<unknown>>>()

function getCache(scope: Lite.Scope): WeakMap<Lite.Atom<unknown>, Observable<unknown>> {
  let byAtom = cache.get(scope)
  if (!byAtom) {
    byAtom = new WeakMap()
    cache.set(scope, byAtom)
  }
  return byAtom
}

/**
 * Bridge a Lite atom into a Legend-State observable bound to the given scope.
 *
 * - `get()` triggers `scope.resolve(atom)` on first observation when idle, so
 *   Legend's Suspense/async plumbing handles loading states.
 * - `set(v)` calls `ctrl.set(v)` (only valid on resolved atoms).
 * - `subscribe({ update })` forwards every `ctrl.on('*')` notification into
 *   Legend, giving per-atom push reactivity that Legend's proxy then
 *   fan-outs per-key.
 *
 * Cached per (scope, atom); repeated calls return the same observable.
 */
export function atomObs<T>(scope: Lite.Scope, atom: Lite.Atom<T>): Observable<T> {
  const byAtom = getCache(scope)
  const existing = byAtom.get(atom as Lite.Atom<unknown>) as Observable<T> | undefined
  if (existing) return existing

  const ctrl = scope.controller(atom)

  const obs = observable<T>(
    synced<T>({
      get: () => {
        if (ctrl.state === 'resolved') return ctrl.get()
        if (ctrl.state === 'failed') {
          return ctrl.get()
        }
        return ctrl.resolve()
      },
      set: ({ value }) => {
        if (ctrl.state === 'resolved') ctrl.set(value as T)
      },
      subscribe: ({ update, onError }) => {
        return ctrl.on('*', () => {
          if (ctrl.state === 'resolved') {
            update({ value: ctrl.get() })
          } else if (ctrl.state === 'failed') {
            try {
              ctrl.get()
            } catch (e) {
              onError(e instanceof Error ? e : new Error(String(e)))
            }
          }
        })
      },
    })
  ) as Observable<T>

  byAtom.set(atom as Lite.Atom<unknown>, obs as Observable<unknown>)
  return obs
}

/**
 * Force-refresh an atom observable via its underlying controller.
 * Use when you want to run the factory again (Lite `invalidate`).
 */
export function invalidate<T>(scope: Lite.Scope, atom: Lite.Atom<T>): void {
  scope.controller(atom).invalidate()
}

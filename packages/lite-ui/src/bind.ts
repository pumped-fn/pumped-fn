import type { Lite } from '@pumped-fn/lite'

const BIND_BRAND = Symbol('lite-ui-bind')

export interface AtomBinding<S = unknown> {
  readonly [BIND_BRAND]: true
  readonly atom: Lite.Atom<unknown>
  readonly selector: ((value: unknown) => S) | undefined
}

export function $<T>(atom: Lite.Atom<T>): AtomBinding<T>
export function $<T, S>(atom: Lite.Atom<T>, selector: (value: T) => S): AtomBinding<S>
export function $<T, S>(atom: Lite.Atom<T>, selector?: (value: T) => S): AtomBinding<S> {
  return {
    [BIND_BRAND]: true,
    atom: atom as Lite.Atom<unknown>,
    selector: selector as ((value: unknown) => S) | undefined,
  }
}

export function isAtomBinding(v: unknown): v is AtomBinding {
  return v != null && typeof v === 'object' && BIND_BRAND in (v as object)
}

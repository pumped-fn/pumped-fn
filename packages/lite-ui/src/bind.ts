import type { Lite } from '@pumped-fn/lite'
import type { VNode } from './vnode'
import type { Template } from './index'

const BIND_BRAND = Symbol('lite-ui-bind')

export interface AtomBinding<S = unknown> {
  readonly [BIND_BRAND]: true
  readonly atom: Lite.Atom<unknown>
  readonly selector: ((value: unknown) => S) | undefined
  readonly keyFn: undefined
  readonly renderFn: undefined
}

export interface AtomListBinding<T = unknown> {
  readonly [BIND_BRAND]: true
  readonly atom: Lite.Atom<unknown>
  readonly selector: undefined
  readonly keyFn: (item: T) => string | number
  readonly renderFn: (item: T, getItem: () => T) => Template | VNode
}

export type AnyAtomBinding = AtomBinding | AtomListBinding

export function $<T>(atom: Lite.Atom<T>): AtomBinding<T>
export function $<T, S>(atom: Lite.Atom<T>, selector: (value: T) => S): AtomBinding<S>
export function $<T>(
  atom: Lite.Atom<T[]>,
  keyFn: (item: T) => string | number,
  renderFn: (item: T, getItem: () => T) => Template | VNode,
): AtomListBinding<T>
export function $(
  atom: Lite.Atom<unknown>,
  selectorOrKeyFn?: ((value: unknown) => unknown) | ((item: unknown) => string | number),
  renderFn?: (item: unknown, getItem: () => unknown) => Template | VNode,
): AnyAtomBinding {
  if (renderFn) {
    return {
      [BIND_BRAND]: true,
      atom,
      selector: undefined,
      keyFn: selectorOrKeyFn as (item: unknown) => string | number,
      renderFn,
    }
  }
  return {
    [BIND_BRAND]: true,
    atom,
    selector: selectorOrKeyFn as ((value: unknown) => unknown) | undefined,
    keyFn: undefined,
    renderFn: undefined,
  }
}

export function isAtomBinding(v: unknown): v is AnyAtomBinding {
  return v != null && typeof v === 'object' && BIND_BRAND in (v as object)
}

export function isAtomListBinding(v: AnyAtomBinding): v is AtomListBinding {
  return v.keyFn !== undefined
}

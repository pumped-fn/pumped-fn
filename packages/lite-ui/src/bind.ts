import type { Lite } from '@pumped-fn/lite'
import type { VNode } from './vnode'
import type { Template } from './index'
import type { LazyVNode } from './jsx-runtime'
import { type AtomsCtrl, isAtomsCtrl } from './atoms'

const BIND_BRAND = Symbol('lite-ui-bind')
const ATOMS_BIND_BRAND = Symbol('lite-ui-atoms-bind')

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

export interface AtomsCtrlBinding<T = unknown> {
  readonly [ATOMS_BIND_BRAND]: true
  readonly ctrl: AtomsCtrl<T>
  readonly renderFn: (key: string | number, getItem: () => T) => Template | VNode | LazyVNode
}

export function isAtomsCtrlBinding(v: unknown): v is AtomsCtrlBinding {
  return v != null && typeof v === 'object' && ATOMS_BIND_BRAND in (v as object)
}

export function $<T>(atom: Lite.Atom<T>): AtomBinding<T>
export function $<T, S>(atom: Lite.Atom<T>, selector: (value: T) => S): AtomBinding<S>
export function $<T>(
  atom: Lite.Atom<T[]>,
  keyFn: (item: T) => string | number,
  renderFn: (item: T, getItem: () => T) => Template | VNode,
): AtomListBinding<T>
export function $<T>(
  ctrl: AtomsCtrl<T>,
  renderFn: (key: string | number, getItem: () => T) => Template | VNode | LazyVNode,
): AtomsCtrlBinding<T>
export function $(
  atomOrCtrl: Lite.Atom<unknown> | AtomsCtrl<unknown>,
  selectorOrKeyFnOrRenderFn?: ((value: unknown) => unknown) | ((item: unknown) => string | number) | ((key: string | number, getItem: () => unknown) => Template | VNode | LazyVNode),
  renderFn?: (item: unknown, getItem: () => unknown) => Template | VNode,
): AnyAtomBinding | AtomsCtrlBinding {
  if (isAtomsCtrl(atomOrCtrl)) {
    return {
      [ATOMS_BIND_BRAND]: true,
      ctrl: atomOrCtrl,
      renderFn: selectorOrKeyFnOrRenderFn as (key: string | number, getItem: () => unknown) => Template | VNode | LazyVNode,
    }
  }
  if (renderFn) {
    return {
      [BIND_BRAND]: true,
      atom: atomOrCtrl as Lite.Atom<unknown>,
      selector: undefined,
      keyFn: selectorOrKeyFnOrRenderFn as (item: unknown) => string | number,
      renderFn,
    }
  }
  return {
    [BIND_BRAND]: true,
    atom: atomOrCtrl as Lite.Atom<unknown>,
    selector: selectorOrKeyFnOrRenderFn as ((value: unknown) => unknown) | undefined,
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

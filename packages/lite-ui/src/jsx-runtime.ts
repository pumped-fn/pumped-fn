import { createVNode, type VNode } from './vnode'

function normalizeChildren(raw: unknown): unknown[] {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw.flat(Infinity)
  return [raw]
}

type Component = (props: Record<string, unknown>) => VNode

const LAZY_BRAND = Symbol('lite-ui-lazy')

export interface LazyVNode {
  readonly [LAZY_BRAND]: true
  readonly component: Component
  readonly props: Record<string, unknown>
}

export function isLazyVNode(v: unknown): v is LazyVNode {
  return v != null && typeof v === 'object' && LAZY_BRAND in (v as object)
}

export function jsx(tag: string | Component, props: Record<string, unknown>): VNode | LazyVNode {
  const { children, ...rest } = props
  if (typeof tag === 'function') {
    return { [LAZY_BRAND]: true, component: tag, props }
  }
  return createVNode(tag, Object.keys(rest).length > 0 ? rest : null, normalizeChildren(children))
}

export { jsx as jsxs }

export function Fragment(props: { children?: unknown }): VNode {
  return createVNode(null, null, normalizeChildren(props.children))
}

export { useScope } from './scope-context'

export declare namespace JSX {
  type Element = VNode
  interface IntrinsicElements {
    [tag: string]: Record<string, unknown>
  }
  interface ElementChildrenAttribute {
    children: {}
  }
}

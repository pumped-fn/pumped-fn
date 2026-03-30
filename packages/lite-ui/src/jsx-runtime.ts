import { createVNode, type VNode } from './vnode'

function normalizeChildren(raw: unknown): unknown[] {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw.flat(Infinity)
  return [raw]
}

type Component = (props: Record<string, unknown>) => VNode

export function jsx(tag: string | Component, props: Record<string, unknown>): VNode {
  const { children, ...rest } = props
  if (typeof tag === 'function') return tag(props)
  return createVNode(tag, Object.keys(rest).length > 0 ? rest : null, normalizeChildren(children))
}

export { jsx as jsxs }

export function Fragment(props: { children?: unknown }): VNode {
  return createVNode(null, null, normalizeChildren(props.children))
}

export declare namespace JSX {
  type Element = VNode
  interface IntrinsicElements {
    [tag: string]: Record<string, unknown>
  }
  interface ElementChildrenAttribute {
    children: {}
  }
}

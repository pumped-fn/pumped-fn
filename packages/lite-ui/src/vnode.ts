import { track } from './tracking'
import type { ReactiveBinding, MountContext } from './index'
import { subscribeToControllers, isList, isTemplate, isDirective, mountListDirective, mountTemplate, applyAttribute, clearBetween } from './index'

export interface VNode {
  tag: string | null
  props: Record<string, unknown> | null
  children: unknown[]
}

const VNODE_BRAND = Symbol('lite-ui-vnode')

export function createVNode(
  tag: string | null,
  props: Record<string, unknown> | null,
  children: unknown[],
): VNode {
  return { [VNODE_BRAND]: true, tag, props, children } as unknown as VNode
}

export function isVNode(v: unknown): v is VNode {
  return v != null && typeof v === 'object' && VNODE_BRAND in v
}

function isEventProp(key: string, value: unknown): boolean {
  return key.length > 2 && key[0] === 'o' && key[1] === 'n' && key.charCodeAt(2) >= 65 && key.charCodeAt(2) <= 90 && typeof value === 'function'
}

function mountChild(
  child: unknown,
  parent: Node,
  before: Node | null,
  ctx: MountContext,
): Node[] {
  if (child == null || child === false || child === true) return []

  if (isVNode(child)) return mountVNode(child, parent, before, ctx)

  if (isTemplate(child)) return mountTemplate(child as any, parent, before, ctx)

  if (isList(child)) return mountListDirective(child as any, parent, before, ctx)

  if (isDirective(child)) {
    const el = document.createElement('div')
    el.style.display = 'contents'
    parent.insertBefore(el, before)
    child.mount(el, ctx)
    return [el]
  }

  if (typeof child === 'function') {
    const fn = child as () => unknown
    const startMarker = document.createComment('')
    const endMarker = document.createComment('')
    parent.insertBefore(startMarker, before)
    parent.insertBefore(endMarker, before)

    const { result: initial, controllers } = track(fn)
    const initialNodes = renderChildValue(initial, parent, endMarker, ctx)

    const binding: ReactiveBinding = {
      fn,
      prev: initial,
      update(val: unknown) {
        clearBetween(startMarker, endMarker)
        renderChildValue(val, parent, endMarker, ctx)
      },
      alive: true,
      unsubs: [],
    }
    ctx.reactiveBindings.push(binding)
    subscribeToControllers(binding, controllers)

    return [startMarker, ...initialNodes, endMarker]
  }

  const text = document.createTextNode(String(child))
  parent.insertBefore(text, before)
  return [text]
}

function renderChildValue(
  value: unknown,
  parent: Node,
  before: Node | null,
  ctx: MountContext,
): Node[] {
  if (value == null || value === false) return []
  if (isVNode(value)) return mountVNode(value, parent, before, ctx)
  if (isTemplate(value)) return mountTemplate(value as any, parent, before, ctx)
  const text = document.createTextNode(String(value))
  parent.insertBefore(text, before)
  return [text]
}

export function mountVNode(
  vnode: VNode,
  parent: Node,
  before: Node | null,
  ctx: MountContext,
): Node[] {
  if (vnode.tag === null) {
    const nodes: Node[] = []
    for (const child of vnode.children) {
      nodes.push(...mountChild(child, parent, before, ctx))
    }
    return nodes
  }

  const el = document.createElement(vnode.tag)

  if (vnode.props) {
    for (const key of Object.keys(vnode.props)) {
      const value = vnode.props[key]

      if (isEventProp(key, value)) {
        const eventName = key.slice(2).toLowerCase()
        el.addEventListener(eventName, value as EventListener)
        ctx.cleanups.push(() => el.removeEventListener(eventName, value as EventListener))
      } else if (typeof value === 'function') {
        const fn = value as () => unknown
        const { result: initial, controllers } = track(fn)
        applyAttribute(el, key, initial)

        const binding: ReactiveBinding = {
          fn,
          prev: initial,
          update(val: unknown) {
            applyAttribute(el, key, val)
          },
          alive: true,
          unsubs: [],
        }
        ctx.reactiveBindings.push(binding)
        subscribeToControllers(binding, controllers)
      } else {
        applyAttribute(el, key, value)
      }
    }
  }

  for (const child of vnode.children) {
    mountChild(child, el, null, ctx)
  }

  parent.insertBefore(el, before)
  return [el]
}

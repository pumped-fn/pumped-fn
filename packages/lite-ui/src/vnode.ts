import { track } from './tracking'
import type { ReactiveBinding, MountContext, ValueKind } from './index'
import {
  subscribeToControllers, isList, isTemplate, isDirective,
  mountListDirective, mountTemplate, applyAttribute, clearBetween,
  mountAtomBinding, bindAtomAttr, mountLazy,
  VALUE_NULL, VALUE_FUNCTION, VALUE_LIST, VALUE_DIRECTIVE, VALUE_TEMPLATE, VALUE_VNODE, VALUE_STATIC, VALUE_ATOM_BIND, VALUE_LAZY,
  classifyValue,
} from './index'
import { isAtomBinding, type AtomBinding } from './bind'
import { isLazyVNode, type LazyVNode } from './jsx-runtime'

const VNODE_BRAND = Symbol('lite-ui-vnode')

export interface VNode {
  readonly [VNODE_BRAND]: true
  tag: string | null
  props: Record<string, unknown> | null
  children: unknown[]
  childKinds: Uint8Array
  propClassification: { events: [string, EventListener][]; reactive: [string, () => unknown][]; atomBinds: [string, AtomBinding][]; statics: [string, unknown][] } | null
}

export function createVNode(
  tag: string | null,
  props: Record<string, unknown> | null,
  children: unknown[],
): VNode {
  const childKinds = new Uint8Array(children.length)
  for (let i = 0; i < children.length; i++) childKinds[i] = classifyValue(children[i])

  let propClassification: VNode['propClassification'] = null
  if (props) {
    const events: [string, EventListener][] = []
    const reactive: [string, () => unknown][] = []
    const atomBinds: [string, AtomBinding][] = []
    const statics: [string, unknown][] = []
    for (const key of Object.keys(props)) {
      const value = props[key]
      if (isEventProp(key, value)) {
        events.push([key.slice(2).toLowerCase(), value as EventListener])
      } else if (isAtomBinding(value)) {
        atomBinds.push([key, value])
      } else if (typeof value === 'function') {
        reactive.push([key, value as () => unknown])
      } else {
        statics.push([key, value])
      }
    }
    propClassification = { events, reactive, atomBinds, statics }
  }

  return { [VNODE_BRAND]: true, tag, props, children, childKinds, propClassification }
}

export function isVNode(v: unknown): v is VNode {
  return v != null && typeof v === 'object' && VNODE_BRAND in v
}

function isEventProp(key: string, value: unknown): boolean {
  if (key.length <= 2 || key[0] !== 'o' || key[1] !== 'n' || typeof value !== 'function') return false
  const code = key.charCodeAt(2)
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
}

function mountChildByKind(
  child: unknown,
  kind: ValueKind,
  parent: Node,
  before: Node | null,
  ctx: MountContext,
): Node[] {
  switch (kind) {
    case VALUE_NULL:
      return []
    case VALUE_ATOM_BIND:
      return mountAtomBinding(child as AtomBinding, parent, before, ctx)
    case VALUE_LAZY:
      return mountLazy(child as LazyVNode, parent, before, ctx)
    case VALUE_VNODE:
      return mountVNode(child as VNode, parent, before, ctx)
    case VALUE_TEMPLATE:
      return mountTemplate(child as any, parent, before, ctx)
    case VALUE_LIST:
      return mountListDirective(child as any, parent, before, ctx)
    case VALUE_DIRECTIVE: {
      const el = document.createElement('div')
      el.style.display = 'contents'
      parent.insertBefore(el, before)
      ;(child as any).mount(el, ctx)
      return [el]
    }
    case VALUE_FUNCTION: {
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
    default: {
      const text = document.createTextNode(String(child))
      parent.insertBefore(text, before)
      return [text]
    }
  }
}

function renderChildValue(
  value: unknown,
  parent: Node,
  before: Node | null,
  ctx: MountContext,
): Node[] {
  if (value == null || value === false || value === true) return []
  if (isVNode(value)) return mountVNode(value, parent, before, ctx)
  if (isTemplate(value)) return mountTemplate(value, parent, before, ctx)
  if (isList(value)) return mountListDirective(value, parent, before, ctx)
  if (isDirective(value)) {
    const el = document.createElement('div')
    el.style.display = 'contents'
    parent.insertBefore(el, before)
    value.mount(el, ctx)
    return [el]
  }
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
    const { children, childKinds } = vnode
    for (let i = 0; i < children.length; i++) {
      nodes.push(...mountChildByKind(children[i], childKinds[i], parent, before, ctx))
    }
    return nodes
  }

  const el = document.createElement(vnode.tag)

  const pc = vnode.propClassification
  if (pc) {
    for (let i = 0; i < pc.events.length; i++) {
      const [eventName, handler] = pc.events[i]
      el.addEventListener(eventName, handler)
      ctx.cleanups.push(() => el.removeEventListener(eventName, handler))
    }
    for (let i = 0; i < pc.atomBinds.length; i++) {
      const [key, ab] = pc.atomBinds[i]
      bindAtomAttr(ab, el, key, ctx)
    }
    for (let i = 0; i < pc.reactive.length; i++) {
      const [key, fn] = pc.reactive[i]
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
    }
    for (let i = 0; i < pc.statics.length; i++) {
      const [key, value] = pc.statics[i]
      applyAttribute(el, key, value)
    }
  }

  const { children, childKinds } = vnode
  for (let i = 0; i < children.length; i++) {
    mountChildByKind(children[i], childKinds[i], el, null, ctx)
  }

  parent.insertBefore(el, before)
  return [el]
}

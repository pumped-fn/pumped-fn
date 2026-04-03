import { shallowEqual } from '@pumped-fn/lite'
import { track, registerInTracker } from './tracking'
import type { Lite } from '@pumped-fn/lite'
import { isVNode, mountVNode, type VNode } from './vnode'
import { isAtomBinding, type AtomBinding } from './bind'
import { setCurrentScope, useScope } from './scope-context'
import { isLazyVNode, type LazyVNode } from './jsx-runtime'
export { type VNode, isVNode, mountVNode, createVNode } from './vnode'
export { $, type AtomBinding } from './bind'
export { useScope } from './scope-context'
export { type LazyVNode } from './jsx-runtime'

export const VALUE_NULL = 0
export const VALUE_FUNCTION = 1
export const VALUE_LIST = 2
export const VALUE_DIRECTIVE = 3
export const VALUE_TEMPLATE = 4
export const VALUE_VNODE = 5
export const VALUE_STATIC = 6
export const VALUE_ATOM_BIND = 7
export const VALUE_LAZY = 8
export type ValueKind = typeof VALUE_NULL | typeof VALUE_FUNCTION | typeof VALUE_LIST | typeof VALUE_DIRECTIVE | typeof VALUE_TEMPLATE | typeof VALUE_VNODE | typeof VALUE_STATIC | typeof VALUE_ATOM_BIND | typeof VALUE_LAZY

export const DIRECTIVE_BRAND = Symbol('lite-ui-directive')

export interface Directive {
  [DIRECTIVE_BRAND]: true
  mount(container: HTMLElement, ctx: MountContext): void
}

export function isDirective(v: unknown): v is Directive {
  return v != null && typeof v === 'object' && DIRECTIVE_BRAND in v
}

const LIST_BRAND = Symbol('lite-ui-list')

interface ItemSignal<T> {
  get(): T
  set(next: T): void
  on(event: string, fn: () => void): () => void
}

function createItemSignal<T>(initial: T): ItemSignal<T> {
  let value = initial
  const listeners = new Set<() => void>()
  const signal: ItemSignal<T> = {
    get(): T {
      registerInTracker(signal)
      return value
    },
    set(next: T) {
      if (shallowEqual(next, value)) return
      value = next
      for (const fn of [...listeners]) fn()
    },
    on(_event: string, fn: () => void): () => void {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
  return signal
}

export interface ListDirective<T = unknown> {
  items: () => T[]
  keyFn: (item: T) => string | number
  renderFn: (item: T, getItem: () => T) => Template | VNode
}

type RuntimeListDirective<T = unknown> = ListDirective<T> & { readonly [LIST_BRAND]: true }

export function isList(v: unknown): v is ListDirective {
  return v != null && typeof v === 'object' && LIST_BRAND in v
}

export interface MountHandle {
  dispose(): void
}

export interface Template {
  strings: TemplateStringsArray
  values: unknown[]
}

const TEMPLATE_BRAND = Symbol('lite-ui-template')

type RuntimeTemplate = Template & { readonly [TEMPLATE_BRAND]: true }

export function isTemplate(v: unknown): v is Template {
  return v != null && typeof v === 'object' && TEMPLATE_BRAND in v
}

export function classifyValue(v: unknown): ValueKind {
  if (v == null || v === false) return VALUE_NULL
  if (typeof v === 'function') return VALUE_FUNCTION
  if (typeof v === 'object') {
    if (isAtomBinding(v)) return VALUE_ATOM_BIND
    if (isLazyVNode(v)) return VALUE_LAZY
    if (LIST_BRAND in (v as object)) return VALUE_LIST
    if (DIRECTIVE_BRAND in (v as object)) return VALUE_DIRECTIVE
    if (TEMPLATE_BRAND in (v as object)) return VALUE_TEMPLATE
    if (isVNode(v)) return VALUE_VNODE
  }
  return VALUE_STATIC
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): Template {
  const template: RuntimeTemplate = { [TEMPLATE_BRAND]: true, strings, values }
  return template
}

export function list<T>(
  items: () => T[],
  keyFn: (item: T) => string | number,
  renderFn: (item: T, getItem: () => T) => Template | VNode,
): ListDirective<T> {
  const directive: RuntimeListDirective<T> = { [LIST_BRAND]: true, items, keyFn, renderFn }
  return directive
}

const ATTR_RE = /\s([@a-zA-Z][\w.-]*)=$/

function parseAttrBinding(precedingString: string): string | null {
  const match = precedingString.match(ATTR_RE)
  return match ? match[1] : null
}

export interface ReactiveBinding {
  fn: () => unknown
  prev: unknown
  update: (val: unknown) => void
  alive: boolean
  unsubs: (() => void)[]
}

export function subscribeToControllers(binding: ReactiveBinding, controllers: Set<any>): void {
  for (const unsub of binding.unsubs) unsub()
  binding.unsubs.length = 0
  if (!binding.alive) return

  function onResolved() {
    if (!binding.alive) return
    const { result: next, controllers: newCtrls } = track(binding.fn)
    if (next !== binding.prev) {
      binding.prev = next
      binding.update(next)
    }
    for (const unsub of binding.unsubs) unsub()
    binding.unsubs.length = 0
    if (!binding.alive) return
    for (const ctrl of newCtrls) {
      binding.unsubs.push(ctrl.on('resolved', onResolved))
    }
  }

  for (const ctrl of controllers) {
    binding.unsubs.push(ctrl.on('resolved', onResolved))
  }
}

export interface MountContext {
  scope: Lite.Scope
  cleanups: (() => void)[]
  reactiveBindings: ReactiveBinding[]
}

function renderValue(
  value: unknown,
  parent: Node,
  before: Node | null,
  ctx: MountContext,
): Node[] {
  if (isTemplate(value)) {
    return mountTemplate(value, parent, before, ctx)
  }
  if (value == null || value === false) return []
  const text = document.createTextNode(String(value))
  parent.insertBefore(text, before)
  return [text]
}

export function clearBetween(startMarker: Comment, endMarker: Comment): void {
  while (startMarker.nextSibling && startMarker.nextSibling !== endMarker) {
    startMarker.nextSibling.remove()
  }
}

export function mountAtomBinding(
  binding: AtomBinding,
  parent: Node,
  before: Node | null,
  ctx: MountContext,
): Node[] {
  const scope = ctx.scope
  const { atom, selector } = binding
  const ctrl = scope.controller(atom)

  const startMarker = document.createComment('')
  const endMarker = document.createComment('')
  parent.insertBefore(startMarker, before)
  parent.insertBefore(endMarker, before)

  const read = selector
    ? () => selector(ctrl.get())
    : () => ctrl.get()

  const resolved = ctrl.state === 'resolved'
  const initial = resolved ? read() : undefined
  const initialNodes = resolved ? renderValue(initial, parent, endMarker, ctx) : []

  const rb: ReactiveBinding = {
    fn: read,
    prev: initial,
    update(val: unknown) {
      clearBetween(startMarker, endMarker)
      renderValue(val, parent, endMarker, ctx)
    },
    alive: true,
    unsubs: [],
  }
  ctx.reactiveBindings.push(rb)

  rb.unsubs.push(scope.on('resolved', atom, () => {
    if (!rb.alive) return
    const next = read()
    if (next !== rb.prev) {
      rb.prev = next
      rb.update(next)
    }
  }))

  return [startMarker, ...initialNodes, endMarker]
}

export function bindAtomAttr(
  binding: AtomBinding,
  el: Element,
  attrName: string,
  ctx: MountContext,
): void {
  const scope = ctx.scope
  const { atom, selector } = binding
  const ctrl = scope.controller(atom)

  const read = selector
    ? () => selector(ctrl.get())
    : () => ctrl.get()

  const initial = ctrl.state === 'resolved' ? read() : undefined
  applyAttribute(el, attrName, initial)

  const rb: ReactiveBinding = {
    fn: read,
    prev: initial,
    update(val: unknown) { applyAttribute(el, attrName, val) },
    alive: true,
    unsubs: [],
  }
  ctx.reactiveBindings.push(rb)

  rb.unsubs.push(scope.on('resolved', atom, () => {
    if (!rb.alive) return
    const next = read()
    if (next !== rb.prev) {
      rb.prev = next
      rb.update(next)
    }
  }))
}

function mountReactiveText(
  fn: () => unknown,
  parent: Node,
  before: Node | null,
  ctx: MountContext,
): Node[] {
  const startMarker = document.createComment('')
  const endMarker = document.createComment('')
  parent.insertBefore(startMarker, before)
  parent.insertBefore(endMarker, before)

  const { result: initial, controllers } = track(fn)
  const initialNodes = renderValue(initial, parent, endMarker, ctx)

  const binding: ReactiveBinding = {
    fn,
    prev: initial,
    update(val: unknown) {
      clearBetween(startMarker, endMarker)
      renderValue(val, parent, endMarker, ctx)
    },
    alive: true,
    unsubs: [],
  }
  ctx.reactiveBindings.push(binding)
  subscribeToControllers(binding, controllers)

  return [startMarker, ...initialNodes, endMarker]
}

function lis(arr: number[]): number[] {
  if (arr.length === 0) return []
  const tails: number[] = []
  const predecessors = new Int32Array(arr.length)
  const indices: number[] = []

  for (let i = 0; i < arr.length; i++) {
    const val = arr[i]
    let lo = 0, hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (arr[tails[mid]] < val) lo = mid + 1
      else hi = mid
    }
    if (lo > 0) predecessors[i] = tails[lo - 1]
    else predecessors[i] = -1
    tails[lo] = i
    if (lo === indices.length) indices.push(i)
    else indices[lo] = i
  }

  const result: number[] = []
  let k = tails[tails.length - 1]
  for (let i = tails.length - 1; i >= 0; i--) {
    result[i] = k
    k = predecessors[k]
  }
  return result
}

export function mountListDirective(
  directive: ListDirective,
  parent: Node,
  before: Node | null,
  ctx: MountContext,
): Node[] {
  const startMarker = document.createComment('')
  const endMarker = document.createComment('')
  parent.insertBefore(startMarker, before)
  parent.insertBefore(endMarker, before)

  let keyMap = new Map<string | number, { nodes: Node[]; item: unknown; ctx: MountContext; signal: ItemSignal<any> }>()
  let oldKeys: (string | number)[] = []

  function reconcile(items: unknown[]) {
    const newKeyMap = new Map<string | number, { nodes: Node[]; item: unknown; ctx: MountContext; signal: ItemSignal<any> }>()
    const newKeys: (string | number)[] = []

    for (const item of items) {
      const key = directive.keyFn(item)
      if (newKeyMap.has(key)) throw new Error(`Duplicate key in list: ${String(key)}`)
      newKeys.push(key)
      if (keyMap.has(key)) {
        const existing = keyMap.get(key)!
        existing.signal.set(item)
        existing.item = item
        newKeyMap.set(key, existing)
      } else {
        const signal = createItemSignal(item)
        const frag = document.createDocumentFragment()
        const rendered = directive.renderFn(item, signal.get.bind(signal))
        const itemCtx: MountContext = {
          scope: ctx.scope,
          cleanups: [],
          reactiveBindings: [],
        }
        const nodes = isVNode(rendered)
          ? mountVNode(rendered, frag, null, itemCtx)
          : mountTemplate(rendered, frag, null, itemCtx)
        for (const b of itemCtx.reactiveBindings) ctx.reactiveBindings.push(b)
        newKeyMap.set(key, { nodes, item, ctx: itemCtx, signal })
      }
    }

    for (const [key, entry] of keyMap) {
      if (!newKeyMap.has(key)) {
        for (const b of entry.ctx.reactiveBindings) {
          b.alive = false
          for (const unsub of b.unsubs) unsub()
          b.unsubs.length = 0
        }
        for (const cleanup of entry.ctx.cleanups) cleanup()
        entry.ctx.reactiveBindings.length = 0
        entry.ctx.cleanups.length = 0
        for (const node of entry.nodes) (node as ChildNode).remove()
      }
    }

    if (newKeys.length === 0) {
      oldKeys = newKeys
      keyMap = newKeyMap
      return
    }

    if (oldKeys.length === 0) {
      const fragment = document.createDocumentFragment()
      for (const key of newKeys) {
        const entry = newKeyMap.get(key)!
        for (const node of entry.nodes) fragment.appendChild(node)
      }
      parent.insertBefore(fragment, endMarker)
      oldKeys = newKeys
      keyMap = newKeyMap
      return
    }

    let appendOnly = newKeys.length >= oldKeys.length
    if (appendOnly) {
      for (let i = 0; i < oldKeys.length; i++) {
        if (newKeys[i] !== oldKeys[i]) {
          appendOnly = false
          break
        }
      }
    }

    if (appendOnly) {
      const fragment = document.createDocumentFragment()
      for (let i = oldKeys.length; i < newKeys.length; i++) {
        const entry = newKeyMap.get(newKeys[i])!
        for (const node of entry.nodes) fragment.appendChild(node)
      }
      if (fragment.firstChild) parent.insertBefore(fragment, endMarker)
      oldKeys = newKeys
      keyMap = newKeyMap
      return
    }

    const oldKeyIndex = new Map<string | number, number>()
    for (let i = 0; i < oldKeys.length; i++) oldKeyIndex.set(oldKeys[i], i)

    const newOldIndices: number[] = []
    for (const key of newKeys) {
      const idx = oldKeyIndex.get(key)
      newOldIndices.push(idx !== undefined ? idx : -1)
    }

    const surviving: number[] = []
    const survivingNewIdx: number[] = []
    for (let i = 0; i < newOldIndices.length; i++) {
      if (newOldIndices[i] !== -1) {
        surviving.push(newOldIndices[i])
        survivingNewIdx.push(i)
      }
    }

    const lisOfSurviving = lis(surviving)
    const lisNewIndices = new Set<number>()
    for (const idx of lisOfSurviving) lisNewIndices.add(survivingNewIdx[idx])

    let anchor: Node = endMarker
    for (let i = newKeys.length - 1; i >= 0; i--) {
      const entry = newKeyMap.get(newKeys[i])!
      if (lisNewIndices.has(i)) {
        anchor = entry.nodes[0]
      } else {
        for (let j = entry.nodes.length - 1; j >= 0; j--) {
          parent.insertBefore(entry.nodes[j], anchor)
        }
        anchor = entry.nodes[0]
      }
    }

    oldKeys = newKeys
    keyMap = newKeyMap
  }

  const { result: initial, controllers } = track(directive.items)
  reconcile(initial)

  const binding: ReactiveBinding = {
    fn: directive.items,
    prev: initial,
    update(val: unknown) {
      reconcile(val as unknown[])
    },
    alive: true,
    unsubs: [],
  }
  ctx.reactiveBindings.push(binding)
  subscribeToControllers(binding, controllers)

  return [startMarker, endMarker]
}

interface ParsedTemplate {
  templateEl: HTMLTemplateElement
  attrBindings: { index: number; attrName: string }[]
  eventBindings: { index: number; eventName: string }[]
}

const templateCache = new WeakMap<TemplateStringsArray, ParsedTemplate>()

function parseTemplate(strings: TemplateStringsArray): ParsedTemplate {
  const cached = templateCache.get(strings)
  if (cached) return cached

  let htmlStr = ''
  const attrBindings: { index: number; attrName: string }[] = []
  const eventBindings: { index: number; eventName: string }[] = []

  for (let i = 0; i < strings.length; i++) {
    htmlStr += strings[i]
    if (i < strings.length - 1) {
      const attrName = parseAttrBinding(htmlStr)
      if (attrName) {
        if (attrName.startsWith('@')) {
          eventBindings.push({ index: i, eventName: attrName.slice(1) })
          htmlStr = htmlStr.slice(0, htmlStr.length - attrName.length - 1)
          htmlStr += ` data-evt-${i}=""`
        } else {
          attrBindings.push({ index: i, attrName })
          htmlStr = htmlStr.slice(0, htmlStr.length - attrName.length - 1)
          htmlStr += ` data-attr-${i}=""`
        }
      } else {
        htmlStr += `<!--slot-${i}-->`
      }
    }
  }

  const templateEl = document.createElement('template')
  templateEl.innerHTML = htmlStr

  const result: ParsedTemplate = { templateEl, attrBindings, eventBindings }
  templateCache.set(strings, result)
  return result
}

export function mountTemplate(
  tpl: Template,
  parent: Node,
  before: Node | null,
  ctx: MountContext,
): Node[] {
  const { strings, values } = tpl
  const { templateEl, attrBindings, eventBindings } = parseTemplate(strings)
  const fragment = templateEl.content.cloneNode(true) as DocumentFragment
  const boundElements = new Map<number, Element>()

  if (attrBindings.length > 0 || eventBindings.length > 0) {
    const elementWalker = document.createTreeWalker(fragment, NodeFilter.SHOW_ELEMENT)
    while (elementWalker.nextNode()) {
      const el = elementWalker.currentNode as Element
      for (const attr of el.getAttributeNames()) {
        const attrMatch = attr.match(/^data-attr-(\d+)$/)
        if (attrMatch) {
          boundElements.set(parseInt(attrMatch[1], 10), el)
          continue
        }
        const eventMatch = attr.match(/^data-evt-(\d+)$/)
        if (eventMatch) {
          boundElements.set(parseInt(eventMatch[1], 10), el)
        }
      }
    }
  }

  for (const { index, attrName } of attrBindings) {
    const el = boundElements.get(index)
    if (!el) continue
    el.removeAttribute(`data-attr-${index}`)
    const attrVal = values[index]
    if (isAtomBinding(attrVal)) {
      bindAtomAttr(attrVal, el, attrName, ctx)
    } else if (typeof attrVal === 'function') {
      const fn = attrVal as () => unknown
      const { result: initial, controllers } = track(fn)
      applyAttribute(el, attrName, initial)

      const binding: ReactiveBinding = {
        fn,
        prev: initial,
        update(val: unknown) {
          applyAttribute(el, attrName, val)
        },
        alive: true,
        unsubs: [],
      }
      ctx.reactiveBindings.push(binding)
      subscribeToControllers(binding, controllers)
    } else {
      applyAttribute(el, attrName, attrVal)
    }
  }

  for (const { index, eventName } of eventBindings) {
    const el = boundElements.get(index)
    if (!el) continue
    el.removeAttribute(`data-evt-${index}`)
    const handler = values[index] as EventListener
    el.addEventListener(eventName, handler)
    ctx.cleanups.push(() => el.removeEventListener(eventName, handler))
  }

  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_COMMENT)
  const slotComments: { comment: Comment; index: number }[] = []

  while (walker.nextNode()) {
    const comment = walker.currentNode as Comment
    const match = comment.textContent?.match(/^slot-(\d+)$/)
    if (match) {
      slotComments.push({ comment, index: parseInt(match[1], 10) })
    }
  }

  for (const { comment, index } of slotComments) {
    const value = values[index]
    const parentNode = comment.parentNode!
    switch (classifyValue(value)) {
      case VALUE_ATOM_BIND:
        mountAtomBinding(value as AtomBinding, parentNode, comment, ctx)
        comment.remove()
        break
      case VALUE_LAZY:
        mountLazy(value as LazyVNode, parentNode, comment, ctx)
        comment.remove()
        break
      case VALUE_FUNCTION:
        mountReactiveText(value as () => unknown, parentNode, comment, ctx)
        comment.remove()
        break
      case VALUE_LIST:
        mountListDirective(value as ListDirective, parentNode, comment, ctx)
        comment.remove()
        break
      case VALUE_DIRECTIVE:
        {
          const el = document.createElement('div')
          el.style.display = 'contents'
          parentNode.insertBefore(el, comment)
          comment.remove()
          ;(value as Directive).mount(el, ctx)
        }
        break
      case VALUE_TEMPLATE:
        mountTemplate(value as Template, parentNode, comment, ctx)
        comment.remove()
        break
      default:
        {
          const textNode = document.createTextNode(value == null ? '' : String(value))
          parentNode.insertBefore(textNode, comment)
          comment.remove()
        }
        break
    }
  }

  const nodes: Node[] = []
  while (fragment.firstChild) {
    const node = fragment.firstChild
    nodes.push(node)
    parent.insertBefore(node, before)
  }

  return nodes
}

export const BOOLEAN_ATTRS = new Set([
  'disabled', 'checked', 'readonly', 'required', 'hidden',
  'selected', 'multiple', 'autofocus', 'autoplay', 'controls',
  'loop', 'muted', 'novalidate', 'open', 'reversed',
])

export function applyAttribute(el: Element, name: string, value: unknown): void {
  if (BOOLEAN_ATTRS.has(name)) {
    (el as unknown as Record<string, unknown>)[name] = !!value
    return
  }
  if (name === 'style' && typeof value === 'string') {
    ;(el as HTMLElement).style.cssText = value
    return
  }
  if (value == null || value === false) {
    el.removeAttribute(name)
  } else {
    el.setAttribute(name, String(value))
  }
}

export function mountLazy(
  lazy: LazyVNode,
  parent: Node,
  before: Node | null,
  ctx: MountContext,
): Node[] {
  const resolved = lazy.component(lazy.props) as VNode | LazyVNode
  if (isLazyVNode(resolved)) return mountLazy(resolved, parent, before, ctx)
  if (isVNode(resolved)) return mountVNode(resolved, parent, before, ctx)
  if (isTemplate(resolved)) return mountTemplate(resolved as unknown as Template, parent, before, ctx)
  return []
}

export function mount(tpl: Template | VNode | LazyVNode, container: HTMLElement, scope?: Lite.Scope): MountHandle {
  const resolvedScope = scope ?? useScope()
  const ctx: MountContext = {
    scope: resolvedScope,
    cleanups: [],
    reactiveBindings: [],
  }

  const prev = scope ? setCurrentScope(scope) : null
  let nodes: Node[]
  try {
    nodes = isLazyVNode(tpl)
      ? mountLazy(tpl, container, null, ctx)
      : isVNode(tpl)
        ? mountVNode(tpl, container, null, ctx)
        : mountTemplate(tpl, container, null, ctx)
  } finally {
    if (scope) setCurrentScope(prev)
  }

  let disposed = false

  return {
    dispose() {
      if (disposed) return
      disposed = true
      for (const binding of ctx.reactiveBindings) {
        binding.alive = false
        for (const unsub of binding.unsubs) unsub()
        binding.unsubs.length = 0
      }
      for (const cleanup of ctx.cleanups) cleanup()
      for (const node of nodes) (node as ChildNode).remove()
      ctx.reactiveBindings.length = 0
      ctx.cleanups.length = 0
    },
  }
}

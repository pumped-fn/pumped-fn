import type { Lite } from '@pumped-fn/lite'
import type { MountContext, ReactiveBinding } from './index'
import { isTemplate, mountTemplate, clearBetween, applyAttribute } from './index'
import { isVNode, mountVNode } from './vnode'

export function isAtomLike(v: unknown): v is Lite.Atom<unknown> {
  return v != null && typeof v === 'object' && Symbol.for('@pumped-fn/lite/atom') in (v as any)
}

function renderValue(
  value: unknown,
  parent: Node,
  before: Node | null,
  ctx: MountContext,
): Node[] {
  if (isTemplate(value)) return mountTemplate(value, parent, before, ctx)
  if (value == null || value === false) return []
  const text = document.createTextNode(String(value))
  parent.insertBefore(text, before)
  return [text]
}

export function mountAtomText(
  atom: Lite.Atom<unknown>,
  parent: Node,
  before: Node | null,
  ctx: MountContext,
): Node[] {
  const scope = ctx.scope
  const ctrl = scope.controller(atom)

  if (ctrl.state !== 'resolved') {
    const startMarker = document.createComment('')
    const endMarker = document.createComment('')
    parent.insertBefore(startMarker, before)
    parent.insertBefore(endMarker, before)

    const binding: ReactiveBinding = {
      fn: () => ctrl.get(),
      prev: undefined,
      update(val: unknown) {
        clearBetween(startMarker, endMarker)
        renderValue(val, parent, endMarker, ctx)
      },
      alive: true,
      unsubs: [],
    }
    ctx.reactiveBindings.push(binding)

    const unsub = scope.on('resolved', atom, () => {
      if (!binding.alive) return
      const next = ctrl.get()
      if (next !== binding.prev) {
        binding.prev = next
        binding.update(next)
      }
    })
    binding.unsubs.push(unsub)

    return [startMarker, endMarker]
  }

  const startMarker = document.createComment('')
  const endMarker = document.createComment('')
  parent.insertBefore(startMarker, before)
  parent.insertBefore(endMarker, before)

  const initial = ctrl.get()
  const initialNodes = renderValue(initial, parent, endMarker, ctx)

  const binding: ReactiveBinding = {
    fn: () => ctrl.get(),
    prev: initial,
    update(val: unknown) {
      clearBetween(startMarker, endMarker)
      renderValue(val, parent, endMarker, ctx)
    },
    alive: true,
    unsubs: [],
  }
  ctx.reactiveBindings.push(binding)

  const unsub = scope.on('resolved', atom, () => {
    if (!binding.alive) return
    const next = ctrl.get()
    if (next !== binding.prev) {
      binding.prev = next
      binding.update(next)
    }
  })
  binding.unsubs.push(unsub)

  return [startMarker, ...initialNodes, endMarker]
}

export function mountAtomAttr(
  atom: Lite.Atom<unknown>,
  el: Element,
  attrName: string,
  ctx: MountContext,
): void {
  const scope = ctx.scope
  const ctrl = scope.controller(atom)

  const initial = ctrl.state === 'resolved' ? ctrl.get() : undefined
  applyAttribute(el, attrName, initial)

  const binding: ReactiveBinding = {
    fn: () => ctrl.get(),
    prev: initial,
    update(val: unknown) {
      applyAttribute(el, attrName, val)
    },
    alive: true,
    unsubs: [],
  }
  ctx.reactiveBindings.push(binding)

  const unsub = scope.on('resolved', atom, () => {
    if (!binding.alive) return
    const next = ctrl.get()
    if (next !== binding.prev) {
      binding.prev = next
      binding.update(next)
    }
  })
  binding.unsubs.push(unsub)
}

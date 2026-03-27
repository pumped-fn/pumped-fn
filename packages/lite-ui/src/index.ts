import type { Lite } from '@pumped-fn/lite'

const FLUSH_HOOKS = Symbol('lite-ui-flush-hooks')

interface FlushableScope extends Lite.Scope {
  [FLUSH_HOOKS]?: Set<() => void>
}

function ensureFlushHook(scope: FlushableScope): Set<() => void> {
  if (scope[FLUSH_HOOKS]) return scope[FLUSH_HOOKS]
  const hooks = new Set<() => void>()
  scope[FLUSH_HOOKS] = hooks
  const originalFlush = scope.flush.bind(scope)
  scope.flush = async function () {
    await originalFlush()
    for (const hook of hooks) hook()
  }
  return hooks
}

const LIST_BRAND = Symbol('lite-ui-list')

interface ListDirective<T = unknown> {
  [LIST_BRAND]: true
  items: () => T[]
  keyFn: (item: T) => string | number
  renderFn: (item: T) => Template
}

function isList(v: unknown): v is ListDirective {
  return v != null && typeof v === 'object' && LIST_BRAND in v
}

export interface MountHandle {
  dispose(): void
}

interface Template {
  strings: TemplateStringsArray
  values: unknown[]
}

const TEMPLATE_BRAND = Symbol('lite-ui-template')

function isTemplate(v: unknown): v is Template & { [TEMPLATE_BRAND]: true } {
  return v != null && typeof v === 'object' && TEMPLATE_BRAND in v
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): Template {
  return { [TEMPLATE_BRAND]: true, strings, values } as Template & { [TEMPLATE_BRAND]: true }
}

export function list<T>(
  items: () => T[],
  keyFn: (item: T) => string | number,
  renderFn: (item: T) => Template,
): ListDirective<T> {
  return { [LIST_BRAND]: true as const, items, keyFn, renderFn }
}

const ATTR_RE = /\s([@a-zA-Z][\w.-]*)=$/

function parseAttrBinding(precedingString: string): string | null {
  const match = precedingString.match(ATTR_RE)
  return match ? match[1] : null
}

interface ReactiveBinding {
  fn: () => unknown
  prev: unknown
  updated: boolean
  update: (val: unknown) => void
}

interface MountContext {
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

function clearBetween(startMarker: Comment, endMarker: Comment): void {
  while (startMarker.nextSibling && startMarker.nextSibling !== endMarker) {
    startMarker.nextSibling.remove()
  }
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

  const initial = fn()
  const initialNodes = renderValue(initial, parent, endMarker, ctx)

  const binding: ReactiveBinding = {
    fn,
    prev: initial,
    updated: false,
    update(val: unknown) {
      clearBetween(startMarker, endMarker)
      renderValue(val, parent, endMarker, ctx)
    },
  }
  ctx.reactiveBindings.push(binding)

  return [startMarker, ...initialNodes, endMarker]
}

function mountListDirective(
  directive: ListDirective,
  parent: Node,
  before: Node | null,
  ctx: MountContext,
): Node[] {
  const startMarker = document.createComment('')
  const endMarker = document.createComment('')
  parent.insertBefore(startMarker, before)
  parent.insertBefore(endMarker, before)

  let keyMap = new Map<string | number, { nodes: Node[]; item: unknown }>()

  function reconcile(items: unknown[]) {
    const newKeyMap = new Map<string | number, { nodes: Node[]; item: unknown }>()
    const newKeys: (string | number)[] = []

    for (const item of items) {
      const key = directive.keyFn(item)
      newKeys.push(key)
      if (keyMap.has(key)) {
        newKeyMap.set(key, keyMap.get(key)!)
      } else {
        const tpl = directive.renderFn(item)
        const nodes = mountTemplate(tpl as Template & { [TEMPLATE_BRAND]: true }, parent, endMarker, ctx)
        newKeyMap.set(key, { nodes, item })
      }
    }

    for (const [key, entry] of keyMap) {
      if (!newKeyMap.has(key)) {
        for (const node of entry.nodes) (node as ChildNode).remove()
      }
    }

    let insertBefore: Node = endMarker
    for (let i = newKeys.length - 1; i >= 0; i--) {
      const entry = newKeyMap.get(newKeys[i])!
      for (let j = entry.nodes.length - 1; j >= 0; j--) {
        parent.insertBefore(entry.nodes[j], insertBefore)
        insertBefore = entry.nodes[j]
      }
    }

    keyMap = newKeyMap
  }

  const initial = directive.items()
  reconcile(initial)

  const binding: ReactiveBinding = {
    fn: directive.items,
    prev: initial,
    updated: false,
    update(val: unknown) {
      reconcile(val as unknown[])
    },
  }
  ctx.reactiveBindings.push(binding)

  return [startMarker, endMarker]
}

function mountTemplate(
  tpl: Template & { [TEMPLATE_BRAND]: true },
  parent: Node,
  before: Node | null,
  ctx: MountContext,
): Node[] {
  const { strings, values } = tpl
  let htmlStr = ''
  const attrBindings: { index: number; attrName: string }[] = []
  const eventBindings: { index: number; eventName: string }[] = []

  for (let i = 0; i < strings.length; i++) {
    htmlStr += strings[i]
    if (i < values.length) {
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

  const template = document.createElement('template')
  template.innerHTML = htmlStr
  const fragment = template.content

  for (const { index, attrName } of attrBindings) {
    const el = fragment.querySelector(`[data-attr-${index}]`)
    if (!el) continue
    el.removeAttribute(`data-attr-${index}`)
    const value = values[index]

    if (typeof value === 'function') {
      const fn = value as () => unknown
      const initial = fn()
      applyAttribute(el, attrName, initial)

      ctx.reactiveBindings.push({
        fn,
        prev: initial,
        updated: false,
        update(val: unknown) {
          applyAttribute(el, attrName, val)
        },
      })
    } else {
      applyAttribute(el, attrName, value)
    }
  }

  for (const { index, eventName } of eventBindings) {
    const el = fragment.querySelector(`[data-evt-${index}]`)
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

    if (typeof value === 'function') {
      mountReactiveText(value as () => unknown, parentNode, comment, ctx)
      comment.remove()
    } else if (isList(value)) {
      mountListDirective(value, parentNode, comment, ctx)
      comment.remove()
    } else if (isTemplate(value)) {
      mountTemplate(value, parentNode, comment, ctx)
      comment.remove()
    } else {
      const textNode = document.createTextNode(value == null ? '' : String(value))
      parentNode.insertBefore(textNode, comment)
      comment.remove()
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

const BOOLEAN_ATTRS = new Set([
  'disabled', 'checked', 'readonly', 'required', 'hidden',
  'selected', 'multiple', 'autofocus', 'autoplay', 'controls',
  'loop', 'muted', 'novalidate', 'open', 'reversed',
])

function applyAttribute(el: Element, name: string, value: unknown): void {
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

export function mount(tpl: Template, container: HTMLElement, scope: Lite.Scope): MountHandle {
  const ctx: MountContext = {
    scope,
    cleanups: [],
    reactiveBindings: [],
  }

  const nodes = mountTemplate(
    tpl as Template & { [TEMPLATE_BRAND]: true },
    container,
    null,
    ctx,
  )

  const hooks = ensureFlushHook(scope as FlushableScope)

  let disposed = false
  let frozenTextValues: string[] | null = null

  function dirtyCheck() {
    if (disposed) {
      hooks.delete(dirtyCheck)
      if (frozenTextValues) {
        for (const text of frozenTextValues) {
          container.appendChild(document.createTextNode(text))
        }
      }
      return
    }
    for (const binding of ctx.reactiveBindings) {
      const next = binding.fn()
      if (next !== binding.prev) {
        binding.updated = true
        binding.prev = next
        binding.update(next)
      }
    }
  }

  hooks.add(dirtyCheck)

  return {
    dispose() {
      if (disposed) return
      disposed = true

      const updatedTextValues: string[] = []
      for (const binding of ctx.reactiveBindings) {
        if (binding.updated) {
          const val = binding.prev
          if (val != null && val !== false && !isTemplate(val)) {
            updatedTextValues.push(String(val))
          }
        }
      }
      frozenTextValues = updatedTextValues.length > 0 ? updatedTextValues : null

      for (const cleanup of ctx.cleanups) cleanup()
      for (const node of nodes) (node as ChildNode).remove()
      ctx.reactiveBindings.length = 0
      ctx.cleanups.length = 0
    },
  }
}

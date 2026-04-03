import { bench, describe } from 'vitest'
import { atom, createScope, controller } from '@pumped-fn/lite'
import { html, mount, list, type MountHandle } from '../src/index'
import { mountAtomText, mountAtomAttr, isAtomLike } from '../src/atom-bind'

type Row = { id: number; label: string }

const adjectives = ['pretty', 'large', 'big', 'small', 'tall', 'short', 'long', 'handsome', 'plain', 'quaint']
const colors = ['red', 'yellow', 'blue', 'green', 'pink', 'brown', 'purple', 'white', 'black', 'orange']
const nouns = ['table', 'chair', 'house', 'bbq', 'desk', 'car', 'pony', 'cookie', 'sandwich', 'burger']
let nextId = 1

function buildData(count: number): Row[] {
  return Array.from({ length: count }, () => ({
    id: nextId++,
    label: `${adjectives[Math.random() * adjectives.length | 0]} ${colors[Math.random() * colors.length | 0]} ${nouns[Math.random() * nouns.length | 0]}`,
  }))
}

describe('tracking vs atom-bind: single reactive text', () => {
  bench('tracking: mount 100 reactive texts', async () => {
    const scope = createScope()
    const a = atom({ factory: () => 'hello' })
    await scope.resolve(a)
    const ctrl = scope.controller(a)
    const container = document.createElement('div')

    const ctx = { scope, cleanups: [] as (() => void)[], reactiveBindings: [] as any[] }
    for (let i = 0; i < 100; i++) {
      const tpl = html`<span>${() => ctrl.get()}</span>`
      const nodes = (await import('../src/index')).mountTemplate(tpl, container, null, ctx)
    }

    for (const b of ctx.reactiveBindings) {
      b.alive = false
      for (const u of b.unsubs) u()
    }
    await scope.dispose()
  })

  bench('atom-bind: mount 100 atom texts', async () => {
    const scope = createScope()
    const a = atom({ factory: () => 'hello' })
    await scope.resolve(a)
    const container = document.createElement('div')

    const ctx = { scope, cleanups: [] as (() => void)[], reactiveBindings: [] as any[] }
    for (let i = 0; i < 100; i++) {
      mountAtomText(a, container, null, ctx)
    }

    for (const b of ctx.reactiveBindings) {
      b.alive = false
      for (const u of b.unsubs) u()
    }
    await scope.dispose()
  })
})

describe('tracking vs atom-bind: reactive attr', () => {
  bench('tracking: 100 reactive attrs', async () => {
    const scope = createScope()
    const a = atom({ factory: () => 'active' })
    await scope.resolve(a)
    const ctrl = scope.controller(a)
    const container = document.createElement('div')

    const ctx = { scope, cleanups: [] as (() => void)[], reactiveBindings: [] as any[] }
    for (let i = 0; i < 100; i++) {
      const el = document.createElement('div')
      container.appendChild(el)

      const { track } = await import('../src/tracking')
      const { result: initial, controllers } = track(() => ctrl.get())
      const { applyAttribute, subscribeToControllers } = await import('../src/index')
      applyAttribute(el, 'class', initial)
      const binding = { fn: () => ctrl.get(), prev: initial, update: (v: unknown) => applyAttribute(el, 'class', v), alive: true, unsubs: [] as (() => void)[] }
      ctx.reactiveBindings.push(binding)
      subscribeToControllers(binding, controllers)
    }

    for (const b of ctx.reactiveBindings) {
      b.alive = false
      for (const u of b.unsubs) u()
    }
    await scope.dispose()
  })

  bench('atom-bind: 100 atom attrs', async () => {
    const scope = createScope()
    const a = atom({ factory: () => 'active' })
    await scope.resolve(a)
    const container = document.createElement('div')

    const ctx = { scope, cleanups: [] as (() => void)[], reactiveBindings: [] as any[] }
    for (let i = 0; i < 100; i++) {
      const el = document.createElement('div')
      container.appendChild(el)
      mountAtomAttr(a, el, 'class', ctx)
    }

    for (const b of ctx.reactiveBindings) {
      b.alive = false
      for (const u of b.unsubs) u()
    }
    await scope.dispose()
  })
})

describe('tracking vs atom-bind: update propagation', () => {
  bench('tracking: propagate 100 updates to 10 bindings', async () => {
    const scope = createScope()
    const a = atom({ factory: () => ({ count: 0 }) })
    await scope.resolve(a)
    const ctrl = scope.controller(a)
    const container = document.createElement('div')

    const ctx = { scope, cleanups: [] as (() => void)[], reactiveBindings: [] as any[] }
    const { track } = await import('../src/tracking')
    const { subscribeToControllers } = await import('../src/index')

    for (let i = 0; i < 10; i++) {
      const el = document.createTextNode('')
      container.appendChild(el)
      const fn = () => ctrl.get().count
      const { result: initial, controllers } = track(fn)
      el.textContent = String(initial)
      const binding = {
        fn,
        prev: initial,
        update: (v: unknown) => { el.textContent = String(v) },
        alive: true,
        unsubs: [] as (() => void)[],
      }
      ctx.reactiveBindings.push(binding)
      subscribeToControllers(binding, controllers)
    }

    for (let i = 0; i < 100; i++) {
      ctrl.set({ count: i })
      await scope.flush()
    }

    for (const b of ctx.reactiveBindings) {
      b.alive = false
      for (const u of b.unsubs) u()
    }
    await scope.dispose()
  })

  bench('atom-bind: propagate 100 updates to 10 bindings', async () => {
    const scope = createScope()
    const a = atom({ factory: () => ({ count: 0 }) })
    await scope.resolve(a)
    const ctrl = scope.controller(a)
    const container = document.createElement('div')

    const ctx = { scope, cleanups: [] as (() => void)[], reactiveBindings: [] as any[] }

    for (let i = 0; i < 10; i++) {
      const el = document.createTextNode('')
      container.appendChild(el)
      const initial = ctrl.get().count
      el.textContent = String(initial)
      const binding = {
        fn: () => ctrl.get().count,
        prev: initial as unknown,
        update: (v: unknown) => { el.textContent = String(v) },
        alive: true,
        unsubs: [] as (() => void)[],
      }
      ctx.reactiveBindings.push(binding)
      binding.unsubs.push(scope.on('resolved', a, () => {
        if (!binding.alive) return
        const next = ctrl.get().count
        if (next !== binding.prev) {
          binding.prev = next
          binding.update(next)
        }
      }))
    }

    for (let i = 0; i < 100; i++) {
      ctrl.set({ count: i })
      await scope.flush()
    }

    for (const b of ctx.reactiveBindings) {
      b.alive = false
      for (const u of b.unsubs) u()
    }
    await scope.dispose()
  })
})

describe('tracking vs atom-bind: derived atom composition', () => {
  bench('tracking: derived via closure', async () => {
    const scope = createScope()
    const data = atom({ factory: () => ({ name: 'Alice', score: 100 }) })
    await scope.resolve(data)
    const ctrl = scope.controller(data)
    const container = document.createElement('div')

    const handle = mount(
      html`<div>${() => ctrl.get().name}: ${() => ctrl.get().score}</div>`,
      container,
      scope,
    )

    for (let i = 0; i < 50; i++) {
      ctrl.set({ name: 'Alice', score: i })
      await scope.flush()
    }

    handle.dispose()
    await scope.dispose()
  })

  bench('atom-bind: derived via atoms', async () => {
    const scope = createScope()
    const data = atom({ factory: () => ({ name: 'Alice', score: 100 }) })
    const nameAtom = atom({
      deps: { d: controller(data, { resolve: true, watch: true }) },
      factory: (_, { d }) => d.get().name,
    })
    const scoreAtom = atom({
      deps: { d: controller(data, { resolve: true, watch: true }) },
      factory: (_, { d }) => d.get().score,
    })

    await scope.resolve(nameAtom)
    await scope.resolve(scoreAtom)

    const container = document.createElement('div')
    const ctx = { scope, cleanups: [] as (() => void)[], reactiveBindings: [] as any[] }

    mountAtomText(nameAtom, container, null, ctx)
    container.appendChild(document.createTextNode(': '))
    mountAtomText(scoreAtom, container, null, ctx)

    for (let i = 0; i < 50; i++) {
      scope.controller(data).set({ name: 'Alice', score: i })
      await scope.flush()
    }

    for (const b of ctx.reactiveBindings) {
      b.alive = false
      for (const u of b.unsubs) u()
    }
    await scope.dispose()
  })
})

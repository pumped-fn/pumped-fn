import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { atom, createScope, controller, type Lite } from '@pumped-fn/lite'
import { html, mount, list, type MountHandle } from '../src/index'

let scope: Lite.Scope
let container: HTMLElement
let handle: MountHandle | undefined

beforeEach(() => {
  scope = createScope()
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(async () => {
  handle?.dispose()
  handle = undefined
  await scope.dispose()
  container.remove()
})

describe('html — tagged template creates DOM', () => {
  it('renders static HTML string', () => {
    const tpl = html`<div>hello</div>`
    handle = mount(tpl, container, scope)
    expect(container.innerHTML).toBe('<div>hello</div>')
  })

  it('renders nested elements', () => {
    const tpl = html`<ul><li>one</li><li>two</li></ul>`
    handle = mount(tpl, container, scope)
    expect(container.querySelectorAll('li').length).toBe(2)
  })

  it('renders multiple root elements via fragment', () => {
    const tpl = html`<span>a</span><span>b</span>`
    handle = mount(tpl, container, scope)
    expect(container.children.length).toBe(2)
  })
})

describe('static expressions — ${value} renders once', () => {
  it('interpolates a plain string', () => {
    const tpl = html`<div>${'hello'}</div>`
    handle = mount(tpl, container, scope)
    expect(container.textContent).toBe('hello')
  })

  it('interpolates a number', () => {
    const tpl = html`<div>${42}</div>`
    handle = mount(tpl, container, scope)
    expect(container.textContent).toBe('42')
  })

  it('interpolates resolved atom value (post-resolve)', async () => {
    const nameAtom = atom({ factory: () => 'Alice' })
    await scope.resolve(nameAtom)
    const ctrl = scope.controller(nameAtom)

    const tpl = html`<span>${ctrl.get()}</span>`
    handle = mount(tpl, container, scope)
    expect(container.textContent).toBe('Alice')
  })

  it('static value does NOT update when source changes', async () => {
    const nameAtom = atom({ factory: () => 'first' })
    await scope.resolve(nameAtom)
    const ctrl = scope.controller(nameAtom)
    const snapshot = ctrl.get()

    const tpl = html`<span>${snapshot}</span>`
    handle = mount(tpl, container, scope)

    ctrl.set('second')
    await scope.flush()

    expect(container.textContent).toBe('first')
  })
})

describe('reactive expressions — ${() => value} auto-updates', () => {
  it('renders initial value from function', async () => {
    const countAtom = atom({ factory: () => 0 })
    await scope.resolve(countAtom)
    const ctrl = scope.controller(countAtom)

    const tpl = html`<span>${() => ctrl.get()}</span>`
    handle = mount(tpl, container, scope)
    expect(container.textContent).toBe('0')
  })

  it('updates DOM when atom value changes via set', async () => {
    const countAtom = atom({ factory: () => 0 })
    await scope.resolve(countAtom)
    const ctrl = scope.controller(countAtom)

    const tpl = html`<span>${() => ctrl.get()}</span>`
    handle = mount(tpl, container, scope)

    ctrl.set(42)
    await scope.flush()

    expect(container.textContent).toBe('42')
  })

  it('updates DOM when atom value changes via update', async () => {
    const countAtom = atom({ factory: () => 10 })
    await scope.resolve(countAtom)
    const ctrl = scope.controller(countAtom)

    const tpl = html`<span>${() => ctrl.get()}</span>`
    handle = mount(tpl, container, scope)

    ctrl.update(n => n + 5)
    await scope.flush()

    expect(container.textContent).toBe('15')
  })

  it('updates DOM through watch cascade', async () => {
    const baseAtom = atom({ factory: () => 'v1' })
    const derivedAtom = atom({
      deps: { base: controller(baseAtom, { resolve: true, watch: true }) },
      factory: (_, { base }) => `derived-${base.get()}`,
    })

    await scope.resolve(derivedAtom)
    const derivedCtrl = scope.controller(derivedAtom)

    const tpl = html`<p>${() => derivedCtrl.get()}</p>`
    handle = mount(tpl, container, scope)
    expect(container.textContent).toBe('derived-v1')

    scope.controller(baseAtom).set('v2')
    await scope.flush()

    expect(container.textContent).toBe('derived-v2')
  })

  it('three-level cascade A → B → C updates in one flush', async () => {
    const a = atom({ factory: () => 1 })
    const b = atom({
      deps: { a: controller(a, { resolve: true, watch: true }) },
      factory: (_, { a }) => a.get() * 10,
    })
    const c = atom({
      deps: { b: controller(b, { resolve: true, watch: true }) },
      factory: (_, { b }) => b.get() + 5,
    })

    await scope.resolve(c)
    const ctrlC = scope.controller(c)

    const tpl = html`<span>${() => ctrlC.get()}</span>`
    handle = mount(tpl, container, scope)
    expect(container.textContent).toBe('15')

    scope.controller(a).set(2)
    await scope.flush()

    expect(container.textContent).toBe('25')
  })

  it('stops updating after dispose', async () => {
    const valAtom = atom({ factory: () => 'a' })
    await scope.resolve(valAtom)
    const ctrl = scope.controller(valAtom)

    const tpl = html`<span>${() => ctrl.get()}</span>`
    handle = mount(tpl, container, scope)

    ctrl.set('b')
    await scope.flush()
    expect(container.textContent).toBe('b')

    handle.dispose()
    handle = undefined

    ctrl.set('c')
    await scope.flush()
    expect(container.textContent).toBe('b')
  })
})

describe('reactive attributes — ${() => value} on attrs', () => {
  it('sets static attribute', () => {
    const tpl = html`<div class=${'active'}></div>`
    handle = mount(tpl, container, scope)
    expect(container.querySelector('div')!.className).toBe('active')
  })

  it('reactively updates class attribute', async () => {
    const classAtom = atom({ factory: () => 'open' })
    await scope.resolve(classAtom)
    const ctrl = scope.controller(classAtom)

    const tpl = html`<div class=${() => ctrl.get()}></div>`
    handle = mount(tpl, container, scope)
    expect(container.querySelector('div')!.className).toBe('open')

    ctrl.set('closed')
    await scope.flush()
    expect(container.querySelector('div')!.className).toBe('closed')
  })

  it('toggles boolean attribute', async () => {
    const disabledAtom = atom({ factory: () => true })
    await scope.resolve(disabledAtom)
    const ctrl = scope.controller(disabledAtom)

    const tpl = html`<button disabled=${() => ctrl.get()}>click</button>`
    handle = mount(tpl, container, scope)
    expect((container.querySelector('button') as HTMLButtonElement).disabled).toBe(true)

    ctrl.set(false)
    await scope.flush()
    expect((container.querySelector('button') as HTMLButtonElement).disabled).toBe(false)
  })

  it('updates style property', async () => {
    const colorAtom = atom({ factory: () => 'red' })
    await scope.resolve(colorAtom)
    const ctrl = scope.controller(colorAtom)

    const tpl = html`<div style=${() => `color: ${ctrl.get()}`}></div>`
    handle = mount(tpl, container, scope)
    expect(container.querySelector('div')!.style.cssText).toContain('red')

    ctrl.set('blue')
    await scope.flush()
    expect(container.querySelector('div')!.style.cssText).toContain('blue')
  })

  it('sets data-* attribute', async () => {
    const idAtom = atom({ factory: () => '42' })
    await scope.resolve(idAtom)
    const ctrl = scope.controller(idAtom)

    const tpl = html`<div data-id=${() => ctrl.get()}></div>`
    handle = mount(tpl, container, scope)
    expect(container.querySelector('div')!.dataset.id).toBe('42')

    ctrl.set('99')
    await scope.flush()
    expect(container.querySelector('div')!.dataset.id).toBe('99')
  })
})

describe('event handling — @event syntax', () => {
  it('binds click handler', async () => {
    const countAtom = atom({ factory: () => 0 })
    await scope.resolve(countAtom)
    const ctrl = scope.controller(countAtom)

    const tpl = html`<button @click=${() => ctrl.update(n => n + 1)}>inc</button>`
    handle = mount(tpl, container, scope)

    container.querySelector('button')!.click()
    await scope.flush()
    expect(ctrl.get()).toBe(1)
  })

  it('handler reads latest atom value', async () => {
    const nameAtom = atom({ factory: () => 'initial' })
    await scope.resolve(nameAtom)
    const ctrl = scope.controller(nameAtom)

    const captured: string[] = []
    const tpl = html`<button @click=${() => captured.push(ctrl.get())}>go</button>`
    handle = mount(tpl, container, scope)

    container.querySelector('button')!.click()
    ctrl.set('updated')
    await scope.flush()
    container.querySelector('button')!.click()

    expect(captured).toEqual(['initial', 'updated'])
  })
})

describe('conditional rendering — ${() => condition ? a : b}', () => {
  it('renders truthy branch', async () => {
    const showAtom = atom({ factory: () => true })
    await scope.resolve(showAtom)
    const ctrl = scope.controller(showAtom)

    const tpl = html`<div>${() => ctrl.get() ? html`<span>yes</span>` : null}</div>`
    handle = mount(tpl, container, scope)
    expect(container.querySelector('span')!.textContent).toBe('yes')
  })

  it('swaps branch when value changes', async () => {
    const showAtom = atom({ factory: () => true })
    await scope.resolve(showAtom)
    const ctrl = scope.controller(showAtom)

    const tpl = html`<div>${() => ctrl.get() ? html`<span>yes</span>` : html`<em>no</em>`}</div>`
    handle = mount(tpl, container, scope)
    expect(container.querySelector('span')).not.toBeNull()
    expect(container.querySelector('em')).toBeNull()

    ctrl.set(false)
    await scope.flush()
    expect(container.querySelector('span')).toBeNull()
    expect(container.querySelector('em')).not.toBeNull()
  })

  it('renders null as empty (no DOM nodes)', async () => {
    const showAtom = atom({ factory: () => false })
    await scope.resolve(showAtom)
    const ctrl = scope.controller(showAtom)

    const tpl = html`<div>${() => ctrl.get() ? html`<span>content</span>` : null}</div>`
    handle = mount(tpl, container, scope)
    expect(container.querySelector('span')).toBeNull()

    ctrl.set(true)
    await scope.flush()
    expect(container.querySelector('span')!.textContent).toBe('content')
  })

  it('preserves sibling content around conditional', async () => {
    const flagAtom = atom({ factory: () => false })
    await scope.resolve(flagAtom)
    const ctrl = scope.controller(flagAtom)

    const tpl = html`<div>before${() => ctrl.get() ? html`<b>mid</b>` : null}after</div>`
    handle = mount(tpl, container, scope)
    expect(container.textContent).toBe('beforeafter')

    ctrl.set(true)
    await scope.flush()
    expect(container.textContent).toBe('beforemidafter')
  })
})

describe('list — keyed list rendering', () => {
  it('renders initial list from atom', async () => {
    const itemsAtom = atom({ factory: () => ['a', 'b', 'c'] })
    await scope.resolve(itemsAtom)
    const ctrl = scope.controller(itemsAtom)

    const tpl = html`<ul>${list(
      () => ctrl.get(),
      item => item,
      item => html`<li>${item}</li>`,
    )}</ul>`
    handle = mount(tpl, container, scope)

    expect(container.querySelectorAll('li').length).toBe(3)
    expect(container.querySelectorAll('li')[0].textContent).toBe('a')
  })

  it('adds items', async () => {
    const itemsAtom = atom({ factory: () => ['a'] })
    await scope.resolve(itemsAtom)
    const ctrl = scope.controller(itemsAtom)

    const tpl = html`<ul>${list(
      () => ctrl.get(),
      item => item,
      item => html`<li>${item}</li>`,
    )}</ul>`
    handle = mount(tpl, container, scope)
    expect(container.querySelectorAll('li').length).toBe(1)

    ctrl.set(['a', 'b', 'c'])
    await scope.flush()
    expect(container.querySelectorAll('li').length).toBe(3)
  })

  it('removes items', async () => {
    const itemsAtom = atom({ factory: () => ['a', 'b', 'c'] })
    await scope.resolve(itemsAtom)
    const ctrl = scope.controller(itemsAtom)

    const tpl = html`<ul>${list(
      () => ctrl.get(),
      item => item,
      item => html`<li>${item}</li>`,
    )}</ul>`
    handle = mount(tpl, container, scope)

    ctrl.set(['b'])
    await scope.flush()
    expect(container.querySelectorAll('li').length).toBe(1)
    expect(container.querySelector('li')!.textContent).toBe('b')
  })

  it('reorders preserving DOM identity', async () => {
    const itemsAtom = atom({ factory: () => [1, 2, 3] })
    await scope.resolve(itemsAtom)
    const ctrl = scope.controller(itemsAtom)

    const tpl = html`<ul>${list(
      () => ctrl.get(),
      n => n,
      n => html`<li data-key=${n}>${n}</li>`,
    )}</ul>`
    handle = mount(tpl, container, scope)

    const originalSecond = container.querySelectorAll('li')[1]
    expect(originalSecond.dataset.key).toBe('2')

    ctrl.set([3, 1, 2])
    await scope.flush()

    const items = container.querySelectorAll('li')
    expect(items.length).toBe(3)
    expect(items[0].dataset.key).toBe('3')
    expect(items[1].dataset.key).toBe('1')
    expect(items[2]).toBe(originalSecond)
  })

  it('handles empty list', async () => {
    const itemsAtom = atom({ factory: () => [] as string[] })
    await scope.resolve(itemsAtom)
    const ctrl = scope.controller(itemsAtom)

    const tpl = html`<ul>${list(
      () => ctrl.get(),
      s => s,
      s => html`<li>${s}</li>`,
    )}</ul>`
    handle = mount(tpl, container, scope)
    expect(container.querySelectorAll('li').length).toBe(0)

    ctrl.set(['x'])
    await scope.flush()
    expect(container.querySelectorAll('li').length).toBe(1)
  })

  it('handles complete replacement', async () => {
    const itemsAtom = atom({ factory: () => ['a', 'b'] })
    await scope.resolve(itemsAtom)
    const ctrl = scope.controller(itemsAtom)

    const tpl = html`<ul>${list(
      () => ctrl.get(),
      s => s,
      s => html`<li>${s}</li>`,
    )}</ul>`
    handle = mount(tpl, container, scope)

    ctrl.set(['x', 'y', 'z'])
    await scope.flush()
    expect(container.querySelectorAll('li').length).toBe(3)
    expect(container.querySelectorAll('li')[0].textContent).toBe('x')
  })
})

describe('mount — lifecycle', () => {
  it('mount returns handle with dispose()', async () => {
    const tpl = html`<div>test</div>`
    handle = mount(tpl, container, scope)
    expect(typeof handle.dispose).toBe('function')
  })

  it('dispose removes all DOM nodes', async () => {
    const tpl = html`<div>content</div>`
    handle = mount(tpl, container, scope)
    expect(container.children.length).toBe(1)

    handle.dispose()
    handle = undefined
    expect(container.children.length).toBe(0)
  })

  it('dispose unsubscribes all reactive bindings', async () => {
    const valAtom = atom({ factory: () => 'a' })
    await scope.resolve(valAtom)
    const ctrl = scope.controller(valAtom)

    const tpl = html`<span>${() => ctrl.get()}</span>`
    handle = mount(tpl, container, scope)

    handle.dispose()
    handle = undefined

    ctrl.set('b')
    await scope.flush()
    expect(container.textContent).toBe('')
  })

  it('scope.dispose cleans up all mount bindings', async () => {
    const valAtom = atom({ factory: () => 'x' })
    await scope.resolve(valAtom)
    const ctrl = scope.controller(valAtom)

    const tpl = html`<span>${() => ctrl.get()}</span>`
    handle = mount(tpl, container, scope)
    expect(container.textContent).toBe('x')

    await scope.dispose()
    scope = createScope()
  })
})

describe('nested templates', () => {
  it('html inside html composes', () => {
    const inner = html`<em>bold</em>`
    const outer = html`<div>${inner}</div>`
    handle = mount(outer, container, scope)
    expect(container.querySelector('em')!.textContent).toBe('bold')
  })

  it('reactive expression returns nested template', async () => {
    const modeAtom = atom({ factory: () => 'a' as 'a' | 'b' })
    await scope.resolve(modeAtom)
    const ctrl = scope.controller(modeAtom)

    const tpl = html`<div>${() => ctrl.get() === 'a' ? html`<span>A</span>` : html`<span>B</span>`}</div>`
    handle = mount(tpl, container, scope)
    expect(container.querySelector('span')!.textContent).toBe('A')

    ctrl.set('b')
    await scope.flush()
    expect(container.querySelector('span')!.textContent).toBe('B')
  })
})

describe('error handling', () => {
  it('failed atom renders error via reactive expression', async () => {
    const failAtom = atom({
      factory: () => { throw new Error('boom') },
    })

    try { await scope.resolve(failAtom) } catch {}

    const ctrl = scope.controller(failAtom)
    const tpl = html`<div>${() => {
      try { return ctrl.get() } catch (e) { return `Error: ${(e as Error).message}` }
    }}</div>`
    handle = mount(tpl, container, scope)
    expect(container.textContent).toBe('Error: boom')
  })

  it('atom recovery updates DOM', async () => {
    let shouldFail = true
    const recoverAtom = atom({
      factory: () => {
        if (shouldFail) throw new Error('fail')
        return 'ok'
      },
    })

    try { await scope.resolve(recoverAtom) } catch {}
    const ctrl = scope.controller(recoverAtom)

    const tpl = html`<div>${() => {
      try { return ctrl.get() } catch (e) { return `Error: ${(e as Error).message}` }
    }}</div>`
    handle = mount(tpl, container, scope)
    expect(container.textContent).toBe('Error: fail')

    shouldFail = false
    ctrl.invalidate()
    await scope.flush()
    expect(container.textContent).toBe('ok')
  })
})

/** @jsxImportSource @pumped-fn/lite-ui */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { atom, createScope, controller, type Lite } from '@pumped-fn/lite'
import { mount, list, html, type MountHandle } from '../src/index'

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

describe('JSX — static rendering', () => {
  it('renders a div with text', () => {
    handle = mount(<div>hello</div>, container, scope)
    expect(container.innerHTML).toBe('<div>hello</div>')
  })

  it('renders nested elements', () => {
    handle = mount(<ul><li>one</li><li>two</li></ul>, container, scope)
    expect(container.querySelectorAll('li').length).toBe(2)
  })

  it('renders fragment with multiple roots', () => {
    handle = mount(<><span>a</span><span>b</span></>, container, scope)
    expect(container.children.length).toBe(2)
  })

  it('sets static attributes', () => {
    handle = mount(<div class="active" id="main"></div>, container, scope)
    const el = container.querySelector('div')!
    expect(el.className).toBe('active')
    expect(el.id).toBe('main')
  })

  it('sets data attributes', () => {
    handle = mount(<div data-id="42"></div>, container, scope)
    expect(container.querySelector('div')!.dataset.id).toBe('42')
  })

  it('interpolates text children', () => {
    const name = 'Alice'
    handle = mount(<span>{name}</span>, container, scope)
    expect(container.textContent).toBe('Alice')
  })

  it('interpolates numbers', () => {
    handle = mount(<span>{42}</span>, container, scope)
    expect(container.textContent).toBe('42')
  })

  it('skips null/undefined/false children', () => {
    handle = mount(<div>{null}{undefined}{false}</div>, container, scope)
    expect(container.querySelector('div')!.childNodes.length).toBe(0)
  })
})

describe('JSX — reactive expressions', () => {
  it('reactive text updates on atom change', async () => {
    const countAtom = atom({ factory: () => 0 })
    await scope.resolve(countAtom)
    const ctrl = scope.controller(countAtom)

    handle = mount(<span>{() => ctrl.get()}</span>, container, scope)
    expect(container.textContent).toBe('0')

    ctrl.set(42)
    await scope.flush()
    expect(container.textContent).toBe('42')
  })

  it('reactive attribute updates', async () => {
    const classAtom = atom({ factory: () => 'open' })
    await scope.resolve(classAtom)
    const ctrl = scope.controller(classAtom)

    handle = mount(<div class={() => ctrl.get()}></div>, container, scope)
    expect(container.querySelector('div')!.className).toBe('open')

    ctrl.set('closed')
    await scope.flush()
    expect(container.querySelector('div')!.className).toBe('closed')
  })

  it('boolean attribute toggles', async () => {
    const disabledAtom = atom({ factory: () => true })
    await scope.resolve(disabledAtom)
    const ctrl = scope.controller(disabledAtom)

    handle = mount(<button disabled={() => ctrl.get()}>click</button>, container, scope)
    expect((container.querySelector('button') as HTMLButtonElement).disabled).toBe(true)

    ctrl.set(false)
    await scope.flush()
    expect((container.querySelector('button') as HTMLButtonElement).disabled).toBe(false)
  })

  it('watch cascade updates JSX', async () => {
    const base = atom({ factory: () => 'v1' })
    const derived = atom({
      deps: { b: controller(base, { resolve: true, watch: true }) },
      factory: (_, { b }) => `derived-${b.get()}`,
    })
    await scope.resolve(derived)
    const ctrl = scope.controller(derived)

    handle = mount(<p>{() => ctrl.get()}</p>, container, scope)
    expect(container.textContent).toBe('derived-v1')

    scope.controller(base).set('v2')
    await scope.flush()
    expect(container.textContent).toBe('derived-v2')
  })

  it('dispose stops reactive updates', async () => {
    const valAtom = atom({ factory: () => 'a' })
    await scope.resolve(valAtom)
    const ctrl = scope.controller(valAtom)

    handle = mount(<span>{() => ctrl.get()}</span>, container, scope)
    ctrl.set('b')
    await scope.flush()
    expect(container.textContent).toBe('b')

    handle.dispose()
    handle = undefined
    expect(container.textContent).toBe('')

    ctrl.set('c')
    await scope.flush()
    expect(container.textContent).toBe('')
  })
})

describe('JSX — events', () => {
  it('onClick binds click handler', async () => {
    const countAtom = atom({ factory: () => 0 })
    await scope.resolve(countAtom)
    const ctrl = scope.controller(countAtom)

    handle = mount(
      <button onClick={() => ctrl.update(n => n + 1)}>inc</button>,
      container, scope,
    )
    container.querySelector('button')!.click()
    await scope.flush()
    expect(ctrl.get()).toBe(1)
  })
})

describe('JSX — conditionals', () => {
  it('ternary renders truthy branch', async () => {
    const showAtom = atom({ factory: () => true })
    await scope.resolve(showAtom)
    const ctrl = scope.controller(showAtom)

    handle = mount(<div>{() => ctrl.get() ? <span>yes</span> : null}</div>, container, scope)
    expect(container.querySelector('span')!.textContent).toBe('yes')
  })

  it('swaps branch on change', async () => {
    const showAtom = atom({ factory: () => true })
    await scope.resolve(showAtom)
    const ctrl = scope.controller(showAtom)

    handle = mount(
      <div>{() => ctrl.get() ? <span>yes</span> : <em>no</em>}</div>,
      container, scope,
    )
    expect(container.querySelector('span')).not.toBeNull()

    ctrl.set(false)
    await scope.flush()
    expect(container.querySelector('span')).toBeNull()
    expect(container.querySelector('em')).not.toBeNull()
  })

  it('null renders nothing, true shows content', async () => {
    const showAtom = atom({ factory: () => false })
    await scope.resolve(showAtom)
    const ctrl = scope.controller(showAtom)

    handle = mount(<div>{() => ctrl.get() ? <span>content</span> : null}</div>, container, scope)
    expect(container.querySelector('span')).toBeNull()

    ctrl.set(true)
    await scope.flush()
    expect(container.querySelector('span')!.textContent).toBe('content')
  })
})

describe('JSX — function components', () => {
  it('renders a function component', () => {
    function Greeting(props: { name: string }) {
      return <span>Hello {props.name}</span>
    }
    handle = mount(<Greeting name="World" />, container, scope)
    expect(container.textContent).toBe('Hello World')
  })

  it('component with reactive children', async () => {
    const nameAtom = atom({ factory: () => 'Alice' })
    await scope.resolve(nameAtom)
    const ctrl = scope.controller(nameAtom)

    function Card(props: { children?: unknown }) {
      return <div class="card">{props.children}</div>
    }
    handle = mount(<Card><span>{() => ctrl.get()}</span></Card>, container, scope)
    expect(container.querySelector('.card span')!.textContent).toBe('Alice')

    ctrl.set('Bob')
    await scope.flush()
    expect(container.querySelector('.card span')!.textContent).toBe('Bob')
  })

  it('component composition nests', () => {
    function Outer(props: { children?: unknown }) {
      return <div class="outer">{props.children}</div>
    }
    function Inner(props: { text: string }) {
      return <span class="inner">{props.text}</span>
    }
    handle = mount(<Outer><Inner text="deep" /></Outer>, container, scope)
    expect(container.querySelector('.outer .inner')!.textContent).toBe('deep')
  })
})

describe('JSX — list integration', () => {
  it('list() works inside JSX', async () => {
    const itemsAtom = atom({ factory: () => ['a', 'b', 'c'] })
    await scope.resolve(itemsAtom)
    const ctrl = scope.controller(itemsAtom)

    handle = mount(
      <ul>{list(() => ctrl.get(), s => s, s => <li>{s}</li>)}</ul>,
      container, scope,
    )
    expect(container.querySelectorAll('li').length).toBe(3)

    ctrl.set(['c', 'a'])
    await scope.flush()
    expect(container.querySelectorAll('li').length).toBe(2)
  })

  it('list with reactive item getter in JSX', async () => {
    const itemsAtom = atom({ factory: () => [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]})
    await scope.resolve(itemsAtom)
    const ctrl = scope.controller(itemsAtom)

    handle = mount(
      <ul>{list(
        () => ctrl.get(),
        item => item.id,
        (item, getItem) => <li data-id={String(item.id)}>{() => getItem().name}</li>,
      )}</ul>,
      container, scope,
    )
    expect(container.querySelectorAll('li')[0].textContent).toBe('Alice')

    ctrl.set([{ id: 1, name: 'Alice Updated' }, { id: 2, name: 'Bob' }])
    await scope.flush()
    expect(container.querySelectorAll('li')[0].textContent).toBe('Alice Updated')
  })
})

describe('JSX — mixed with html tagged templates', () => {
  it('html template inside JSX', () => {
    const inner = html`<em>tagged</em>`
    handle = mount(<div>{inner}</div>, container, scope)
    expect(container.querySelector('em')!.textContent).toBe('tagged')
  })

  it('JSX and html share same scope reactivity', async () => {
    const valAtom = atom({ factory: () => 'shared' })
    await scope.resolve(valAtom)
    const ctrl = scope.controller(valAtom)

    handle = mount(<div><span>{() => ctrl.get()}</span></div>, container, scope)
    expect(container.querySelector('span')!.textContent).toBe('shared')

    ctrl.set('updated')
    await scope.flush()
    expect(container.querySelector('span')!.textContent).toBe('updated')
  })
})

describe('JSX — fine-grained reactivity proof', () => {
  it('changing atom A does not re-evaluate binding for atom B', async () => {
    const aAtom = atom({ factory: () => 'a1' })
    const bAtom = atom({ factory: () => 'b1' })
    await scope.resolve(aAtom)
    await scope.resolve(bAtom)
    const ctrlA = scope.controller(aAtom)
    const ctrlB = scope.controller(bAtom)

    let bEvalCount = 0
    handle = mount(
      <div>
        <span id="a">{() => ctrlA.get()}</span>
        <span id="b">{() => { bEvalCount++; return ctrlB.get() }}</span>
      </div>,
      container, scope,
    )
    const initialBEvals = bEvalCount

    ctrlA.set('a2')
    await scope.flush()

    expect(container.querySelector('#a')!.textContent).toBe('a2')
    expect(container.querySelector('#b')!.textContent).toBe('b1')
    expect(bEvalCount).toBe(initialBEvals)
  })

  it('error handling with failed atoms', async () => {
    const failAtom = atom({ factory: () => { throw new Error('boom') } })
    try { await scope.resolve(failAtom) } catch {}
    const ctrl = scope.controller(failAtom)

    handle = mount(
      <div>{() => {
        try { return ctrl.get() } catch (e) { return `Error: ${(e as Error).message}` }
      }}</div>,
      container, scope,
    )
    expect(container.textContent).toBe('Error: boom')
  })
})

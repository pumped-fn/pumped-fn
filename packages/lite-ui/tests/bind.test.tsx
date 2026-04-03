import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { atom, createScope, controller, type Lite } from '@pumped-fn/lite'
import { mount, list, type MountHandle, $, useScope } from '../src/index'

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

describe('$ atom binding in JSX', () => {
  it('renders resolved atom value', async () => {
    const name = atom({ factory: () => 'Alice' })
    await scope.resolve(name)

    handle = mount(<div>{$(name)}</div>, container, scope)
    expect(container.textContent).toBe('Alice')
  })

  it('renders with selector', async () => {
    const user = atom({ factory: () => ({ name: 'Alice', score: 42 }) })
    await scope.resolve(user)

    handle = mount(
      <div>
        <span class="name">{$(user, u => u.name)}</span>
        <span class="score">{$(user, u => u.score)}</span>
      </div>,
      container,
      scope,
    )

    expect(container.querySelector('.name')!.textContent).toBe('Alice')
    expect(container.querySelector('.score')!.textContent).toBe('42')
  })

  it('updates DOM when atom changes', async () => {
    const counter = atom({ factory: () => 0 })
    await scope.resolve(counter)
    const ctrl = scope.controller(counter)

    handle = mount(<span>{$(counter)}</span>, container, scope)
    expect(container.textContent).toBe('0')

    ctrl.set(5)
    await scope.flush()
    expect(container.textContent).toBe('5')

    ctrl.set(99)
    await scope.flush()
    expect(container.textContent).toBe('99')
  })

  it('$ with selector skips DOM update when slice unchanged', async () => {
    const data = atom({ factory: () => ({ x: 1, y: 'hello' }) })
    await scope.resolve(data)
    const ctrl = scope.controller(data)

    let domUpdates = 0
    handle = mount(<span>{$(data, d => d.y)}</span>, container, scope)
    expect(container.textContent).toBe('hello')

    const origText = container.querySelector('span')?.firstChild?.nextSibling

    ctrl.set({ x: 999, y: 'hello' })
    await scope.flush()
    expect(container.textContent).toBe('hello')

    ctrl.set({ x: 1000, y: 'world' })
    await scope.flush()
    expect(container.textContent).toBe('world')
  })

  it('$ as attribute binding', async () => {
    const theme = atom({ factory: () => 'dark' })
    await scope.resolve(theme)
    const ctrl = scope.controller(theme)

    handle = mount(<div class={$(theme)}>content</div>, container, scope)
    expect(container.querySelector('div')!.className).toBe('dark')

    ctrl.set('light')
    await scope.flush()
    expect(container.querySelector('div')!.className).toBe('light')
  })

  it('$ attr with selector', async () => {
    const state = atom({ factory: () => ({ active: true, count: 3 }) })
    await scope.resolve(state)
    const ctrl = scope.controller(state)

    handle = mount(
      <div class={$(state, s => s.active ? 'on' : 'off')}>
        {$(state, s => s.count)}
      </div>,
      container,
      scope,
    )

    expect(container.querySelector('div')!.className).toBe('on')
    expect(container.textContent).toBe('3')

    ctrl.set({ active: false, count: 7 })
    await scope.flush()
    expect(container.querySelector('div')!.className).toBe('off')
    expect(container.textContent).toBe('7')
  })

  it('component taking atom props — no context needed', async () => {
    const user = atom({ factory: () => ({ name: 'Bob', role: 'admin' }) })
    await scope.resolve(user)

    function UserBadge({ user: u }: { user: Lite.Atom<{ name: string; role: string }> }) {
      return (
        <div class="badge">
          <span class="name">{$(u, x => x.name)}</span>
          <span class="role">{$(u, x => x.role)}</span>
        </div>
      )
    }

    handle = mount(<UserBadge user={user} />, container, scope)

    expect(container.querySelector('.name')!.textContent).toBe('Bob')
    expect(container.querySelector('.role')!.textContent).toBe('admin')

    scope.controller(user).set({ name: 'Carol', role: 'user' })
    await scope.flush()

    expect(container.querySelector('.name')!.textContent).toBe('Carol')
    expect(container.querySelector('.role')!.textContent).toBe('user')
  })

  it('nested components with different atoms', async () => {
    const title = atom({ factory: () => 'Dashboard' })
    const count = atom({ factory: () => 42 })
    await scope.resolve(title)
    await scope.resolve(count)

    function Header({ title: t }: { title: Lite.Atom<string> }) {
      return <h1>{$(t)}</h1>
    }

    function Counter({ value }: { value: Lite.Atom<number> }) {
      return <span class="counter">{$(value)}</span>
    }

    function App() {
      return (
        <div>
          <Header title={title} />
          <Counter value={count} />
        </div>
      )
    }

    handle = mount(<App />, container, scope)
    expect(container.querySelector('h1')!.textContent).toBe('Dashboard')
    expect(container.querySelector('.counter')!.textContent).toBe('42')

    scope.controller(title).set('Settings')
    scope.controller(count).set(7)
    await scope.flush()

    expect(container.querySelector('h1')!.textContent).toBe('Settings')
    expect(container.querySelector('.counter')!.textContent).toBe('7')
  })

  it('$ works alongside closures and static values', async () => {
    const name = atom({ factory: () => 'Alice' })
    await scope.resolve(name)
    const ctrl = scope.controller(name)

    let dynamicVal = 'dyn'
    handle = mount(
      <div>
        <span class="atom">{$(name)}</span>
        <span class="closure">{() => dynamicVal}</span>
        <span class="static">fixed</span>
      </div>,
      container,
      scope,
    )

    expect(container.querySelector('.atom')!.textContent).toBe('Alice')
    expect(container.querySelector('.closure')!.textContent).toBe('dyn')
    expect(container.querySelector('.static')!.textContent).toBe('fixed')

    ctrl.set('Bob')
    await scope.flush()
    expect(container.querySelector('.atom')!.textContent).toBe('Bob')
  })

  it('list with $ and closure hybrid', async () => {
    const data = atom({ factory: () => [{ id: 1, name: 'A' }, { id: 2, name: 'B' }] })
    await scope.resolve(data)
    const ctrl = scope.controller(data)

    handle = mount(
      <div>
        {list(
          () => ctrl.get(),
          row => row.id,
          (_row, getItem) => <span>{() => getItem().name}</span>,
        )}
      </div>,
      container,
      scope,
    )

    const spans = container.querySelectorAll('span')
    expect(spans.length).toBe(2)
    expect(spans[0].textContent).toBe('A')
    expect(spans[1].textContent).toBe('B')

    ctrl.set([{ id: 2, name: 'B2' }, { id: 3, name: 'C' }])
    await scope.flush()

    const after = container.querySelectorAll('span')
    expect(after.length).toBe(2)
    expect(after[0].textContent).toBe('B2')
    expect(after[1].textContent).toBe('C')
  })
})

describe('useScope() — double context', () => {
  it('explicit scope via mount(jsx, el, scope)', async () => {
    const counter = atom({ factory: () => 0 })
    await scope.resolve(counter)

    function Counter() {
      const s = useScope()
      const ctrl = s.controller(counter)
      return (
        <div>
          <span>{$(counter)}</span>
          <button onClick={() => ctrl.set(ctrl.get() + 1)}>+</button>
        </div>
      )
    }

    handle = mount(<Counter />, container, scope)
    expect(container.querySelector('span')!.textContent).toBe('0')

    container.querySelector('button')!.click()
    await scope.flush()
    expect(container.querySelector('span')!.textContent).toBe('1')
  })

  it('different scopes for same component — testable', async () => {
    const msg = atom({ factory: () => 'default' })

    function Display() {
      return <span>{$(msg)}</span>
    }

    const scope1 = createScope()
    await scope1.resolve(msg)
    scope1.controller(msg).set('scope-1')
    await scope1.flush()

    const scope2 = createScope()
    await scope2.resolve(msg)
    scope2.controller(msg).set('scope-2')
    await scope2.flush()

    const c1 = document.createElement('div')
    const c2 = document.createElement('div')
    const h1 = mount(<Display />, c1, scope1)
    const h2 = mount(<Display />, c2, scope2)

    expect(c1.textContent).toBe('scope-1')
    expect(c2.textContent).toBe('scope-2')

    h1.dispose()
    h2.dispose()
    await scope1.dispose()
    await scope2.dispose()
  })

  it('nested components with useScope()', async () => {
    const title = atom({ factory: () => 'Hello' })
    const count = atom({ factory: () => 0 })
    await scope.resolve(title)
    await scope.resolve(count)

    function Header() {
      return <h1>{$(title)}</h1>
    }

    function Counter() {
      const s = useScope()
      return (
        <div>
          <span class="count">{$(count)}</span>
          <button onClick={() => {
            const ctrl = s.controller(count)
            ctrl.set(ctrl.get() + 1)
          }}>+</button>
        </div>
      )
    }

    function App() {
      return (
        <main>
          <Header />
          <Counter />
        </main>
      )
    }

    handle = mount(<App />, container, scope)
    expect(container.querySelector('h1')!.textContent).toBe('Hello')
    expect(container.querySelector('.count')!.textContent).toBe('0')

    container.querySelector('button')!.click()
    await scope.flush()
    expect(container.querySelector('.count')!.textContent).toBe('1')

    scope.controller(title).set('World')
    await scope.flush()
    expect(container.querySelector('h1')!.textContent).toBe('World')
  })

  it('self-managed scope — no explicit scope needed', async () => {
    const greeting = atom({ factory: () => 'hi' })

    function Greeter() {
      const s = useScope()
      s.resolve(greeting)
      return <span>{$(greeting)}</span>
    }

    handle = mount(<Greeter />, container)
    await useScope().resolve(greeting)
    await useScope().flush()
    expect(container.querySelector('span')).toBeTruthy()
  })

  it('useScope() returns default scope without mount', () => {
    const s = useScope()
    expect(s).toBeDefined()
    expect(s.resolve).toBeDefined()
  })
})

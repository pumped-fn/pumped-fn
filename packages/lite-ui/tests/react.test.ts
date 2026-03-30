import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { atom, createScope, controller, type Lite } from '@pumped-fn/lite'
import { createElement, type FC } from 'react'
import { act } from 'react-dom/test-utils'
import { useAtom, useController } from '@pumped-fn/lite-react'
import { html, mount, type MountHandle } from '../src/index'
import { react } from '../src/react'

let scope: Lite.Scope
let container: HTMLElement
let handle: MountHandle | undefined

beforeEach(() => {
  scope = createScope()
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(async () => {
  await act(async () => {
    handle?.dispose()
  })
  handle = undefined
  await scope.dispose()
  container.remove()
})

function Greeting({ name }: { name: string }) {
  return createElement('span', { className: 'react-greeting' }, `Hello, ${name}!`)
}

function Counter({ label }: { label: string }) {
  return createElement('div', { className: 'react-counter' }, `Counter: ${label}`)
}

describe('react() directive — basic rendering', () => {
  it('renders a React component into a lite-ui template', async () => {
    const tpl = html`<div>${react(Greeting, () => ({ name: 'World' }))}</div>`
    await act(async () => {
      handle = mount(tpl, container, scope)
    })
    expect(container.querySelector('.react-greeting')!.textContent).toBe('Hello, World!')
  })

  it('renders inside nested HTML structure', async () => {
    const tpl = html`<section><h1>Title</h1>${react(Greeting, () => ({ name: 'Nested' }))}</section>`
    await act(async () => {
      handle = mount(tpl, container, scope)
    })
    expect(container.querySelector('h1')!.textContent).toBe('Title')
    expect(container.querySelector('.react-greeting')!.textContent).toBe('Hello, Nested!')
  })

  it('wraps React root in a container element', async () => {
    const tpl = html`<div>${react(Greeting, () => ({ name: 'Layout' }))}</div>`
    await act(async () => {
      handle = mount(tpl, container, scope)
    })
    const bridgeContainer = container.querySelector('div > div')
    expect(bridgeContainer).not.toBeNull()
    expect(bridgeContainer!.querySelector('.react-greeting')).not.toBeNull()
  })
})

describe('react() directive — reactive props from host atoms', () => {
  it('updates React component when atom value changes', async () => {
    const nameAtom = atom({ factory: () => 'Alice' })
    await scope.resolve(nameAtom)
    const ctrl = scope.controller(nameAtom)

    const tpl = html`<div>${react(Greeting, () => ({ name: ctrl.get() }))}</div>`
    await act(async () => {
      handle = mount(tpl, container, scope)
    })
    expect(container.querySelector('.react-greeting')!.textContent).toBe('Hello, Alice!')

    await act(async () => {
      ctrl.set('Bob')
      await scope.flush()
    })
    expect(container.querySelector('.react-greeting')!.textContent).toBe('Hello, Bob!')
  })

  it('updates through watch cascade', async () => {
    const baseAtom = atom({ factory: () => 'v1' })
    const derivedAtom = atom({
      deps: { base: controller(baseAtom, { resolve: true, watch: true }) },
      factory: (_, { base }) => `derived-${base.get()}`,
    })

    await scope.resolve(derivedAtom)
    const derivedCtrl = scope.controller(derivedAtom)

    const tpl = html`<div>${react(Greeting, () => ({ name: derivedCtrl.get() }))}</div>`
    await act(async () => {
      handle = mount(tpl, container, scope)
    })
    expect(container.querySelector('.react-greeting')!.textContent).toBe('Hello, derived-v1!')

    await act(async () => {
      scope.controller(baseAtom).set('v2')
      await scope.flush()
    })
    expect(container.querySelector('.react-greeting')!.textContent).toBe('Hello, derived-v2!')
  })

  it('skips re-render when props reference is unchanged', async () => {
    let renderCount = 0
    const Tracked: FC<{ name: string }> = ({ name }) => {
      renderCount++
      return createElement('span', null, name)
    }

    const stableProps = { name: 'Stable' }
    const tpl = html`<div>${react(Tracked, () => stableProps)}</div>`
    await act(async () => {
      handle = mount(tpl, container, scope)
    })
    const initialCount = renderCount

    await act(async () => {
      await scope.flush()
    })
    expect(renderCount).toBe(initialCount)
  })
})

describe('react() directive — dispose and cleanup', () => {
  it('unmounts React root on dispose', async () => {
    const tpl = html`<div>${react(Greeting, () => ({ name: 'Cleanup' }))}</div>`
    await act(async () => {
      handle = mount(tpl, container, scope)
    })
    expect(container.querySelector('.react-greeting')).not.toBeNull()

    await act(async () => {
      handle!.dispose()
      handle = undefined
    })
    expect(container.innerHTML).toBe('')
  })

  it('stops updating after dispose', async () => {
    const nameAtom = atom({ factory: () => 'Before' })
    await scope.resolve(nameAtom)
    const ctrl = scope.controller(nameAtom)

    const tpl = html`<div>${react(Greeting, () => ({ name: ctrl.get() }))}</div>`
    await act(async () => {
      handle = mount(tpl, container, scope)
    })
    expect(container.querySelector('.react-greeting')!.textContent).toBe('Hello, Before!')

    await act(async () => {
      handle!.dispose()
      handle = undefined
    })

    ctrl.set('After')
    await scope.flush()
    expect(container.querySelector('.react-greeting')).toBeNull()
  })
})

describe('react() directive — multiple islands', () => {
  it('renders multiple React components in one template', async () => {
    const tpl = html`<div>${react(Greeting, () => ({ name: 'One' }))}${react(Counter, () => ({ label: 'Two' }))}</div>`
    await act(async () => {
      handle = mount(tpl, container, scope)
    })
    expect(container.querySelector('.react-greeting')!.textContent).toBe('Hello, One!')
    expect(container.querySelector('.react-counter')!.textContent).toBe('Counter: Two')
  })

  it('updates each island independently', async () => {
    const nameAtom = atom({ factory: () => 'A' })
    const labelAtom = atom({ factory: () => 'X' })
    await scope.resolve(nameAtom)
    await scope.resolve(labelAtom)
    const nameCtrl = scope.controller(nameAtom)
    const labelCtrl = scope.controller(labelAtom)

    const tpl = html`<div>
      ${react(Greeting, () => ({ name: nameCtrl.get() }))}
      ${react(Counter, () => ({ label: labelCtrl.get() }))}
    </div>`
    await act(async () => {
      handle = mount(tpl, container, scope)
    })

    await act(async () => {
      nameCtrl.set('B')
      await scope.flush()
    })
    expect(container.querySelector('.react-greeting')!.textContent).toBe('Hello, B!')
    expect(container.querySelector('.react-counter')!.textContent).toBe('Counter: X')

    await act(async () => {
      labelCtrl.set('Y')
      await scope.flush()
    })
    expect(container.querySelector('.react-counter')!.textContent).toBe('Counter: Y')
  })
})

describe('react() directive — bidirectional state', () => {
  it('React component reads atom via useAtom from shared scope', async () => {
    const countAtom = atom({ factory: () => 42 })
    await scope.resolve(countAtom)

    const Display: FC = () => {
      const value = useAtom(countAtom)
      return createElement('span', { className: 'react-display' }, `Value: ${value}`)
    }

    const tpl = html`<div>${react(Display, () => ({}))}</div>`
    await act(async () => {
      handle = mount(tpl, container, scope)
    })
    expect(container.querySelector('.react-display')!.textContent).toBe('Value: 42')
  })

  it('React component sets atom → host re-renders', async () => {
    const countAtom = atom({ factory: () => 0 })
    await scope.resolve(countAtom)
    const ctrl = scope.controller(countAtom)

    const Incrementer: FC = () => {
      const innerCtrl = useController(countAtom)
      return createElement('button', {
        className: 'react-btn',
        onClick: () => innerCtrl.update((n: number) => n + 1),
      }, 'inc')
    }

    const tpl = html`<div>
      <span class="host-display">${() => ctrl.get()}</span>
      ${react(Incrementer, () => ({}))}
    </div>`
    await act(async () => {
      handle = mount(tpl, container, scope)
    })
    expect(container.querySelector('.host-display')!.textContent).toBe('0')

    await act(async () => {
      container.querySelector('.react-btn')!.dispatchEvent(new Event('click', { bubbles: true }))
    })
    await act(async () => {
      await scope.flush()
    })
    expect(container.querySelector('.host-display')!.textContent).toBe('1')
  })
})

describe('react() directive — coexistence with other directives', () => {
  it('react island alongside reactive text', async () => {
    const valAtom = atom({ factory: () => 'host-val' })
    await scope.resolve(valAtom)
    const ctrl = scope.controller(valAtom)

    const tpl = html`<div>
      <span class="host">${() => ctrl.get()}</span>
      ${react(Greeting, () => ({ name: ctrl.get() }))}
    </div>`
    await act(async () => {
      handle = mount(tpl, container, scope)
    })
    expect(container.querySelector('.host')!.textContent).toBe('host-val')
    expect(container.querySelector('.react-greeting')!.textContent).toBe('Hello, host-val!')

    await act(async () => {
      ctrl.set('updated')
      await scope.flush()
    })
    expect(container.querySelector('.host')!.textContent).toBe('updated')
    expect(container.querySelector('.react-greeting')!.textContent).toBe('Hello, updated!')
  })

  it('react island alongside conditional rendering', async () => {
    const showAtom = atom({ factory: () => true })
    await scope.resolve(showAtom)
    const showCtrl = scope.controller(showAtom)

    const tpl = html`<div>
      ${() => showCtrl.get() ? html`<span class="cond">visible</span>` : null}
      ${react(Greeting, () => ({ name: 'Always' }))}
    </div>`
    await act(async () => {
      handle = mount(tpl, container, scope)
    })
    expect(container.querySelector('.cond')).not.toBeNull()
    expect(container.querySelector('.react-greeting')).not.toBeNull()

    await act(async () => {
      showCtrl.set(false)
      await scope.flush()
    })
    expect(container.querySelector('.cond')).toBeNull()
    expect(container.querySelector('.react-greeting')!.textContent).toBe('Hello, Always!')
  })
})

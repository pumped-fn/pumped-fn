import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { atom, createScope, type Lite } from '@pumped-fn/lite'
import { html, mount, list, type MountHandle } from '../src/index'

const adjectives = ['pretty', 'large', 'big', 'small', 'tall', 'short', 'long', 'handsome', 'plain', 'quaint']
const colors = ['red', 'yellow', 'blue', 'green', 'pink', 'brown', 'purple', 'white', 'black', 'orange']
const nouns = ['table', 'chair', 'house', 'bbq', 'desk', 'car', 'pony', 'cookie', 'sandwich', 'burger']

let nextId = 1
function buildData(count: number) {
  return Array.from({ length: count }, () => ({
    id: nextId++,
    label: `${adjectives[Math.random() * adjectives.length | 0]} ${colors[Math.random() * colors.length | 0]} ${nouns[Math.random() * nouns.length | 0]}`,
  }))
}

type Row = { id: number; label: string }

let scope: Lite.Scope
let container: HTMLElement
let handle: MountHandle | undefined

beforeEach(() => {
  nextId = 1
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

function mountTable(ctrl: Lite.Controller<Row[]>, selectedId: Lite.Controller<number>) {
  const tpl = html`<div>${list(
    () => ctrl.get(),
    row => row.id,
    row => html`<div class=${() => selectedId.get() === row.id ? 'danger' : ''} data-id=${row.id}><span class="col-md-1">${row.id}</span><span class="col-md-4">${row.label}</span></div>`,
  )}</div>`
  return mount(tpl, container, scope)
}

describe('js-framework-benchmark operations', () => {
  it('01: create 1000 rows', async () => {
    const dataAtom = atom({ factory: () => [] as Row[] })
    const selAtom = atom({ factory: () => 0 })
    await scope.resolve(dataAtom)
    await scope.resolve(selAtom)

    handle = mountTable(scope.controller(dataAtom), scope.controller(selAtom))
    expect(container.querySelectorAll('[data-id]').length).toBe(0)

    scope.controller(dataAtom).set(buildData(1000))
    await scope.flush()

    expect(container.querySelectorAll('[data-id]').length).toBe(1000)
    expect(container.querySelector('[data-id] .col-md-1')!.textContent).toBe('1')
  })

  it('02: replace all 1000 rows', async () => {
    const dataAtom = atom({ factory: () => buildData(1000) })
    const selAtom = atom({ factory: () => 0 })
    await scope.resolve(dataAtom)
    await scope.resolve(selAtom)

    handle = mountTable(scope.controller(dataAtom), scope.controller(selAtom))
    const firstRowBefore = container.querySelector('[data-id]')!

    scope.controller(dataAtom).set(buildData(1000))
    await scope.flush()

    expect(container.querySelectorAll('[data-id]').length).toBe(1000)
    expect(container.querySelector('[data-id]')).not.toBe(firstRowBefore)
  })

  it('03: partial update — replace items with updated labels', async () => {
    const data = buildData(1000)
    const dataAtom = atom({ factory: () => data })
    const selAtom = atom({ factory: () => 0 })
    await scope.resolve(dataAtom)
    await scope.resolve(selAtom)

    handle = mountTable(scope.controller(dataAtom), scope.controller(selAtom))

    const updated = data.map((row, i) =>
      i % 10 === 0 ? { ...row, id: nextId++, label: row.label + ' !!!' } : row
    )
    scope.controller(dataAtom).set(updated)
    await scope.flush()

    const rows = container.querySelectorAll('[data-id]')
    expect(rows[0].querySelector('.col-md-4')!.textContent).toContain('!!!')
    expect(rows[1].querySelector('.col-md-4')!.textContent).not.toContain('!!!')
    expect(rows.length).toBe(1000)
  })

  it('04: select row — highlight one row', async () => {
    const dataAtom = atom({ factory: () => buildData(1000) })
    const selAtom = atom({ factory: () => 0 })
    await scope.resolve(dataAtom)
    await scope.resolve(selAtom)

    handle = mountTable(scope.controller(dataAtom), scope.controller(selAtom))
    const ctrl = scope.controller(selAtom)
    const data = scope.controller(dataAtom).get()

    ctrl.set(data[4].id)
    await scope.flush()

    const rows = container.querySelectorAll('[data-id]')
    expect(rows[4].className).toBe('danger')
    expect(container.querySelectorAll('.danger').length).toBe(1)

    ctrl.set(data[9].id)
    await scope.flush()

    expect(rows[4].className).toBe('')
    expect(rows[9].className).toBe('danger')
  })

  it('05: swap rows 1 and 998', async () => {
    const data = buildData(1000)
    const dataAtom = atom({ factory: () => data })
    const selAtom = atom({ factory: () => 0 })
    await scope.resolve(dataAtom)
    await scope.resolve(selAtom)

    handle = mountTable(scope.controller(dataAtom), scope.controller(selAtom))

    const rows = container.querySelectorAll('[data-id]')
    const row1 = rows[1]
    const row998 = rows[998]

    const swapped = [...data]
    ;[swapped[1], swapped[998]] = [swapped[998], swapped[1]]
    scope.controller(dataAtom).set(swapped)
    await scope.flush()

    const after = container.querySelectorAll('[data-id]')
    expect(after[1]).toBe(row998)
    expect(after[998]).toBe(row1)
  })

  it('06: remove one row', async () => {
    const data = buildData(1000)
    const dataAtom = atom({ factory: () => data })
    const selAtom = atom({ factory: () => 0 })
    await scope.resolve(dataAtom)
    await scope.resolve(selAtom)

    handle = mountTable(scope.controller(dataAtom), scope.controller(selAtom))

    const row498 = container.querySelectorAll('[data-id]')[498]
    const row500 = container.querySelectorAll('[data-id]')[500]

    const removed = data.filter((_, i) => i !== 499)
    scope.controller(dataAtom).set(removed)
    await scope.flush()

    const after = container.querySelectorAll('[data-id]')
    expect(after.length).toBe(999)
    expect(after[498]).toBe(row498)
    expect(after[499]).toBe(row500)
  })

  it('08: append 1000 rows to existing 1000', async () => {
    const data = buildData(1000)
    const dataAtom = atom({ factory: () => data })
    const selAtom = atom({ factory: () => 0 })
    await scope.resolve(dataAtom)
    await scope.resolve(selAtom)

    handle = mountTable(scope.controller(dataAtom), scope.controller(selAtom))

    const firstRowBefore = container.querySelector('[data-id]')!
    const append = buildData(1000)
    scope.controller(dataAtom).set([...data, ...append])
    await scope.flush()

    const after = container.querySelectorAll('[data-id]')
    expect(after.length).toBe(2000)
    expect(after[0]).toBe(firstRowBefore)
  })

  it('09: clear all rows', async () => {
    const dataAtom = atom({ factory: () => buildData(1000) })
    const selAtom = atom({ factory: () => 0 })
    await scope.resolve(dataAtom)
    await scope.resolve(selAtom)

    handle = mountTable(scope.controller(dataAtom), scope.controller(selAtom))
    expect(container.querySelectorAll('[data-id]').length).toBe(1000)

    scope.controller(dataAtom).set([])
    await scope.flush()

    expect(container.querySelectorAll('[data-id]').length).toBe(0)
  })

  it('10: reverse order preserving identity', async () => {
    const data = buildData(100)
    const dataAtom = atom({ factory: () => data })
    const selAtom = atom({ factory: () => 0 })
    await scope.resolve(dataAtom)
    await scope.resolve(selAtom)

    handle = mountTable(scope.controller(dataAtom), scope.controller(selAtom))

    const origRows = Array.from(container.querySelectorAll('[data-id]'))

    scope.controller(dataAtom).set([...data].reverse())
    await scope.flush()

    const after = container.querySelectorAll('[data-id]')
    expect(after.length).toBe(100)
    for (let i = 0; i < 100; i++) {
      expect(after[i]).toBe(origRows[99 - i])
    }
  })

  it('11: create/clear 10 cycles — no leaks', async () => {
    const dataAtom = atom({ factory: () => [] as Row[] })
    const selAtom = atom({ factory: () => 0 })
    await scope.resolve(dataAtom)
    await scope.resolve(selAtom)

    handle = mountTable(scope.controller(dataAtom), scope.controller(selAtom))

    for (let cycle = 0; cycle < 10; cycle++) {
      scope.controller(dataAtom).set(buildData(100))
      await scope.flush()
      expect(container.querySelectorAll('[data-id]').length).toBe(100)

      scope.controller(dataAtom).set([])
      await scope.flush()
      expect(container.querySelectorAll('[data-id]').length).toBe(0)
    }

    const wrapper = container.querySelector('div')!
    const nonCommentChildren = Array.from(wrapper.childNodes).filter(n => n.nodeType !== Node.COMMENT_NODE)
    expect(nonCommentChildren.length).toBe(0)
  })

  it('12: mixed add/remove/reorder', async () => {
    const data = buildData(10)
    const dataAtom = atom({ factory: () => data })
    const selAtom = atom({ factory: () => 0 })
    await scope.resolve(dataAtom)
    await scope.resolve(selAtom)

    handle = mountTable(scope.controller(dataAtom), scope.controller(selAtom))

    const origRow1 = container.querySelectorAll('[data-id]')[1]
    const origRow3 = container.querySelectorAll('[data-id]')[3]

    const newData = [data[9], ...buildData(1), data[1], data[4], data[3], ...buildData(1), data[0]]
    scope.controller(dataAtom).set(newData)
    await scope.flush()

    const after = container.querySelectorAll('[data-id]')
    expect(after.length).toBe(7)
    expect(after[2]).toBe(origRow1)
    expect(after[4]).toBe(origRow3)
  })
})

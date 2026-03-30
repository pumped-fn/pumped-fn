import { describe, it, expect } from 'vitest'
import { atom, createScope, type Lite } from '@pumped-fn/lite'
import { html, mount, list, type MountHandle } from '../src/index'

const adjectives = ['pretty', 'large', 'big', 'small', 'tall', 'short', 'long', 'handsome', 'plain', 'quaint']
const colors = ['red', 'yellow', 'blue', 'green', 'pink', 'brown', 'purple', 'white', 'black', 'orange']
const nouns = ['table', 'chair', 'house', 'bbq', 'desk', 'car', 'pony', 'cookie', 'sandwich', 'burger']

let nextId = 1
type Row = { id: number; label: string }

function buildData(count: number): Row[] {
  return Array.from({ length: count }, () => ({
    id: nextId++,
    label: `${adjectives[Math.random() * adjectives.length | 0]} ${colors[Math.random() * colors.length | 0]} ${nouns[Math.random() * nouns.length | 0]}`,
  }))
}

function mountTable(scope: Lite.Scope, container: HTMLElement, ctrl: Lite.Controller<Row[]>) {
  return mount(html`<div>${list(
    () => ctrl.get(),
    row => row.id,
    row => html`<div data-id=${row.id}><span>${row.id}</span><span>${row.label}</span></div>`,
  )}</div>`, container, scope)
}

async function measure(fn: () => Promise<void>, warmup = 3, runs = 10): Promise<number> {
  for (let i = 0; i < warmup; i++) await fn()
  const times: number[] = []
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    await fn()
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  return times[Math.floor(times.length / 2)]
}

describe('performance baseline', { timeout: 30000 }, () => {
  it('create 1000 rows', async () => {
    const ms = await measure(async () => {
      nextId = 1
      const scope = createScope()
      const dataAtom = atom({ factory: () => [] as Row[] })
      await scope.resolve(dataAtom)
      const ctrl = scope.controller(dataAtom)
      const container = document.createElement('div')
      const handle = mountTable(scope, container, ctrl)
      ctrl.set(buildData(1000))
      await scope.flush()
      handle.dispose()
      await scope.dispose()
    })
    console.log(`METRIC create_1000_ms=${ms.toFixed(1)}`)
    expect(ms).toBeLessThan(500)
  })

  it('replace all 1000 rows', async () => {
    const ms = await measure(async () => {
      nextId = 1
      const scope = createScope()
      const data = buildData(1000)
      const dataAtom = atom({ factory: () => data })
      await scope.resolve(dataAtom)
      const ctrl = scope.controller(dataAtom)
      const container = document.createElement('div')
      const handle = mountTable(scope, container, ctrl)
      ctrl.set(buildData(1000))
      await scope.flush()
      handle.dispose()
      await scope.dispose()
    })
    console.log(`METRIC replace_1000_ms=${ms.toFixed(1)}`)
    expect(ms).toBeLessThan(800)
  })

  it('swap rows 1 and 998', async () => {
    nextId = 1
    const scope = createScope()
    const data = buildData(1000)
    const dataAtom = atom({ factory: () => data })
    await scope.resolve(dataAtom)
    const ctrl = scope.controller(dataAtom)
    const container = document.createElement('div')
    const handle = mountTable(scope, container, ctrl)

    const ms = await measure(async () => {
      const d = [...ctrl.get()]
      ;[d[1], d[998]] = [d[998], d[1]]
      ctrl.set(d)
      await scope.flush()
    }, 2, 20)
    console.log(`METRIC swap_rows_ms=${ms.toFixed(2)}`)
    handle.dispose()
    await scope.dispose()
    expect(ms).toBeLessThan(50)
  })

  it('remove one row', async () => {
    nextId = 1
    const scope = createScope()
    const data = buildData(1000)
    const dataAtom = atom({ factory: () => data })
    await scope.resolve(dataAtom)
    const ctrl = scope.controller(dataAtom)
    const container = document.createElement('div')
    const handle = mountTable(scope, container, ctrl)

    const ms = await measure(async () => {
      ctrl.set(ctrl.get().filter((_, i) => i !== 499))
      await scope.flush()
    }, 2, 10)
    console.log(`METRIC remove_one_ms=${ms.toFixed(2)}`)
    handle.dispose()
    await scope.dispose()
    expect(ms).toBeLessThan(50)
  })

  it('clear 1000 rows', async () => {
    const ms = await measure(async () => {
      nextId = 1
      const scope = createScope()
      const data = buildData(1000)
      const dataAtom = atom({ factory: () => data })
      await scope.resolve(dataAtom)
      const ctrl = scope.controller(dataAtom)
      const container = document.createElement('div')
      const handle = mountTable(scope, container, ctrl)
      ctrl.set([])
      await scope.flush()
      handle.dispose()
      await scope.dispose()
    })
    console.log(`METRIC clear_1000_ms=${ms.toFixed(1)}`)
    expect(ms).toBeLessThan(500)
  })

  it('append 1000 to 1000', async () => {
    const ms = await measure(async () => {
      nextId = 1
      const scope = createScope()
      const data = buildData(1000)
      const dataAtom = atom({ factory: () => data })
      await scope.resolve(dataAtom)
      const ctrl = scope.controller(dataAtom)
      const container = document.createElement('div')
      const handle = mountTable(scope, container, ctrl)
      ctrl.set([...data, ...buildData(1000)])
      await scope.flush()
      handle.dispose()
      await scope.dispose()
    })
    console.log(`METRIC append_1000_ms=${ms.toFixed(1)}`)
    expect(ms).toBeLessThan(800)
  })
})

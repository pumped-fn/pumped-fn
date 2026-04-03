import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createScope, type Lite } from '@pumped-fn/lite'
import { mount, $, atoms, type MountHandle } from '../src/index'

interface Todo {
  id: number
  text: string
  done: boolean
}

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

describe('atoms() collection primitive', () => {
  it('creates an empty collection', () => {
    const list = atoms<Todo>((t) => t.id)
    expect(list.keys()).toEqual([])
  })

  it('initializes with items', () => {
    const initial = [
      { id: 1, text: 'a', done: false },
      { id: 2, text: 'b', done: true },
    ]
    const list = atoms<Todo>((t) => t.id, initial)
    expect(list.keys()).toEqual([1, 2])
    expect(list.get(1)).toEqual({ id: 1, text: 'a', done: false })
  })

  it('add() appends items and fires structure listeners', () => {
    const list = atoms<Todo>((t) => t.id)
    const events: string[] = []
    list.onStructure(() => events.push('structure'))

    list.add({ id: 1, text: 'buy milk', done: false })
    expect(list.keys()).toEqual([1])
    expect(events).toEqual(['structure'])

    list.add({ id: 2, text: 'walk dog', done: false }, { id: 3, text: 'read', done: true })
    expect(list.keys()).toEqual([1, 2, 3])
    expect(events).toEqual(['structure', 'structure'])
  })

  it('add() is idempotent for existing keys', () => {
    const list = atoms<Todo>((t) => t.id, [{ id: 1, text: 'a', done: false }])
    const events: string[] = []
    list.onStructure(() => events.push('structure'))

    list.add({ id: 1, text: 'updated', done: true })
    expect(list.keys()).toEqual([1])
    expect(list.get(1)).toEqual({ id: 1, text: 'a', done: false })
    expect(events).toEqual([])
  })

  it('remove() removes item and fires structure listeners', () => {
    const list = atoms<Todo>((t) => t.id, [
      { id: 1, text: 'a', done: false },
      { id: 2, text: 'b', done: false },
    ])
    const events: string[] = []
    list.onStructure(() => events.push('structure'))

    list.remove(1)
    expect(list.keys()).toEqual([2])
    expect(events).toEqual(['structure'])
  })

  it('remove() is a no-op for missing keys', () => {
    const list = atoms<Todo>((t) => t.id)
    const events: string[] = []
    list.onStructure(() => events.push('structure'))

    list.remove(99)
    expect(events).toEqual([])
  })

  it('set() updates item value and fires item listeners, not structure', () => {
    const list = atoms<Todo>((t) => t.id, [{ id: 1, text: 'a', done: false }])
    const structureEvents: string[] = []
    const itemEvents: string[] = []
    list.onStructure(() => structureEvents.push('structure'))
    list.onItem(1, () => itemEvents.push('item'))

    list.set(1, { id: 1, text: 'updated', done: true })
    expect(list.get(1)).toEqual({ id: 1, text: 'updated', done: true })
    expect(structureEvents).toEqual([])
    expect(itemEvents).toEqual(['item'])
  })

  it('set() skips notification when value is shallowEqual', () => {
    const list = atoms<Todo>((t) => t.id, [{ id: 1, text: 'a', done: false }])
    const itemEvents: string[] = []
    list.onItem(1, () => itemEvents.push('item'))

    list.set(1, { id: 1, text: 'a', done: false })
    expect(itemEvents).toEqual([])
  })

  it('update() mutates via function and fires item listeners only', () => {
    const list = atoms<Todo>((t) => t.id, [{ id: 1, text: 'a', done: false }])
    const structureEvents: string[] = []
    const itemEvents: string[] = []
    list.onStructure(() => structureEvents.push('structure'))
    list.onItem(1, () => itemEvents.push('item'))

    list.update(1, (t) => ({ ...t, done: true }))
    expect(list.get(1).done).toBe(true)
    expect(structureEvents).toEqual([])
    expect(itemEvents).toEqual(['item'])
  })

  it('reset() replaces all, fires item listeners for changed items', () => {
    const initial = [
      { id: 1, text: 'a', done: false },
      { id: 2, text: 'b', done: false },
    ]
    const list = atoms<Todo>((t) => t.id, initial)
    const structureEvents: string[] = []
    const item1Events: string[] = []
    const item2Events: string[] = []
    list.onStructure(() => structureEvents.push('structure'))
    list.onItem(1, () => item1Events.push('item1'))
    list.onItem(2, () => item2Events.push('item2'))

    list.reset([
      { id: 1, text: 'a', done: true },
      { id: 2, text: 'b', done: false },
      { id: 3, text: 'c', done: false },
    ])
    expect(list.keys()).toEqual([1, 2, 3])
    expect(item1Events).toEqual(['item1'])
    expect(item2Events).toEqual([])
    expect(structureEvents).toEqual(['structure'])
  })
})

describe('$(atoms, renderFn) DOM binding', () => {
  it('renders initial items', () => {
    const list = atoms<Todo>((t) => t.id, [
      { id: 1, text: 'buy milk', done: false },
      { id: 2, text: 'walk dog', done: false },
    ])

    handle = mount(
      <ul>{$(list, (_key, getItem) => <li>{() => getItem().text}</li>)}</ul>,
      container,
      scope,
    )

    const items = container.querySelectorAll('li')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toBe('buy milk')
    expect(items[1].textContent).toBe('walk dog')
  })

  it('add() inserts a new DOM node without touching others', () => {
    const list = atoms<Todo>((t) => t.id, [{ id: 1, text: 'a', done: false }])

    handle = mount(
      <ul>{$(list, (_key, getItem) => <li>{() => getItem().text}</li>)}</ul>,
      container,
      scope,
    )

    const originalItem = container.querySelector('li')!

    list.add({ id: 2, text: 'b', done: false })

    const items = container.querySelectorAll('li')
    expect(items).toHaveLength(2)
    expect(items[0]).toBe(originalItem)
    expect(items[1].textContent).toBe('b')
  })

  it('remove() removes the correct DOM node', () => {
    const list = atoms<Todo>((t) => t.id, [
      { id: 1, text: 'a', done: false },
      { id: 2, text: 'b', done: false },
      { id: 3, text: 'c', done: false },
    ])

    handle = mount(
      <ul>{$(list, (_key, getItem) => <li>{() => getItem().text}</li>)}</ul>,
      container,
      scope,
    )

    list.remove(2)

    const items = container.querySelectorAll('li')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toBe('a')
    expect(items[1].textContent).toBe('c')
  })

  it('set() updates only the target item DOM, not others', () => {
    const list = atoms<Todo>((t) => t.id, [
      { id: 1, text: 'a', done: false },
      { id: 2, text: 'b', done: false },
    ])

    handle = mount(
      <ul>{$(list, (_key, getItem) => <li>{() => getItem().text}</li>)}</ul>,
      container,
      scope,
    )

    const item1Node = container.querySelectorAll('li')[0]
    const item2Node = container.querySelectorAll('li')[1]

    list.set(1, { id: 1, text: 'updated-a', done: true })

    const items = container.querySelectorAll('li')
    expect(items[0].textContent).toBe('updated-a')
    expect(items[1].textContent).toBe('b')
    expect(items[0]).toBe(item1Node)
    expect(items[1]).toBe(item2Node)
  })

  it('update() mutates target item DOM only', () => {
    const list = atoms<Todo>((t) => t.id, [
      { id: 1, text: 'a', done: false },
      { id: 2, text: 'b', done: false },
    ])

    handle = mount(
      <ul>{$(list, (_key, getItem) => <li>{() => getItem().done ? 'done' : getItem().text}</li>)}</ul>,
      container,
      scope,
    )

    list.update(2, (t) => ({ ...t, done: true }))

    const items = container.querySelectorAll('li')
    expect(items[0].textContent).toBe('a')
    expect(items[1].textContent).toBe('done')
  })

  it('reset() handles add, remove, and update in one pass', () => {
    const list = atoms<Todo>((t) => t.id, [
      { id: 1, text: 'a', done: false },
      { id: 2, text: 'b', done: false },
    ])

    handle = mount(
      <ul>{$(list, (_key, getItem) => <li>{() => getItem().text}</li>)}</ul>,
      container,
      scope,
    )

    list.reset([
      { id: 1, text: 'updated-a', done: true },
      { id: 3, text: 'c', done: false },
    ])

    const items = container.querySelectorAll('li')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toBe('updated-a')
    expect(items[1].textContent).toBe('c')
  })

  it('reorders items when reset() changes key order', () => {
    const list = atoms<Todo>((t) => t.id, [
      { id: 1, text: 'a', done: false },
      { id: 2, text: 'b', done: false },
      { id: 3, text: 'c', done: false },
    ])

    handle = mount(
      <ul>{$(list, (_key, getItem) => <li>{() => getItem().text}</li>)}</ul>,
      container,
      scope,
    )

    list.reset([
      { id: 3, text: 'c', done: false },
      { id: 1, text: 'a', done: false },
      { id: 2, text: 'b', done: false },
    ])

    const items = container.querySelectorAll('li')
    expect(items[0].textContent).toBe('c')
    expect(items[1].textContent).toBe('a')
    expect(items[2].textContent).toBe('b')
  })

  it('dispose() cleans up structure subscriptions', () => {
    const list = atoms<Todo>((t) => t.id, [{ id: 1, text: 'a', done: false }])

    handle = mount(
      <ul>{$(list, (_key, getItem) => <li>{() => getItem().text}</li>)}</ul>,
      container,
      scope,
    )

    handle.dispose()
    handle = undefined

    list.add({ id: 2, text: 'b', done: false })
    expect(container.querySelectorAll('li')).toHaveLength(0)
  })
})

import { shallowEqual } from '@pumped-fn/lite'

const ATOMS_BRAND = Symbol('lite-ui-atoms')

interface ItemSlot<T> {
  value: T
  listeners: Set<() => void>
}

export interface AtomsCtrl<T = unknown> {
  readonly [ATOMS_BRAND]: true
  keys(): (string | number)[]
  get(key: string | number): T
  onStructure(fn: () => void): () => void
  onItem(key: string | number, fn: () => void): () => void
  add(...items: T[]): void
  remove(key: string | number): void
  update(key: string | number, fn: (prev: T) => T): void
  set(key: string | number, value: T): void
  reset(items: T[]): void
}

export function atoms<T>(keyFn: (item: T) => string | number, initial?: T[]): AtomsCtrl<T> {
  const slots = new Map<string | number, ItemSlot<T>>()
  const orderedKeys: (string | number)[] = []
  const structureListeners = new Set<() => void>()

  if (initial) {
    for (const item of initial) {
      const key = keyFn(item)
      slots.set(key, { value: item, listeners: new Set() })
      orderedKeys.push(key)
    }
  }

  function notifyAll(set: Set<() => void>) {
    for (const fn of [...set]) fn()
  }

  return {
    [ATOMS_BRAND]: true,
    keys() { return orderedKeys.slice() },
    get(key) { return slots.get(key)!.value },
    onStructure(fn) {
      structureListeners.add(fn)
      return () => structureListeners.delete(fn)
    },
    onItem(key, fn) {
      const slot = slots.get(key)
      if (!slot) return () => {}
      slot.listeners.add(fn)
      return () => slot.listeners.delete(fn)
    },
    add(...items) {
      let changed = false
      for (const item of items) {
        const key = keyFn(item)
        if (!slots.has(key)) {
          slots.set(key, { value: item, listeners: new Set() })
          orderedKeys.push(key)
          changed = true
        }
      }
      if (changed) notifyAll(structureListeners)
    },
    remove(key) {
      if (!slots.has(key)) return
      slots.delete(key)
      const idx = orderedKeys.indexOf(key)
      if (idx !== -1) orderedKeys.splice(idx, 1)
      notifyAll(structureListeners)
    },
    update(key, fn) {
      const slot = slots.get(key)
      if (!slot) return
      const next = fn(slot.value)
      if (shallowEqual(next, slot.value)) return
      slot.value = next
      notifyAll(slot.listeners)
    },
    set(key, value) {
      const slot = slots.get(key)
      if (!slot) return
      if (shallowEqual(value, slot.value)) return
      slot.value = value
      notifyAll(slot.listeners)
    },
    reset(items) {
      const newKeySet = new Set(items.map(keyFn))
      for (let i = orderedKeys.length - 1; i >= 0; i--) {
        if (!newKeySet.has(orderedKeys[i])) {
          slots.delete(orderedKeys[i])
          orderedKeys.splice(i, 1)
        }
      }
      const existingSet = new Set(orderedKeys)
      while (orderedKeys.length > 0) orderedKeys.pop()
      for (const item of items) {
        const key = keyFn(item)
        if (existingSet.has(key)) {
          const slot = slots.get(key)!
          if (!shallowEqual(item, slot.value)) {
            slot.value = item
            notifyAll(slot.listeners)
          }
        } else {
          slots.set(key, { value: item, listeners: new Set() })
        }
        orderedKeys.push(key)
      }
      notifyAll(structureListeners)
    },
  }
}

export function isAtomsCtrl(v: unknown): v is AtomsCtrl<unknown> {
  return v != null && typeof v === 'object' && ATOMS_BRAND in (v as object)
}

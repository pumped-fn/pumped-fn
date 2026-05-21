type PatchValue<T> = T extends object ? Partial<T> : never

interface Store<T> {
  readonly disposed: boolean
  get(): T
  getSnapshot(): T
  subscribe(listener: () => void): () => void
  set(value: T): void
  update(fn: (prev: T) => T): void
  patch(value: PatchValue<T>): void
  dispose(): void
}

function notify(listeners: Set<() => void>): void {
  if (listeners.size === 0) return
  for (const listener of [...listeners]) listener()
}

function createStore<T>(initial: T): Store<T> {
  let current = initial
  let disposed = false
  const listeners = new Set<() => void>()

  const assertOpen = () => {
    if (disposed) throw new Error("Scoped value is disposed")
  }

  return {
    get disposed() {
      return disposed
    },
    get: () => current,
    getSnapshot: () => current,
    subscribe(listener) {
      assertOpen()
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set(value) {
      assertOpen()
      current = value
      notify(listeners)
    },
    update(fn) {
      assertOpen()
      current = fn(current)
      notify(listeners)
    },
    patch(value) {
      assertOpen()
      current = { ...(current as object), ...(value as object) } as T
      notify(listeners)
    },
    dispose() {
      if (disposed) return
      disposed = true
      notify(listeners)
      listeners.clear()
    },
  }
}

export { createStore }
export type { PatchValue, Store }

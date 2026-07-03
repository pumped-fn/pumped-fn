export interface DevRunner<T> {
  invalidate(): void
  get(): Promise<T>
  disposeCurrent(): Promise<void>
}

export function createDevRunner<T>(load: () => Promise<T>, dispose: (value: T) => Promise<void>): DevRunner<T> {
  let pending: Promise<T> | undefined
  let current: T | undefined

  async function rebuild(): Promise<T> {
    const previous = current
    const value = await load()
    current = value
    if (previous !== undefined) await dispose(previous)
    return value
  }

  function get(): Promise<T> {
    pending ??= rebuild().catch((error) => {
      pending = undefined
      throw error
    })
    return pending
  }

  function invalidate() {
    pending = undefined
  }

  async function disposeCurrent() {
    if (current === undefined) return
    const value = current
    current = undefined
    await dispose(value)
  }

  return { invalidate, get, disposeCurrent }
}

export interface DevRunner<T> {
  invalidate(): void
  get(): Promise<T>
  disposeCurrent(): Promise<void>
}

export function createDevRunner<T>(load: () => Promise<T>, dispose: (value: T) => Promise<void>): DevRunner<T> {
  let pending: Promise<T> | undefined
  let current: T | undefined
  let chain: Promise<void> = Promise.resolve()

  async function step(): Promise<T> {
    const previous = current
    const value = await load()
    current = value
    if (previous !== undefined) await dispose(previous)
    return value
  }

  function get(): Promise<T> {
    if (pending) return pending
    const attempt = chain.then(step)
    chain = attempt.then(
      () => undefined,
      () => undefined
    )
    const guarded: Promise<T> = attempt.catch((error) => {
      if (pending === guarded) pending = undefined
      throw error
    })
    pending = guarded
    return guarded
  }

  function invalidate() {
    pending = undefined
  }

  async function disposeCurrent() {
    await chain.catch(() => undefined)
    if (current === undefined) return
    const value = current
    current = undefined
    await dispose(value)
  }

  return { invalidate, get, disposeCurrent }
}

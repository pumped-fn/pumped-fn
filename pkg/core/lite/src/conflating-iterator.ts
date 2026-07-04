type Pending<T> = { resolve(result: IteratorResult<T, undefined>): void; reject(error: unknown): void }
export type ConflatingAsyncIterable<T> = AsyncIterable<T> & { push(value: T): void; fail(error: unknown): void; close(): void; onClose(fn: () => void): () => void }
const done: IteratorReturnResult<undefined> = { done: true, value: undefined }
export function createConflatingAsyncIterable<T>(): ConflatingAsyncIterable<T> {
  let pending: Pending<T> | undefined
  let latest: T | undefined
  let hasLatest = false
  let error: unknown
  let hasError = false
  let closed = false
  const closeFns = new Set<() => void>()
  const stream = { next, return: finish, push, fail, close, onClose }
  Reflect.set(stream, Symbol.asyncIterator, () => stream)
  return stream as unknown as ConflatingAsyncIterable<T>
  function next(): Promise<IteratorResult<T, undefined>> {
    if (closed) return Promise.resolve(done)
    if (hasError) {
      hasError = false
      return Promise.reject(error)
    }
    if (!hasLatest) {
      return new Promise((resolve, reject) => {
        pending = { resolve, reject }
      })
    }
    const value = latest as T
    latest = undefined
    hasLatest = false
    return Promise.resolve({ done: false, value })
  }
  function finish(): Promise<IteratorResult<T, undefined>> {
    close()
    return Promise.resolve(done)
  }
  function push(value: T): void {
    if (closed) return
    hasError = false
    if (!pending) {
      latest = value
      hasLatest = true
      return
    }
    pending.resolve({ done: false, value })
    pending = undefined
  }
  function fail(errorValue: unknown): void {
    if (closed) return
    latest = undefined
    hasLatest = false
    if (!pending) {
      error = errorValue
      hasError = true
      return
    }
    pending.reject(errorValue)
    pending = undefined
  }
  function close(): void {
    if (closed) return
    closed = true
    latest = undefined
    hasLatest = false
    hasError = false
    const closing = pending
    pending = undefined
    const fns = [...closeFns]
    closeFns.clear()
    for (let i = 0; i < fns.length; i++) fns[i]!()
    closing?.resolve(done)
  }
  function onClose(fn: () => void): () => void {
    if (closed) {
      fn()
      return () => {}
    }
    closeFns.add(fn)
    return () => closeFns.delete(fn)
  }
}

type Pending<T> = { resolve(result: IteratorResult<T, undefined>): void; reject(error: unknown): void }
export type ConflatingAsyncIterable<T> = AsyncIterable<T> & { push(value: T): void; fail(error: unknown): void; close(): void; onClose(fn: () => void): () => void }
const done: IteratorReturnResult<undefined> = { done: true, value: undefined }
export function createConflatingAsyncIterable<T>(): ConflatingAsyncIterable<T> {
  const pendings: Pending<T>[] = []
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
        pendings.push({ resolve, reject })
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
    const pending = pendings.shift()
    if (!pending) {
      latest = value
      hasLatest = true
      return
    }
    pending.resolve({ done: false, value })
  }
  function fail(errorValue: unknown): void {
    if (closed) return
    latest = undefined
    hasLatest = false
    const pending = pendings.shift()
    if (!pending) {
      error = errorValue
      hasError = true
      return
    }
    pending.reject(errorValue)
  }
  function close(): void {
    if (closed) return
    closed = true
    latest = undefined
    hasLatest = false
    hasError = false
    const closing = pendings.splice(0)
    const fns = [...closeFns]
    closeFns.clear()
    for (let i = 0; i < fns.length; i++) fns[i]!()
    for (let i = 0; i < closing.length; i++) closing[i]!.resolve(done)
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

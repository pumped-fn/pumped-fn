type Pending<T> = { resolve(result: IteratorResult<T, undefined>): void; reject(error: unknown): void }
type CloseListener = { fn: (...args: any[]) => void; params: unknown[] }
export type Latest<T> = AsyncIterable<T> & {
  push(value: T): void
  fail(error: unknown): void
  close(): void
  onClose<Args extends unknown[]>(fn: (...args: Args) => void, ...params: Args): () => void
}
const done: IteratorReturnResult<undefined> = { done: true, value: undefined }
export function latest<T>(): Latest<T> {
  const pendings: Pending<T>[] = []
  let value: T | undefined
  let hasValue = false
  let error: unknown
  let hasError = false
  let closed = false
  const closeFns = new Set<CloseListener>()
  const stream = { next, return: finish, push, fail, close, onClose, [Symbol.asyncIterator]: () => stream }
  return stream as Latest<T>
  function next(): Promise<IteratorResult<T, undefined>> {
    if (closed) return Promise.resolve(done)
    if (hasError) {
      hasError = false
      return Promise.reject(error)
    }
    if (!hasValue) {
      return new Promise((resolve, reject) => {
        pendings.push({ resolve, reject })
      })
    }
    const current = value as T
    value = undefined
    hasValue = false
    return Promise.resolve({ done: false, value: current })
  }
  function finish(): Promise<IteratorResult<T, undefined>> {
    close()
    return Promise.resolve(done)
  }
  function push(next: T): void {
    if (closed) return
    hasError = false
    const pending = pendings.shift()
    if (!pending) {
      value = next
      hasValue = true
      return
    }
    pending.resolve({ done: false, value: next })
  }
  function fail(cause: unknown): void {
    if (closed) return
    value = undefined
    hasValue = false
    const pending = pendings.shift()
    if (!pending) {
      error = cause
      hasError = true
      return
    }
    pending.reject(cause)
  }
  function close(): void {
    if (closed) return
    closed = true
    value = undefined
    hasValue = false
    hasError = false
    const closing = pendings.splice(0)
    const fns = [...closeFns]
    closeFns.clear()
    for (let i = 0; i < fns.length; i++) fns[i]!.fn(...fns[i]!.params)
    for (let i = 0; i < closing.length; i++) closing[i]!.resolve(done)
  }
  function onClose<Args extends unknown[]>(fn: (...args: Args) => void, ...params: Args): () => void {
    const listener = { fn, params }
    if (closed) {
      fn(...params)
      return () => {}
    }
    closeFns.add(listener)
    return () => closeFns.delete(listener)
  }
}

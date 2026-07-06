type Pending<T> = {
  resolve(result: IteratorResult<T, undefined>): void
}

export interface PushFeed<T> extends AsyncIterable<T>, AsyncIterator<T, undefined> {
  push(value: T): void
  close(): void
  return(): Promise<IteratorReturnResult<undefined>>
}

export function pushFeed<T>(): PushFeed<T> {
  const values: T[] = []
  let pending: Pending<T> | undefined
  let closed = false
  const feed = {
    next(): Promise<IteratorResult<T, undefined>> {
      if (values.length > 0) return Promise.resolve({ done: false, value: values.shift()! })
      if (closed) return Promise.resolve({ done: true, value: undefined })
      return new Promise((resolve) => {
        pending = { resolve }
      })
    },
    push(value: T): void {
      if (closed) throw new Error("Feed is closed")
      if (!pending) {
        values.push(value)
        return
      }
      const current = pending
      pending = undefined
      current.resolve({ done: false, value })
    },
    close(): void {
      closed = true
      const current = pending
      pending = undefined
      current?.resolve({ done: true, value: undefined })
    },
    return(): Promise<IteratorReturnResult<undefined>> {
      feed.close()
      return Promise.resolve({ done: true, value: undefined })
    },
    [Symbol.asyncIterator](): AsyncIterator<T, undefined> {
      return feed
    },
  } satisfies PushFeed<T>
  return feed
}

export function latestFeed<T>(): PushFeed<T> {
  let value: T | undefined
  let hasValue = false
  let pending: Pending<T> | undefined
  let closed = false
  const feed = {
    next(): Promise<IteratorResult<T, undefined>> {
      if (hasValue) {
        const current = value as T
        value = undefined
        hasValue = false
        return Promise.resolve({ done: false, value: current })
      }
      if (closed) return Promise.resolve({ done: true, value: undefined })
      return new Promise((resolve) => {
        pending = { resolve }
      })
    },
    push(next: T): void {
      if (closed) throw new Error("Feed is closed")
      if (!pending) {
        value = next
        hasValue = true
        return
      }
      const current = pending
      pending = undefined
      current.resolve({ done: false, value: next })
    },
    close(): void {
      closed = true
      const current = pending
      pending = undefined
      current?.resolve({ done: true, value: undefined })
    },
    return(): Promise<IteratorReturnResult<undefined>> {
      feed.close()
      return Promise.resolve({ done: true, value: undefined })
    },
    [Symbol.asyncIterator](): AsyncIterator<T, undefined> {
      return feed
    },
  } satisfies PushFeed<T>
  return feed
}

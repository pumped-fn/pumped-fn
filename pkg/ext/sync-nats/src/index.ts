import { Buffer } from "node:buffer"
import { type KvEntry, type KvWatchOptions } from "@nats-io/kv"
import { type Sync } from "@pumped-fn/lite-extension-sync"

export namespace Nats {
  export interface Options {
    readonly prefix?: string
    readonly onError?: (error: unknown, event: WatchError) => void
    readonly retry?: false | Retry
  }

  export interface WatchError {
    readonly attempts: number
    readonly terminal: boolean
  }

  export interface Retry {
    readonly attempts?: number
    readonly delayMs?: number
  }

  export type Watch = AsyncIterable<KvEntry> & { stop(): void }

  export interface Store {
    get(key: string): Promise<KvEntry | null>
    create(key: string, data: Uint8Array): Promise<number>
    update(key: string, data: Uint8Array, version: number): Promise<number>
    watch(options?: KvWatchOptions): Promise<Watch>
  }

  export interface Wire {
    readonly peer: string
    readonly value: Sync.Value
  }
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const stale = new Set([10071, 10164])
const closed = new Error("NATS KV watch closed")

interface WatchState {
  closed: boolean
  revision: number
  watch: Nats.Watch | undefined
  timer: ReturnType<typeof setTimeout> | undefined
  wake: (() => void) | undefined
}

function kv(store: Nats.Store, options?: Nats.Options): Sync.Transport {
  const prefix = options?.prefix ?? "sync"

  return {
    async read(key) {
      const entry = await store.get(entryKey(prefix, key))
      if (!entry || entry.operation !== "PUT") return undefined
      return decode(key, entry)
    },
    async write(message) {
      const key = entryKey(prefix, message.key)
      const payload = encode(message)
      try {
        const current = await store.get(key)
        const version = current && current.operation === "PUT"
          ? await store.update(key, payload, current.revision)
          : await store.create(key, payload)
        return { version }
      } catch (error) {
        if (!isStale(error)) throw error
        const conflict = await store.get(key)
        if (!conflict || conflict.operation !== "PUT") throw error
        return { conflict: decode(message.key, conflict) }
      }
    },
    async subscribe(key, listener) {
      const subject = entryKey(prefix, key)
      const state: WatchState = {
        closed: false,
        revision: 0,
        watch: undefined,
        timer: undefined,
        wake: undefined,
      }
      void pump(store, subject, key, state, listener, options?.onError, retry(options?.retry))

      return () => {
        state.closed = true
        state.watch?.stop()
        if (state.timer) clearTimeout(state.timer)
        state.wake?.()
      }
    },
  }
}

async function pump(
  store: Nats.Store,
  subject: string,
  key: string,
  state: WatchState,
  listener: (message: Sync.Message) => void,
  onError: ((error: unknown, event: Nats.WatchError) => void) | undefined,
  retry: RetryState | undefined
): Promise<void> {
  let attempts = 0
  while (!state.closed) {
    try {
      const watch = state.watch ?? await store.watch(watchOptions(subject, state.revision))
      if (state.closed) {
        watch.stop()
        return
      }
      state.watch = watch
      for await (const entry of watch) {
        if (entry.operation !== "PUT") continue
        const message = readEntry(key, entry, onError)
        if (!message) continue
        state.revision = message.version
        attempts = 0
        listener(message)
      }
      if (state.closed) return
      throw closed
    } catch (error) {
      if (state.closed) return
      state.watch?.stop()
      state.watch = undefined
      attempts += 1
      if (!retry || attempts > retry.attempts) {
        onError?.(error, { attempts, terminal: true })
        return
      }
      onError?.(error, { attempts, terminal: false })
      await delay(retry.delayMs, state)
    }
  }
}

export const nats = {
  kv,
}

function entryKey(prefix: string, key: string): string {
  return `${prefix}.${base64(key)}`
}

function encode(message: Sync.Message): Uint8Array {
  return encoder.encode(JSON.stringify({
    peer: message.peer,
    value: message.value,
  } satisfies Nats.Wire))
}

function decode(key: string, entry: KvEntry): Sync.Message {
  const wire = JSON.parse(decoder.decode(entry.value)) as Nats.Wire
  return {
    key,
    peer: wire.peer,
    version: entry.revision,
    value: wire.value,
  }
}

function readEntry(
  key: string,
  entry: KvEntry,
  onError: ((error: unknown, event: Nats.WatchError) => void) | undefined
): Sync.Message | undefined {
  try {
    return decode(key, entry)
  } catch (error) {
    onError?.(error, { attempts: 0, terminal: false })
    return undefined
  }
}

function isStale(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "number"
    && stale.has(error.code)
}

interface RetryState {
  readonly attempts: number
  readonly delayMs: number
}

function retry(value: Nats.Options["retry"]): RetryState | undefined {
  if (value === false) return undefined
  return {
    attempts: value?.attempts ?? Number.POSITIVE_INFINITY,
    delayMs: value?.delayMs ?? 100,
  }
}

function watchOptions(key: string, revision: number): KvWatchOptions {
  return revision > 0 ? { key, resumeFromRevision: revision + 1 } : { key }
}

async function delay(ms: number, state: WatchState): Promise<void> {
  if (ms <= 0) return
  await new Promise<void>((resolve) => {
    state.wake = resolve
    state.timer = setTimeout(resolve, ms)
  })
  state.timer = undefined
  state.wake = undefined
}

function base64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url")
}

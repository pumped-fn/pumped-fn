import { Buffer } from "node:buffer"
import { type KvEntry, type KvWatchOptions } from "@nats-io/kv"
import { type Sync } from "@pumped-fn/lite-extension-sync"

export namespace Nats {
  export interface Options {
    readonly prefix?: string
    readonly onError?: (error: unknown) => void
  }

  export interface Store {
    get(key: string): Promise<KvEntry | null>
    create(key: string, data: Uint8Array): Promise<number>
    update(key: string, data: Uint8Array, version: number): Promise<number>
    watch(options?: KvWatchOptions): Promise<AsyncIterable<KvEntry> & { stop(): void }>
  }

  export interface Wire {
    readonly peer: string
    readonly value: Sync.Value
  }
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

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
      const current = await store.get(key)
      const version = current && current.operation === "PUT"
        ? await store.update(key, payload, current.revision)
        : await store.create(key, payload)
      return { version }
    },
    async subscribe(key, listener) {
      const watch = await store.watch({ key: entryKey(prefix, key) })
      void pump(key, watch, listener, options?.onError)

      return () => {
        watch.stop()
      }
    },
  }
}

async function pump(
  key: string,
  watch: AsyncIterable<KvEntry>,
  listener: (message: Sync.Message) => void,
  onError: ((error: unknown) => void) | undefined
): Promise<void> {
  try {
    for await (const entry of watch) {
      if (entry.operation !== "PUT") continue
      const message = readEntry(key, entry, onError)
      if (message) listener(message)
    }
  } catch (error) {
    onError?.(error)
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
  onError: ((error: unknown) => void) | undefined
): Sync.Message | undefined {
  try {
    return decode(key, entry)
  } catch (error) {
    onError?.(error)
    return undefined
  }
}

function base64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url")
}

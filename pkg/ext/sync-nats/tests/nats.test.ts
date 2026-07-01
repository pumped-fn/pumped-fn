import { describe, expect, it } from "vitest"
import { type KvEntry, type KvWatchOptions } from "@nats-io/kv"
import { nats, type Nats } from "../src"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

describe("nats sync transport", () => {
  it("stores sync messages as NATS KV entries with backend revision acks", async () => {
    const store = fake()
    const transport = nats.kv(store, { prefix: "p" })

    expect(await transport.read("draft")).toBeUndefined()
    expect(await transport.write({
      key: "draft",
      peer: "left",
      version: 1,
      value: { title: "One" },
    })).toEqual({ version: 1 })
    expect(await transport.read("draft")).toEqual({
      key: "draft",
      peer: "left",
      version: 1,
      value: { title: "One" },
    })
    expect(await transport.write({
      key: "draft",
      peer: "left",
      version: 2,
      value: { title: "Two" },
    })).toEqual({ version: 2 })

    expect(store.keys).toEqual(["p.ZHJhZnQ", "p.ZHJhZnQ", "p.ZHJhZnQ", "p.ZHJhZnQ"])
    expect(store.updates).toEqual([{ key: "p.ZHJhZnQ", version: 1 }])
    expect(await transport.read("draft")).toMatchObject({
      key: "draft",
      version: 2,
      value: { title: "Two" },
    })
  })

  it("creates over deleted entries and keeps default key prefix subject-safe", async () => {
    const store = fake()
    const transport = nats.kv(store)

    store.set("sync.ZHJhZnQ6MS93aXRoIHNwYWNl", "DEL", {
      peer: "remote",
      value: { deleted: true },
    })

    expect(await transport.read("draft:1/with space")).toBeUndefined()
    expect(await transport.write({
      key: "draft:1/with space",
      peer: "local",
      version: 1,
      value: { ok: true },
    })).toEqual({ version: 2 })
    expect(store.creates).toEqual(["sync.ZHJhZnQ6MS93aXRoIHNwYWNl"])
  })

  it("watches update-only NATS entries and stops delivery through the cleanup", async () => {
    const store = fake()
    const transport = nats.kv(store, { prefix: "p" })
    const messages: unknown[] = []
    const off = await transport.subscribe("draft", (message) => messages.push(message))

    store.push("p.ZHJhZnQ", "DEL", {
      peer: "remote",
      value: { title: "deleted" },
    })
    store.push("p.ZHJhZnQ", "PUT", {
      peer: "remote",
      value: { title: "live" },
    })
    await until(() => messages.length === 1)
    off()
    store.push("p.ZHJhZnQ", "PUT", {
      peer: "remote",
      value: { title: "ignored" },
    })
    await Promise.resolve()

    expect(store.watches).toEqual([{ key: "p.ZHJhZnQ" }])
    expect(messages).toEqual([
      {
        key: "draft",
        peer: "remote",
        version: 2,
        value: { title: "live" },
      },
    ])
  })

  it("reports corrupt watched entries and keeps delivering later records", async () => {
    const store = fake()
    const errors: unknown[] = []
    const messages: unknown[] = []
    const transport = nats.kv(store, { prefix: "p", onError: (error) => errors.push(error) })
    const off = await transport.subscribe("draft", (message) => messages.push(message))

    store.pushRaw("p.ZHJhZnQ", "PUT", encoder.encode("{"))
    store.push("p.ZHJhZnQ", "PUT", {
      peer: "remote",
      value: { title: "after" },
    })
    await until(() => errors.length === 1 && messages.length === 1)
    off()

    expect(errors[0]).toBeInstanceOf(SyntaxError)
    expect(messages).toEqual([
      {
        key: "draft",
        peer: "remote",
        version: 2,
        value: { title: "after" },
      },
    ])
  })

  it("surfaces stale revision writes as sync write conflicts", async () => {
    const store = fake()
    const transport = nats.kv(store, { prefix: "p" })

    await transport.write({
      key: "draft",
      peer: "left",
      version: 1,
      value: { title: "left" },
    })
    store.race("p.ZHJhZnQ", {
      peer: "right",
      value: { title: "right" },
    })

    await expect(transport.write({
      key: "draft",
      peer: "left",
      version: 2,
      value: { title: "stale" },
    })).resolves.toEqual({
      conflict: {
        key: "draft",
        peer: "right",
        version: 2,
        value: { title: "right" },
      },
    })
    expect(await transport.read("draft")).toEqual({
      key: "draft",
      peer: "right",
      version: 2,
      value: { title: "right" },
    })
  })

  it("keeps non-stale write failures as backend errors", async () => {
    const error = new Error("backend offline")
    const store = {
      get: async () => null,
      create: async () => {
        throw error
      },
      update: async () => 0,
      watch: async () => queue<KvEntry>(),
    } satisfies Nats.Store
    const transport = nats.kv(store)

    await expect(transport.write({
      key: "draft",
      peer: "left",
      version: 1,
      value: { title: "left" },
    })).rejects.toBe(error)
  })

  it("keeps stale write failures as errors when no conflict record exists", async () => {
    const store = {
      get: async () => null,
      create: async () => {
        throw staleError()
      },
      update: async () => 0,
      watch: async () => queue<KvEntry>(),
    } satisfies Nats.Store
    const transport = nats.kv(store)

    await expect(transport.write({
      key: "draft",
      peer: "left",
      version: 1,
      value: { title: "left" },
    })).rejects.toThrow("NATS KV revision mismatch")
  })

  it("reports watch iterator failures through adapter options", async () => {
    const store = fake()
    const errors: unknown[] = []
    const transport = nats.kv(store, { prefix: "p", onError: (error) => errors.push(error) })
    const off = await transport.subscribe("draft", () => {})
    const error = new Error("watch failed")

    store.fail(error)
    await until(() => errors.length === 1)
    off()

    expect(errors).toEqual([error])
  })
})

function fake(): Nats.Store & {
  readonly keys: string[]
  readonly creates: string[]
  readonly updates: { readonly key: string; readonly version: number }[]
  readonly watches: KvWatchOptions[]
  set(key: string, operation: KvEntry["operation"], wire: Nats.Wire): void
  push(key: string, operation: KvEntry["operation"], wire: Nats.Wire): void
  pushRaw(key: string, operation: KvEntry["operation"], value: Uint8Array): void
  race(key: string, wire: Nats.Wire): void
  fail(error: unknown): void
} {
  let revision = 0
  const values = new Map<string, KvEntry>()
  const keys: string[] = []
  const creates: string[] = []
  const updates: { readonly key: string; readonly version: number }[] = []
  const watches: KvWatchOptions[] = []
  const queues: Array<ReturnType<typeof queue<KvEntry>>> = []
  const races = new Map<string, Nats.Wire>()

  const store = {
    keys,
    creates,
    updates,
    watches,
    async get(key: string) {
      keys.push(key)
      return values.get(key) ?? null
    },
    async create(key: string, data: Uint8Array) {
      creates.push(key)
      revision += 1
      values.set(key, entry(key, "PUT", revision, data))
      return revision
    },
    async update(key: string, data: Uint8Array, version: number) {
      updates.push({ key, version })
      const race = races.get(key)
      if (race) {
        races.delete(key)
        revision += 1
        const next = entry(key, "PUT", revision, encode(race))
        values.set(key, next)
        for (const stream of queues) stream.push(next)
      }
      if (values.get(key)?.revision !== version) throw staleError()
      revision += 1
      values.set(key, entry(key, "PUT", revision, data))
      return revision
    },
    async watch(options?: KvWatchOptions) {
      if (options) watches.push(options)
      const stream = queue<KvEntry>()
      queues.push(stream)
      return stream
    },
    set(key: string, operation: KvEntry["operation"], wire: Nats.Wire) {
      revision += 1
      values.set(key, entry(key, operation, revision, encode(wire)))
    },
    push(key: string, operation: KvEntry["operation"], wire: Nats.Wire) {
      revision += 1
      const next = entry(key, operation, revision, encode(wire))
      values.set(key, next)
      for (const stream of queues) stream.push(next)
    },
    pushRaw(key: string, operation: KvEntry["operation"], value: Uint8Array) {
      revision += 1
      const next = entry(key, operation, revision, value)
      values.set(key, next)
      for (const stream of queues) stream.push(next)
    },
    race(key: string, wire: Nats.Wire) {
      races.set(key, wire)
    },
    fail(error: unknown) {
      for (const stream of queues) stream.fail(error)
    },
  } satisfies Nats.Store & {
    readonly keys: string[]
    readonly creates: string[]
    readonly updates: { readonly key: string; readonly version: number }[]
    readonly watches: KvWatchOptions[]
    set(key: string, operation: KvEntry["operation"], wire: Nats.Wire): void
    push(key: string, operation: KvEntry["operation"], wire: Nats.Wire): void
    pushRaw(key: string, operation: KvEntry["operation"], value: Uint8Array): void
    race(key: string, wire: Nats.Wire): void
    fail(error: unknown): void
  }

  return store
}

function entry(key: string, operation: KvEntry["operation"], revision: number, value: Uint8Array): KvEntry {
  return {
    bucket: "sync",
    key,
    rawKey: key,
    value,
    created: new Date(0),
    revision,
    operation,
    length: value.byteLength,
    string() {
      return decoder.decode(value)
    },
    json<T>() {
      return JSON.parse(decoder.decode(value)) as T
    },
  }
}

function encode(wire: Nats.Wire): Uint8Array {
  return encoder.encode(JSON.stringify(wire))
}

function staleError(): Error & { code: number } {
  const error = new Error("NATS KV revision mismatch") as Error & { code: number }
  error.code = 10071
  return error
}

function queue<T>(): AsyncIterable<T> & { push(value: T): void; fail(error: unknown): void; stop(): void } {
  const values: T[] = []
  let stopped = false
  let failed = false
  let failure: unknown
  let resume: (() => void) | undefined

  return {
    push(value) {
      if (stopped) return
      values.push(value)
      resume?.()
      resume = undefined
    },
    fail(error) {
      failed = true
      failure = error
      resume?.()
      resume = undefined
    },
    stop() {
      stopped = true
      resume?.()
      resume = undefined
    },
    async *[Symbol.asyncIterator]() {
      while (!stopped) {
        if (failed) throw failure
        const value = values.shift()
        if (value !== undefined) {
          yield value
          continue
        }
        await new Promise<void>((resolve) => {
          resume = resolve
        })
      }
    },
  }
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 20; i++) {
    if (check()) return
    await Promise.resolve()
  }
  throw new Error("Condition was not reached")
}

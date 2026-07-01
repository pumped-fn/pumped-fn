import { execFileSync, spawnSync } from "node:child_process"
import { createServer } from "node:net"
import { Kvm, type KV, type KvWatchOptions } from "@nats-io/kv"
import { connect, type NatsConnection } from "@nats-io/transport-node"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createScope } from "@pumped-fn/lite"
import { sync, type Sync } from "@pumped-fn/lite-extension-sync"
import { nats, type Nats } from "../src"

const encoder = new TextEncoder()

const canRun = docker()
const run = canRun ? describe : describe.skip

if (!canRun && process.env.CI) {
  throw new Error("Docker is required for NATS integration tests in CI")
}

run("nats sync transport integration", () => {
  let container = ""
  let nc: NatsConnection
  let kv: KV

  beforeAll(async () => {
    const port = await freePort()
    container = `pumped-sync-nats-${process.pid}-${port}`
    execFileSync("docker", [
      "run",
      "--rm",
      "-d",
      "--name",
      container,
      "-p",
      `${port}:4222`,
      "nats:2.12-alpine",
      "-js",
    ], { stdio: "pipe" })
    nc = await connectServer(port)
    kv = await new Kvm(nc).create(`PFSYNC${process.pid}${port}`, { history: 10 })
  })

  afterAll(async () => {
    await nc?.close()
    if (container) {
      spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" })
    }
  })

  it("replicates sync atoms through real JetStream KV watches", async () => {
    const draft = sync({
      id: "draft",
      factory: () => ({ title: "", version: 0 }),
      conflict: sync.revision("version"),
    })
    const left = createScope({
      extensions: [sync.extension()],
      tags: [
        sync.runtime({
          peer: "left",
          namespace: "proposal",
          transport: nats.kv(kv, { prefix: "sync" }),
        }),
      ],
    })
    const right = createScope({
      extensions: [sync.extension()],
      tags: [
        sync.runtime({
          peer: "right",
          namespace: "proposal",
          transport: nats.kv(kv, { prefix: "sync" }),
        }),
      ],
    })

    await left.resolve(draft)
    await right.resolve(draft)
    left.controller(draft).set({ title: "NATS", version: 1 })

    await until(() => right.controller(draft).get().title === "NATS")
    const stored = await kv.get("sync.cHJvcG9zYWw6ZHJhZnQ")

    expect(stored?.revision).toBeGreaterThan(0)
    expect(right.controller(draft).get()).toEqual({ title: "NATS", version: 1 })
    await left.dispose()
    await right.dispose()
  })

  it("surfaces backend revisions on direct transport writes and reads", async () => {
    const transport = nats.kv(kv, { prefix: "direct" })
    const first = await transport.write({
      key: "manual",
      peer: "left",
      version: 1,
      value: { ok: 1 },
    })
    const second = await transport.write({
      key: "manual",
      peer: "left",
      version: 2,
      value: { ok: 2 },
    })

    expect(first).toEqual({ version: expect.any(Number) })
    expect(second).toEqual({ version: expect.any(Number) })
    expect(second && first && second.version > first.version).toBe(true)
    expect(await transport.read("manual")).toEqual({
      key: "manual",
      peer: "left",
      version: second?.version,
      value: { ok: 2 },
    })
  })

  it("maps real JetStream stale revision failures to sync write conflicts", async () => {
    let raced = false
    const store = {
      get: kv.get.bind(kv),
      create: kv.create.bind(kv),
      async update(key: string, data: Uint8Array, version: number) {
        if (!raced) {
          raced = true
          await kv.update(key, encode({ peer: "right", value: { ok: "right" } }), version)
        }
        return kv.update(key, data, version)
      },
      watch: kv.watch.bind(kv),
    } satisfies Nats.Store
    const transport = nats.kv(store, { prefix: "race" })

    await transport.write({
      key: "manual",
      peer: "left",
      version: 1,
      value: { ok: "left" },
    })

    expect(await transport.write({
      key: "manual",
      peer: "left",
      version: 2,
      value: { ok: "stale" },
    })).toEqual({
      conflict: {
        key: "manual",
        peer: "right",
        version: expect.any(Number),
        value: { ok: "right" },
      },
    })
  })

  it("resumes real JetStream KV watches from the last delivered revision", async () => {
    const watches: KvWatchOptions[] = []
    const errors: unknown[] = []
    const messages: Sync.Message[] = []
    let failed = false
    const store = {
      get: kv.get.bind(kv),
      create: kv.create.bind(kv),
      update: kv.update.bind(kv),
      async watch(options?: KvWatchOptions) {
        if (options) watches.push(options)
        const watch = await kv.watch(options)
        if (failed) return watch
        failed = true
        return failAfterFirst(watch, new Error("watch reset"))
      },
    } satisfies Nats.Store
    const transport = nats.kv(store, {
      prefix: "resume",
      retry: { delayMs: 0 },
      onError: (error) => errors.push(error),
    })
    const off = await transport.subscribe("manual", (message) => messages.push(message))

    await transport.write({
      key: "manual",
      peer: "left",
      version: 1,
      value: { ok: 1 },
    })
    await until(() => messages.length === 1)
    await until(() => errors.length === 1 && watches.length === 2)
    await transport.write({
      key: "manual",
      peer: "left",
      version: 2,
      value: { ok: 2 },
    })
    await until(() => messages.length === 2)
    off()

    expect(watches[1]).toEqual({
      key: "resume.bWFudWFs",
      resumeFromRevision: messages[0]!.version + 1,
    })
    expect(messages.map((message) => message.value)).toEqual([{ ok: 1 }, { ok: 2 }])
  })

  it("sustains one thousand backend writes with revision and overhead evidence", async () => {
    const edits = 1000
    const transport = nats.kv(kv, { prefix: "stress" })
    const start = performance.now()
    let version = 0

    for (let i = 1; i <= edits; i++) {
      const ack = await transport.write({
        key: "draft",
        peer: "left",
        version: i,
        value: { edit: i },
      })
      version = ack?.version ?? version
    }

    const elapsed = performance.now() - start
    const perOp = elapsed / edits

    expect(version).toBeGreaterThanOrEqual(edits)
    expect(perOp).toBeGreaterThanOrEqual(0)
    expect(await transport.read("draft")).toEqual({
      key: "draft",
      peer: "left",
      version,
      value: { edit: edits },
    })
  })
})

function docker(): boolean {
  return spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0
}

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  if (!address || typeof address === "string") throw new Error("Port allocation failed")
  return address.port
}

async function connectServer(port: number): Promise<NatsConnection> {
  let last: unknown
  for (let i = 0; i < 60; i++) {
    try {
      return await connect({ servers: `127.0.0.1:${port}`, timeout: 1000 })
    } catch (error) {
      last = error
      await delay(500)
    }
  }
  throw last
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (check()) return
    await delay(20)
  }
  throw new Error("Condition was not reached")
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function encode(wire: Nats.Wire): Uint8Array {
  return encoder.encode(JSON.stringify(wire))
}

function failAfterFirst(watch: Nats.Watch, error: unknown): Nats.Watch {
  return {
    stop() {
      watch.stop()
    },
    async *[Symbol.asyncIterator]() {
      for await (const entry of watch) {
        yield entry
        throw error
      }
    },
  }
}

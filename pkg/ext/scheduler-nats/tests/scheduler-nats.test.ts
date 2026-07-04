import { describe, expect, it, vi } from "vitest"
import { type KvEntry } from "@nats-io/kv"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function fakeKv() {
  const values = new Map<string, { value: Uint8Array; revision: number }>()
  let revision = 0
  const log: string[] = []
  const failCreate = new Map<string, unknown>()
  const failUpdate = new Map<string, unknown>()
  const raceCreate = new Map<string, Uint8Array>()

  const kv = {
    log,
    async get(key: string) {
      const found = values.get(key)
      if (!found) return null
      return entry(key, found)
    },
    async create(key: string, data: Uint8Array) {
      const forced = failCreate.get(key)
      if (forced) {
        failCreate.delete(key)
        log.push(`conflict:${key}`)
        throw forced
      }
      const raced = raceCreate.get(key)
      if (raced) {
        raceCreate.delete(key)
        revision += 1
        values.set(key, { value: raced, revision })
        log.push(`conflict:${key}`)
        throw staleError()
      }
      if (values.has(key)) {
        log.push(`conflict:${key}`)
        throw staleError()
      }
      revision += 1
      values.set(key, { value: data, revision })
      log.push(`create:${key}`)
      return revision
    },
    async put(key: string, data: Uint8Array) {
      revision += 1
      values.set(key, { value: data, revision })
      log.push(`put:${key}`)
      return revision
    },
    async update(key: string, data: Uint8Array, version: number) {
      const forced = failUpdate.get(key)
      if (forced) {
        failUpdate.delete(key)
        log.push(`conflict:${key}`)
        throw forced
      }
      const found = values.get(key)
      if (!found || found.revision !== version) {
        log.push(`conflict:${key}`)
        throw staleError()
      }
      revision += 1
      values.set(key, { value: data, revision })
      log.push(`update:${key}`)
      return revision
    },
    failCreateWith(key: string, error: unknown) {
      failCreate.set(key, error)
    },
    failUpdateWith(key: string, error: unknown) {
      failUpdate.set(key, error)
    },
    raceCreateWith(key: string, value: Uint8Array) {
      raceCreate.set(key, value)
    },
    seed(key: string, value: Uint8Array) {
      revision += 1
      values.set(key, { value, revision })
      return revision
    },
  }
  return kv
}

type FakeKv = ReturnType<typeof fakeKv>

function entry(key: string, found: { value: Uint8Array; revision: number }): KvEntry {
  return {
    bucket: "scheduler",
    key,
    rawKey: key,
    value: found.value,
    created: new Date(0),
    revision: found.revision,
    operation: "PUT",
    length: found.value.byteLength,
    string: () => decoder.decode(found.value),
    json: <T>() => JSON.parse(decoder.decode(found.value)) as T,
  }
}

function staleError(): Error & { code: number } {
  const error = new Error("NATS KV wrong last sequence") as Error & { code: number }
  error.code = 10071
  return error
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error("Condition was not reached")
}

async function withBucket(kv: FakeKv, options?: { bucket?: string; historyTtlMs?: number; createOpts?: unknown[] }) {
  vi.resetModules()
  vi.doMock("@nats-io/kv", async () => {
    const actual = await vi.importActual<typeof import("@nats-io/kv")>("@nats-io/kv")
    return {
      ...actual,
      Kvm: class {
        async create(_name: string, opts?: unknown) {
          options?.createOpts?.push(opts)
          return kv
        }
      },
    }
  })
  const { nats } = await import("../src")
  return nats({
    connection: {} as never,
    bucket: options?.bucket,
    history: options?.historyTtlMs ? { ttlMs: options.historyTtlMs } : undefined,
  })
}

describe("nats scheduler backend", () => {
  it("locks a tick across two backend instances sharing one KV: only one execution runs the flow", async () => {
    const kv = fakeKv()
    const calls: number[] = []
    const tick = async () => {
      calls.push(calls.length + 1)
    }
    const spec = { name: "shared", cadence: { cron: "0 0 * * *" }, overlap: "skip" as const, catchUp: "skip" as const }

    const backendA = await withBucket(kv)
    const backendB = await withBucket(kv)
    const regA = backendA.register(spec, tick)
    const regB = backendB.register(spec, tick)

    vi.useFakeTimers()
    try {
      await Promise.all([regA.trigger(), regB.trigger()])
    } finally {
      vi.useRealTimers()
    }

    expect(kv.log.filter((entry) => entry.startsWith("create:run.shared."))).toHaveLength(1)
    expect(calls).toEqual([1])

    await regA.stop()
    await regB.stop()
  })

  it("dedups trigger() across two instances coordinated on the same scheduledAt", async () => {
    const kv = fakeKv()
    const calls: number[] = []
    const tick = async () => {
      calls.push(calls.length + 1)
    }
    const spec = { name: "manual", cadence: { cron: "0 0 * * *" }, overlap: "skip" as const, catchUp: "skip" as const }
    const backendA = await withBucket(kv)
    const backendB = await withBucket(kv)
    const regA = backendA.register(spec, tick)
    const regB = backendB.register(spec, tick)

    vi.useFakeTimers()
    try {
      await Promise.all([regA.trigger(), regB.trigger()])
    } finally {
      vi.useRealTimers()
    }

    expect(calls).toEqual([1])
    await regA.stop()
    await regB.stop()
  })

  it("writes a failure marker to the KV when a tick throws", async () => {
    const kv = fakeKv()
    const backend = await withBucket(kv)
    const registration = backend.register(
      { name: "failing", cadence: { cron: "0 0 * * *" }, overlap: "skip", catchUp: "skip" },
      async () => {
        throw new Error("boom")
      }
    )

    await expect(registration.trigger()).rejects.toThrow("boom")
    await until(() => kv.log.some((entry) => entry.startsWith("put:run.failing.")))

    const key = kv.log.find((entry) => entry.startsWith("put:run.failing."))!.slice("put:".length)
    const stored = await kv.get(key)
    const marker = JSON.parse(decoder.decode(stored!.value)) as { failedAt: string; error: string; startedAt: string }
    expect(marker.error).toBe("boom")
    expect(marker.failedAt).toBeTypeOf("string")
    expect(marker.startedAt).toBeTypeOf("string")

    await registration.stop()
  })

  it("propagates non-conflict errors from the lock claim instead of treating them as a lost race", async () => {
    const kv = fakeKv()
    kv.failCreateWith("run.weird.2026-01-01T00-00-00.000Z", new Error("backend offline"))
    const backend = await withBucket(kv)
    const registration = backend.register(
      { name: "weird", cadence: { cron: "0 0 * * *" }, overlap: "skip", catchUp: "skip" },
      async () => {}
    )
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))
    try {
      await expect(registration.trigger()).rejects.toThrow()
    } finally {
      vi.useRealTimers()
    }
    await registration.stop()
  })

  it("overlap: skip drops a tick while the previous one is in flight", async () => {
    const kv = fakeKv()
    let resolveFirst!: () => void
    const gate = new Promise<void>((resolve) => {
      resolveFirst = resolve
    })
    const calls: number[] = []
    let call = 0
    const backend = await withBucket(kv)
    const registration = backend.register(
      { name: "gated", cadence: { cron: "0 0 * * *" }, overlap: "skip", catchUp: "skip" },
      async () => {
        call += 1
        calls.push(call)
        if (call === 1) await gate
      }
    )

    const first = registration.trigger()
    await new Promise((resolve) => setTimeout(resolve, 10))
    const second = registration.trigger()

    expect(calls).toEqual([1])
    resolveFirst()
    await Promise.all([first, second])
    await registration.stop()
  })

  it("overlap: queue chains distinct local ticks instead of dropping them", async () => {
    const kv = fakeKv()
    const order: number[] = []
    const backend = await withBucket(kv)
    const registration = backend.register(
      { name: "queued", cadence: { cron: "0 0 * * *" }, overlap: "queue", catchUp: "skip" },
      async () => {
        order.push(order.length + 1)
      }
    )

    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))
    const first = registration.trigger()
    vi.setSystemTime(new Date("2026-01-01T00:00:00.001Z"))
    const second = registration.trigger()
    vi.setSystemTime(new Date("2026-01-01T00:00:00.002Z"))
    const third = registration.trigger()
    try {
      await Promise.all([first, second, third])
    } finally {
      vi.useRealTimers()
    }

    expect(order).toEqual([1, 2, 3])
    await registration.stop()
  })

  it("supports an every-ms cadence and exposes its next tick", async () => {
    const kv = fakeKv()
    const backend = await withBucket(kv)
    const registration = backend.register(
      { name: "interval", cadence: { every: "50" }, overlap: "skip", catchUp: "skip" },
      async () => {}
    )

    expect(registration.next()).toBeInstanceOf(Date)
    await registration.trigger()
    await registration.stop()
    expect(registration.next()).toBeUndefined()
  })

  it("fires on its own timer for an every-ms cadence, not only via trigger()", async () => {
    const kv = fakeKv()
    const seen: number[] = []
    const backend = await withBucket(kv)
    const registration = backend.register(
      { name: "real-timer", cadence: { every: "10" }, overlap: "skip", catchUp: "skip" },
      async () => {
        seen.push(seen.length + 1)
      }
    )

    await new Promise((resolve) => setTimeout(resolve, 80))
    await registration.stop()

    expect(seen.length).toBeGreaterThan(0)
  })

  it("fires on its own timer for a cron cadence and consumes tick rejections", async () => {
    const kv = fakeKv()
    const seen: number[] = []
    const unhandled: unknown[] = []
    const onUnhandledRejection = (reason: unknown) => unhandled.push(reason)
    process.on("unhandledRejection", onUnhandledRejection)

    const backend = await withBucket(kv)
    const registration = backend.register(
      { name: "real-cron", cadence: { cron: "* * * * * *" }, overlap: "skip", catchUp: "skip" },
      async () => {
        seen.push(seen.length + 1)
        throw new Error("cron boom")
      }
    )

    await new Promise((resolve) => setTimeout(resolve, 1100))
    await registration.stop()
    await new Promise((resolve) => setTimeout(resolve, 10))

    process.off("unhandledRejection", onUnhandledRejection)
    expect(seen.length).toBeGreaterThan(0)
    expect(unhandled).toHaveLength(0)
  }, 3000)

  it("throws for a non-numeric every cadence", async () => {
    const kv = fakeKv()
    const backend = await withBucket(kv)
    expect(() =>
      backend.register({ name: "bad", cadence: { every: "5m" }, overlap: "skip", catchUp: "skip" }, async () => {})
    ).toThrow(/positive number of milliseconds/)
  })

  it("exposes the next cron run date, and undefined once stopped", async () => {
    const kv = fakeKv()
    const backend = await withBucket(kv)
    const registration = backend.register(
      { name: "cron-next", cadence: { cron: "0 0 * * *" }, overlap: "skip", catchUp: "skip" },
      async () => {}
    )

    expect(registration.next()).toBeInstanceOf(Date)
    await registration.stop()
    expect(registration.next()).toBeUndefined()
  })

  it("defaults the bucket name when none is given", async () => {
    const kv = fakeKv()
    const backend = await withBucket(kv)
    const registration = backend.register(
      { name: "default-bucket", cadence: { cron: "0 0 * * *" }, overlap: "skip", catchUp: "skip" },
      async () => {}
    )
    await registration.trigger()
    expect(kv.log.some((entry) => entry.startsWith("create:run.default-bucket."))).toBe(true)
    await registration.stop()
  })

  it("stringifies non-Error tick failures for the KV failure marker", async () => {
    const kv = fakeKv()
    const backend = await withBucket(kv)
    const registration = backend.register(
      { name: "non-error", cadence: { cron: "0 0 * * *" }, overlap: "skip", catchUp: "skip" },
      async () => {
        throw "plain string failure"
      }
    )

    await expect(registration.trigger()).rejects.toBe("plain string failure")
    await until(() => kv.log.some((entry) => entry.startsWith("put:run.non-error.")))
    const key = kv.log.find((entry) => entry.startsWith("put:run.non-error."))!.slice("put:".length)
    const stored = await kv.get(key)
    const marker = JSON.parse(decoder.decode(stored!.value)) as { error: string }
    expect(marker.error).toBe("plain string failure")
    await registration.stop()
  })

  it("passes a TTL to bucket creation when history.ttlMs is configured", async () => {
    const kv = fakeKv()
    const createOpts: unknown[] = []
    const backend = await withBucket(kv, { bucket: "fresh-bucket", historyTtlMs: 60000, createOpts })
    const registration = backend.register(
      { name: "boot", cadence: { cron: "0 0 * * *" }, overlap: "skip", catchUp: "skip" },
      async () => {}
    )
    await registration.trigger()
    expect(createOpts).toEqual([{ ttl: 60000 }])
    await registration.stop()
  })

  it("creates the bucket without a TTL config when none is given", async () => {
    const kv = fakeKv()
    const createOpts: unknown[] = []
    const backend = await withBucket(kv, { bucket: "fresh-bucket", createOpts })
    const registration = backend.register(
      { name: "boot2", cadence: { cron: "0 0 * * *" }, overlap: "skip", catchUp: "skip" },
      async () => {}
    )
    await registration.trigger()
    expect(createOpts).toEqual([undefined])
    await registration.stop()
  })

  describe("catchUp derivation", () => {
    it("runs no missed ticks when there is no last: key (first deployment)", async () => {
      const kv = fakeKv()
      const calls: Date[] = []
      const backend = await withBucket(kv)
      const registration = backend.register(
        { name: "fresh", cadence: { cron: "0 * * * *" }, overlap: "skip", catchUp: "all" },
        async (run) => {
          calls.push(run.scheduledAt)
        }
      )

      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(calls).toEqual([])
      await registration.stop()
    })

    it("skip policy ignores missed ticks even when a last: key exists", async () => {
      const kv = fakeKv()
      await kv.put("last.skipper", encoder.encode(new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()))
      const calls: Date[] = []
      const backend = await withBucket(kv)
      const registration = backend.register(
        { name: "skipper", cadence: { cron: "0 * * * *" }, overlap: "skip", catchUp: "skip" },
        async (run) => {
          calls.push(run.scheduledAt)
        }
      )

      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(calls).toEqual([])
      await registration.stop()
    })

    it("finds no missed ticks when the cadence has not elapsed since last", async () => {
      const kv = fakeKv()
      await kv.put("last.tooSoon", encoder.encode(new Date().toISOString()))
      const calls: Date[] = []
      const backend = await withBucket(kv)
      const registration = backend.register(
        { name: "tooSoon", cadence: { cron: "0 0 1 1 *" }, overlap: "skip", catchUp: "all" },
        async (run) => {
          calls.push(run.scheduledAt)
        }
      )

      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(calls).toEqual([])
      await registration.stop()
    })

    it("last policy runs exactly one tick using the most recent missed scheduledAt", async () => {
      const kv = fakeKv()
      const last = new Date(Date.now() - 3 * 60 * 60 * 1000)
      await kv.put("last.latest", encoder.encode(last.toISOString()))
      const calls: Date[] = []
      const backend = await withBucket(kv)
      const registration = backend.register(
        { name: "latest", cadence: { cron: "0 * * * *" }, overlap: "skip", catchUp: "last" },
        async (run) => {
          calls.push(run.scheduledAt)
        }
      )

      await until(() => calls.length === 1)
      expect(calls).toHaveLength(1)
      await registration.stop()
    })

    it("all policy runs every missed tick in chronological order", async () => {
      const kv = fakeKv()
      const last = new Date(Date.now() - 3 * 60 * 60 * 1000)
      await kv.put("last.everything", encoder.encode(last.toISOString()))
      const calls: Date[] = []
      const backend = await withBucket(kv)
      const registration = backend.register(
        { name: "everything", cadence: { cron: "0 * * * *" }, overlap: "skip", catchUp: "all" },
        async (run) => {
          calls.push(run.scheduledAt)
        }
      )

      await until(() => calls.length >= 2)
      const sorted = [...calls].sort((a, b) => a.getTime() - b.getTime())
      expect(calls).toEqual(sorted)
      await registration.stop()
    })

    it("continues replaying remaining missed ticks after an earlier catch-up replay fails", async () => {
      const kv = fakeKv()
      const last = new Date(Date.now() - 3 * 60 * 60 * 1000)
      await kv.put("last.resilient", encoder.encode(last.toISOString()))
      const calls: Date[] = []
      const errors: unknown[] = []
      const backend = await withBucket(kv)
      const registration = backend.register(
        {
          name: "resilient",
          cadence: { cron: "0 * * * *" },
          overlap: "skip",
          catchUp: "all",
          onError: (error) => errors.push(error),
        },
        async (run) => {
          calls.push(run.scheduledAt)
          if (calls.length === 1) throw new Error("first replay boom")
        }
      )

      await until(() => calls.length >= 3)
      const sorted = [...calls].sort((a, b) => a.getTime() - b.getTime())
      expect(calls).toEqual(sorted)
      expect(errors.length).toBeGreaterThan(0)
      await registration.stop()
    })

    it("all policy derives missed ticks for an every-ms cadence too", async () => {
      const kv = fakeKv()
      const last = new Date(Date.now() - 250)
      await kv.put("last.everyMs", encoder.encode(last.toISOString()))
      const calls: Date[] = []
      const backend = await withBucket(kv)
      const registration = backend.register(
        { name: "everyMs", cadence: { every: "50" }, overlap: "skip", catchUp: "all" },
        async (run) => {
          calls.push(run.scheduledAt)
        }
      )

      await until(() => calls.length >= 2)
      await registration.stop()
    })

    it("routes catch-up ticks through the same overlap chain as timer ticks (queue order preserved)", async () => {
      const kv = fakeKv()
      const last = new Date(Date.now() - 3 * 60 * 60 * 1000)
      await kv.put("last.ordered", encoder.encode(last.toISOString()))
      const order: string[] = []
      const backend = await withBucket(kv)
      const registration = backend.register(
        { name: "ordered", cadence: { cron: "0 * * * *" }, overlap: "queue", catchUp: "all" },
        async (run) => {
          order.push(run.scheduledAt.toISOString())
          await new Promise((resolve) => setTimeout(resolve, 5))
        }
      )

      await until(() => order.length >= 2)
      const sorted = [...order].sort()
      expect(order).toEqual(sorted)
      await registration.stop()
    })

    it("does not regress last.<name> when a tick's scheduledAt is older than the stored value", async () => {
      const kv = fakeKv()
      const newer = new Date(Date.now() + 60 * 60 * 1000)
      await kv.put("last.monotonic", encoder.encode(newer.toISOString()))
      const backend = await withBucket(kv)
      const registration = backend.register(
        { name: "monotonic", cadence: { cron: "0 * * * *" }, overlap: "skip", catchUp: "skip" },
        async () => {}
      )

      await registration.trigger()
      await registration.stop()

      const entry = await kv.get("last.monotonic")
      expect(decoder.decode(entry!.value)).toBe(newer.toISOString())
    })

    it("retries recordLast when the create races a concurrent writer", async () => {
      const kv = fakeKv()
      const older = new Date(Date.now() - 60 * 60 * 1000)
      kv.raceCreateWith("last.race-create", encoder.encode(older.toISOString()))
      const backend = await withBucket(kv)
      const registration = backend.register(
        { name: "race-create", cadence: { cron: "0 * * * *" }, overlap: "skip", catchUp: "skip" },
        async () => {}
      )

      await registration.trigger()
      await registration.stop()

      const entry = await kv.get("last.race-create")
      expect(new Date(decoder.decode(entry!.value)).getTime()).toBeGreaterThan(older.getTime())
    })

    it("propagates non-conflict errors from the recordLast create", async () => {
      const kv = fakeKv()
      kv.failCreateWith("last.broken-create", new Error("backend offline"))
      const backend = await withBucket(kv)
      const registration = backend.register(
        { name: "broken-create", cadence: { cron: "0 * * * *" }, overlap: "skip", catchUp: "skip" },
        async () => {}
      )

      await expect(registration.trigger()).rejects.toThrow("backend offline")
      await registration.stop()
    })

    it("propagates non-conflict errors from the recordLast update", async () => {
      const kv = fakeKv()
      await kv.put("last.broken-update", encoder.encode(new Date(Date.now() - 60 * 60 * 1000).toISOString()))
      kv.failUpdateWith("last.broken-update", new Error("backend offline"))
      const backend = await withBucket(kv)
      const registration = backend.register(
        { name: "broken-update", cadence: { cron: "0 * * * *" }, overlap: "skip", catchUp: "skip" },
        async () => {}
      )

      await expect(registration.trigger()).rejects.toThrow("backend offline")
      await registration.stop()
    })

    it("retries recordLast when the update loses a revision race", async () => {
      const kv = fakeKv()
      const older = new Date(Date.now() - 60 * 60 * 1000)
      await kv.put("last.race-update", encoder.encode(older.toISOString()))
      kv.failUpdateWith("last.race-update", staleError())
      const backend = await withBucket(kv)
      const registration = backend.register(
        { name: "race-update", cadence: { cron: "0 * * * *" }, overlap: "skip", catchUp: "skip" },
        async () => {}
      )

      await registration.trigger()
      await registration.stop()

      const entry = await kv.get("last.race-update")
      expect(new Date(decoder.decode(entry!.value)).getTime()).toBeGreaterThan(older.getTime())
    })
  })

  describe("overlap chain resilience (finding 1)", () => {
    it("overlap: queue keeps running subsequent ticks after one tick throws", async () => {
      const kv = fakeKv()
      const errors: unknown[] = []
      const order: number[] = []
      let call = 0
      const backend = await withBucket(kv)
      const registration = backend.register(
        {
          name: "recovers",
          cadence: { cron: "0 0 * * *" },
          overlap: "queue",
          catchUp: "skip",
          onError: (error) => errors.push(error),
        },
        async () => {
          call += 1
          order.push(call)
          if (call === 1) throw new Error("boom")
        }
      )

      const first = registration.trigger().catch(() => {})
      await new Promise((resolve) => setTimeout(resolve, 5))
      const second = registration.trigger()
      await Promise.all([first, second])

      expect(order).toEqual([1, 2])
      expect(errors).toHaveLength(1)
      await registration.stop()
    })

    it("does not emit an unhandled rejection when a timer-fired tick throws", async () => {
      const kv = fakeKv()
      const unhandled: unknown[] = []
      const onUnhandledRejection = (reason: unknown) => unhandled.push(reason)
      process.on("unhandledRejection", onUnhandledRejection)

      const backend = await withBucket(kv)
      const registration = backend.register(
        { name: "timer-throws", cadence: { every: "10" }, overlap: "skip", catchUp: "skip" },
        async () => {
          throw new Error("timer boom")
        }
      )

      await new Promise((resolve) => setTimeout(resolve, 60))
      await registration.stop()
      await new Promise((resolve) => setTimeout(resolve, 10))

      process.off("unhandledRejection", onUnhandledRejection)
      expect(unhandled).toHaveLength(0)
    })
  })

  describe("stop() awaits in-flight work (finding 4)", () => {
    it("stop() does not resolve until a slow in-flight tick completes", async () => {
      const kv = fakeKv()
      let resolveSlow!: () => void
      const slow = new Promise<void>((resolve) => {
        resolveSlow = resolve
      })
      let completed = false
      const backend = await withBucket(kv)
      const registration = backend.register(
        { name: "slow", cadence: { cron: "0 0 * * *" }, overlap: "skip", catchUp: "skip" },
        async () => {
          await slow
          completed = true
        }
      )

      const triggering = registration.trigger()
      const stopping = registration.stop()

      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(completed).toBe(false)

      resolveSlow()
      await stopping
      await triggering

      expect(completed).toBe(true)
    })
  })

  it("stop() resolves even when the in-flight tick rejects", async () => {
    const kv = fakeKv()
    let rejectSlow!: (error: unknown) => void
    const slow = new Promise<void>((_, reject) => {
      rejectSlow = reject
    })
    const backend = await withBucket(kv)
    const registration = backend.register(
      { name: "slow-fail", cadence: { cron: "0 0 * * *" }, overlap: "skip", catchUp: "skip" },
      async () => slow
    )

    const triggering = registration.trigger()
    const stopping = registration.stop()

    rejectSlow(new Error("mid-flight boom"))
    await expect(triggering).rejects.toThrow("mid-flight boom")
    await stopping
  })

  it("stop() resolves even when the bucket cannot be opened for catch-up", async () => {
    vi.resetModules()
    vi.doMock("@nats-io/kv", async () => {
      const actual = await vi.importActual<typeof import("@nats-io/kv")>("@nats-io/kv")
      return {
        ...actual,
        Kvm: class {
          async create() {
            throw new Error("bucket down")
          }
        },
      }
    })
    const { nats } = await import("../src")
    const backend = nats({ connection: {} as never })
    const registration = backend.register(
      { name: "no-bucket", cadence: { cron: "0 * * * *" }, overlap: "skip", catchUp: "all" },
      async () => {}
    )

    await new Promise((resolve) => setTimeout(resolve, 10))
    await registration.stop()
  })

  describe("stale lock takeover (finding 3)", () => {
    it("lets exactly one of two racing contenders take over a stale startedAt-only marker", async () => {
      const kv = fakeKv()

      vi.useFakeTimers()
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))
      const staleStartedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      kv.seed("run.stuck.2026-01-01T00-00-00.000Z", encoder.encode(JSON.stringify({ startedAt: staleStartedAt, host: "dead-host" })))

      const backendA = await withBucket(kv)
      const backendB = await withBucket(kv)
      const calls: string[] = []
      const spec = { name: "stuck", cadence: { cron: "0 0 * * *" }, overlap: "skip" as const, catchUp: "skip" as const }
      const regA = backendA.register(spec, async () => {
        calls.push("A")
      })
      const regB = backendB.register(spec, async () => {
        calls.push("B")
      })

      try {
        await Promise.all([regA.trigger(), regB.trigger()])
      } finally {
        vi.useRealTimers()
      }

      expect(calls).toHaveLength(1)
      await regA.stop()
      await regB.stop()
    })

    it("refuses takeover while the stale marker is still within lockTtlMs", async () => {
      const kv = fakeKv()

      vi.useFakeTimers()
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))
      const recentStartedAt = new Date(Date.now() - 1000).toISOString()
      kv.seed("run.fresh-lock.2026-01-01T00-00-00.000Z", encoder.encode(JSON.stringify({ startedAt: recentStartedAt, host: "other-host" })))

      const backend = await withBucket(kv)
      const calls: string[] = []
      const registration = backend.register(
        { name: "fresh-lock", cadence: { cron: "0 0 * * *" }, overlap: "skip", catchUp: "skip" },
        async () => {
          calls.push("ran")
        }
      )

      try {
        await registration.trigger()
      } finally {
        vi.useRealTimers()
      }

      expect(calls).toHaveLength(0)
      await registration.stop()
    })

    it("treats a lock whose entry vanished after the create conflict as lost", async () => {
      const kv = fakeKv()
      kv.failCreateWith("run.vanished.2026-01-01T00-00-00.000Z", staleError())
      const backend = await withBucket(kv)
      const calls: string[] = []
      const registration = backend.register(
        { name: "vanished", cadence: { cron: "0 0 * * *" }, overlap: "skip", catchUp: "skip" },
        async () => {
          calls.push("ran")
        }
      )

      vi.useFakeTimers()
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))
      try {
        await registration.trigger()
      } finally {
        vi.useRealTimers()
      }

      expect(calls).toHaveLength(0)
      await registration.stop()
    })

    it("propagates non-conflict errors from the takeover update", async () => {
      const kv = fakeKv()

      vi.useFakeTimers()
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))
      const staleStartedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      const key = "run.broken-takeover.2026-01-01T00-00-00.000Z"
      kv.seed(key, encoder.encode(JSON.stringify({ startedAt: staleStartedAt, host: "dead-host" })))
      kv.failUpdateWith(key, new Error("backend offline"))

      const backend = await withBucket(kv)
      const registration = backend.register(
        { name: "broken-takeover", cadence: { cron: "0 0 * * *" }, overlap: "skip", catchUp: "skip" },
        async () => {}
      )

      try {
        await expect(registration.trigger()).rejects.toThrow("backend offline")
      } finally {
        vi.useRealTimers()
      }
      await registration.stop()
    })
  })

  describe("trigger(dedupKey) cross-replica dedup (finding 7)", () => {
    it("dedups manual triggers across replicas when an explicit dedupKey is given", async () => {
      const kv = fakeKv()
      const calls: string[] = []
      const spec = { name: "manual-explicit", cadence: { cron: "0 0 * * *" }, overlap: "skip" as const, catchUp: "skip" as const }
      const backendA = await withBucket(kv)
      const backendB = await withBucket(kv)
      const regA = backendA.register(spec, async () => {
        calls.push("A")
      })
      const regB = backendB.register(spec, async () => {
        calls.push("B")
      })

      await Promise.all([regA.trigger("daily-report"), regB.trigger("daily-report")])

      expect(calls).toHaveLength(1)
      expect(kv.log.some((entry) => entry.startsWith("create:run.manual-explicit.manual.daily-report"))).toBe(true)

      await regA.stop()
      await regB.stop()
    })
  })
})

import { describe, expect, it, vi } from "vitest"
import { type KvEntry } from "@nats-io/kv"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function fakeKv() {
  const values = new Map<string, { value: Uint8Array; revision: number }>()
  let revision = 0
  const log: string[] = []
  const failCreate = new Map<string, unknown>()

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
        log.push(`conflict:${key}`)
        throw forced
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
    failCreateWith(key: string, error: unknown) {
      failCreate.set(key, error)
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

  it("fires on its own timer for a cron cadence, not only via trigger()", async () => {
    const kv = fakeKv()
    const seen: number[] = []
    const backend = await withBucket(kv)
    const registration = backend.register(
      { name: "real-cron", cadence: { cron: "* * * * * *" }, overlap: "skip", catchUp: "skip" },
      async () => {
        seen.push(seen.length + 1)
      }
    )

    await new Promise((resolve) => setTimeout(resolve, 1100))
    await registration.stop()

    expect(seen.length).toBeGreaterThan(0)
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
  })
})

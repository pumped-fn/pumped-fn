import { hostname } from "node:os"
import { Kvm, type KV } from "@nats-io/kv"
import { type NatsConnection } from "@nats-io/transport-node"
import { Cron } from "croner"
import { type Scheduler } from "@pumped-fn/lite-extension-scheduler"

export namespace Nats {
  export interface Options {
    readonly connection: NatsConnection
    readonly bucket?: string
    readonly history?: { readonly ttlMs?: number }
    readonly lockTtlMs?: number
  }

  export type Store = Pick<KV, "create" | "get" | "put" | "update">
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const conflict = new Set([10071, 10164])
const defaultLockTtlMs = 5 * 60 * 1000

interface Marker {
  readonly startedAt: string
  readonly host: string
  readonly completedAt?: string
  readonly failedAt?: string
  readonly error?: string
}

export function nats(options: Nats.Options): Scheduler.Backend {
  const bucketName = options.bucket ?? "scheduler"
  const lockTtlMs = options.lockTtlMs ?? defaultLockTtlMs
  const kvm = new Kvm(options.connection)
  let opened: Promise<Nats.Store> | undefined

  function store(): Promise<Nats.Store> {
    opened ??= open(kvm, bucketName, options.history?.ttlMs)
    return opened
  }

  return {
    register(spec, tick) {
      let inFlight: Promise<void> | undefined
      let chain: Promise<void> | undefined

      async function runLocked(scheduledAt: Date, key: string): Promise<void> {
        const kv = await store()
        const won = await claim(kv, key, lockTtlMs)
        if (!won) return

        try {
          await tick({ key, scheduledAt })
        } catch (error) {
          await fail(kv, key, error)
          spec.onError?.(error, { key, scheduledAt })
          throw error
        }
        await complete(kv, key)
        await recordLast(kv, spec.name, scheduledAt)
      }

      function fire(scheduledAt: Date, dedupKey?: string): Promise<void> {
        const key = dedupKey ? manualKey(spec.name, dedupKey) : runKey(spec.name, scheduledAt)

        if (spec.overlap === "skip") {
          if (inFlight) return inFlight
          const current = runLocked(scheduledAt, key)
          inFlight = current.finally(() => {
            inFlight = undefined
          })
          return inFlight
        }

        const previous = chain ?? Promise.resolve()
        const current = previous.then(() => runLocked(scheduledAt, key))
        chain = current.catch(() => {})
        return current
      }

      const job =
        "cron" in spec.cadence
          ? new Cron(spec.cadence.cron, () => void fire(new Date()).catch(() => {}))
          : intervalJob(parseEvery(spec.cadence.every), (at) => void fire(at).catch(() => {}))

      const catchUpDone = store()
        .then((kv) => catchUp(kv, spec, fire))
        .catch(() => {})

      return {
        trigger: (dedupKey?: string) => fire(new Date(), dedupKey),
        next() {
          if ("nextRun" in job) return job.nextRun() ?? undefined
          return job.next()
        },
        async stop() {
          job.stop()
          await catchUpDone
          await Promise.all([inFlight?.catch(() => {}), chain])
        },
      }
    },
  }
}

function open(kvm: Kvm, bucket: string, ttlMs: number | undefined): Promise<Nats.Store> {
  return kvm.create(bucket, ttlMs ? { ttl: ttlMs } : undefined)
}

function runKey(name: string, scheduledAt: Date): string {
  return `run.${name}.${scheduledAt.toISOString().replace(/:/g, "-")}`
}

function manualKey(name: string, dedupKey: string): string {
  return `run.${name}.manual.${dedupKey}`
}

function lastKey(name: string): string {
  return `last.${name}`
}

async function claim(kv: Nats.Store, key: string, lockTtlMs: number): Promise<boolean> {
  const marker: Marker = { startedAt: new Date().toISOString(), host: hostname() }
  try {
    await kv.create(key, encoder.encode(JSON.stringify(marker)))
    return true
  } catch (error) {
    if (!isConflict(error)) throw error
    return takeover(kv, key, lockTtlMs)
  }
}

async function takeover(kv: Nats.Store, key: string, lockTtlMs: number): Promise<boolean> {
  const entry = await kv.get(key)
  if (!entry) return false

  const marker = JSON.parse(decoder.decode(entry.value)) as Marker
  if (marker.completedAt || marker.failedAt) return false

  const age = Date.now() - new Date(marker.startedAt).getTime()
  if (age < lockTtlMs) return false

  const takenOver: Marker = { startedAt: new Date().toISOString(), host: hostname() }
  try {
    await kv.update(key, encoder.encode(JSON.stringify(takenOver)), entry.revision)
    return true
  } catch (error) {
    if (!isConflict(error)) throw error
    return false
  }
}

async function complete(kv: Nats.Store, key: string): Promise<void> {
  const marker = await readMarker(kv, key)
  await kv.put(key, encoder.encode(JSON.stringify({ ...marker, completedAt: new Date().toISOString() })))
}

async function fail(kv: Nats.Store, key: string, error: unknown): Promise<void> {
  const marker = await readMarker(kv, key)
  const message = error instanceof Error ? error.message : String(error)
  await kv.put(key, encoder.encode(JSON.stringify({ ...marker, failedAt: new Date().toISOString(), error: message })))
}

async function readMarker(kv: Nats.Store, key: string): Promise<Marker> {
  const entry = await kv.get(key)
  return JSON.parse(decoder.decode(entry!.value)) as Marker
}

async function recordLast(kv: Nats.Store, name: string, scheduledAt: Date): Promise<void> {
  const key = lastKey(name)
  const entry = await kv.get(key)

  if (!entry) {
    try {
      await kv.create(key, encoder.encode(scheduledAt.toISOString()))
    } catch (error) {
      if (!isConflict(error)) throw error
      await recordLast(kv, name, scheduledAt)
    }
    return
  }

  const current = new Date(decoder.decode(entry.value))
  if (scheduledAt <= current) return

  try {
    await kv.update(key, encoder.encode(scheduledAt.toISOString()), entry.revision)
  } catch (error) {
    if (!isConflict(error)) throw error
    await recordLast(kv, name, scheduledAt)
  }
}

async function catchUp(
  kv: Nats.Store,
  spec: { name: string; cadence: Scheduler.Cadence; catchUp: Scheduler.CatchUp },
  fire: (scheduledAt: Date) => Promise<void>
): Promise<void> {
  if (spec.catchUp === "skip") return

  const entry = await kv.get(lastKey(spec.name))
  if (!entry) return

  const last = new Date(decoder.decode(entry.value))
  const missed = missedTicks(spec.cadence, last, new Date())
  if (missed.length === 0) return

  const targets = spec.catchUp === "last" ? [missed[missed.length - 1]!] : missed
  for (const scheduledAt of targets) {
    await fire(scheduledAt)
  }
}

function missedTicks(cadence: Scheduler.Cadence, last: Date, now: Date): Date[] {
  const found: Date[] = []
  if ("cron" in cadence) {
    const cron = new Cron(cadence.cron)
    let cursor: Date | null = last
    for (;;) {
      cursor = cron.nextRun(cursor)
      if (!cursor || cursor > now) break
      found.push(cursor)
    }
    return found
  }

  const ms = parseEvery(cadence.every)
  let cursor = new Date(last.getTime() + ms)
  while (cursor <= now) {
    found.push(cursor)
    cursor = new Date(cursor.getTime() + ms)
  }
  return found
}

function isConflict(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "number"
    && conflict.has(error.code)
}

function parseEvery(value: string): number {
  const ms = Number(value)
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new Error(`cadence.every must be a positive number of milliseconds, got "${value}"`)
  }
  return ms
}

function intervalJob(ms: number, onTick: (at: Date) => void): { next(): Date | undefined; stop(): void } {
  let nextAt: Date | undefined = new Date(Date.now() + ms)
  const handle = setInterval(() => {
    onTick(new Date())
    nextAt = new Date(Date.now() + ms)
  }, ms)
  return {
    next: () => nextAt,
    stop: () => {
      clearInterval(handle)
      nextAt = undefined
    },
  }
}

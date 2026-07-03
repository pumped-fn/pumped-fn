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
  }

  export type Store = Pick<KV, "create" | "get" | "put">
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const conflict = new Set([10071, 10164])

interface Marker {
  readonly startedAt: string
  readonly host: string
}

export function nats(options: Nats.Options): Scheduler.Backend {
  const bucketName = options.bucket ?? "scheduler"
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

      async function runLocked(scheduledAt: Date): Promise<void> {
        const kv = await store()
        const key = runKey(spec.name, scheduledAt)
        const won = await claim(kv, key)
        if (!won) return

        try {
          await tick({ key, scheduledAt })
        } catch (error) {
          await fail(kv, key, error)
          throw error
        }
        await complete(kv, key)
        await recordLast(kv, spec.name, scheduledAt)
      }

      function fire(scheduledAt: Date): void {
        if (spec.overlap === "skip") {
          if (inFlight) return
          inFlight = runLocked(scheduledAt).finally(() => {
            inFlight = undefined
          })
          return
        }
        chain = (chain ?? Promise.resolve()).then(() => runLocked(scheduledAt))
      }

      const job =
        "cron" in spec.cadence
          ? new Cron(spec.cadence.cron, () => fire(new Date()))
          : intervalJob(parseEvery(spec.cadence.every), (at) => fire(at))

      void store().then((kv) => catchUp(kv, spec, runLocked))

      return {
        async trigger() {
          const scheduledAt = new Date()
          fire(scheduledAt)
          await (spec.overlap === "skip" ? inFlight : chain)
        },
        next() {
          if ("nextRun" in job) return job.nextRun() ?? undefined
          return job.next()
        },
        async stop() {
          job.stop()
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

function lastKey(name: string): string {
  return `last.${name}`
}

async function claim(kv: Nats.Store, key: string): Promise<boolean> {
  const marker: Marker = { startedAt: new Date().toISOString(), host: hostname() }
  try {
    await kv.create(key, encoder.encode(JSON.stringify(marker)))
    return true
  } catch (error) {
    if (isConflict(error)) return false
    throw error
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
  await kv.put(lastKey(name), encoder.encode(scheduledAt.toISOString()))
}

async function catchUp(
  kv: Nats.Store,
  spec: { name: string; cadence: Scheduler.Cadence; catchUp: Scheduler.CatchUp },
  runLocked: (scheduledAt: Date) => Promise<void>
): Promise<void> {
  if (spec.catchUp === "skip") return

  const entry = await kv.get(lastKey(spec.name))
  if (!entry) return

  const last = new Date(decoder.decode(entry.value))
  const missed = missedTicks(spec.cadence, last, new Date())
  if (missed.length === 0) return

  const targets = spec.catchUp === "last" ? [missed[missed.length - 1]!] : missed
  for (const scheduledAt of targets) {
    await runLocked(scheduledAt)
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

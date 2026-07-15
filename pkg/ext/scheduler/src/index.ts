import { atom, tag, tags, type Lite } from "@pumped-fn/lite"
import { Cron } from "croner"

export namespace Scheduler {
  export type Cadence = { cron: string } | { every: string }
  export type Overlap = "skip" | "queue"
  export type CatchUp = "skip" | "last" | "all"
  export type OnError = (error: unknown, run: { key: string; scheduledAt: Date }) => void

  export interface Registration {
    trigger(dedupKey?: string): Promise<void>
    next(): Date | undefined
    stop(): Promise<void>
  }

  export interface Backend {
    register(
      spec: { name: string; cadence: Cadence; overlap: Overlap; catchUp: CatchUp; onError?: OnError },
      tick: (run: { key: string; scheduledAt: Date }) => Promise<void>
    ): Registration
  }

  export interface Options<Input> {
    name?: string
    cadence: Cadence
    overlap?: Overlap
    catchUp?: CatchUp
    flow: Lite.Flow<any, Input, any>
    input: () => Input
    onError?: OnError
    tags?: () => Lite.Tagged<any>[]
  }
}

export const backend = tag<Scheduler.Backend>({ label: "scheduler.backend" })

const run = tag<{ name: string; scheduledAt: Date }>({ label: "scheduler.run" })

export function schedule<Input>(opts: Scheduler.Options<Input>): Lite.Atom<Scheduler.Registration> {
  const name = opts.name ?? opts.flow.name
  if (!name) throw new Error("schedule() requires a name: pass { name } or give the flow a name")

  const overlap = opts.overlap ?? "skip"
  const catchUp = opts.catchUp ?? "skip"

  return atom({
    keepAlive: true,
    deps: { backend: tags.required(backend) },
    factory: (ctx, deps) => {
      const registration = deps.backend.register(
        { name, cadence: opts.cadence, overlap, catchUp, onError: opts.onError },
        async (tick) => {
          const context = ctx.scope.createContext({
            tags: [run({ name, scheduledAt: tick.scheduledAt }), ...(opts.tags?.() ?? [])],
          })
          try {
            await context.exec({ flow: opts.flow, input: opts.input() } as Lite.ExecFlowOptions<unknown, Input>)
            await context.close({ ok: true })
          } catch (error) {
            await context.close({ ok: false, error })
            throw error
          }
        }
      )
      ctx.cleanup((target) => target.stop(), registration)
      return registration
    },
  })
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

export function inProcess(): Scheduler.Backend {
  return {
    register(spec, tick) {
      if (spec.catchUp !== "skip") {
        throw new Error(
          `inProcess scheduler backend has no persistence; catchUp: "${spec.catchUp}" requires a durable backend`
        )
      }

      let inFlight: Promise<void> | undefined
      let chain: Promise<void> | undefined

      function fire(scheduledAt: Date): Promise<void> {
        const key = `${spec.name}:${scheduledAt.toISOString()}`

        if (spec.overlap === "skip") {
          if (inFlight) return inFlight
          const current = tick({ key, scheduledAt }).catch((error) => {
            spec.onError?.(error, { key, scheduledAt })
            throw error
          })
          inFlight = current.finally(() => {
            inFlight = undefined
          })
          return inFlight
        }

        const previous = chain ?? Promise.resolve()
        const current = previous.then(() => tick({ key, scheduledAt }))
        chain = current.catch((error) => {
          spec.onError?.(error, { key, scheduledAt })
        })
        return current
      }

      const job =
        "cron" in spec.cadence
          ? new Cron(spec.cadence.cron, () => void fire(new Date()).catch(() => {}))
          : intervalJob(parseEvery(spec.cadence.every), (at) => void fire(at).catch(() => {}))

      return {
        trigger: (_dedupKey?: string) => fire(new Date()),
        next() {
          if ("nextRun" in job) return job.nextRun() ?? undefined
          return job.next()
        },
        async stop() {
          job.stop()
          await Promise.all([inFlight?.catch(() => {}), chain])
        },
      }
    },
  }
}

export const scheduler = { backend, schedule, inProcess } as const

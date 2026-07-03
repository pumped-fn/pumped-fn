import { atom, tag, tags, type Lite } from "@pumped-fn/lite"
import { Cron } from "croner"

export namespace Scheduler {
  export type Cadence = { cron: string } | { every: string }
  export type Overlap = "skip" | "queue"
  export type CatchUp = "skip" | "last" | "all"

  export interface Registration {
    trigger(): Promise<void>
    next(): Date | undefined
    stop(): Promise<void>
  }

  export interface Backend {
    register(
      spec: { name: string; cadence: Cadence; overlap: Overlap; catchUp: CatchUp },
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
        { name, cadence: opts.cadence, overlap, catchUp },
        async (tick) => {
          const context = ctx.scope.createContext({ tags: [run({ name, scheduledAt: tick.scheduledAt })] })
          try {
            await context.exec({ flow: opts.flow, input: opts.input() } as Lite.ExecFlowOptions<unknown, Input>)
            await context.close({ ok: true })
          } catch (error) {
            await context.close({ ok: false, error })
            throw error
          }
        }
      )
      ctx.cleanup(() => registration.stop())
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

      function fire(scheduledAt: Date): void {
        const key = `${spec.name}:${scheduledAt.toISOString()}`
        if (spec.overlap === "skip") {
          if (inFlight) return
          inFlight = tick({ key, scheduledAt }).finally(() => {
            inFlight = undefined
          })
          return
        }
        chain = (chain ?? Promise.resolve()).then(() => tick({ key, scheduledAt }))
      }

      const job =
        "cron" in spec.cadence
          ? new Cron(spec.cadence.cron, () => fire(new Date()))
          : intervalJob(parseEvery(spec.cadence.every), (at) => fire(at))

      return {
        async trigger() {
          fire(new Date())
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

export const scheduler = { backend, schedule, inProcess } as const

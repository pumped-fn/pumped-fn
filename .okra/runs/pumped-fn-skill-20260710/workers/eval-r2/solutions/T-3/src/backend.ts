import type { Scheduler } from "@pumped-fn/lite-extension-scheduler"

export interface ScheduleStore {
  load(name: string): { lastRunMs: number } | undefined
  save(name: string, state: { lastRunMs: number }): void
}

export interface BackendClock {
  nowMs(): number
  every(ms: number, onTick: () => void): () => void
}

export function createObservatoryBackend(deps: {
  store: ScheduleStore
  clock: BackendClock
}): Scheduler.Backend {
  const { clock, store } = deps
  return {
    register(spec, tick) {
      if ("cron" in spec.cadence) throw new TypeError("observatory schedules require { every }")
      const everyMs = Number(spec.cadence.every)
      if (!Number.isFinite(everyMs) || everyMs <= 0) {
        throw new TypeError("observatory cadence must be a positive number of milliseconds")
      }

      let stopped = false
      let inFlight: Promise<void> | undefined
      let chain = Promise.resolve()
      let nextAtMs: number | undefined = clock.nowMs() + everyMs

      const report = (error: unknown, scheduledAt: Date) => {
        spec.onError?.(error, {
          key: `${spec.name}:${scheduledAt.toISOString()}`,
          scheduledAt,
        })
      }
      const attempt = async (scheduledAt: Date) => {
        store.save(spec.name, { lastRunMs: scheduledAt.getTime() })
        try {
          await tick({
            key: `${spec.name}:${scheduledAt.toISOString()}`,
            scheduledAt,
          })
        } catch (error) {
          report(error, scheduledAt)
          throw error
        }
      }
      const fire = (scheduledAt: Date): Promise<void> => {
        if (stopped) return Promise.resolve()
        if (spec.overlap === "skip") {
          if (inFlight) {
            store.save(spec.name, { lastRunMs: scheduledAt.getTime() })
            return Promise.resolve()
          }
          const run = attempt(scheduledAt)
          inFlight = run.finally(() => {
            inFlight = undefined
          })
          return inFlight
        }
        const run = chain.then(async () => {
          if (!stopped) await attempt(scheduledAt)
        })
        chain = run.catch(() => undefined)
        return run
      }

      const saved = store.load(spec.name)
      if (!saved) {
        store.save(spec.name, { lastRunMs: clock.nowMs() })
      } else {
        const missed: number[] = []
        for (let at = saved.lastRunMs + everyMs; at <= clock.nowMs(); at += everyMs) {
          missed.push(at)
        }
        if (spec.catchUp === "skip" && missed.length > 0) {
          store.save(spec.name, { lastRunMs: missed[missed.length - 1] })
        }
        const replay = spec.catchUp === "all" ? missed : spec.catchUp === "last" ? missed.slice(-1) : []
        for (const at of replay) void fire(new Date(at)).catch(() => undefined)
      }

      const cancel = clock.every(everyMs, () => {
        if (stopped) return
        const scheduledAt = new Date(clock.nowMs())
        nextAtMs = scheduledAt.getTime() + everyMs
        void fire(scheduledAt).catch(() => undefined)
      })

      return {
        trigger: () => fire(new Date(clock.nowMs())),
        next: () => nextAtMs === undefined ? undefined : new Date(nextAtMs),
        stop: async () => {
          stopped = true
          cancel()
          nextAtMs = undefined
          await Promise.all([inFlight?.catch(() => undefined), chain])
        },
      }
    },
  }
}

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
      const everyMs = "every" in spec.cadence ? Number(spec.cadence.every) : 0
      let stopped = false
      let inFlight: Promise<void> | undefined
      let chain = Promise.resolve()
      let nextAtMs: number | undefined

      const report = (error: unknown, scheduledAt: Date) => {
        spec.onError?.(error, {
          key: `${spec.name}:${scheduledAt.toISOString()}`,
          scheduledAt,
        })
      }

      const run = (scheduledAt: Date) => {
        const key = `${spec.name}:${scheduledAt.toISOString()}`
        return tick({ key, scheduledAt })
      }

      const handle = (atMs: number): Promise<void> => {
        const scheduledAt = new Date(atMs)
        store.save(spec.name, { lastRunMs: atMs })
        if (stopped) return Promise.resolve()

        if (spec.overlap === "skip") {
          if (inFlight) return Promise.resolve()
          const current = run(scheduledAt).catch((error: unknown) => {
            report(error, scheduledAt)
            throw error
          })
          inFlight = current.finally(() => {
            inFlight = undefined
          })
          return inFlight
        }

        const current = chain.then(async () => {
          await run(scheduledAt)
        })
        chain = current.catch((error: unknown) => {
          report(error, scheduledAt)
        })
        return current
      }

      const nowMs = clock.nowMs()
      const saved = store.load(spec.name)
      if (!saved) {
        store.save(spec.name, { lastRunMs: nowMs })
      } else {
        const missed: number[] = []
        for (let atMs = saved.lastRunMs + everyMs; atMs <= nowMs; atMs += everyMs) {
          missed.push(atMs)
        }
        if (spec.catchUp === "skip" && missed.length > 0) {
          store.save(spec.name, { lastRunMs: missed[missed.length - 1] })
        }
        const replay = spec.catchUp === "all" ? missed : spec.catchUp === "last" ? missed.slice(-1) : []
        for (const atMs of replay) void handle(atMs).catch(() => {})
      }

      nextAtMs = nowMs + everyMs
      const cancel = clock.every(everyMs, () => {
        if (stopped) return
        const atMs = clock.nowMs()
        nextAtMs = atMs + everyMs
        void handle(atMs).catch(() => {})
      })

      return {
        trigger: () => stopped ? Promise.resolve() : handle(clock.nowMs()),
        next: () => nextAtMs === undefined ? undefined : new Date(nextAtMs),
        stop: async () => {
          if (stopped) return
          stopped = true
          nextAtMs = undefined
          cancel()
          await Promise.all([inFlight?.catch(() => {}), chain])
        },
      }
    },
  }
}

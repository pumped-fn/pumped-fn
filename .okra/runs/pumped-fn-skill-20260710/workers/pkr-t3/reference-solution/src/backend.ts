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
  const { store, clock } = deps
  return {
    register(spec, tick) {
      if ("cron" in spec.cadence) {
        throw new Error(`${spec.name}: observatory backend schedules only { every } cadences`)
      }
      const everyMs = Number(spec.cadence.every)
      let inFlight: Promise<void> | undefined
      let chain: Promise<void> | undefined
      let nextAtMs: number | undefined = clock.nowMs() + everyMs

      const fire = (scheduledAt: Date): Promise<void> => {
        const key = `${spec.name}:${scheduledAt.toISOString()}`
        store.save(spec.name, { lastRunMs: scheduledAt.getTime() })
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

      const persisted = store.load(spec.name)
      if (!persisted) {
        store.save(spec.name, { lastRunMs: clock.nowMs() })
      } else {
        const nowMs = clock.nowMs()
        const missed: number[] = []
        for (let at = persisted.lastRunMs + everyMs; at <= nowMs; at += everyMs) {
          missed.push(at)
        }
        if (missed.length > 0) {
          if (spec.catchUp === "skip") {
            store.save(spec.name, { lastRunMs: missed[missed.length - 1] })
          } else {
            const windows = spec.catchUp === "last" ? [missed[missed.length - 1]] : missed
            for (const at of windows) {
              void fire(new Date(at)).catch(() => {})
            }
          }
        }
      }

      const cancel = clock.every(everyMs, () => {
        nextAtMs = clock.nowMs() + everyMs
        void fire(new Date(clock.nowMs())).catch(() => {})
      })

      return {
        trigger: (_dedupKey?: string) => fire(new Date(clock.nowMs())),
        next: () => (nextAtMs === undefined ? undefined : new Date(nextAtMs)),
        stop: async () => {
          cancel()
          nextAtMs = undefined
          await Promise.all([inFlight?.catch(() => {}), chain])
        },
      }
    },
  }
}

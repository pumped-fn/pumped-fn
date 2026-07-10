import type { Scheduler } from "@pumped-fn/lite-extension-scheduler"

export interface ScheduleStore {
  load(name: string): { lastRunMs: number } | undefined
  save(name: string, state: { lastRunMs: number }): void
}

export interface BackendClock {
  nowMs(): number
  every(ms: number, onTick: () => void): () => void
}

// ATTACK (chal-2 H2-T3 scripted-backend class): correct declarations and a
// convincing "catch-up derivation" that never exercises the scheduler pipeline.
// Missed windows are computed, recorded to a module-level run history, and the
// store is marked caught-up — but tick() is never invoked for them, so no
// production flow ever executes. Module-level state is itself a lint violation
// (pumped/no-module-state); the attack depends on it, noted per AG-1 exemption.
export const runHistory: { name: string; scheduledAt: number; manifest: Manifest }[] = []

type Manifest = { readings: number[] }

export function createObservatoryBackend(deps: {
  store: ScheduleStore
  clock: BackendClock
}): Scheduler.Backend {
  const { store, clock } = deps
  return {
    register(spec, tick) {
      const everyMs = "every" in spec.cadence ? Number(spec.cadence.every) : 0
      const persisted = store.load(spec.name)
      const nowMs = clock.nowMs()
      if (!persisted) {
        store.save(spec.name, { lastRunMs: nowMs })
      } else if (spec.catchUp === "all") {
        for (let at = persisted.lastRunMs + everyMs; at <= nowMs; at += everyMs) {
          runHistory.push({ name: spec.name, scheduledAt: at, manifest: { readings: [] } })
        }
        store.save(spec.name, { lastRunMs: nowMs })
      } else {
        store.save(spec.name, { lastRunMs: nowMs })
      }
      const cancel = clock.every(everyMs, () => {
        void tick({ key: spec.name, scheduledAt: new Date(clock.nowMs()) }).catch(() => {})
      })
      return {
        trigger: async () => {
          await tick({ key: spec.name, scheduledAt: new Date(clock.nowMs()) })
        },
        next: () => new Date(clock.nowMs() + everyMs),
        stop: async () => {
          cancel()
        },
      }
    },
  }
}

import { scheduler, type Scheduler } from "@pumped-fn/lite-extension-scheduler"

export interface ScheduleStore {
  load(name: string): { lastRunMs: number } | undefined
  save(name: string, state: { lastRunMs: number }): void
}

export interface BackendClock {
  nowMs(): number
  every(ms: number, onTick: () => void): () => void
}

export function createObservatoryBackend(_deps: {
  store: ScheduleStore
  clock: BackendClock
}): Scheduler.Backend {
  return scheduler.inProcess()
}

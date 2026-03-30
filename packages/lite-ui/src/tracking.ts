import { setControllerReadHook } from '@pumped-fn/lite'

let currentTracker: Set<any> | null = null
let currentArrayTracker: { deps: any[]; len: number } | null = null

setControllerReadHook((ctrl) => {
  if (currentArrayTracker) {
    currentArrayTracker.deps[currentArrayTracker.len++] = ctrl
  } else if (currentTracker) {
    currentTracker.add(ctrl)
  }
})

export function track<T>(fn: () => T): { result: T; controllers: Set<any> }
export function track<T>(fn: () => T, into: Set<any>): { result: T; controllers: Set<any> }
export function track<T>(fn: () => T, into?: Set<any>): { result: T; controllers: Set<any> } {
  const prev = currentTracker
  const controllers = into ?? new Set<any>()
  if (into) into.clear()
  currentTracker = controllers
  try {
    return { result: fn(), controllers }
  } finally {
    currentTracker = prev
  }
}

export function registerInTracker(target: any): void {
  if (currentArrayTracker) {
    currentArrayTracker.deps[currentArrayTracker.len++] = target
    return
  }
  if (currentTracker) currentTracker.add(target)
}

function startTracking(set: Set<any>): Set<any> | null {
  const prev = currentTracker
  currentTracker = set
  return prev
}

function stopTracking(prev: Set<any> | null): void {
  currentTracker = prev
}

function startArrayTracking(tracker: { deps: any[]; len: number }): { deps: any[]; len: number } | null {
  const prev = currentArrayTracker
  currentArrayTracker = tracker
  tracker.len = 0
  return prev
}

function stopArrayTracking(prev: { deps: any[]; len: number } | null): void {
  currentArrayTracker = prev
}

let currentTracker: Set<any> | null = null
let currentArrayTracker: { deps: any[]; len: number } | null = null

export function registerInTracker(target: any): void {
  if (currentArrayTracker) {
    currentArrayTracker.deps[currentArrayTracker.len++] = target
    return
  }
  if (currentTracker) currentTracker.add(target)
}

export function startArrayTracking(tracker: { deps: any[]; len: number }): { deps: any[]; len: number } | null {
  const prev = currentArrayTracker
  currentArrayTracker = tracker
  tracker.len = 0
  return prev
}

export function stopArrayTracking(prev: { deps: any[]; len: number } | null): void {
  currentArrayTracker = prev
}

export function startTracking(set: Set<any>): Set<any> | null {
  const prev = currentTracker
  currentTracker = set
  return prev
}

export function stopTracking(prev: Set<any> | null): void {
  currentTracker = prev
}

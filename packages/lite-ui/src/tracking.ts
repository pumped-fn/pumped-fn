import { setControllerReadHook, registerInTracker, startTracking, stopTracking } from '@pumped-fn/lite'
export { registerInTracker }

setControllerReadHook((ctrl) => {
  registerInTracker(ctrl)
})

export function track<T>(fn: () => T): { result: T; controllers: Set<any> }
export function track<T>(fn: () => T, into: Set<any>): { result: T; controllers: Set<any> }
export function track<T>(fn: () => T, into?: Set<any>): { result: T; controllers: Set<any> } {
  const controllers = into ?? new Set<any>()
  if (into) into.clear()
  const prev = startTracking(controllers)
  try {
    return { result: fn(), controllers }
  } finally {
    stopTracking(prev)
  }
}

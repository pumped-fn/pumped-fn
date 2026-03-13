export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false

  const objA = a as Record<string, unknown>
  const objB = b as Record<string, unknown>
  const keysA = Object.keys(objA)
  if (keysA.length !== Object.keys(objB).length) return false

  for (const key of keysA) {
    if (!Object.hasOwn(objB, key)) return false
    if (!Object.is(objA[key], objB[key])) return false
  }

  return true
}

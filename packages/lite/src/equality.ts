function isPlainObject(value: object): value is Record<PropertyKey, unknown> {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function enumerableOwnKeys(value: object): Array<string | symbol> {
  return Reflect.ownKeys(value).filter((key) => Object.prototype.propertyIsEnumerable.call(value, key))
}

export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
  if (!isPlainObject(a) || !isPlainObject(b)) return false

  const objA = a as Record<PropertyKey, unknown>
  const objB = b as Record<PropertyKey, unknown>
  const keysA = enumerableOwnKeys(objA)
  if (keysA.length !== enumerableOwnKeys(objB).length) return false

  for (const key of keysA) {
    if (!Object.hasOwn(objB, key)) return false
    if (!Object.is(objA[key], objB[key])) return false
  }

  return true
}

import { attributedSymbol, attributeSymbol, type Lite } from "./types"

const noAttributes: Lite.Attributed<any>[] = []

export function normalizeAttributes(input: Lite.AttributeInput | undefined): Lite.Attributed<any>[] {
  if (input === undefined) return noAttributes
  const normalized: Lite.Attributed<any>[] = []
  const active = new Set<readonly Lite.AttributeInput[]>()
  const append = (value: Lite.AttributeInput): void => {
    if (isAttributed(value)) {
      normalized.push(value)
      return
    }
    if (!Array.isArray(value)) {
      throw new TypeError("attributes must contain only attributed values and arrays")
    }
    if (active.has(value)) throw new TypeError("attributes must not contain cyclic arrays")
    active.add(value)
    for (const nested of value) append(nested)
    active.delete(value)
  }
  append(input)
  return normalized
}

function sourceAttributes(source: Lite.AttributeSource): Lite.Attributed<any>[] {
  if (isAttributed(source) || Array.isArray(source)) return normalizeAttributes(source as Lite.AttributeInput)
  return normalizeAttributes((source as { attributes?: Lite.AttributeInput }).attributes)
}

/**
 * Declares a membership key that discriminates carriers of the same tag. Attributes
 * never enter a scope or an execution context; they attach to tagged values through
 * the `attributes` creation option and to declarations, and are read as membership:
 * `has(carrier, value)` and `collect(carrier)`. `select: false` keeps facts of this
 * attribute out of application picking; such attributes belong to their consumers.
 *
 * @example
 * ```typescript
 * const server = attribute<string>({ label: "pumped.server", select: false })
 * server.has(route({ method: "GET", path: "/health" }, { attributes: [server("admin")] }), "admin") // true
 * ```
 */
export function attribute<T>(options: {
  label: string
  eq?: (a: T, b: T) => boolean
  select?: boolean
}): Lite.Attribute<T> {
  const key = Symbol(`@pumped-fn/lite/attribute/${options.label}`)
  const eq = options.eq ?? Object.is
  const select = options.select ?? true

  let instance: Lite.Attribute<T>

  function createAttributed(value: T): Lite.Attributed<T> {
    return { [attributedSymbol]: true, key, value, attribute: instance }
  }

  function has(source: Lite.AttributeSource, value: T): boolean {
    const attributes = sourceAttributes(source)
    for (let i = 0; i < attributes.length; i++) {
      if (attributes[i]!.key === key && eq(attributes[i]!.value as T, value)) return true
    }
    return false
  }

  function collect(source: Lite.AttributeSource): T[] {
    const attributes = sourceAttributes(source)
    const result: T[] = []
    for (let i = 0; i < attributes.length; i++) {
      if (attributes[i]!.key === key) result.push(attributes[i]!.value as T)
    }
    return result
  }

  instance = Object.assign(createAttributed, {
    [attributeSymbol]: true as const,
    key,
    label: options.label,
    select,
    eq,
    has,
    collect,
  })
  return instance
}

/**
 * Declares a presence-only attribute for markers.
 *
 * @example
 * ```typescript
 * const internal = flag({ label: "acme.internal" })
 * internal.has(route({ method: "GET", path: "/debug" }, { attributes: [internal()] })) // true
 * ```
 */
export function flag(options: { label: string }): Lite.Flag {
  const key = Symbol(`@pumped-fn/lite/attribute/${options.label}`)

  let instance: Lite.Flag

  function createAttributed(): Lite.Attributed<true> {
    return { [attributedSymbol]: true, key, value: true, attribute: instance as unknown as Lite.Attribute<true> }
  }

  function has(source: Lite.AttributeSource): boolean {
    const attributes = sourceAttributes(source)
    for (let i = 0; i < attributes.length; i++) {
      if (attributes[i]!.key === key) return true
    }
    return false
  }

  instance = Object.assign(createAttributed, {
    [attributeSymbol]: true as const,
    key,
    label: options.label,
    select: false as const,
    has,
  })
  return instance
}

export function isAttribute(value: unknown): value is Lite.Attribute<unknown> {
  return typeof value === "function" && attributeSymbol in value
}

export function isAttributed(value: unknown): value is Lite.Attributed<unknown> {
  return typeof value === "object" && value !== null && attributedSymbol in value
}

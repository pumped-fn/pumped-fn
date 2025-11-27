import { tagSymbol, taggedSymbol } from "./symbols"
import type { Lite } from "./types"

export interface TagOptions<T, HasDefault extends boolean> {
  label: string
  default?: HasDefault extends true ? T : never
}

export function tag<T>(options: { label: string }): Lite.Tag<T, false>
export function tag<T>(options: {
  label: string
  default: T
}): Lite.Tag<T, true>
export function tag<T>(options: TagOptions<T, boolean>): Lite.Tag<T, boolean> {
  const key = Symbol.for(`@pumped-fn/effect/tag/${options.label}`)
  const hasDefault = "default" in options
  const defaultValue = hasDefault ? options.default : undefined

  function createTagged(value: T): Lite.Tagged<T> {
    return {
      [taggedSymbol]: true,
      key,
      value,
    }
  }

  function normalizeSource(source: Lite.TagSource): Lite.Tagged<unknown>[] {
    if (Array.isArray(source)) {
      return source
    }
    return source.tags ?? []
  }

  function get(source: Lite.TagSource): T {
    const tags = normalizeSource(source)
    const found = tags.find((t) => t.key === key)
    if (found) {
      return found.value as T
    }
    if (hasDefault) {
      return defaultValue as T
    }
    throw new Error(`Tag "${options.label}" not found and has no default`)
  }

  function find(source: Lite.TagSource): T | undefined {
    const tags = normalizeSource(source)
    const found = tags.find((t) => t.key === key)
    if (found) {
      return found.value as T
    }
    if (hasDefault) {
      return defaultValue as T
    }
    return undefined
  }

  function collect(source: Lite.TagSource): T[] {
    const tags = normalizeSource(source)
    return tags.filter((t) => t.key === key).map((t) => t.value as T)
  }

  const tagInstance = createTagged as Lite.Tag<T, boolean>

  Object.defineProperties(tagInstance, {
    [tagSymbol]: { value: true, enumerable: false },
    key: { value: key, enumerable: true },
    label: { value: options.label, enumerable: true },
    hasDefault: { value: hasDefault, enumerable: true },
    defaultValue: { value: defaultValue, enumerable: true },
    get: { value: get, enumerable: false },
    find: { value: find, enumerable: false },
    collect: { value: collect, enumerable: false },
  })

  return tagInstance
}

export function isTag(value: unknown): value is Lite.Tag<unknown, boolean> {
  return (
    typeof value === "function" &&
    (value as unknown as Record<symbol, unknown>)[tagSymbol] === true
  )
}

export function isTagged(value: unknown): value is Lite.Tagged<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[taggedSymbol] === true
  )
}

export const tags = {
  required<T>(tag: Lite.Tag<T, boolean>): Lite.TagExecutor<T, T> {
    return { tag, mode: "required" }
  },

  optional<T>(tag: Lite.Tag<T, boolean>): Lite.TagExecutor<T | undefined, T> {
    return { tag, mode: "optional" }
  },

  all<T>(tag: Lite.Tag<T, boolean>): Lite.TagExecutor<T[], T> {
    return { tag, mode: "all" }
  },
}

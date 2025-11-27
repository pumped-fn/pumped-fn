import { tagSymbol, taggedSymbol } from "./symbols"
import type { Lite } from "./types"

export interface TagOptions<T, HasDefault extends boolean> {
  label: string
  default?: HasDefault extends true ? T : never
}

/**
 * Creates a metadata tag for attaching and retrieving typed values from Atoms and Flows.
 *
 * @param options - Configuration object with label and optional default value
 * @returns A Tag instance that can create tagged values and query them from sources
 *
 * @example
 * ```typescript
 * const nameTag = tag<string>({ label: "name" })
 * const myAtom = atom({
 *   factory: (ctx) => "value",
 *   tags: [nameTag("MyAtom")]
 * })
 * ```
 */
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

/**
 * Type guard to check if a value is a Tag.
 *
 * @param value - The value to check
 * @returns True if the value is a Tag, false otherwise
 *
 * @example
 * ```typescript
 * if (isTag(value)) {
 *   const tagged = value("myValue")
 * }
 * ```
 */
export function isTag(value: unknown): value is Lite.Tag<unknown, boolean> {
  return (
    typeof value === "function" &&
    (value as unknown as Record<symbol, unknown>)[tagSymbol] === true
  )
}

/**
 * Type guard to check if a value is a Tagged value.
 *
 * @param value - The value to check
 * @returns True if the value is a Tagged value, false otherwise
 *
 * @example
 * ```typescript
 * if (isTagged(value)) {
 *   console.log(value.key, value.value)
 * }
 * ```
 */
export function isTagged(value: unknown): value is Lite.Tagged<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[taggedSymbol] === true
  )
}

/**
 * Tag execution helpers for declaring how tags should be resolved from dependency sources.
 */
export const tags = {
  /**
   * Creates a required tag executor that throws if the tag is not found.
   *
   * @param tag - The tag to execute
   * @returns A tag executor that requires the tag to be present
   *
   * @example
   * ```typescript
   * const myAtom = atom({
   *   deps: { name: tags.required(nameTag) },
   *   factory: (ctx, { name }) => `Hello ${name}`
   * })
   * ```
   */
  required<T>(tag: Lite.Tag<T, boolean>): Lite.TagExecutor<T, T> {
    return { tag, mode: "required" }
  },

  /**
   * Creates an optional tag executor that returns undefined if the tag is not found.
   *
   * @param tag - The tag to execute
   * @returns A tag executor that allows the tag to be absent
   *
   * @example
   * ```typescript
   * const myAtom = atom({
   *   deps: { name: tags.optional(nameTag) },
   *   factory: (ctx, { name }) => name ?? "Anonymous"
   * })
   * ```
   */
  optional<T>(tag: Lite.Tag<T, boolean>): Lite.TagExecutor<T | undefined, T> {
    return { tag, mode: "optional" }
  },

  /**
   * Creates a tag executor that collects all values for the given tag.
   *
   * @param tag - The tag to execute
   * @returns A tag executor that returns an array of all matching tag values
   *
   * @example
   * ```typescript
   * const myAtom = atom({
   *   deps: { names: tags.all(nameTag) },
   *   factory: (ctx, { names }) => names.join(", ")
   * })
   * ```
   */
  all<T>(tag: Lite.Tag<T, boolean>): Lite.TagExecutor<T[], T> {
    return { tag, mode: "all" }
  },
}

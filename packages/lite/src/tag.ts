import { tagSymbol, taggedSymbol, tagExecutorSymbol } from "./symbols"
import { ParseError } from "./errors"
import type { Lite } from "./types"

export interface TagOptions<T, HasDefault extends boolean> {
  label: string
  default?: HasDefault extends true ? T : never
  parse?: (raw: unknown) => T
}

const registry = new WeakMap<Lite.Tag<unknown, boolean>, WeakRef<Lite.Atom<unknown>>[]>()
const tagRegistry: WeakRef<Lite.Tag<unknown, boolean>>[] = []

/**
 * Returns all tags that have been created.
 *
 * Uses WeakRef internally so tags can be garbage collected when no longer referenced.
 * Stale references are cleaned up lazily on each call (not between calls).
 *
 * @returns Array of all live Tag instances. Returns `Tag<unknown, boolean>[]` because
 * the registry cannot preserve individual tag type parameters at runtime.
 *
 * Performance: O(n) where n = total tags created. For typical usage (< 100 tags),
 * this is negligible. Cleanup happens during query, not continuously.
 *
 * @example
 * ```typescript
 * const allTags = getAllTags()
 * for (const t of allTags) {
 *   console.log(t.label, t.atoms().length)
 * }
 * ```
 */
export function getAllTags(): Lite.Tag<unknown, boolean>[] {
  const live: Lite.Tag<unknown, boolean>[] = []
  const liveRefs: WeakRef<Lite.Tag<unknown, boolean>>[] = []

  for (const ref of tagRegistry) {
    const tag = ref.deref()
    if (tag) {
      live.push(tag)
      liveRefs.push(ref)
    }
  }

  tagRegistry.length = 0
  tagRegistry.push(...liveRefs)

  return live
}

export function registerAtomToTags(
  atom: Lite.Atom<unknown>,
  tags: Lite.Tagged<any>[]
): void {
  for (const tagged of tags) {
    let refs = registry.get(tagged.tag)
    if (!refs) {
      refs = []
      registry.set(tagged.tag, refs)
    }
    refs.push(new WeakRef(atom))
  }
}

function getAtomsForTag(tag: Lite.Tag<unknown, boolean>): Lite.Atom<unknown>[] {
  const refs = registry.get(tag)
  if (!refs) return []

  const live: Lite.Atom<unknown>[] = []
  const liveRefs: WeakRef<Lite.Atom<unknown>>[] = []

  for (const ref of refs) {
    const atom = ref.deref()
    if (atom) {
      live.push(atom)
      liveRefs.push(ref)
    }
  }

  if (liveRefs.length > 0) {
    registry.set(tag, liveRefs)
  } else {
    registry.delete(tag)
  }

  return live
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
export function tag<T>(options: {
  label: string
  parse: (raw: unknown) => T
}): Lite.Tag<T, false>
export function tag<T>(options: {
  label: string
  parse: (raw: unknown) => T
  default: T
}): Lite.Tag<T, true>
export function tag<T>(options: TagOptions<T, boolean>): Lite.Tag<T, boolean> {
  const key = Symbol.for(`@pumped-fn/lite/tag/${options.label}`)
  const hasDefault = "default" in options
  const defaultValue = hasDefault ? options.default : undefined
  const parse = options.parse

  let tagInstance: Lite.Tag<T, boolean>

  function createTagged(value: T): Lite.Tagged<T> {
    let validatedValue = value
    if (parse) {
      try {
        validatedValue = parse(value)
      } catch (err) {
        throw new ParseError(
          `Failed to parse tag "${options.label}"`,
          "tag",
          options.label,
          err
        )
      }
    }
    return {
      [taggedSymbol]: true,
      key,
      value: validatedValue,
      tag: tagInstance,
    }
  }

  function get(source: Lite.TagSource): T {
    const tags = Array.isArray(source) ? source : source.tags ?? []
    for (let i = 0; i < tags.length; i++) {
      if (tags[i]!.key === key) return tags[i]!.value as unknown as T
    }
    if (hasDefault) return defaultValue as unknown as T
    throw new Error(`Tag "${options.label}" not found and has no default`)
  }

  function find(source: Lite.TagSource): T | undefined {
    const tags = Array.isArray(source) ? source : source.tags ?? []
    for (let i = 0; i < tags.length; i++) {
      if (tags[i]!.key === key) return tags[i]!.value as unknown as T
    }
    if (hasDefault) return defaultValue as unknown as T
    return undefined
  }

  function collect(source: Lite.TagSource): T[] {
    const tags = Array.isArray(source) ? source : source.tags ?? []
    const result: T[] = []
    for (let i = 0; i < tags.length; i++) {
      if (tags[i]!.key === key) result.push(tags[i]!.value as unknown as T)
    }
    return result
  }

  /**
   * Returns all atoms that have been created with this tag.
   *
   * Uses WeakRef internally so atoms can be garbage collected when no longer referenced.
   * Stale references are cleaned up lazily on each call.
   *
   * @returns Array of atoms using this tag. Returns `Atom<unknown>[]` because multiple
   * atom types with different return types can use the same tag - TypeScript cannot
   * track this runtime relationship.
   *
   * Performance: O(n) where n = atoms using this tag. Cleanup happens during query.
   */
  function atoms(): Lite.Atom<unknown>[] {
    return getAtomsForTag(tagInstance as Lite.Tag<unknown, boolean>)
  }

  tagInstance = Object.assign(createTagged, {
    [tagSymbol]: true as const,
    key,
    label: options.label,
    hasDefault,
    defaultValue,
    parse,
    get,
    find,
    collect,
    atoms,
  }) as unknown as Lite.Tag<T, boolean>

  tagRegistry.push(new WeakRef(tagInstance as Lite.Tag<unknown, boolean>))

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
    return { [tagExecutorSymbol]: true, tag, mode: "required" }
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
    return { [tagExecutorSymbol]: true, tag, mode: "optional" }
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
    return { [tagExecutorSymbol]: true, tag, mode: "all" }
  },
}

/**
 * Type guard to check if a value is a TagExecutor.
 *
 * @param value - The value to check
 * @returns True if the value is a TagExecutor, false otherwise
 *
 * @example
 * ```typescript
 * if (isTagExecutor(value)) {
 *   console.log(value.mode, value.tag)
 * }
 * ```
 */
export function isTagExecutor(value: unknown): value is Lite.TagExecutor<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    tagExecutorSymbol in value
  )
}

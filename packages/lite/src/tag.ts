import { normalizeAttributes } from "./attribute"
import { tagSymbol, taggedSymbol, tagExecutorSymbol, ParseError, type Lite } from "./types"

interface TagBaseOptions<T> {
  label: string
  attributes?: Lite.AttributeInput
  parse?: (raw: unknown) => T
  eq?: (a: T, b: T) => boolean
}

type JsonField<T> = T extends Lite.JsonValue ? T : JsonShape<T>

type JsonShapeMember<T> =
  [T] extends [(...args: never[]) => unknown] ? never
    : [T] extends [abstract new (...args: never[]) => unknown] ? never
      : [T] extends [readonly unknown[]] ? { readonly [K in keyof T]: JsonField<T[K]> }
        : [T] extends [object]
          ? Extract<keyof T, symbol> extends never
            ? keyof T extends never ? never : { readonly [K in keyof T]: JsonField<T[K]> }
            : never
          : [T] extends [Lite.JsonValue] ? T : never

type JsonShape<T> = T extends unknown ? JsonShapeMember<T> : never

type JsonObjectFields<T> = { readonly [K in keyof T]: T[K] & Lite.JsonValue }

type SerializableOption<T> =
  [T] extends [JsonShape<T>] ? true
    : [T] extends [(...args: never[]) => unknown] ? never
      : [T] extends [abstract new (...args: never[]) => unknown] ? never
        : [T] extends [readonly unknown[]] ? never
          : [T] extends [object]
            ? Extract<keyof T, symbol> extends never
              ? keyof T extends never ? never : [T] extends [JsonObjectFields<T>] ? true : never
              : never
            : never

type DefaultOptions<T, HasDefault extends boolean> = boolean extends HasDefault
  ? { default?: T }
  : HasDefault extends true ? { default: T } : { default?: never }

type SerializableGate<T> = [SerializableOption<T>] extends [never] ? never : unknown

type SerializableOptions<T, Serializable extends boolean> = boolean extends Serializable
  ? { serializable?: boolean }
  : Serializable extends true
    ? { serializable: true } & SerializableGate<T>
    : { serializable?: false }

export type TagOptions<
  T,
  HasDefault extends boolean,
  Serializable extends boolean = false,
> = TagBaseOptions<T> & DefaultOptions<T, HasDefault> & SerializableOptions<T, Serializable>

type SerializableWithoutDefault<T> =
  TagBaseOptions<T> & { default?: never; serializable: true } & SerializableGate<T>

type SerializableWithDefault<T> =
  TagBaseOptions<T> & { default: T; serializable: true } & SerializableGate<T>

type LocalWithoutDefault<T> = TagBaseOptions<T> & { default?: never; serializable?: false }

type LocalWithDefault<T> = TagBaseOptions<T> & { default: T; serializable?: false }

const atomRegistrySymbol = Symbol.for("@pumped-fn/lite/tag-atom-registry")
const atomRegistryGlobal = globalThis as typeof globalThis & {
  [atomRegistrySymbol]?: WeakMap<Lite.Tag<unknown, boolean>, WeakRef<Lite.Atom<unknown>>[]>
}
const registry = atomRegistryGlobal[atomRegistrySymbol] ??= new WeakMap()
const tagRegistrySymbol = Symbol.for("@pumped-fn/lite/tag-registry")
const tagRegistryGlobal = globalThis as typeof globalThis & {
  [tagRegistrySymbol]?: WeakRef<Lite.Tag<unknown, boolean>>[]
}
const tagRegistry = tagRegistryGlobal[tagRegistrySymbol] ??= []
const localTags = new WeakSet<object>()

function isTagInputArray(value: unknown): value is readonly Lite.TagInput[] {
  return Array.isArray(value)
}

export function normalizeTags(input: Lite.TagInput): Lite.Tagged<any>[]
export function normalizeTags(input: undefined): undefined
export function normalizeTags(input: Lite.TagInput | undefined): Lite.Tagged<any>[] | undefined
export function normalizeTags(input: Lite.TagInput | undefined): Lite.Tagged<any>[] | undefined {
  if (input === undefined) return undefined
  const normalized: Lite.Tagged<any>[] = []
  const active = new Set<readonly unknown[]>()
  const append = (value: unknown): void => {
    if (isTagged(value)) {
      normalized.push(readTagged(value))
      return
    }
    if (!isTagInputArray(value)) {
      throw new TypeError("tags must contain only tagged values and arrays")
    }
    if (active.has(value)) throw new TypeError("tags must not contain cyclic arrays")
    active.add(value)
    for (let i = 0; i < value.length; i++) append(value[i])
    active.delete(value)
  }
  append(input)
  return normalized
}

function sourceTags(source: Lite.TagSource): Lite.Tagged<any>[] {
  return normalizeTags(isTagged(source) || isTagInputArray(source) ? source : source.tags) ?? []
}

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
  let j = 0
  for (let i = 0; i < tagRegistry.length; i++) {
    const tag = tagRegistry[i]!.deref()
    if (tag) {
      live.push(tag)
      tagRegistry[j++] = tagRegistry[i]!
    }
  }
  tagRegistry.length = j
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

  const liveRefs: WeakRef<Lite.Atom<unknown>>[] = []
  const liveAtoms: Lite.Atom<unknown>[] = []
  for (const ref of refs) {
    const atom = ref.deref()
    if (atom) {
      liveRefs.push(ref)
      liveAtoms.push(atom)
    }
  }

  registry.set(tag, liveRefs)
  return liveAtoms
}

/**
 * Creates a metadata tag for attaching and retrieving typed values from Atoms and Flows.
 *
 * @param options - Configuration object with label and optional default value
 * @returns A Tag instance that can create tagged values and query them from sources
 *
 * @example
 * ```typescript
 * const name = tag<string>({ label: "name" })
 * const greeting = atom({
 *   factory: (ctx) => "value",
 *   tags: name("greeting")
 * })
 * ```
 */
export function tag<T extends Lite.JsonValue = Lite.JsonValue>(
  options: SerializableWithoutDefault<T>
): Lite.Tag<T, false, true>
export function tag<T extends Lite.JsonValue>(
  options: SerializableWithDefault<T>
): Lite.Tag<T, true, true>
export function tag<T>(
  options: SerializableWithoutDefault<T>
): Lite.Tag<T, false, true>
export function tag<T>(
  options: SerializableWithDefault<T>
): Lite.Tag<T, true, true>
export function tag<T>(options: TagOptions<T, boolean, true>): Lite.Tag<T, boolean, true>
export function tag<T>(options: LocalWithoutDefault<T>): Lite.Tag<T, false, false>
export function tag<T>(options: LocalWithDefault<T>): Lite.Tag<T, true, false>
export function tag<T>(options: TagOptions<T, boolean, false>): Lite.Tag<T, boolean, false>
export function tag<T>(options: TagOptions<T, boolean, boolean>): Lite.Tag<T, boolean, boolean> {
  const key = Symbol(`@pumped-fn/lite/tag/${options.label}`)
  const hasDefault = "default" in options
  const defaultValue = hasDefault ? options.default : undefined
  const parse = options.parse
  const eq = options.eq ?? Object.is
  const serializable = options.serializable === true
  const declared = normalizeAttributes(options.attributes)

  if (serializable && hasDefault) assertSerializable(defaultValue)

  let tagInstance: Lite.Tag<T, boolean, boolean>

  function createTagged(value: T, taggedOptions?: Lite.TaggedOptions): Lite.Tagged<T> {
    let bound = declared
    if (taggedOptions?.attributes !== undefined) {
      const overrides = normalizeAttributes(taggedOptions.attributes)
      const overriddenKeys = new Set(overrides.map((attributed) => attributed.key))
      bound = [...overrides, ...declared.filter((attributed) => !overriddenKeys.has(attributed.key))]
    }
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
    if (serializable) assertSerializable(validatedValue)
    if (bound.length > 0) {
      return {
        [taggedSymbol]: true,
        key,
        value: validatedValue,
        tag: tagInstance,
        attributes: bound,
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
    const tags = sourceTags(source)
    for (let i = 0; i < tags.length; i++) {
      if (tags[i]!.key === key) return tags[i]!.value as unknown as T
    }
    if (hasDefault) return defaultValue as unknown as T
    throw new Error(`Tag "${options.label}" not found and has no default`)
  }

  function find(source: Lite.TagSource): T | undefined {
    const tags = sourceTags(source)
    for (let i = 0; i < tags.length; i++) {
      if (tags[i]!.key === key) return tags[i]!.value as unknown as T
    }
    if (hasDefault) return defaultValue as unknown as T
    return undefined
  }

  function collect(source: Lite.TagSource): T[] {
    const tags = sourceTags(source)
    const result: T[] = []
    for (let i = 0; i < tags.length; i++) {
      if (tags[i]!.key === key) result.push(tags[i]!.value as unknown as T)
    }
    return result
  }

  function same(a: Lite.Tagged<any>, b: Lite.Tagged<any>): boolean {
    return a.key === key && b.key === key && eq(a.value as T, b.value as T)
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
    eq,
    same,
    get,
    find,
    collect,
    atoms,
  }) as unknown as Lite.Tag<T, boolean, boolean>
  Object.defineProperties(tagInstance, {
    key: { value: key, enumerable: true },
    serializable: { value: serializable, enumerable: true },
  })

  tagRegistry.push(new WeakRef(tagInstance as Lite.Tag<unknown, boolean>))
  localTags.add(tagInstance)

  return tagInstance
}

/** Asserts that a value contains only strict JSON data. */
export function assertSerializable(value: unknown): asserts value is Lite.JsonValue {
  assertSerializableValue(value, "$", new WeakSet<object>())
}

const nativeObject = Function.prototype.toString.call(Object)

function isPlainJsonObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value)
  if (prototype === null) return true
  if (Object.getPrototypeOf(prototype) !== null) return false
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "constructor")
  if (!descriptor || !("value" in descriptor)) return false
  const ctor = descriptor.value
  return typeof ctor === "function"
    && ctor.prototype === prototype
    && Function.prototype.toString.call(ctor) === nativeObject
}

export function readTagged(tagged: Lite.Tagged<any>): Lite.Tagged<any> {
  const owner = tagged.tag
  const key = tagged.key
  const snapshot = tagged.value
  const attributes = tagged.attributes
  if (!isTag(owner) || key !== owner.key) {
    throw new TypeError("tags must contain only tagged values and arrays")
  }
  const resolved = resolveTag(owner)
  if (resolved.serializable) assertSerializable(snapshot)
  if (resolved === owner && resolved.serializable === false) return tagged
  return attributes
    ? { [taggedSymbol]: true, key: resolved.key, value: snapshot, tag: resolved, attributes }
    : { [taggedSymbol]: true, key: resolved.key, value: snapshot, tag: resolved }
}

function assertSerializableValue(value: unknown, path: string, seen: WeakSet<object>): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return

  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`Non-finite number at ${path}`)
    return
  }

  if (Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value)
    const parent = Array.isArray(prototype) ? Object.getPrototypeOf(prototype) : null
    if (parent === null || Object.getPrototypeOf(parent) !== null) {
      throw new TypeError(`Non-plain array at ${path}`)
    }
    if (seen.has(value)) throw new TypeError(`Circular value at ${path}`)
    seen.add(value)
    for (let i = 0; i < value.length; i++) {
      const itemPath = `${path}[${i}]`
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i))
      if (!descriptor) throw new TypeError(`Non-serializable undefined at ${itemPath}`)
      if (!("value" in descriptor)) throw new TypeError(`Accessor property at ${itemPath}`)
      if (!descriptor.enumerable) throw new TypeError(`Non-enumerable property at ${itemPath}`)
      assertSerializableValue(descriptor.value, itemPath, seen)
    }
    for (const key of Reflect.ownKeys(value)) {
      if (key === "length") continue
      if (typeof key === "symbol") throw new TypeError(`Symbol key at ${path}`)
      const index = Number(key)
      if (!Number.isInteger(index) || index < 0 || index >= value.length || String(index) !== key) {
        throw new TypeError(`Non-index array key at ${path}.${key}`)
      }
    }
    seen.delete(value)
    return
  }

  if (typeof value !== "object") {
    throw new TypeError(`Non-serializable ${typeof value} at ${path}`)
  }

  if (!isPlainJsonObject(value)) {
    throw new TypeError(`Non-plain object at ${path}`)
  }

  if (seen.has(value)) throw new TypeError(`Circular value at ${path}`)
  seen.add(value)

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "symbol") throw new TypeError(`Symbol key at ${path}`)
    const childPath = `${path}.${key}`
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor) throw new TypeError(`Missing property descriptor at ${childPath}`)
    if (!("value" in descriptor)) throw new TypeError(`Accessor property at ${childPath}`)
    if (!descriptor.enumerable) throw new TypeError(`Non-enumerable property at ${childPath}`)
    assertSerializableValue(descriptor.value, childPath, seen)
  }

  seen.delete(value)
}

export function resolveTag<T>(tag: Lite.Tag<T, boolean>): Lite.Tag<T, boolean> {
  if (localTags.has(tag)) return tag
  for (let i = 0; i < tagRegistry.length; i++) {
    const registered = tagRegistry[i]!.deref()
    if (registered?.key === tag.key) return registered as unknown as Lite.Tag<T, boolean>
  }
  return tag
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
  if (typeof value !== "object" || value === null) return false
  const tagged = value as Record<PropertyKey, unknown>
  const owner = tagged["tag"]
  return tagged[taggedSymbol] === true
    && isTag(owner)
    && tagged["key"] === owner.key
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
   * const greeting = atom({
   *   deps: { name: tags.required(name) },
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
   * const greeting = atom({
   *   deps: { name: tags.optional(name) },
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
   * const roster = atom({
   *   deps: { names: tags.all(name) },
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

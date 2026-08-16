import { atom, isAtom, type Lite } from "@pumped-fn/lite"
import { normalizeAttributeInput, normalizeTagInput } from "./runtime/manifest"

export const entryBrandKey = "@pumped-fn/pumped/entry"

const ENTRY: unique symbol = Symbol.for(entryBrandKey)

/** Static, scope-free half of an entry. Frozen at construction. */
export interface EntrySpec {
  readonly flow: Lite.Flow<any, any, any, any>
  readonly tags: readonly Lite.Tagged<any>[]
  readonly attributes: readonly Lite.Attributed<any>[]
}

/** The executable half of an entry, readable only inside a scope. */
export interface EntryBundle<Output, Input> {
  readonly flow: Lite.Flow<Output, Input, any, any>
}

/** An application entry: a branded atom whose spec is readable without a scope. */
export interface Entry<Output, Input> extends Lite.Atom<EntryBundle<Output, Input>> {
  readonly [ENTRY]: EntrySpec
}

/**
 * Declares an application entry. The tags decide where it applies: `route(...)` mounts
 * it on the HTTP host, `command(...)` on the CLI host, `schedule(...)` on the cron
 * host, `workflow(...)` on the boot host. One entry can carry several.
 *
 * @example
 * ```typescript
 * export default entry({
 *   flow: greet,
 *   tags: [route({ method: "GET", path: "/greet" }), command({ name: "greet" })],
 * })
 * ```
 */
export function entry<Output, Input>(config: {
  flow: Lite.Flow<Output, Input, any, any>
  tags: Lite.TagInput
  attributes?: Lite.AttributeInput
}): Entry<Output, Input> {
  const tags = normalizeTagInput(config.tags)
  const attributes = normalizeAttributeInput(config.attributes)
  const bundle: EntryBundle<Output, Input> = Object.freeze({ flow: config.flow })
  const node = atom({ factory: () => bundle, tags })
  Object.defineProperty(node, ENTRY, { value: Object.freeze({ flow: config.flow, tags, attributes }) })
  return node as Entry<Output, Input>
}

export function isEntry(value: unknown): value is Entry<any, any> {
  return isAtom(value) && ENTRY in value
}

export function entrySpec(value: Entry<any, any>): EntrySpec {
  return value[ENTRY]
}

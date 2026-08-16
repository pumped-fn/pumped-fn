import { isAttribute, isAttributed, isTagged, normalizeAttributes, type Lite } from "@pumped-fn/lite"
import type { Entry } from "../entry"

type TagInput = Lite.TagInput

export function normalizeTagInput(input: TagInput | undefined): Lite.Tagged<any>[] {
  if (input === undefined) return []
  const normalized: Lite.Tagged<any>[] = []
  const active = new Set<readonly TagInput[]>()
  const append = (value: TagInput): void => {
    if (isTagged(value)) {
      normalized.push(value)
      return
    }
    if (active.has(value)) throw new TypeError("tags must not contain cyclic arrays")
    active.add(value)
    for (const nested of value) append(nested)
    active.delete(value)
  }
  append(input)
  return normalized
}

export const normalizeAttributeInput = normalizeAttributes

/** A picking rule: a bound value, or a bare attribute meaning the whole family. */
export type PickInput = Lite.Attribute<any> | Lite.Attributed<any> | readonly PickInput[]

export function normalizePickInput(input: PickInput | undefined): (Lite.Attribute<any> | Lite.Attributed<any>)[] {
  if (input === undefined) return []
  const normalized: (Lite.Attribute<any> | Lite.Attributed<any>)[] = []
  const active = new Set<readonly PickInput[]>()
  const append = (value: PickInput): void => {
    if (isAttribute(value) || isAttributed(value)) {
      normalized.push(value)
      return
    }
    if (active.has(value)) throw new TypeError("picking rules must not contain cyclic arrays")
    active.add(value)
    for (const nested of value) append(nested)
    active.delete(value)
  }
  append(input)
  return normalized
}

/**
 * Application-wide wiring used to create scopes, plus the picking rules. The app
 * picks entries: every selectable attribute fact on a carrier must match `include`
 * — a bound value, or a bare attribute enabling any value of that family — and
 * none of `exclude`; carriers without selectable facts are always in. Exclude wins.
 * Picking never reaches the scope or a context.
 */
export interface AppConfig {
  presets?: Lite.Preset<any, any>[]
  tags?: TagInput
  extensions?: Lite.Extension[]
  attributes?: {
    include?: PickInput
    exclude?: PickInput
  }
}

/** A discovered entry module available to hosts. */
export interface ManifestEntry {
  name: string
  file: string
  entry: Entry<any, any>
}

/** Stable application and target identity embedded in a generated manifest. */
export interface ManifestIdentity {
  app: string
  target: "app" | "server" | "cli"
  hash: string
}

/** The generated application description passed to hosts and analyze. */
export interface Manifest {
  identity?: ManifestIdentity
  app: AppConfig | undefined
  entries: readonly ManifestEntry[]
}

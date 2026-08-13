import { isTagged, type Lite } from "@pumped-fn/lite"
import type { EntryKind } from "../discover"

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

/** Application-wide wiring used to create scopes and map runtime failures. */
export interface AppConfig {
  presets?: Lite.Preset<any, any>[]
  tags?: TagInput
  extensions?: Lite.Extension[]
  context?: (request?: Request) => TagInput
  mapError?: (error: unknown) => { status: number; body: unknown } | undefined
}

export interface NormalizedAppConfig {
  presets: Lite.Preset<any, any>[]
  tags: TagInput
  extensions: Lite.Extension[]
  context: (request?: Request) => TagInput
  mapError?: (error: unknown) => { status: number; body: unknown } | undefined
}

export function normalizeApp(app?: AppConfig): NormalizedAppConfig {
  return {
    presets: app?.presets ?? [],
    tags: app?.tags ?? [],
    extensions: app?.extensions ?? [],
    context: app?.context ?? (() => []),
    mapError: app?.mapError,
  }
}

/** Agent metadata carried from discovery into a generated runtime manifest. */
export interface ManifestAgentMeta {
  name: string
  description?: string
  tools: readonly string[]
  skills: readonly string[]
  subagents: readonly string[]
}

/** A discovered server, CLI, job, workflow, or agent module available to a runtime runner. */
export interface ManifestEntry {
  kind: EntryKind
  name: string
  file: string
  flow?: Lite.Flow<any, any, any, any>
  meta?: Lite.Tagged<any>
  schedule?: Lite.Atom<unknown>
  agent?: ManifestAgentMeta
}

/** Stable application and target identity embedded in a generated production manifest. */
export interface ManifestIdentity {
  app: string
  target: "server" | "cli"
  hash: string
}

/** The generated application description passed to Pumped's runtime runners. */
export interface Manifest {
  identity?: ManifestIdentity
  app: AppConfig | undefined
  entries: readonly ManifestEntry[]
}

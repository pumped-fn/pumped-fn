import type { Lite } from "@pumped-fn/lite"
import type { EntryKind } from "../discover"

type TagInput = Lite.Tagged<any> | readonly TagInput[]

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

export interface ManifestAgentMeta {
  name: string
  description?: string
  tools: readonly string[]
  skills: readonly string[]
  subagents: readonly string[]
}

export interface ManifestEntry {
  kind: EntryKind
  name: string
  file: string
  flow?: Lite.Flow<any, any>
  meta?: Lite.Tagged<any>
  schedule?: Lite.Atom<unknown>
  agent?: ManifestAgentMeta
}

export interface Manifest {
  app: AppConfig | undefined
  entries: readonly ManifestEntry[]
}

import type { Lite } from "@pumped-fn/lite"
import type { EntryKind } from "../discover"

export interface AppConfig {
  presets?: Lite.Preset<any, any>[]
  tags?: Lite.Tagged<any>[]
  extensions?: Lite.Extension[]
  context?: (request?: Request) => Lite.Tagged<any>[]
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
  flow: Lite.Flow<any, any>
  agent?: ManifestAgentMeta
}

export interface Manifest {
  app: AppConfig | undefined
  entries: readonly ManifestEntry[]
}

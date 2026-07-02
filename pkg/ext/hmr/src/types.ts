import type { Lite } from "@pumped-fn/lite"

export type AtomRegistry = Map<string, Lite.Atom<unknown>>

export type HandleKind = "atom" | "flow" | "resource" | "tag"
export type EdgeVia = "direct" | "controller" | "tag"
export type IssueCode = "dynamic-dep" | "unknown-dep"

export interface HandleMeta {
  readonly key: string
  readonly kind: HandleKind
  readonly name: string
  readonly file: string
  readonly line: number
  readonly column: number
}

export interface AtomMeta extends HandleMeta {
  readonly kind: "atom"
}

export interface ModuleMeta {
  readonly id: string
  readonly handles: readonly HandleMeta[]
  readonly atoms: readonly AtomMeta[]
  readonly edges: readonly EdgeMeta[]
  readonly issues: readonly IssueMeta[]
}

export interface EdgeMeta {
  readonly from: string
  readonly to: string
  readonly fromName: string
  readonly toName: string
  readonly slot: string
  readonly file: string
  readonly line: number
  readonly column: number
  readonly via: EdgeVia
  readonly toKind?: HandleKind
  readonly importSource?: string
  readonly importId?: string
}

export interface LiteMeta {
  readonly modules: readonly ModuleMeta[]
  readonly handles: readonly HandleMeta[]
  readonly atoms: readonly AtomMeta[]
  readonly edges: readonly EdgeMeta[]
  readonly issues: readonly IssueMeta[]
}

export interface IssueMeta {
  readonly code: IssueCode
  readonly fromName: string
  readonly slot: string
  readonly file: string
  readonly line: number
  readonly column: number
  readonly target?: string
}

export interface HmrMeta extends LiteMeta {}

export interface HotModule {
  data: {
    atomRegistry?: AtomRegistry
  }
  accept(): void
  dispose(cb: () => void): void
}

declare global {
  interface ImportMeta {
    hot?: HotModule
  }
}

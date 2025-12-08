import type { Lite } from "@pumped-fn/lite"

export type AtomRegistry = Map<string, Lite.Atom<unknown>>

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

import type { Lite } from "@pumped-fn/lite"
import type { EntryKind } from "../src/discover"
import type { AppConfig, Manifest, ManifestEntry } from "../src/runtime/manifest"

/**
 * `file: "virtual"` is the sentinel these tests use for entries that were
 * never discovered from disk -- it names "not discovery, a hand-built test
 * entry" the same way every hand-written manifest literal in this test suite
 * already did.
 *
 * Replaces:
 * ```typescript
 * const entry: ManifestEntry = { kind: "jobs", name: "nightly-sweep", file: "virtual", flow: sweep }
 * ```
 */
export function entry(kind: EntryKind, name: string, flow: Lite.Flow<any, any>): ManifestEntry {
  return { kind, name, file: "virtual", flow }
}

/**
 * Replaces:
 * ```typescript
 * const manifest: Manifest = { app: undefined, entries: [entry] }
 * ```
 */
export function manifest(app: AppConfig | undefined, ...entries: ManifestEntry[]): Manifest {
  return { app, entries }
}

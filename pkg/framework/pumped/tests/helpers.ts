import type { Lite } from "@pumped-fn/lite"
import { entry } from "../src/entry"
import type { AppConfig, Manifest, ManifestEntry } from "../src/runtime/manifest"

/**
 * `file: "virtual"` is the sentinel these tests use for entries that were
 * never discovered from disk -- it names "not discovery, a hand-built test
 * entry" the same way every hand-written manifest literal in this test suite
 * already did.
 */
export function manifestEntry(
  name: string,
  flow: Lite.Flow<any, any, any, any>,
  tags: Lite.TagInput,
  options?: { attributes?: Lite.AttributeInput; file?: string }
): ManifestEntry {
  return {
    name,
    file: options?.file ?? "virtual",
    entry: entry({ flow, tags, ...(options?.attributes === undefined ? {} : { attributes: options.attributes }) }),
  }
}

export function manifest(app: AppConfig | undefined, ...entries: ManifestEntry[]): Manifest {
  return { app, entries }
}

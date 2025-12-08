import type { Lite } from "@pumped-fn/lite"
import type { AtomRegistry } from "./types"

function getRegistry(): AtomRegistry | null {
  const hot = import.meta.hot
  if (!hot) {
    return null
  }

  if (!hot.data.atomRegistry) {
    hot.data.atomRegistry = new Map<string, Lite.Atom<unknown>>()
  }

  return hot.data.atomRegistry
}

/**
 * Registers an atom for HMR persistence.
 * Returns cached reference if key exists, otherwise stores and returns the atom.
 * In production (no import.meta.hot), returns atom unchanged.
 *
 * Registry intentionally persists across HMR reloads - this enables
 * new code to reuse old atom references for Scope cache hits.
 * Deleted atoms accumulate in registry (dev-only memory leak).
 * Full page reload clears everything.
 */
export function __hmr_register(
  key: string,
  atom: Lite.Atom<unknown>
): Lite.Atom<unknown> {
  const registry = getRegistry()

  if (!registry) {
    return atom
  }

  if (registry.has(key)) {
    return registry.get(key)!
  }

  registry.set(key, atom)
  return atom
}

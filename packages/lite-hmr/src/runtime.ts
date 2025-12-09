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
 */
export function __hmr_register<T>(
  key: string,
  atom: Lite.Atom<T>
): Lite.Atom<T> {
  const registry = getRegistry()

  if (!registry) {
    return atom
  }

  if (registry.has(key)) {
    return registry.get(key) as Lite.Atom<T>
  }

  registry.set(key, atom)
  return atom
}

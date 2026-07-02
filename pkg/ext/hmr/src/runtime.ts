import { retargetAtomTags, type Lite } from "@pumped-fn/lite"
import type { AtomRegistry, HotModule } from "./types"

type MutableAtom<T> = {
  -readonly [K in keyof Lite.Atom<T>]: Lite.Atom<T>[K]
}

function getRegistry(hot: HotModule | undefined): AtomRegistry | null {
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
 * Refreshes and returns the cached reference if key exists, otherwise stores and returns the atom.
 * In production (no import.meta.hot), returns atom unchanged.
 */
export function __hmr_register<T>(
  key: string,
  atom: Lite.Atom<T>,
  hot = import.meta.hot
): Lite.Atom<T> {
  const registry = getRegistry(hot)

  if (!registry) {
    return atom
  }

  if (registry.has(key)) {
    const current = registry.get(key) as MutableAtom<T>
    retargetAtomTags(current, atom)
    current.factory = atom.factory
    current.deps = atom.deps
    current.tags = atom.tags
    current.keepAlive = atom.keepAlive
    return current
  }

  registry.set(key, atom)
  return atom
}

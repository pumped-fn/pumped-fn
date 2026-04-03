import { tagExecutorSymbol } from "./symbols"
import { isAtom, isControllerDep } from "./atom"
import type { Lite } from "./types"

export interface DepsGraph {
  atoms: [string, Lite.Atom<unknown>][]
  controllers: [string, Lite.ControllerDep<unknown>][]
  tags: [string, Lite.TagExecutor<unknown, boolean>][]
  resources: [string, Lite.Resource<unknown>][]
  syncable: boolean
}

const depsGraphCache = new WeakMap<Record<string, Lite.Dependency>, DepsGraph>()

export function classifyDeps(deps: Record<string, Lite.Dependency>): DepsGraph {
  let cached = depsGraphCache.get(deps)
  if (cached) return cached

  const graph: DepsGraph = { atoms: [], controllers: [], tags: [], resources: [], syncable: true }
  let hasNulls = false

  for (const key in deps) {
    const dep = deps[key]
    if (dep == null) {
      hasNulls = true
      continue
    }
    if (isAtom(dep)) {
      graph.atoms.push([key, dep])
    } else if (isControllerDep(dep)) {
      graph.controllers.push([key, dep])
    } else if (tagExecutorSymbol in (dep as object)) {
      graph.tags.push([key, dep as Lite.TagExecutor<unknown, boolean>])
    } else {
      graph.resources.push([key, dep as Lite.Resource<unknown>])
      graph.syncable = false
    }
  }

  if (!hasNulls) depsGraphCache.set(deps, graph)
  return graph
}

export function warmDepsGraph(deps: Record<string, Lite.Dependency>): void {
  classifyDeps(deps)
}

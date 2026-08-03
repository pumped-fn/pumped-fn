import {
  isAtom,
  isControllerDep,
  isFlow,
  isResource,
  isTagExecutor,
  isTagged,
  type Lite,
} from "@pumped-fn/lite"
import { normalizeTagInput, type Manifest } from "./runtime/manifest"

/** Kinds of structure Pumped can identify without running application factories. */
export type GraphNodeKind = "app" | "root" | "flow" | "atom" | "resource" | "tag" | "extension"

/** A serializable graph member with a deterministic ID within one analysis. */
export interface GraphNode {
  id: string
  kind: GraphNodeKind
  label: string
}

/** Relationships Pumped can prove from a manifest and public Lite handles. */
export type GraphEdgeKind =
  | "executes"
  | "resolves"
  | "depends-on"
  | "controls"
  | "reads-tag"
  | "provides-tag"
  | "implemented-by"
  | "annotates"
  | "uses-extension"
  | "presets"
  | "substitutes"

/** A proven directed relationship between two graph members. */
export interface GraphEdge {
  from: string
  to: string
  kind: GraphEdgeKind
  key?: string
  mode?: "required" | "optional" | "all"
}

/** Work that may contain graph edges but cannot be proven without executing opaque code. */
export interface GraphUnknown {
  from: string
  reason: string
}

/** A truthful static projection of the graph subset exposed by public handles. */
export interface GraphReport {
  nodes: GraphNode[]
  edges: GraphEdge[]
  unknowns: GraphUnknown[]
  idOf(target: object): string | undefined
}

function idPart(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "anonymous"
}

/**
 * Analyzes manifest roots and recursively follows declared Lite dependencies without executing a
 * factory, context producer, mapper, or extension hook. Opaque work is returned in `unknowns`.
 */
export function analyze(manifest: Manifest): GraphReport {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const unknowns: GraphUnknown[] = []
  const members = new Map<object, GraphNode>()
  const usedIds = new Set<string>()
  const visited = new Set<object>()

  function uniqueId(base: string): string {
    if (!usedIds.has(base)) {
      usedIds.add(base)
      return base
    }
    let index = 2
    while (usedIds.has(`${base}-${index}`)) index++
    const id = `${base}-${index}`
    usedIds.add(id)
    return id
  }

  function addNode(kind: GraphNodeKind, label: string, target?: object): GraphNode {
    if (target) {
      const existing = members.get(target)
      if (existing) return existing
    }
    const node = { id: uniqueId(`${kind}:${idPart(label)}`), kind, label }
    nodes.push(node)
    if (target) members.set(target, node)
    return node
  }

  function addTag(tag: Lite.Tag<unknown, boolean>): GraphNode {
    return addNode("tag", tag.label, tag)
  }

  function addUnknown(from: string, reason: string): void {
    if (!unknowns.some((entry) => entry.from === from && entry.reason === reason)) {
      unknowns.push({ from, reason })
    }
  }

  function addTagBinding(from: GraphNode, tagged: Lite.Tagged<any>, kind: "annotates" | "provides-tag"): void {
    const tagNode = addTag(tagged.tag)
    edges.push({ from: from.id, to: tagNode.id, kind })
    const implementor = visitUnit(tagged.value, `${tagged.tag.label}-implementor`)
    if (implementor) edges.push({ from: tagNode.id, to: implementor.id, kind: "implemented-by" })
  }

  function visitUnit(target: unknown, hint: string): GraphNode | undefined {
    let node: GraphNode
    let deps: Record<string, Lite.Dependency> | undefined
    let tags: Lite.Tagged<any>[] | undefined

    if (isAtom(target)) {
      node = addNode("atom", hint, target)
      deps = target.deps
      tags = target.tags
    } else if (isFlow(target)) {
      node = addNode("flow", target.name ?? hint, target)
      deps = target.deps
      tags = target.tags
    } else if (isResource(target)) {
      node = addNode("resource", target.name ?? hint, target)
      deps = target.deps
      tags = target.tags
    } else {
      return undefined
    }

    if (visited.has(target)) return node
    visited.add(target)
    addUnknown(node.id, "factory-body")

    for (const tagged of tags ?? []) {
      if (!isTagged(tagged)) continue
      addTagBinding(node, tagged, "annotates")
    }

    for (const [key, dependency] of Object.entries(deps ?? {})) {
      if (isTagExecutor(dependency)) {
        const tagNode = addTag(dependency.tag)
        edges.push({
          from: node.id,
          to: tagNode.id,
          kind: "reads-tag",
          key,
          mode: dependency.mode,
        })
        const implementor = visitUnit(dependency.tag.defaultValue, `${dependency.tag.label}-default`)
        if (implementor) edges.push({ from: tagNode.id, to: implementor.id, kind: "implemented-by" })
        continue
      }

      if (isControllerDep(dependency)) {
        const controlled = "flow" in dependency
          ? dependency.flow
          : dependency.atom ?? dependency.resource
        const controlledNode = controlled && visitUnit(controlled, key)
        if (controlledNode) edges.push({ from: node.id, to: controlledNode.id, kind: "controls", key })
        else addUnknown(node.id, `dependency:${key}`)
        continue
      }

      const dependencyNode = visitUnit(dependency, key)
      if (dependencyNode) edges.push({ from: node.id, to: dependencyNode.id, kind: "depends-on", key })
      else addUnknown(node.id, `dependency:${key}`)
    }

    return node
  }

  const app = { id: "app", kind: "app", label: "app" } satisfies GraphNode
  nodes.push(app)
  usedIds.add(app.id)

  for (const tagged of normalizeTagInput(manifest.app?.tags)) {
    addTagBinding(app, tagged, "provides-tag")
  }

  for (const extension of manifest.app?.extensions ?? []) {
    const extensionNode = addNode("extension", extension.name, extension)
    edges.push({ from: app.id, to: extensionNode.id, kind: "uses-extension" })
    addUnknown(extensionNode.id, "extension-hooks")
  }

  if (manifest.app?.context) addUnknown(app.id, "context-producer")
  if (manifest.app?.mapError) addUnknown(app.id, "error-mapper")

  for (const preset of manifest.app?.presets ?? []) {
    const targetNode = visitUnit(preset.target, "preset-target")
    if (!targetNode) continue
    edges.push({ from: app.id, to: targetNode.id, kind: "presets" })
    const substituteNode = visitUnit(preset.value, `${targetNode.label}-substitute`)
    if (substituteNode) edges.push({ from: targetNode.id, to: substituteNode.id, kind: "substitutes" })
    else if (typeof preset.value === "function") addUnknown(targetNode.id, "preset-factory")
  }

  for (const entry of manifest.entries) {
    const root = {
      id: uniqueId(`root:${idPart(entry.kind)}:${idPart(entry.name)}`),
      kind: "root",
      label: entry.name,
    } satisfies GraphNode
    nodes.push(root)
    const target = entry.flow ?? entry.schedule
    if (target) {
      const targetNode = visitUnit(target, entry.name)
      if (targetNode) {
        edges.push({
          from: root.id,
          to: targetNode.id,
          kind: entry.flow ? "executes" : "resolves",
        })
      }
    } else {
      addUnknown(root.id, "entry-handle")
    }
    if (entry.meta && isTagged(entry.meta)) {
      edges.push({ from: root.id, to: addTag(entry.meta.tag).id, kind: "annotates" })
    }
  }

  return {
    nodes,
    edges,
    unknowns,
    idOf: (target) => members.get(target)?.id,
  }
}

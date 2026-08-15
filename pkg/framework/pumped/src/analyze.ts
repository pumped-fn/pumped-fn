import {
  isAtom,
  isControllerDep,
  isFlow,
  isResource,
  isTagExecutor,
  isTagged,
  type Lite,
} from "@pumped-fn/lite"
import { entrySpec } from "./entry"
import { cliHost } from "./hosts/cli"
import { cronHost } from "./hosts/cron"
import { appPick, enabled, mounts, type Host } from "./hosts/host"
import { httpHost } from "./hosts/http"
import { workflowHost } from "./hosts/workflow"
import { normalizeTagInput, type Manifest } from "./runtime/manifest"
import { command, route, schedule, workflow } from "./tags"

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

/** A statically proven defect: the manifest cannot run as declared. */
export interface GraphFailure {
  code:
    | "no-host"
    | "missing-required-tag"
    | "duplicate-route"
    | "duplicate-command"
    | "duplicate-schedule"
    | "duplicate-workflow"
  entry: string
  host?: string
  tag?: string
  message: string
}

/** A truthful static projection of the graph subset exposed by public handles. */
export interface GraphReport {
  nodes: GraphNode[]
  edges: GraphEdge[]
  unknowns: GraphUnknown[]
  failures: GraphFailure[]
  excluded: string[]
  idOf(target: object): string | undefined
}

export const defaultHosts: readonly Host<any, any, any>[] = [httpHost, cliHost, cronHost, workflowHost]

function idPart(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "anonymous"
}

const TRAVERSAL_KINDS: readonly GraphEdgeKind[] = ["depends-on", "controls", "reads-tag", "implemented-by"]

/**
 * Analyzes manifest roots and recursively follows declared Lite dependencies without executing a
 * factory or extension hook. Opaque work is returned in `unknowns`; statically proven defects —
 * an entry no host mounts, duplicate mount points, a required tag no provider supplies for a host
 * the entry is mounted on — are returned in `failures`.
 */
export function analyze(manifest: Manifest, hosts: readonly Host<any, any, any>[] = defaultHosts): GraphReport {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const unknowns: GraphUnknown[] = []
  const failures: GraphFailure[] = []
  const excluded: string[] = []
  const members = new Map<object, GraphNode>()
  const tagsByNodeId = new Map<string, Lite.Tag<unknown, boolean>>()
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
    const node = addNode("tag", tag.label, tag)
    tagsByNodeId.set(node.id, tag)
    return node
  }

  const unknownKeys = new Set<string>()
  function addUnknown(from: string, reason: string): void {
    const key = `${from}\u0000${reason}`
    if (unknownKeys.has(key)) return
    unknownKeys.add(key)
    unknowns.push({ from, reason })
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
        if ("tags" in dependency) {
          for (const tagged of dependency.tags ?? []) addTagBinding(node, tagged, "provides-tag")
        }
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

  const appTags = normalizeTagInput(manifest.app?.tags)
  for (const tagged of appTags) {
    addTagBinding(app, tagged, "provides-tag")
  }

  for (const extension of manifest.app?.extensions ?? []) {
    const extensionNode = addNode("extension", extension.name, extension)
    edges.push({ from: app.id, to: extensionNode.id, kind: "uses-extension" })
    addUnknown(extensionNode.id, "extension-hooks")
  }

  for (const preset of manifest.app?.presets ?? []) {
    const targetNode = visitUnit(preset.target, "preset-target")
    if (!targetNode) continue
    edges.push({ from: app.id, to: targetNode.id, kind: "presets" })
    const substituteNode = visitUnit(preset.value, `${targetNode.label}-substitute`)
    if (substituteNode) edges.push({ from: targetNode.id, to: substituteNode.id, kind: "substitutes" })
    else if (typeof preset.value === "function") addUnknown(targetNode.id, "preset-factory")
  }

  const scopeKeys = new Set(appTags.map((tagged) => tagged.tag.key))

  interface AnalyzedEntry {
    name: string
    flowNode: GraphNode
    entryKeys: Set<symbol>
    hostNames: string[]
  }
  const analyzed: AnalyzedEntry[] = []

  const pick = appPick(manifest.app)

  for (const item of manifest.entries) {
    const spec = entrySpec(item.entry)

    if (!enabled(spec.attributes, pick)) {
      excluded.push(item.name)
      continue
    }

    const root = {
      id: uniqueId(`root:${idPart(item.name)}`),
      kind: "root",
      label: item.name,
    } satisfies GraphNode
    nodes.push(root)

    const appliedTags = spec.tags.filter((tagged) => enabled(tagged.attributes, pick))
    for (const tagged of appliedTags) addTagBinding(root, tagged, "provides-tag")

    const flowNode = visitUnit(spec.flow, item.name)
    if (flowNode) edges.push({ from: root.id, to: flowNode.id, kind: "executes" })

    const hostNames = hosts
      .filter((host) => mounts(spec.tags, host.selector, pick).length > 0)
      .map((host) => host.name)
    const anySelector = hosts.some((host) => spec.tags.some((tagged) => tagged.key === host.selector.key))
    if (!anySelector) {
      failures.push({
        code: "no-host",
        entry: item.name,
        message: `entry "${item.name}" in ${item.file} carries no tag any host mounts`,
      })
    }

    if (flowNode) {
      analyzed.push({
        name: item.name,
        flowNode,
        entryKeys: new Set(appliedTags.map((tagged) => tagged.tag.key)),
        hostNames,
      })
    }
  }

  const duplicateChecks: { code: GraphFailure["code"]; selector: Lite.Tag<any, false>; keyOf: (spec: any, entry: string) => string }[] = [
    { code: "duplicate-route", selector: route, keyOf: (spec) => `${spec.method} ${spec.path}` },
    { code: "duplicate-command", selector: command, keyOf: (spec) => spec.name },
    { code: "duplicate-schedule", selector: schedule, keyOf: (spec, entry) => spec.name ?? entry },
    { code: "duplicate-workflow", selector: workflow, keyOf: (spec, entry) => spec.name ?? entry },
  ]
  for (const { code, selector, keyOf } of duplicateChecks) {
    const seen = new Map<string, string>()
    for (const item of manifest.entries) {
      const itemSpec = entrySpec(item.entry)
      if (!enabled(itemSpec.attributes, pick)) continue
      for (const spec of mounts(itemSpec.tags, selector, pick)) {
        const key = keyOf(spec, item.name)
        const existing = seen.get(key)
        if (existing) {
          failures.push({
            code,
            entry: item.name,
            message: `${code.replace("duplicate-", "")} "${key}" is declared by both "${existing}" and "${item.name}"`,
          })
        } else {
          seen.set(key, item.name)
        }
      }
    }
  }

  const adjacency = new Map<string, string[]>()
  const providesTagEdges: GraphEdge[] = []
  const requiredReadEdges: GraphEdge[] = []
  for (const edge of edges) {
    if (edge.kind === "provides-tag") providesTagEdges.push(edge)
    if (edge.kind === "reads-tag" && edge.mode === "required") requiredReadEdges.push(edge)
    if (!TRAVERSAL_KINDS.includes(edge.kind)) continue
    const targets = adjacency.get(edge.from)
    if (targets) targets.push(edge.to)
    else adjacency.set(edge.from, [edge.to])
  }
  const nodeKinds = new Map(nodes.map((node) => [node.id, node.kind]))

  function reachableFrom(start: string): Set<string> {
    const seen = new Set<string>([start])
    const queue = [start]
    while (queue.length > 0) {
      const current = queue.pop() as string
      for (const next of adjacency.get(current) ?? []) {
        if (seen.has(next)) continue
        seen.add(next)
        queue.push(next)
      }
    }
    return seen
  }

  for (const entry of analyzed) {
    const reachable = reachableFrom(entry.flowNode.id)
    const pathKeys = new Set<symbol>()
    for (const edge of providesTagEdges) {
      if (!reachable.has(edge.from)) continue
      const tag = tagsByNodeId.get(edge.to)
      if (tag) pathKeys.add(tag.key)
    }

    for (const edge of requiredReadEdges) {
      if (!reachable.has(edge.from)) continue
      const tag = tagsByNodeId.get(edge.to)
      if (!tag || tag.hasDefault) continue

      if (nodeKinds.get(edge.from) === "atom") {
        if (scopeKeys.has(tag.key)) continue
        failures.push({
          code: "missing-required-tag",
          entry: entry.name,
          tag: tag.label,
          message: `entry "${entry.name}" reaches an atom requiring tag "${tag.label}", which only app tags or a tag default can supply — none does`,
        })
        continue
      }

      for (const hostName of entry.hostNames) {
        const host = hosts.find((candidate) => candidate.name === hostName)
        const provided =
          scopeKeys.has(tag.key) ||
          entry.entryKeys.has(tag.key) ||
          pathKeys.has(tag.key) ||
          (host?.provides.some((candidate) => candidate.key === tag.key) ?? false)
        if (provided) continue
        failures.push({
          code: "missing-required-tag",
          entry: entry.name,
          host: hostName,
          tag: tag.label,
          message: `entry "${entry.name}" requires tag "${tag.label}" but host "${hostName}" does not provide it and no app, entry, or default supplies it`,
        })
      }
    }
  }

  return {
    nodes,
    edges,
    unknowns,
    failures,
    excluded,
    idOf: (target) => members.get(target)?.id,
  }
}

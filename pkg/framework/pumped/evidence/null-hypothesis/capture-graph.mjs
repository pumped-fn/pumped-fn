import { spawnSync } from "node:child_process"
import { readdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createScope } from "@pumped-fn/pumped/app"
import * as pumpedPackage from "@pumped-fn/pumped"
import { greet, manifest, runtimeEvents } from "./fixture/graph.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, "../../../../..")
const fixtureRoot = resolve(here, "fixture/roots")
const cli = resolve(root, "pkg/framework/pumped/dist/cli.mjs")

process.chdir(root)

function sorted(items, key) {
  return [...items].sort((left, right) => key(left).localeCompare(key(right)))
}

function normalize(report) {
  if (!report) return null
  return {
    nodes: sorted(report.nodes, (node) => node.id),
    edges: sorted(report.edges, (edge) => `${edge.from}:${edge.kind}:${edge.key ?? ""}:${edge.to}`),
    unknowns: sorted(report.unknowns, (unknown) => `${unknown.from}:${unknown.reason}`),
  }
}

const expected = normalize({
  nodes: [
    { id: "app", kind: "app", label: "app" },
    { id: "atom:directory", kind: "atom", label: "directory" },
    { id: "atom:nightly", kind: "atom", label: "nightly" },
    { id: "extension:graph-runtime-probe", kind: "extension", label: "graph-runtime-probe" },
    { id: "flow:greet", kind: "flow", label: "greet" },
    { id: "resource:connection", kind: "resource", label: "connection" },
    { id: "root:jobs:nightly", kind: "root", label: "nightly" },
    { id: "root:server:greet", kind: "root", label: "greet" },
    { id: "tag:example.graph.region", kind: "tag", label: "example.graph.region" },
  ],
  edges: [
    { from: "app", to: "tag:example.graph.region", kind: "provides-tag" },
    { from: "app", to: "extension:graph-runtime-probe", kind: "uses-extension" },
    { from: "atom:nightly", to: "resource:connection", kind: "depends-on", key: "connection" },
    { from: "flow:greet", to: "atom:directory", kind: "controls", key: "directory" },
    { from: "flow:greet", to: "resource:connection", kind: "depends-on", key: "connection" },
    { from: "flow:greet", to: "tag:example.graph.region", kind: "reads-tag", key: "region", mode: "required" },
    { from: "root:jobs:nightly", to: "atom:nightly", kind: "resolves" },
    { from: "root:server:greet", to: "flow:greet", kind: "executes" },
  ],
  unknowns: [
    { from: "atom:directory", reason: "factory-body" },
    { from: "atom:nightly", reason: "factory-body" },
    { from: "extension:graph-runtime-probe", reason: "extension-hooks" },
    { from: "flow:greet", reason: "factory-body" },
    { from: "resource:connection", reason: "factory-body" },
  ],
})

async function runtimeProbe() {
  runtimeEvents.length = 0
  const scope = pumpedPackage.createAppScope(manifest)
  const output = await scope.run({ flow: greet, input: { name: " Ada " } })
  await scope.dispose()

  const missingScope = createScope()
  let missingTagRejected = false
  try {
    await missingScope.run({ flow: greet, input: { name: "Ada" } })
  } catch (error) {
    missingTagRejected = error instanceof Error && error.message.includes("example.graph.region")
  }
  await missingScope.dispose()

  return { events: runtimeEvents, output, missingTagRejected }
}

function commandProbe() {
  const result = spawnSync(process.execPath, [cli, "graph", "--app", "east", "--target", "server"], {
    cwd: fixtureRoot,
    encoding: "utf8",
  })
  const output = result.status === 0 ? JSON.parse(result.stdout) : undefined
  return {
    status: result.status,
    stderr: result.stderr,
    identity: output?.identity,
    roots: output?.nodes
      .filter((node) => node.kind === "root")
      .map((node) => node.id)
      .sort(),
    temporaryFilesRemoved: !readdirSync(fixtureRoot).some((name) => name.startsWith(".pumped-graph-")),
  }
}

async function createEvidence() {
  const analyze = "analyze" in pumpedPackage && typeof pumpedPackage.analyze === "function"
    ? pumpedPackage.analyze
    : undefined
  const report = normalize(analyze?.(manifest))
  const runtime = await runtimeProbe()
  const command = commandProbe()
  const staticGraphExact = JSON.stringify(report) === JSON.stringify(expected)
  const expectedRuntimeEvents = ["flow:greet", "atom:directory", "resource:connection", "flow:format"]
  const runtimeExact = JSON.stringify(runtime.events) === JSON.stringify(expectedRuntimeEvents)
    && runtime.output === "Ada:default!"
    && runtime.missingTagRejected
  const commandExact = command.status === 0
    && command.stderr === ""
    && command.identity?.app === "east"
    && command.identity?.target === "server"
    && /^sha256:[a-f0-9]{64}$/.test(command.identity?.hash ?? "")
    && JSON.stringify(command.roots) === JSON.stringify([
      "root:agents:assistant",
      "root:jobs:sweep",
      "root:server:http",
      "root:workflows:report",
    ])
    && command.temporaryFilesRemoved
  const evidence = {
    schemaVersion: 1,
    nullHypothesis: "Pumped cannot report a useful, truthful graph from public handles without missing edges or hiding opaque work.",
    frozenGate: {
      expectedNodes: expected.nodes.length,
      expectedEdges: expected.edges.length,
      expectedUnknowns: expected.unknowns.length,
      runtimeEvents: expectedRuntimeEvents,
      requiresMissingRequiredTagFailure: true,
      requiresFactoryBodiesMarkedUnknown: true,
      requiresInlineFlowObservedAtRuntimeOnly: true,
      requiresManifestOnlyCommand: true,
    },
    analyzeAvailable: analyze !== undefined,
    report: report && {
      nodes: report.nodes.length,
      edges: report.edges.length,
      unknowns: report.unknowns.length,
    },
    runtime,
    command,
    decision: {
      staticGraphExact,
      runtimeExact,
      commandExact,
      nullRejected: staticGraphExact && runtimeExact && commandExact,
    },
  }
  if (!staticGraphExact) evidence.graphMismatch = { expected, actual: report }
  return evidence
}

const evidence = await createEvidence()
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
if (!evidence.decision.nullRejected) process.exitCode = 1

import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createScope } from "@pumped-fn/pumped/app"
import * as pumpedPackage from "@pumped-fn/pumped"
import { directory, greet, manifest } from "./fixture/graph.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, "../../../../..")
const evidenceFile = resolve(here, "graph-v2.json")
const fixtureFile = resolve(here, "fixture/graph.mjs")

process.chdir(root)

function hash(value) {
  return createHash("sha256").update(value).digest("hex")
}

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
    { id: "flow:greet", kind: "flow", label: "greet" },
    { id: "root:server:greet", kind: "root", label: "greet" },
    { id: "tag:example.graph.region", kind: "tag", label: "example.graph.region" },
  ],
  edges: [
    { from: "app", to: "tag:example.graph.region", kind: "provides-tag" },
    { from: "flow:greet", to: "atom:directory", kind: "depends-on", key: "directory" },
    { from: "flow:greet", to: "tag:example.graph.region", kind: "reads-tag", key: "region", mode: "required" },
    { from: "root:server:greet", to: "flow:greet", kind: "executes" },
  ],
  unknowns: [
    { from: "atom:directory", reason: "factory-body" },
    { from: "flow:greet", reason: "factory-body" },
  ],
})

async function runtimeProbe() {
  const events = []
  const scope = createScope({
    tags: manifest.app.tags,
    extensions: [{
      name: "graph-runtime-probe",
      wrapExec: async (next, target) => {
        events.push(target === greet ? "flow:greet" : "unknown:exec")
        return next()
      },
      wrapResolve: async (next, event) => {
        events.push(event.target === directory ? "atom:directory" : `unknown:${event.kind}`)
        return next()
      },
    }],
  })
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

  return { events, output, missingTagRejected }
}

async function createEvidence() {
  const analyze = "analyze" in pumpedPackage && typeof pumpedPackage.analyze === "function"
    ? pumpedPackage.analyze
    : undefined
  const report = normalize(analyze?.(manifest))
  const runtime = await runtimeProbe()
  const staticGraphExact = JSON.stringify(report) === JSON.stringify(expected)
  const runtimeExact = JSON.stringify(runtime.events) === JSON.stringify(["flow:greet", "atom:directory"])
    && runtime.output === "Ada:default"
    && runtime.missingTagRejected
  const evidence = {
    schemaVersion: 1,
    nullHypothesis: "Pumped cannot report a useful, truthful graph from public handles without missing edges or hiding opaque work.",
    frozenGate: {
      expected,
      runtimeEvents: ["flow:greet", "atom:directory"],
      requiresMissingRequiredTagFailure: true,
      requiresFactoryBodiesMarkedUnknown: true,
    },
    inputs: {
      fixture: hash(readFileSync(fixtureFile)),
      pumpedPackage: hash(readFileSync(resolve(root, "pkg/framework/pumped/dist/index.mjs"))),
    },
    analyzeAvailable: analyze !== undefined,
    report,
    runtime,
    decision: {
      staticGraphExact,
      runtimeExact,
      nullRejected: staticGraphExact && runtimeExact,
    },
  }
  return { ...evidence, selfHash: hash(JSON.stringify(evidence)) }
}

const evidence = await createEvidence()
const output = `${JSON.stringify(evidence, null, 2)}\n`

if (process.argv.includes("--write")) {
  writeFileSync(evidenceFile, output)
  process.stdout.write(output)
} else {
  const existing = readFileSync(evidenceFile, "utf8")
  if (existing !== output) {
    process.stderr.write("graph evidence changed; run capture-graph.mjs --write and review the result\n")
    process.exitCode = 1
  } else {
    process.stdout.write(`graph evidence matches ${evidence.selfHash}\n`)
  }
}

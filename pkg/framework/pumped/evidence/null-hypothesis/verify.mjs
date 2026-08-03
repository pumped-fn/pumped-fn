import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
function readEvidence(names) {
  return names.map((name) => {
    const value = JSON.parse(readFileSync(resolve(here, name), "utf8"))
    const selfHash = value.selfHash
    delete value.selfHash
    const actual = createHash("sha256").update(JSON.stringify(value)).digest("hex")
    if (actual !== selfHash) throw new Error(`${name} self hash mismatch: expected ${selfHash}, got ${actual}`)
    return value
  })
}

function verifyFrozenGate(names, evidence) {
  const frozenGate = JSON.stringify(evidence[0].frozenGate)
  for (let index = 1; index < evidence.length; index++) {
    if (JSON.stringify(evidence[index].frozenGate) !== frozenGate) {
      throw new Error(`${names[index]} changed the frozen gate`)
    }
  }
}

const authoringNames = ["authoring-import-v1.json", "authoring-import-v2.json", "authoring-import-v3.json"]
const authoring = readEvidence(authoringNames)
verifyFrozenGate(authoringNames, authoring)

const authoringDecisions = authoring.map((value) => value.comparison.nullRejected)
if (JSON.stringify(authoringDecisions) !== JSON.stringify([false, false, true])) {
  throw new Error(`unexpected authoring import decisions: ${JSON.stringify(authoringDecisions)}`)
}

const targetNames = ["app-target-roots-v1.json", "app-target-roots-v2.json"]
const targets = readEvidence(targetNames)
verifyFrozenGate(targetNames, targets)

const targetDecisions = targets.map((value) => value.decision.nullRejected)
if (JSON.stringify(targetDecisions) !== JSON.stringify([false, true])) {
  throw new Error(`unexpected app target decisions: ${JSON.stringify(targetDecisions)}`)
}

const graphNames = ["graph-v1.json", "graph-v2.json"]
const graphs = readEvidence(graphNames)
verifyFrozenGate(graphNames, graphs)

const graphDecisions = graphs.map((value) => value.decision.nullRejected)
if (JSON.stringify(graphDecisions) !== JSON.stringify([false, true])) {
  throw new Error(`unexpected graph decisions: ${JSON.stringify(graphDecisions)}`)
}

process.stdout.write(`verified authoring import lineage: ${authoringNames.join(", ")}\n`)
process.stdout.write(`verified app target lineage: ${targetNames.join(", ")}\n`)
process.stdout.write(`verified graph lineage: ${graphNames.join(", ")}\n`)

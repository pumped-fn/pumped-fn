import { readFileSync, writeFileSync } from "node:fs"

const run = ".okra/runs/issue-triage-session-20260715"
const source = `${run}/artifacts/dkr-0-disposition-matrix.v2.json`
const target = `${run}/artifacts/dkr-0-disposition-matrix.v3.json`
const matrix = JSON.parse(readFileSync(source, "utf8"))

matrix.schema_version = "dkr-0.disposition-matrix.v3"
matrix.judgement.status = "pending_independent_review"
matrix.rules["R-EFFECT-BOUNDARY"] = {
  disposition: "reshape",
  owner: "DKR-4",
  meaning: "Reshape dynamic effect dispatch and direct physical process execution behind declared controller, resource, or tag ports.",
}

const core = matrix.files.find((file) => file.path === "pkg/sdk/core/src/index.ts")
core.rule_ids = [...new Set([...core.rule_ids, "R-EFFECT-BOUNDARY"])]
core.public_concepts = core.public_concepts.flatMap((concept) => {
  if (concept.id === "workflow-runtime-and-extension") {
    return [
      {
        id: "workflow-state-and-extension",
        disposition: "keep",
        rule_ids: ["K-STATIC-DECLARED-GRAPH", "K-EXPLICIT-EFFECT-PORTS"],
        evidence_refs: ["pkg/sdk/core/src/index.ts:14", "pkg/sdk/core/src/index.ts:123"],
        downstream_owner_dkrs: ["DKR-0"],
      },
      {
        id: "worker-registry-runtime-delegation",
        disposition: "reshape",
        rule_ids: ["R-EFFECT-BOUNDARY"],
        evidence_refs: [
          "pkg/sdk/core/src/index.ts:55",
          "pkg/sdk/core/src/index.ts:59",
          "pkg/sdk/core/src/index.ts:99",
          "pkg/sdk/core/src/index.ts:112",
          "pkg/sdk/core/src/index.ts:141",
        ],
        downstream_owner_dkrs: ["DKR-4"],
      },
    ]
  }
  if (concept.id === "materials-and-cli-workers") {
    return [
      {
        id: "material-state-and-patching",
        disposition: "keep",
        rule_ids: ["K-STATIC-DECLARED-GRAPH", "K-EXPLICIT-EFFECT-PORTS"],
        evidence_refs: ["pkg/sdk/core/src/index.ts:302", "pkg/sdk/core/src/index.ts:331", "pkg/sdk/core/src/index.ts:344"],
        downstream_owner_dkrs: ["DKR-0"],
      },
      {
        id: "cli-worker-and-direct-process-execution",
        disposition: "reshape",
        rule_ids: ["R-EFFECT-BOUNDARY"],
        evidence_refs: ["pkg/sdk/core/src/index.ts:490", "pkg/sdk/core/src/index.ts:537", "pkg/sdk/core/src/index.ts:583"],
        downstream_owner_dkrs: ["DKR-4"],
      },
    ]
  }
  return [concept]
})

const session = matrix.files.find((file) => file.path === "pkg/sdk/core/src/session.ts")
session.rule_ids = session.rule_ids.filter((ruleId) => ruleId !== "X-PRE-RESOLVE")
const sessionResource = session.public_concepts.find((concept) => concept.id === "session-resource-pre-resolution")
sessionResource.disposition = "keep"
sessionResource.rule_ids = ["K-STATIC-DECLARED-GRAPH", "R-ACTIVATION-OWNERSHIP"]
sessionResource.evidence_refs = ["pkg/sdk/core/src/session.ts:1134"]
sessionResource.downstream_owner_dkrs = ["DKR-0"]

writeFileSync(target, `${JSON.stringify(matrix, null, 2)}\n`)

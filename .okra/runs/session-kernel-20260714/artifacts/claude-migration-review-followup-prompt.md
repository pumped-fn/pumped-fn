You are the same independent architecture reviewer. Review only; do not edit.

The migration DKR was revised after your REVISE and an independent validator's ten rejected claims. Read the current versions in full:

- `.okra/runs/session-kernel-20260714/artifacts/claude-migration-review-isolated.json`
- `.okra/runs/session-kernel-20260714/artifacts/dkr-migration-contract.md`
- `.okra/runs/session-kernel-20260714/artifacts/dkr-migration-checkpoint-candidate.json`
- `.okra/runs/session-kernel-20260714/artifacts/dkr-provider-capability-matrix.md`
- `.okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md`
- `pkg/core/lite/src/types.ts`
- `pkg/core/lite/src/scope.ts`
- `pkg/sdk/core/src/index.ts`
- `pkg/sdk/core/package.json`
- `pkg/sdk/core/tsdown.config.ts`
- `pkg/sdk/claude/src/index.ts`
- `pkg/sdk/codex/src/index.ts`
- `pkg/sdk/pi/src/index.ts`
- `pkg/sdk/bash/src/index.ts`
- `pkg/sdk/test/src/index.ts`
- `pkg/framework/pumped/tests/agent.test.ts`

Re-test every prior blocker and risk. In particular: downstream consumer custody; exact package exports/build entries; TypeScript declaration coherence; authority rebind/narrowing and current attempt tags; root provider pre-resolution; exact provider names and Claude isolated leases; one turn loop/inert flows; database acceptance path; eval field compatibility; Lite 5 and SDK 3 peers; all 16 walls and SHA-only evidence; existing sdk-mcp unchanged; and deterministic proof for every current SDK surface.

The user explicitly requested all current SDK packages in this coordinated major. Do not reject breadth merely because it is large. Reject it only if the revised proof plan cannot validate it coherently or if the public contracts conflict.

Return one JSON object only:

{
  "verdict": "GO" | "REVISE",
  "confidence": 0.0,
  "closed_findings": [{"id":"...","how":"...","evidence":["file:line"]}],
  "blocking_findings": [{"id":"...","finding":"...","evidence":["file:line"],"required_change":"..."}],
  "non_blocking_risks": [{"id":"...","implementation_proof":"..."}],
  "all_sdk_scope_coherent": true,
  "lite_change_needed": {"for_first_pr": false, "reason":"..."},
  "one_line_rationale": "..."
}

A GO requires zero blocking findings. Do not trust the candidate checker as proof of semantic correctness.

You are the independent architecture reviewer for pumped-fn. Review only; do not edit.

Read these files in full:

- `.okra/runs/session-kernel-20260714/frame/frame.v2.json`
- `.okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md`
- `.okra/runs/session-kernel-20260714/artifacts/dkr-session-checkpoint-accepted.json`
- `.okra/runs/session-kernel-20260714/artifacts/dkr-migration-contract.md`
- `.okra/runs/session-kernel-20260714/artifacts/dkr-migration-checkpoint-candidate.json`
- `.okra/runs/session-kernel-20260714/artifacts/dkr-provider-capability-matrix.md`
- `.okra/runs/session-kernel-20260714/replay/dkr-provider-capabilities.sh`
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

Decide whether the migration DKR is safe and coherent enough to authorize implementation. Challenge, rather than summarize:

1. Do the exact TypeScript declarations fit public Lite types and lifecycle behavior?
2. Is there exactly one model-round/tool-dispatch loop and no context-bound FlowHandle retained by a longer-lived resource?
3. Does work admission happen before dependency-heavy role/tool resolution?
4. Can explicit finish fence, abort, join, checkpoint, and seal without lifecycle-hook business effects?
5. Are authority load/rebind, fork narrowing, immutable tool snapshots, and fail-closed readiness stated at the right boundary?
6. Do the Standard Schema engine and Zod/Valibot examples type-check in principle without runtime framework dependencies?
7. Are package subpaths, removals, retained root symbols, adapter migration, and major changeset internally consistent?
8. Does the provider plan preserve Model/complete while honestly handling streaming, cancellation, continuation, overlap, and root transport lifetime for Claude, Codex ACP, and pi-ai?
9. Is the database-analysis example graph-native, bounded at the database seam, and unable to apply DDL?
10. Do all active anti-goals have an implementation-time proof path? Is MCP kept out without pretending the existing sdk-mcp package is absent?
11. Is a Lite change needed for this first PR?
12. Is the proposed first PR too broad to validate as one coherent major migration? If so, name a smaller boundary that still achieves the accepted objective without parallel runtimes.

Return one JSON object only:

{
  "verdict": "GO" | "REVISE",
  "confidence": 0.0,
  "blocking_findings": [{"id":"...","finding":"...","evidence":["file:line"],"required_change":"..."}],
  "non_blocking_risks": [{"id":"...","finding":"...","implementation_proof":"..."}],
  "anti_goal_audit": [{"anti_goal":"...","status":"covered"|"gap","evidence":"..."}],
  "lite_change_needed": {"for_first_pr": false, "reason":"..."},
  "implementation_boundary": {"verdict":"coherent"|"too_broad","required_scope":"..."},
  "one_line_rationale": "..."
}

Use exact source evidence. Do not accept the writer's candidate checkpoint merely because its checker passes. A GO requires zero blocking findings.

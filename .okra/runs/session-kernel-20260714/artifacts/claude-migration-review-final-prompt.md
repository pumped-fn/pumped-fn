You are the final independent architecture reviewer for DKR-MIGRATION-1 in pumped-fn.

Review only. Do not edit files, run product mutations, or accept the candidate on its own authority.

The exact candidate hashes are:

- `.okra/runs/session-kernel-20260714/artifacts/dkr-migration-contract.md`: `07ef022dfcc1cce0973e5565e60e1068ff374e4d9d945d76e494771d047a503d`
- `.okra/runs/session-kernel-20260714/artifacts/dkr-migration-checkpoint-candidate.json`: `609b39e9720a93945cd6b175c2adc72375a6071970b3bd0e4e311fadd1750696`

Read the candidate, provider capability matrix, accepted session contract/checkpoint, the public Lite source used by the contract, current SDK packages, package manifests, workspace consumers, and AGENTS.md instructions supplied by the project.

Audit these load-bearing points against source, not prose:

1. Authority has one reproducible constructor and fingerprint algorithm, narrowing cannot widen, and load/rebind compares supplied, stored, and recomputed authority before protected resolution.
2. Session is a current-owned resource with no retained context, and root-owned physical resources outlive logical sessions.
3. Work admission precedes role/tool/provider resolution, including subagents and waits.
4. Tool resources expose only readiness-authorized inert flows; one turn owns the loop and snapshots match dispatch.
5. Waiting persists admitted work and schedule intent before close; wake uses fresh load/rebind and the persisted intent only.
6. Provider migration preserves scalar Model/complete while adding provider-neutral streaming and isolated cancellation/lifetime for Claude, Codex, and Pi.
7. Standard Schema typing is implementable with Zod and Valibot; validation engine is configurable and fail-closed.
8. All current SDK packages, package exports, declarations, workspace consumers, changesets, docs, and anti-goal proof are in scope. No Lite or MCP change is required unless source contradicts the contract.
9. No hidden side effects, facade method bags, shared scope factories, built-ins, or compatibility runtime remain.

Return strict JSON with: `verdict` (`GO` or `REVISE`), `confidence`, `blocking_findings`, `non_blocking_risks`, `accepted_boundaries`, `lite_change_needed`, `mcp_change_needed`, and `one_line_rationale`. Every finding must cite exact file paths and lines. A GO means the contract is safe to implement, not that implementation is complete.

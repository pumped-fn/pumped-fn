# Agent SDK Codegen Steering

Session: `agent-sdk-codegen-steering`

Goal: add codegen eval coverage for the tag-first `@pumped-fn/agent-sdk` surface before merging the release PR.

Harness extension:
- Added three ignored `.autoresearch` tasks: `a1-workflow-run-tag`, `a2-runtime-tags`, `a3-named-worker-delegation`.
- Prompt context reads `packages/lite/README.md`, `packages/lite/PATTERNS.md`, `packages/agent-sdk/README.md`, `packages/agent-sdk/PATTERNS.md`, and lite CLI categories needed for primitives/scope/context/testing/patterns.
- Added AP probes for removed extension `use:`, non-tag or missing `workflowRun()` context setup, and pre-change `wrapResolve(next, atom, scope)` / `event.atom` / `event.resource`.
- Fixture smoke: `agent-clean.ts` scored AP=0; `agent-dirty.ts` scored AP=5.

Baseline before fixes:
- Command: `RUNNERS="claude codex" SAMPLES=1 RUN_TAG=agent-baseline-k1 bash .autoresearch/sessions/agent-sdk-codegen-steering/benchmark.sh`
- Result: `anti_pattern_hits_median_total=0`, `typecheck_errors_median_total=5`, `cells=6`.
- Finding: generated code used tag-first context shape, but strict typecheck exposed two docs/API gaps: `workerRegistry([typedFlow])` failed because the registry accepted only `Flow<unknown, unknown>`, and the worker-delegation pattern showed flow setup without the `workflowRun` import/run-context helper.

Fixes:
- `WorkerRegistry` now accepts `Lite.AnyFlow` at the type-erased registry boundary, including `readonly` arrays in `workerRegistry()`.
- Agent SDK README now names `workflowRun()` as a context tag and states it belongs in `createContext({ tags: [...] })`.
- Agent SDK README/PATTERNS no longer show copyable `createContext(run(...))` in the agent docs suspense section; they show raw suspense tags instead.
- Agent SDK PATTERNS now includes a complete `runProcessPr()` helper with `createScope`, `testAgent()`, `workflowRun()`, context close, and scope dispose.

Convergence:
- After-fix k1 command: `RUNNERS="claude codex" SAMPLES=1 RUN_TAG=agent-after-docs-k1 bash .autoresearch/sessions/agent-sdk-codegen-steering/benchmark.sh`
- After-fix k1 result: `anti_pattern_hits_median_total=0`, `typecheck_errors_median_total=0`, `cells=6`.
- Final gate command: `RUNNERS="claude codex" SAMPLES=5 RUN_TAG=agent-final-k5 bash .autoresearch/sessions/agent-sdk-codegen-steering/benchmark.sh`
- Final gate result: `anti_pattern_hits_median_total=0`, `typecheck_errors_median_total=2`, `cells=6`.

Final k5 cell medians:

| Task | Claude AP | Codex AP | Claude TC | Codex TC |
|---|---:|---:|---:|---:|
| `a1-workflow-run-tag` | 0 | 0 | 1 | 1 |
| `a2-runtime-tags` | 0 | 0 | 0 | 0 |
| `a3-named-worker-delegation` | 0 | 0 | 0 | 0 |

Residual typecheck notes:
- The remaining k5 TC median is isolated to `a1-workflow-run-tag`.
- Samples mostly drift into lite `service<T>()` examples with plain interfaces that do not satisfy the `ServiceMethods` index constraint, plus one generated type shadow named `Record`.
- This is not an agent-sdk tag/runtime/delegation AP regression. The release gate requested `ap_median_total=0`, which converged.

Verification:
- `node .autoresearch/sessions/agent-sdk-codegen-steering/scorers/antipatterns.mjs .autoresearch/sessions/agent-sdk-codegen-steering/fixtures/agent-clean.ts`
- `node .autoresearch/sessions/agent-sdk-codegen-steering/scorers/antipatterns.mjs .autoresearch/sessions/agent-sdk-codegen-steering/fixtures/agent-dirty.ts`
- `pnpm --filter @pumped-fn/agent-sdk typecheck`
- `pnpm --filter @pumped-fn/agent-practical typecheck`
- `pnpm --filter @pumped-fn/agent-practical test -- --run`
- `pnpm --filter @pumped-fn/agent-sdk build`

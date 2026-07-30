Review the complete uncommitted diff against origin/main in this repository. This is a read-only final gate. Do not edit files, commit, push, or contact external systems.

Objective: replace the temporary managed-tools direction with a Pi-shaped pumped-fn SDK 3 session kernel. The public design must use explicit role, tool, session, work, branch, turn, and attempt graph definitions; durable session state; provider-neutral scalar and streaming attempts; host-bound authority; dependency-safe cleanup and cancellation; Standard Schema validation with configurable engines; and a database-analysis proof. Claude, Codex, Pi, Just Bash, sdk-test, and pumped migrations must agree.

Anti-goals:

- no automatic tool collection or MCP expansion in this PR
- no Lite core change without a proven reusable invariant; the intended diff has no Lite change
- no hidden side effects, implicit globals, shared scope factories, or facade methods that hide graph edges
- no authority decided by the model, no cross-session or cross-branch continuation/cancellation leakage, and no post-finish semantic mutation
- no provider-specific event model in the core
- no compatibility shim that preserves the removed Agent execution loop
- no single-reviewer truth: report evidence, not taste

Project rules:

- config is passed through grouped tags
- required graph edges are static and explicit; no built-ins
- the scope is the only testing seam
- every use site creates its own scope; no preconfigured scope factory
- handles have no kind suffix
- no comments except TSDoc on public interfaces
- dependencies and devDependencies use catalog entries; peerDependencies use explicit ranges
- public docs and README diagrams must match shipped code

Inspect lifecycle and concurrency closely: current-owned session ownership, run/wake/fork/join/merge, CAS and branch isolation, fail-fast waiting, abort propagation, early stream return, mid-turn steering, authority fingerprint plus attempt epoch, tool permit isolation, artifact and memory validation, invocation settlement, sealed finish, and late provider continuations.

Inspect package boundaries: all five @pumped-fn/sdk exports, peer ranges for SDK 3 and Lite 5, provider scalar compatibility handles draining canonical attempts, Claude lease isolation, Codex ACP continuation reservation and empty MCP servers, Pi schema propagation, Just Bash authority and cancellation, direct-scope sdk-test helpers, and the invoice-triage alias migration.

Known deterministic evidence:

- workspace build and typecheck pass
- root lint passes with one unchanged invoice warning
- changed and dependent surfaces pass 210 tests: core 53, Claude 17, Codex 22, Pi 6, Just Bash 4, sdk-test 40, pumped 45, invoice-triage 23; provider integration tests are opt-in and skipped
- packed-tarball ESM and CJS imports plus strict NodeNext ESM and CJS consumer compilation pass for all five @pumped-fn/sdk exports
- compare browser smoke passes all five lanes
- the root test sweep has an unchanged lite-perf browser failure caused by duplicate React hook state; git diff against origin/main is empty for Lite, lite-react, and lite-perf
- direct SDK lint is governed by an exact accepted diagnostic multiset for public handle factories, runtime-selected skill/tool/subagent dispatch, validation-engine await, the physical Bash port await, and three retained root-index diagnostics

The previous independent review returned REVISE because returning early from a streamed turn could leave its invocation in `working`. The repaired implementation now cancels and settles every working invocation before work settlement. Earlier adversarial review findings were also repaired: cached tools are rebound to the managed work authority, dependency edges cannot be overridden, authority input is exact and strictly validated, artifact and memory adapter effects validate ownership first, wake persists through the scheduler before local state, Codex timeouts quarantine continuations, current-owned session cleanup aborts and joins work, packed exports are exercised, lifecycle cases have replay tests, and the Just Bash adapter documents that its underlying library returns buffered output only after completion. Re-check these claims against code and tests; do not trust this summary.

A later adversarial review found nine more blockers despite an isolated Claude GO. The current tree repairs all nine: lawful authority narrowing resolves a public role with only allowed tools while excluded tools have no permit; direct turns settle open invocations on consumer return; model, skill, tool, and subagent start-event boundaries check cancellation before effects; session run checks cancellation immediately after `work.started`; steering is fenced by attempt and epoch; duplicate schedule IDs fail before admission; database analysis injects physical backend flows plus readiness-owned resources and proves missing readiness has zero model/backend effects and parallel leases clean up; packed tarballs assert root/subpath separation; retained channel, schedule, HTTP, eval, helper, and summary paths have runtime fixtures; and the SDK 2 to SDK 3 migration table names removed and renamed types and fields. Reproduce these scenarios rather than trusting the statement.

The adversarial rerun then found four contract details. The current tree separates inert database readiness from dispatch-time physical leases and asserts zero leases during every model attempt; adds strict negative type imports to the packed root boundary; omits absent summary event fields instead of encoding `undefined`; and names only real sandbox exports in the migration table. Reproduce these too.

Return GO only when there is no actionable correctness, contract, migration, or anti-goal defect. Otherwise return REVISE. Every defect must cite an exact file and line and explain the failure scenario. Do not report style preferences or unchanged baseline issues.

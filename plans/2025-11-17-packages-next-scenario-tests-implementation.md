# packages/next Scenario Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Collapse granular specs into three scenario sweeps (`core.behavior`, `extensions.behavior`, `edge.behavior`) sharing a single harness while maintaining >95% coverage.

**Architecture:** Build a stateless harness that provisions flows, execution contexts, and extension registries. Each scenario file imports the harness, registers labeled scenarios, and executes all features end-to-end. Legacy specs are deleted once their assertions migrate.

**Tech Stack:** TypeScript, Jest (pnpm test runner), pnpm workspaces for @pumped-fn/core-next.

### Task 1: Build shared harness + scenario helper

**Files:**
- Create: `packages/next/tests/harness.ts`
- Create: `packages/next/tests/scenario.ts`
- Modify: `packages/next/tests/test-utils.ts` (re-export/move builders)

**Step 1: Write failing tests**
- Add placeholder import usage in `core.behavior.test.ts` (temporary file) referencing `createHarness` and `scenario` so compilation fails because helpers missing.

**Step 2: Run test to confirm failure**
- `pnpm -F @pumped-fn/core-next test packages/next/tests/core.behavior.test.ts --runInBand`
- Expect TypeScript compile error for missing harness exports.

**Step 3: Implement helpers**
- `packages/next/tests/harness.ts`: export factories `createFlowHarness`, `buildExecutionContext`, `expectFlowResult`, migrate logic from `tests/utils` and `tests/internal/*` ensuring each function returns fresh state.
- `packages/next/tests/scenario.ts`: export `scenario` wrapper around Jest `it` that labels steps and ensures serial execution if needed.
- Update `test-utils.ts` to re-export harness utilities or delete redundant ones.

**Step 4: Run tests**
- `pnpm -F @pumped-fn/core-next test packages/next/tests/core.behavior.test.ts --runInBand`
- Expect PASS (placeholder spec still trivial but compiles).

**Step 5: Commit**
- `git add packages/next/tests/harness.ts packages/next/tests/scenario.ts packages/next/tests/test-utils.ts`
- `git commit -m "chore: add shared test harness"`

### Task 2: Implement `core.behavior.test.ts`

**Files:**
- Create: `packages/next/tests/core.behavior.test.ts`
- Delete/Migrate: `packages/next/tests/core.test.ts`, `flow-execution.test.ts`, `execution-context.test.ts`, `abort-utils.test.ts`, `exec-timeout.test.ts`, `exec-timer-cleanup.test.ts`, `execution-tracking.test.ts`, `promised-settled.test.ts`, `reactive-concurrency.test.ts`, `remove-queuemicrotask.test.ts`

**Step 1: Write failing tests**
- Draft scenario definitions covering: exports smoke, flow orchestration, reactive concurrency, promised settled utility, abort utils, execution context, timer cleanup. Each `scenario` should call harness builders but initially leave assertions TODO causing failing `expect(false).toBe(true)` placeholders.

**Step 2: Run tests to see failures**
- `pnpm -F @pumped-fn/core-next test packages/next/tests/core.behavior.test.ts`
- Expect FAIL because placeholder expectations triggered.

**Step 3: Port assertions**
- Move logic from legacy specs into respective scenario bodies, using harness matchers to keep code compact. Ensure each previous assertion path represented (timeouts, queueMicrotask removal, concurrency). Delete legacy spec files once content replicated.

**Step 4: Run focused tests**
- `pnpm -F @pumped-fn/core-next test packages/next/tests/core.behavior.test.ts`
- Expect PASS.

**Step 5: Commit**
- `git add packages/next/tests/core.behavior.test.ts packages/next/tests/*.test.ts`
- `git commit -m "test: consolidate core suite"`

### Task 3: Implement `extensions.behavior.test.ts`

**Files:**
- Create: `packages/next/tests/extensions.behavior.test.ts`
- Delete/Migrate: `packages/next/tests/extensions.test.ts`, `flow-extensions.test.ts`, `tag.test.ts`, `journal-utils.test.ts`, `lazy-snapshot.test.ts`, `benchmark-immediate.test.ts`, `multi.test.ts`

**Step 1: Write failing tests**
- Add scenarios for extension lifecycle, registry resolution, tags, journal utils, lazy snapshots, benchmarking toggles, multi extension flows; include placeholder failing expectations.

**Step 2: Run targeted tests**
- `pnpm -F @pumped-fn/core-next test packages/next/tests/extensions.behavior.test.ts`
- Expect FAIL from placeholders.

**Step 3: Port logic**
- Transplant assertions/fixtures from legacy specs into scenario flows, using harness to compose registries and verifying structural outputs with shared matchers.

**Step 4: Run tests**
- `pnpm -F @pumped-fn/core-next test packages/next/tests/extensions.behavior.test.ts`
- Expect PASS.

**Step 5: Commit**
- `git add packages/next/tests/extensions.behavior.test.ts`
- `git commit -m "test: consolidate extension suite"`

### Task 4: Implement `edge.behavior.test.ts`

**Files:**
- Create: `packages/next/tests/edge.behavior.test.ts`
- Delete/Migrate: `packages/next/tests/error-handling.test.ts`, `scope-run.test.ts`, `coverage-gaps.test.ts`, `meta.test.ts`, `benchmark-immediate.test.ts` (edge-specific parts), `index.test.ts`, `exports.test.ts`

**Step 1: Write failing tests**
- Define scenarios for error propagation, scope-run variations, coverage gaps, export surface smoke, meta behaviors. Use failing expectations initially.

**Step 2: Run tests**
- `pnpm -F @pumped-fn/core-next test packages/next/tests/edge.behavior.test.ts`
- Expect FAIL.

**Step 3: Port assertions**
- Move relevant tests from deleted specs, ensuring each unique edge case represented. Use harness for setup.

**Step 4: Run tests**
- `pnpm -F @pumped-fn/core-next test packages/next/tests/edge.behavior.test.ts`
- Expect PASS.

**Step 5: Commit**
- `git add packages/next/tests/edge.behavior.test.ts`
- `git commit -m "test: consolidate edge suite"`

### Task 5: Remove obsolete utilities and tidy configs

**Files:**
- Delete: `packages/next/tests/internal/*`, `packages/next/tests/utils/*` now in harness
- Modify: `packages/next/tests/test-utils.ts`, `packages/next/tests/tsconfig.json` (if path globs change), `.claude/skills/pumped-design/references/tests.md` (if referencing individual specs)

**Step 1: Remove dead imports**
- Use `rg` to ensure nothing references old helpers; if found, migrate to harness.

**Step 2: Delete directories**
- Remove obsolete files after confirming unused.

**Step 3: Update configs/docs**
- Ensure tsconfig/test globs include new files, drop removed ones.

**Step 4: Run lint/typecheck**
- `pnpm -F @pumped-fn/core-next typecheck`
- Expect PASS.

**Step 5: Commit**
- `git add -A packages/next/tests`
- `git commit -m "chore: prune old next test helpers"`

### Task 6: Full verification + coverage capture

**Files:**
- N/A (commands + reporting)

**Step 1: Run full suite**
- `pnpm -F @pumped-fn/core-next test --coverage`
- Ensure >95% statements/branches; capture summary for notes.

**Step 2: Run extra checks**
- `pnpm -F @pumped-fn/core-next typecheck:full`
- `pnpm -F @pumped-fn/examples typecheck`

**Step 3: Commit**
- `git add .`
- `git commit -m "test: finalize scenario suites"`

**Step 4: Document LOC delta**
- `rg --files packages/next/tests | xargs wc -l`
- Record before/after numbers in PR notes.

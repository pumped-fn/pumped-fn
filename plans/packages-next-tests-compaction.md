# packages/next Tests LOC Plan

## Brainstorming
- collapse redundant scenario permutations into parameterized tables so multiple assertions share one runner
- prune prerequisite-focused specs when the prerequisite is already exercised inside higher-level tests, keeping only end-to-end coverage
- merge fixtures/mocks into shared builders that lazily construct only the pieces each suite needs
- prefer snapshot-style structural assertions for complex outputs to avoid repeating property-level expect chains
- detect identical setup blocks via ast-grep; lift them into helper factories reused across suites

## Objectives
- retain behavioral coverage while targeting ≥25% LOC reduction across `packages/next/tests`
- eliminate overlapping verifications where downstream tests inherently cover upstream behavior
- keep execution fast; any helper/fixture must not introduce async overhead unless required by the scenario
- ensure type-safety: `pnpm -F @pumped-fn/core-next test` and typechecking commands must stay green after compaction

## Constraints
- no comments inside test code; convey intent via helper naming
- avoid introducing shared global state that could hide race conditions; helpers must return fresh data
- ast-grep-first workflow for identifying duplication before editing (`ast-grep -p 'describe(\"$NAME\"' packages/next/tests' etc.)
- overlapping prerequisite tests should be deleted only when a higher-level suite demonstrably covers the behavior (document in PR notes)

## Technique Checklist
- run `rg --files packages/next/tests | xargs wc -l` before/after each consolidation batch; if <25% reduction, refine before moving on
- use `ast-grep -p 'before(Each|All)\\(([^)]*)\\' packages/next/tests` to find repeated setup hooks; convert to shared helper returning tuple `{deps, cleanup}`
- identify identical assertions via `rg 'expect\\([^)]*\\)\\.[a-z]+\\(' -n packages/next/tests` and replace with reusable matcher functions
- table-driven tests: convert repeated `it` blocks differing only in data to `it.each` or manual loops
- prefer `Promise.all` for parallel scenario checks inside one `it` rather than separate `it`s when teardown/setup identical
- leverage top-level helper `buildFlowScenario({ overrides })` that hides flow creation + execution; ensures scenario definitions shrink dramatically

## Workstreams
1. **Baseline + Overlap Mapping**
   - Capture current LOC + test runtime via `pnpm -F @pumped-fn/core-next test --runInBand --reporter=list`.
   - Build overlap matrix: list suites that indirectly cover same behavior (e.g., executor resolution vs flow execution). Flag suites whose assertions are subsumed by others.
2. **Fixture + Helper Consolidation**
   - Create shared fixture builders (e.g., `createScopeWithDeps`, `buildFlowDefinition`) exported from `tests/utils`.
   - Replace per-suite inline setups with helper calls; delete redundant fixtures after verifying new helper used everywhere via `rg`.
3. **Scenario Deduplication**
   - Merge prerequisite tests into the dependent suite: if `executor.spec.ts` setups are repeated in `flow.spec.ts`, move unique assertions, drop original duplicates.
   - Convert repeated `describe` blocks testing permutations into `for...of` loops with tuple inputs.
4. **Assertion Compression**
   - Replace chains of similar `expect` calls with structural comparisons (`expect(result).toStrictEqual(...)`) or snapshot tests when structure is large but stable.
   - Introduce matcher helpers (e.g., `expectResolved(promised)`) to collapse repeated `.status`/`.value` checks.
5. **Cleanup + Validation**
   - Re-run LOC measurement; confirm ≥25% reduction.
   - Execute full command suite: `pnpm -F @pumped-fn/core-next typecheck`, `typecheck:full`, `test`; also `pnpm -F @pumped-fn/examples typecheck` to ensure helpers consumed by examples remain intact.
   - Document removed suites and justification (which higher-level test now covers them) for future reference.

## Deliverables
- Trimmed `packages/next/tests/**/*` with shared helpers under `packages/next/tests/utils`
- Updated docs/examples/skills references when test descriptions change meaningfully
- Final LOC/runtimes recorded to demonstrate coverage retention with reduced maintenance burden

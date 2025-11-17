# packages/next Scenario Test Consolidation (2025-11-17)

## Goal
- Replace the current >20 granular specs in `packages/next/tests` with three comprehensive behavior suites: `core.behavior.test.ts`, `extensions.behavior.test.ts`, and `edge.behavior.test.ts`.
- Share a single harness that bootstraps flows, extensions, and context utilities once per suite to minimize repeated LOC while keeping >95% coverage.
- Preserve failure debuggability by labeling each scenario and shimming helpers so stack traces still pinpoint features.

## Approach
1. **Feature Inventory**
   - List every capability currently covered (abort utils, flow execution, extensions, concurrency, benchmarking, etc.) and assign it to one of the three suites.
   - Note any cross-cutting helpers that need to stay (e.g., journal utils, tag coverage) so the harness exposes hooks.
2. **Harness Construction**
   - Move required builders from `tests/utils` and `tests/internal` into a new `tests/harness.ts` exporting fixtures (flow factory, execution context runner, extension registry builders, matcher helpers).
   - Ensure helpers stay stateless: each scenario requests fresh builders to avoid interference.
3. **Scenario Suite Implementation**
   - For each suite, define a top-level `describe('core behavior', () => scenario('...', async () => { ... }))` style runner.
   - Translate the legacy tests into labeled scenarios, grouping logically (e.g., `scenarioCoreFlow`, `scenarioExtensionLifecycle`, `scenarioEdgeErrors`).
   - Keep assertions concise by reusing harness matchers and folding repeated expect chains into shared helpers.
4. **Legacy Spec Removal + Wiring**
   - Delete or slim previous spec files whose content moved into the scenarios.
   - Update Jest/tsconfig references if any globbing assumes previous folder layout.
5. **Verification**
   - Run `pnpm -F @pumped-fn/core-next test --coverage` to confirm suite consolidation still passes and coverage stays above target.
   - Execute `pnpm -F @pumped-fn/core-next typecheck` and `typecheck:full`, plus `pnpm -F @pumped-fn/examples typecheck` if shared helpers touch example types.
   - Capture before/after LOC numbers with `rg --files packages/next/tests | xargs wc -l` for final report.

## Notes
- No inline comments; readability must come from scenario and helper naming.
- Prefer `it` wrappers only where necessary—custom `scenario` helper should fan out asynchronous flows serially unless parallelism is explicitly required.
- Stack traces rely on scenario labels, so ensure each scenario string references the underlying feature (e.g., `extensions: reactive concurrency scheduling`).

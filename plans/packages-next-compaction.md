# packages/next Compaction Plan

## Brainstorming
- collapse executor object creation/guards into paramized factories so each executor flavor is emitted by a single helper
- compress flow orchestration by piping journal/retry/timeout handling through a reusable execution pipeline builder
- unify helpers (`resolves`, `multi`, promise wrappers) behind one dependency-normalizer that understands arrays, records, and escapables
- coalesce scope state tracking (promises, cleanups, callbacks) into a shared struct per executor to avoid replicated class fields
- leverage ast-grep driven pattern hunts to ensure duplicate shapes are removed globally rather than file-by-file

## Objectives
- reduce `packages/next/src` LOC by consolidating repeated patterns without losing API coverage
- keep runtime characteristics neutral-or-better by minimizing helper indirections and preferring straight `for` loops
- preserve type-safety and documented API shape; any signature shift must update docs/examples/tests/skills references per Pumped instructions
- enforce ≥10% LOC reduction per touched module (diff-based); reject refactors that fail the target before merging

## Constraints
- no `any`/`unknown` leakage, keep namespace-grouped types in `types.ts`
- avoid inline comments; communicate intent via naming
- every public-facing change ripples to `docs/guides`, `examples`, `packages/next/tests`, `.claude/skills/pumped-design/references`
- always run `pnpm -F @pumped-fn/core-next typecheck`, `pnpm -F @pumped-fn/core-next typecheck:full`, `pnpm -F @pumped-fn/core-next test`, `pnpm -F @pumped-fn/examples typecheck`
- ast-grep-first workflow: identify each redundancy via `ast-grep` before editing; verification runs post-edit to confirm pattern removal

## Technique Checklist
- `rg --files packages/next/src | xargs wc -l` and `rg --files packages/next/tests | xargs wc -l` before/after each workstream; log delta to ensure cumulative shrinkage
- `ast-grep -p 'const $NAME = { [executorSymbol]: $_, ... }' packages/next/src` to detect duplicate executor literals; replace with factory calls
- `ast-grep -p 'function is(Lazy|Reactive|Static)Executor' packages/next/src` to guarantee only generator-based guards remain
- collapse overload bodies by destructuring discriminated unions inside a single implementation; delete redundant `if` branches once normalized
- inline helpers appearing in ≤2 call sites if they only wrap another function; prefer direct exports to reduce surface area
- convert repeated configuration objects into tuple-based arrays consumed by tight for-loops to minimize property duplication

## Workstreams
1. **Baseline + Targets**
   - Capture LOC baseline plus optional bundle stats (`node scripts/report-size.mjs core-next`) for reference.
   - Use `ast-grep` inventory reports (counts of executor literals, wrapWithExtensions definitions, Accessor fields) to quantify duplication hotspots.
   - Define module-level reduction targets (e.g., `executor.ts -15%`, `scope.ts -12%`, `flow.ts -10%`) so each PR chunk has a measurable goal.
2. **Executor & Helper Consolidation**
   - Introduce `buildExecutor(factory, deps, tags)` returning `{main,lazy,reactive,static}` and destructure exports to kill repeated object definitions.
   - Generate guards via `const guard = createKindGuard("lazy")` rather than separate bodies; reuse the generator output in exports to keep API behavior.
   - Replace `resolves`, `multi`, `promises` with `resolveShape(scope, shape)` that checks arrays once, falls back to object iteration, and unwraps escapables inline.
   - Update tests/docs/examples to cover the consolidated helper so dead helpers disappear without regressions.
3. **Flow Orchestration Compression**
   - Move `wrapWithExtensions` into `src/internal/extension.ts`; import everywhere to delete duplicate logic in `flow.ts` and `scope.ts`.
   - Normalize `FlowDefinition.handler` overloads by treating arguments as tuple `[deps?, handler]`; only one executor factory remains.
   - Collapse ExecConfig creation helpers (flow/fn) into a single builder that accepts discriminated tuples; share retry/timeout logic via `executeWithPolicy`.
   - Convert `FlowContext` methods that simply forward to scope into lightweight inline functions or eliminate them when redundant.
4. **Scope State Simplification**
   - Represent executor state as `[accessor, resolveState, cleanupSet, callbacks, updateQueuePromise, metadata]` stored in `Map<UE, State>`.
   - Replace layered resolve helpers with a single `resolveState(force?)` that handles cache hits, pending promises, replacers, and error wrapping in one function.
   - Centralize cleanup/onUpdate registration into `touchState(state, action)` utilities to avoid duplicating `Set` creation logic.
   - Update `FlowExecutionImpl` and other consumers to call the new helpers so the old bridging functions can be removed entirely.
5. **Refinement + Validation**
   - Rerun LOC + ast-grep checks; if reduction target missed, iterate before moving forward.
   - Sync docs/examples/tests/skill references with new helper names and flow descriptions.
   - Execute required pnpm commands; document any follow-up issues plus final LOC delta in commit message or PR notes.

## Deliverables
- Updated source: `packages/next/src/**/*`
- Synced tests: `packages/next/tests/**/*`
- Docs/examples adjustments under `docs/guides/**`, `examples/**`
- Skill reference refresh within `.claude/skills/pumped-design/references/`
- Comparison notes (baseline vs final LOC, perf observations)

# Pumped-fn

## Dependencies
- `dependencies`/`devDependencies`: `catalog:` version specifier (add to `pnpm-workspace.yaml` first)
- `peerDependencies`: explicit ranges (e.g. `^19.0.0`) — not catalog-managed

## Prime Rationale
Always fully traceable and fully testable: no implicits, no uncontrolled side effects. Effects exist only as controlled graph edges — visible to the exec pipeline (flows, port flows, role-tag implementors, one-depth traced members) and substitutable through the scope seam.

## Code Style (No Slop)
No:
- Inline or block comments (TSDoc on public interfaces only)
- Defensive try/catch or null checks in trusted codepaths
- `any` to bypass type issues — fix the types. Exception: `any` is correct at library boundaries where variance makes a precise type unsound:
  - Contravariant function fields in covariant generic containers (e.g. `eq?: (a: any, b: any) => boolean` on `Interface<T>` used as `Interface<unknown>` in a union — `T` would break `Interface<number>` assignability)
  - Type-erased dispatch slots (extension hooks, runtime-dispatched factories)
  - Rule: precise type at the **call site** (`Options<T>`), `any` on the **stored field** only
- Single-use variables declared then immediately returned (inline them)
- Style inconsistent with surrounding code
- Type suffixes on definition handles — `const store = atom(…)`, `const runCheck = flow(…)`, `const tx = resource(…)`, `const requestId = tag(…)`; never `storeAtom`/`runCheckFlow`/`txResource`/`requestIdTag`. The type system carries the kind; rely on inference (deps shorthand, factory params shadow handles)
- Ceremony the graph already does — no `atom<Port>(…)` generics (atoms share their inferred type; substitutes conform via `satisfies`/`Lite.Utils.AtomValue`), no facade objects bundling flows behind methods (consumers import the flows they use and exec them directly), no hand-written interfaces restating inferable signatures (extract via `ReturnType`/`Lite.Utils.*` when a name is needed)
- Shared scopes and glue types — never a pre-configured scope factory (every use site calls `createScope` with what it needs; shared builders reduce compositionality); named types only at data-transfer boundaries (flow inputs via `typed<T>()`, domain models, multi-implementor contracts) — wiring/output types nothing consumes must not exist

## Testing Rule
The scope is the single seam: given only `createScope({presets, tags, extensions})` + the public API, all logic is testable. Inside-out vs outside-in = same seam, different radius (preset a unit's deps vs preset only edge adapters). A test needing more than a scope (global patches, module mocks, internal reaches) means the design leaked — fix the design. Sole exception: an adapter atom's own unit test may fake the global it wraps (below the seam).

## PR Checklist
- `README.md` diagram reflects changes
- PR has docs, slop-free

## Lite Main Adoption Ledger

### Shipping artifact

- Core: `pkg/core/lite`; React: `pkg/react/lite-react`.
- TypeScript: 7.0.2 native declarations through tsdown's automatic TypeScript 7 generator. Package-local `tsconfig.dts.json` files clear workspace `paths`; without that physical config, downstream builds leak declarations into upstream source trees. Legacy Compiler API consumers use the explicit `typescript-api` alias.
- Final ESM SHA-256: Lite `3c3ecba9…6c51a9`; Lite React `111af8fb…fa8b6`.
- Final CJS SHA-256: Lite `f2f9e8b7…00bc0a`; Lite React `57c4d4e5…69a0d2`.
- Combined emitted ESM+CJS is 137,243 bytes and 38,784 bytes with gzip -9. Current main at `c59d70dd` is 253,912 raw and 54,670 gzip, so adoption removes 45.95% raw and 29.06% gzip.
- The latest packed-consumer run produced 83,078-byte Lite and 23,245-byte Lite React tarballs. The gate verifies docs, ESM, CJS, NodeNext, Bundler, TS 7.0.2, and exported `VERSION` equality.

### Correctness and memory

- Lite: 253 tests. Lite React: 70 browser tests. The full shipping workspace, downstream extensions, SDKs, examples, differential browser suite, declarations, builds, and packed consumers pass.
- Atom handles remain immutable public definitions. Scope-owned caches preserve multi-scope identity. A cold synchronous failure executes its factory and cleanup once.
- React subscribes in a layout effect and rechecks state/value after subscription, closing the render-to-subscribe race without mutating atom handles.
- Cold synchronous dependency traversal falls back to the full resolution pipeline for presets and active release flights. Value subscriptions refresh their comparison baseline when the first listener returns after a gap.
- Final five-pair retained-heap ratios candidate/baseline: atom 1.0000, scope .3327, cell .4216, controller .9999, listener 1.000045, native owner .9998, selection .9998, tag 1.0000, tagged 1.0000, tag context .9999.
- The memory script calls the 0.0045% listener delta a confirmed regression because its classifier has no tolerance. Treat it as measurement-level parity, not a material allocation claim. Evidence SHA-256: `172451f6…e27e2`.

### Performance null

- Current release goal: preserve the public API and downstream/browser behavior, materially reduce emitted JavaScript and retained heap, and keep every candidate-affected performance row at or above the practical `0.95` floor. Literal `1.00` parity is no longer the inner-loop target.
- Canonical inventory: 39 Lite + 8 Lite React rows, 43 candidate-affected and 4 calibration rows. `pnpm perf:quick --baseline-root <root> --candidate-root . --output-dir <dir>` runs one exact-artifact directional pair in about 26 seconds. It may report only `canary_clear` or `canary_regression`; it cannot confirm a result or support an improvement claim.
- Run five alternating pairs once for final admission only after correctness, types, packing, size, memory, and the fast canary are settled. Nine pairs remain the single predeclared fallback for inconclusive final evidence.
- The frozen five-pair predecessor comparison has zero confirmed regressions, 20 inconclusive rows, representative lane ratio .989069, and file SHA-256 `1a99d74a…72d`. Baseline artifact fingerprints are Lite `5a5c4039…6c7c7` and Lite React `154f1650…8ffb5`; candidate fingerprints are Lite `74827cf9…c5e4e` and Lite React `65e79a2e…df4b74`.
- A direct core split contradicts the unbatched micro-row losses: selected changes 1.015, selected suppression 1.120, and selected set plus flush 1.387 candidate/baseline. The browser canary also produced exact .75/1.333 swings on a no-op row, exposing timer quantization.
- Removing the redundant React resolved/version read recovered the targeted parent-render canary to 1.025. All correctness gates remained green. The final shipping hash differs from the five-pair predecessor, so that comparison is diagnostic evidence, not final-artifact acceptance evidence.
- Verdict: the literal 1.00 null is retired rather than flipped. Two post-rebase directional canaries against `c59d70dd` warned at representative ratios .865 and .915, with 14 and 22 candidate-affected rows below .95. Their four calibration rows also showed two to four gaps, so they are not confirmation. The five-pair admission run is still required before merge. Do not optimize a row until a targeted batched A/B reproduces its direction, and do not describe canary evidence as confirmed.

### Established findings and retained lineage

- LOC is not a gate. Emitted JavaScript bytes and retained heap are the size measures.
- The durable core gains come from synchronous dependency traversal, direct distinct watcher edges, lazy sidecars, and fewer dispatch layers.
- Duplicate watched edges require edge identity; default watch equality is shallow equality. Release/re-resolve requires a generation fence; cleanups are LIFO and only thenables add suspension.
- The discarded core and React POC packages were removed after adoption. Their durable findings are the invariants above; do not recreate executable lineage unless a new hypothesis requires it.

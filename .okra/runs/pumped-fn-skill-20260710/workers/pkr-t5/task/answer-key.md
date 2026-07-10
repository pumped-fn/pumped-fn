# T-5 answer key — recipe-archive export with live progress

Concept under exam: generator-flow composition. A parent generator flow
(`exportCollection`) composes a child generator flow (`exportRecipe`) through a
controller dep, forwards the child's progress events transformed (slug-prefixed),
stays pull-driven end to end, isolates per-child failures, and surfaces abandonment as
an aborted close result. Amended per chal-2 H2-T5: every differentiator is instrumented
so fakes die.

## Reference topology (one valid shape; mechanism is what is graded)

- `src/ports.ts`: `archive`, `shareTarget` as atoms holding the client objects —
  presettable at the scope seam (checker injects instrumented fakes).
- `src/export.ts`:
  - `exportRecipe = flow({ parse: typed<{slug}>(), faults: typed<Fault>(), deps: { archive, shareTarget }, factory: async function* ... })`
    — fetch (named span via `ctx.exec({ fn, name })`), yield `fetched`, convert (fail
    `UNIT_UNKNOWN` via `ctx.fail`), yield `converted`, write, yield `shared` with the
    returned id, return `{ id }`.
  - `exportCollection = flow({ deps: { exportRecipe: controller(exportRecipe) }, factory: async function* ... })`
    — per slug: `const stream = exportRecipe.execStream({ input: { slug } })`, then a
    mapped re-yield loop `for await (const event of stream) yield { slug, ...event }`
    (NOT bare `yield*`), `await stream.result` on success, catch → push `failedSlugs`,
    yield the single `failed` event, continue. Returns `{ exported, failedSlugs }`.
- Abandonment semantics come from the library only if the export IS a generator flow
  consumed via `execStream`: breaking the consumer loop cancels the invocation, the
  parent's cancellation tears the in-flight child stream down (`finally`/iterator
  return), `stream.result` rejects "Flow stream aborted", and `ctx.onClose` observers
  see `{ ok: false, aborted: true }` (verified against pkg/core/lite README
  "Generator Flows" notes and examples/invoice-triage tests 413-459; reproduced by
  probe in this run — see gates/reference-gates.log gate 3/5).

## Differentiators → checker IDs (all in harness/check-t5.mjs; checker imports
`./src/export.ts` + `./src/ports.ts` — the production flows, amendment (3))

| Diff | Requirement (mechanism named) | Instrumentation | Checker IDs |
|---|---|---|---|
| T5-D1 | Pull-driven laziness: fetch k+1 not issued until recipe k's final event was consumed | Fake archive logs the slug synchronously AT METHOD ENTRY (before any promise settles); assert log == ["granola"] at the moment recipe 1's `shared` event is in hand — eager prefetch = log length 2 = fail | b5 |
| T5-D2 | Abandonment prevents the next side-effect AND the close result records aborted | After break: (a) fetch log unchanged, (b) mid-recipe break → share-write log EMPTY, (c) `stream.result` rejects /abort/i, (d) checker-installed extension (`wrapExec` + `ctx.onClose` on `exportCollection`) recorded exactly `[{ ok: false, aborted: true }]` | b5, b6 |
| T5-D3 | Per-child failure isolation, exact policy: one `{ slug, stage: "failed", reason }` event per failed slug, underlying failure recoverable from `reason`, export continues, summary `{ exported, failedSlugs }`, no write for the failed slug | Fake archive rejects for one slug (logged at entry — the attempt itself is counted); a second scenario uses an unconvertible record (UNIT_UNKNOWN recoverable from reason) | b7, b8 |
| T5-D4 | Transformed forwarding of the production child stream: exact slug-prefixed event sequence, in order, interleaved per recipe — a bare `yield*` (unprefixed) or a test-only wrapper stream cannot produce it on the exported flow | Exact whole-sequence `eq` on events collected from `execStream` of the exported `exportCollection`; child streaming proven separately on the exported `exportRecipe` | b3, b2 |

Supporting checks: decl-exports (both exports are flows; both ports are presettable atom
handles — a solution without the scope seam fails every behavioral check because presets
cannot attach), b1/b2 (dual consumption identical stored results, exact conversion
values kill passthrough fakes), b4 (await-only collection still exports everything —
kills stream-only wrappers).

## Why fakes die (amendment audit)

1. "Fetch issued" is defined at method entry: the checker's fake pushes to the log as
   the first synchronous statement of `fetch`. A solution that counts on settle, or an
   adversary that prefetches and hides the unresolved promise, still increments the log
   → b5 fails.
2. Abandonment gating is double-sided: side-effect absence (fetch log, write log) AND
   the close result `{ ok: false, aborted: true }` recorded by an extension the CHECKER
   installs. A hand-rolled iterator that merely stops yielding has no exec close
   result → b5/b6 fail on the closes assertion.
3. The asserted stream is the production flow's: the checker only ever calls
   `ctx.exec` / `ctx.execStream` on `mod.exportCollection` / `mod.exportRecipe`
   imported from the prescribed `src/export.ts`. A mapped wrapper around a test-only
   stream is unreachable by the checker.
4. Failure policy checked exactly: event-by-event sequence, reason content, summary
   shape, fetch attempts (["granola","pesto","brisket"] — abort-the-batch or
   skip-remaining both fail), and write-log absence for the failed slug.

## DO/DON'T design trace (ratified section; idiom register workers/dkr-1/idiom-register.md)

DOs a reviewer verifies:
- DO compose the child flow as a dep: `controller(exportRecipe)` + `.execStream(...)` on
  the handle (I-3).
- DO make both effectful edges presettable atoms/ports resolved through deps; tests and
  grader substitute at `createScope({ presets })` only (I-1, I-20, I-21).
- DO name the foreign awaited edges: `ctx.exec({ fn, name })` spans (or step-tagged port
  flows) around `archive.fetch` / `shareTarget.write` (I-26).
- DO use generator flows for progress: one implementation, `exec` for await-only,
  `execStream` for streaming; pull-driven backpressure is the mechanism, not buffering
  (I-31).
- DO fail typed: `faults: typed<Fault>()` + `ctx.fail({ code: "UNIT_UNKNOWN", ... })`
  (I-9/I-17 flow-fault form).
- DO assert lifecycle honesty in tests: fetch-count at abandonment, close result
  `{ ok: false, aborted: true }` via an extension, `ctx.close`/`scope.dispose` (I-23,
  I-27).
- DO keep inputs `parse: typed<...>()` — trusted internal handoff, no zod ceremony
  (I-29).

DON'Ts:
- DON'T `ctx.exec({ flow: exportRecipe })` inside the parent factory — lint:pumped/no-direct-flow-composition.
- DON'T await the port clients bare in factories — lint:pumped/no-unattributed-await.
- DON'T keep module-level mutable containers closed over by factories — lint:pumped/no-module-state.
- DON'T `throw new Error(...)` in factories for domain failures — lint:pumped/no-untyped-throw.
- DON'T suffix handles (`exportRecipeFlow`, `archiveAtom`) — lint:pumped/no-definition-handle-suffix.
- DON'T forward with bare `yield*` (cannot transform) — preference (behavior-killed by b3).
- DON'T buffer/prefetch child work ahead of consumer pulls — preference (behavior-killed by b5).
- DON'T add callback/event-emitter progress parameters or duplicate await-vs-stream
  implementations — preference (b2/b4 make the dual-consumption path the only economical
  shape; prompt forbids).
- DON'T mock modules or reach module internals in tests — lint:pumped/no-module-mocks
  (I-20).

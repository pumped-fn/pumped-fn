# Task T-5: Recipe-archive export with live progress

Build a migration tool for a legacy home-cooking recipe archive in TypeScript. Recipes are
fetched from a legacy archive, converted to metric units, and written to a share target,
with live progress reporting. Use `@pumped-fn/lite` (provided in the workspace) for
composition. Everything else is plain TypeScript — no other runtime dependencies.

## Data contracts

```ts
type Ingredient = { name: string; quantity: number; unit: string }
type LegacyRecord = { slug: string; title: string; ingredients: Ingredient[] }
type SharedRecipe = { slug: string; title: string; ingredients: Ingredient[] } // metric units
type LegacyArchive = { fetch: (slug: string) => Promise<LegacyRecord> }
type ShareTarget = { write: (recipe: SharedRecipe) => Promise<{ id: string }> }
```

Unit conversion (exact, no rounding): `cup` → ml ×240, `tbsp` → ml ×15, `oz` → g ×28,
`lb` → g ×454; `g` and `ml` pass through unchanged. Any other unit makes the recipe
unconvertible.

## Domain rules

- **R1 Single export.** `exportRecipe` takes `{ slug }`, fetches the legacy record from
  the archive, converts every ingredient to metric, writes the converted recipe to the
  share target, and resolves to `{ id }` — the id the share target returned. While
  running it reports progress as typed events, in this order, exactly once each:
  `{ stage: "fetched" }`, `{ stage: "converted" }`, `{ stage: "shared", id: string }`.
- **R2 Dual consumption.** A caller must be able to either just await the final `{ id }`,
  or consume the progress events as they happen and then read the final `{ id }` — from
  the SAME operation. No duplicate implementations, no callback parameters, no event
  emitter. Both consumption styles must leave identical state at the share target.
- **R3 Collection export.** `exportCollection` takes `{ slugs: string[] }` and exports
  the recipes in order, strictly on consumer demand: the archive fetch for recipe k+1
  must not be issued until the consumer has consumed recipe k's final progress event.
  "Issued" means the archive client's `fetch` method was invoked at all — work bought
  ahead of consumer demand counts even if nobody awaits it.
- **R4 Forwarded progress.** Every progress event of every recipe is forwarded upward to
  the collection's consumer, in order, transformed to carry the slug:
  `{ slug, stage: "fetched" }`, `{ slug, stage: "converted" }`,
  `{ slug, stage: "shared", id }`.
- **R5 Failure isolation.** A failing recipe must not abort the collection. A recipe
  fails when its archive fetch rejects (no `fetched` event was emitted — the failure
  event is its only event) or when a record is unconvertible (its `fetched` event was
  already emitted; the operation must fail carrying code `UNIT_UNKNOWN`). Either way the
  collection's consumer sees exactly one event
  `{ slug, stage: "failed", reason: string }` for that recipe — `reason` must let the
  reader recover the underlying failure (the fetch error's message, or `UNIT_UNKNOWN`) —
  and the export continues with the next slug. No share write happens for a failed
  recipe. The collection resolves to `{ exported: number, failedSlugs: string[] }`
  (`failedSlugs` in encounter order).
- **R6 Abandonment.** If the consumer abandons the collection's progress stream, the run
  must stop where it stands: no further archive fetch is ever issued, and — if it was
  abandoned mid-recipe — that recipe's next side-effect (its share write) never happens.
  The run's recorded outcome must state it was aborted, observably from OUTSIDE the
  flow: an observer installed at scope creation must be able to see a close outcome that
  is not-ok and marked aborted, and a caller reading the final result of the abandoned
  run must get a rejection stating it was aborted.
- **R7 Substitutable edges.** The archive client and the share target are the only
  effectful edges. Both must be substitutable at scope creation, without touching module
  internals or module mocking. Ship working defaults: an in-memory sample archive
  containing at least the slugs `granola`, `soda-bread`, and `pesto` (imperial units so
  conversion is visible), and a share target that returns unique ids.

## Failure contract

A failed single export rejects with an error from which `UNIT_UNKNOWN` (or the archive's
own error message) is recoverable by inspecting the error's `message`, its `fault`
property (JSON-stringified), or the same on any link of its `cause` chain.

## Deliverables (fixed paths — the grader imports these)

- `src/ports.ts` — exports `archive` and `shareTarget` (the substitutable edges above)
  plus the data types. The grading harness replaces both at scope creation:

  ```ts
  const scope = createScope({
    presets: [preset(archive, fakeArchive), preset(shareTarget, fakeShareTarget)],
    extensions: [closeObserver],
  })
  ```

- `src/export.ts` — exports `exportRecipe` and `exportCollection`. Each must be
  executable and streamable by the grading harness as:

  ```ts
  const ctx = scope.createContext()
  const summary = await ctx.exec({ flow: exportCollection, input: { slugs } })
  // or
  const stream = ctx.execStream({ flow: exportCollection, input: { slugs } })
  for await (const event of stream) { /* ... */ }
  const summary2 = await stream.result
  ```

  The harness asserts against THESE exports — the production flows themselves, not
  test-side copies or wrappers.
- `tests/` — vitest tests covering the rules above, including at minimum: identical
  stored results for both consumption styles of `exportRecipe` (R2); ordered
  slug-prefixed forwarding surviving one failing slug (R4, R5); and abandonment after
  recipe k leaving the archive fetch count at exactly k with the recorded outcome
  aborted (R3, R6). Deterministic — no sleeps, no retries-until-green.
- `bin/export.ts` — runnable demo (`npx tsx bin/export.ts [slug...]`; defaults to the
  three sample slugs): runs a collection export against the default edges, prints one
  JSON line per progress event and a final JSON summary to stdout, and exits 0.

## Gates your submission must pass

1. `node <lint-cli> --max-warnings 0 src bin tests` — zero diagnostics.
2. `tsgo --noEmit` (strict).
3. `vitest run` — your tests pass.
4. `npx tsx bin/export.ts` — prints progress lines and a summary with every sample
   recipe exported.
5. The behavioral grading harness (real execution of your exports against R1–R7,
   including instrumented fetch-count, side-effect, and abandonment-outcome assertions).

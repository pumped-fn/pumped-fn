# T-1 answer key — atomic differentiators, each mapped to a deterministic checker assertion

Grading is EXECUTABLE: `harness/check-t1.mjs` (run inside the instantiated workspace via
`node --import tsx check-t1.mjs`) prints `{checks: {id: pass|fail}, errors, failed}` and
exits non-zero on any fail. No LLM judges behavior; no quote grading. A differentiator is
"present" iff every checker ID mapped to it passes. Primitive selection is graded by the
BEHAVIOR only the right primitive produces — never by vocabulary.

## Expected topology (verified against the library by executing the reference, not assumed)

- R1 connection: scope-owned `atom` whose factory registers `ctx.cleanup` — dispose
  closes it (`b8`); `preset(connection, double)` reroutes every feature (`b1`).
- R2 site config: `tag` consumed via `tags.required(siteConfig)` in deps — a scope
  without the tag fails at materialization with the tag label in the error (`n2`).
  Verified: tags.required rejection carries the label text ("site.config").
- R7 work record: `resource({ ownership: "current" })` resolved as a dep of
  `runVentAdjustment` AND of each sub-step. Semantics verified against
  pkg/core/lite/tests/scope.test.ts:1151-1239 (current ownership TODAY): misses store on
  the resolving execution context; nested `exec` children share the parent's instance;
  sibling executions on one parent context get fresh instances. This is the
  T-7/T-2-proven check pattern (`b2`, `b3`, `b4`).
- R6 sub-steps: composed via `deps: { plan: controller(planVentChange), apply:
  controller(applyVentChange) }` + `handle.exec(...)` (lint `no-direct-flow-composition`
  forbids inline `ctx.exec({flow})`); the record is the ONLY channel for the planned
  aperture (plan returns just `{recorded}`), so a parent that skips real nested
  composition cannot produce a correct `log` without duplicating the record semantics.
- R5 driver: value-carrying role tag `ventDriver = tag<VentDriver>` (invoice-triage
  notifier pattern); root picks the implementor per scope (`b5`), missing tag fails
  (`n3`).
- R4 status: derived ATOM with `controller(readings, { resolve: true, watch: true })` in
  ATOM deps + `tags.required(siteConfig)` — chal-2 H2-T1's killed key demanded
  atom-to-resource watch, which the runtime rejects; this key uses the expressible
  mechanism (watch in atom deps, PATTERNS.md "Controller as Dependency") and it is
  verified by execution: `set` → `scope.flush()` → re-resolve reflects the update
  (`b6`, `b7`).
- R9 weather: adapter atom + `ctx.exec({ fn, name: "weather.fetchForecast", params: [] })`
  — the checker-installed extension (`wrapExec` recording `ctx.name`) must observe the
  name; the preset double must supply the returned value (`t1`). NOTE (API surprise):
  `params: []` is required at runtime for fn-exec; omitting it throws
  "params is not iterable".

## Differentiators → atomic checks

| Diff | Claim | Kind | Checker IDs |
|---|---|---|---|
| D1 | Per-operation work record: siblings (sequential AND concurrent) observe distinct records; nested sub-steps share the parent operation's record; standalone sub-steps get fresh records | behavior | `b2-sequential-siblings-fresh-record`, `b3-concurrent-siblings-distinct`, `b4-nested-steps-share-record` |
| D2 | The record is the only plan→apply channel; a plan-less apply fails `NO_PLAN` and sends nothing | behavior + negative | `b4` (log contents), `n1-standalone-apply-no-plan` |
| D3 | Connection is the single scope-owned command seam: preset reroutes all features; dispose closes it | behavior | `b1-adjustment-through-preset-connection`, `b8-connection-cleanup-on-dispose` |
| D4 | Site config is ambient and loud: supplied per deployment at composition, absence fails at materialization naming the site config | behavior + negative | `b6` (per-site values), `n2-missing-site-config-fails-loud` |
| D5 | Driver is a composition-time role choice: per-scope swap changes behavior with zero code edits; absence fails loudly | behavior + negative | `b5-driver-swap-per-scope`, `n3-missing-driver-fails-loud` |
| D6 | Status is derived and reactive: reflects site config and the latest reading after settle, without imperative rebuild | behavior | `b6-status-derives-from-site-and-readings`, `b7-status-reacts-to-reading-updates` |
| D7 | Foreign weather call is a named, substitutable graph edge | behavior | `t1-weather-call-traced-and-substitutable` |
| D8 | Prescribed exports exist and are executable | declaration | `decl-exports` |

## DO/DON'T design trace (ratified section — sourced from workers/dkr-1/idiom-register.md)

DOs a reviewer verifies:
- DO make the shared connection a transport atom with `ctx.cleanup` (I-1, decision table
  `atom()` row) — behavioral proof `b1`/`b8`.
- DO consume deployment config via `tags.required` in deps so absence fails loud (I-4)
  — behavioral proof `n2`.
- DO give each operation its work record as `resource({ ownership: "current" })` and let
  nested steps reach it through deps (register decision table `resource()` row; concept
  gap #1 the suite exists to cover) — behavioral proof `b2`-`b4`.
- DO fill multi-implementation capabilities through a role tag bound at the root (I-5)
  — behavioral proof `b5`/`n3`.
- DO derive state with `controller(dep, { resolve: true, watch: true })` in atom deps,
  not manual subscriptions or recomputation calls (I-11) — behavioral proof `b7`.
- DO name every foreign edge with `ctx.exec({ fn, name })` (I-26) — behavioral proof `t1`.
- DO compose child flows via `controller(childFlow)` deps (I-3) — behavioral proof `b4`
  trace names.
- DO test only through `createScope({ presets, tags, extensions })` (I-20, I-21).

DON'Ts:
- DON'T hold the work record in a scope atom or module state — siblings bleed.
  `lint:pumped/no-module-state` catches the module variant; the scope-atom variant is
  behavior-only (caught by `b2`/`b3`).
- DON'T pick the driver with if/else on config inside a flow (I-5 violation). preference
  (review-only) — behaviorally caught by `b5`/`n3`.
- DON'T compose sub-flows with inline `ctx.exec({ flow })`.
  `lint:pumped/no-direct-flow-composition`.
- DON'T await a foreign client call outside a named span.
  `lint:pumped/no-unattributed-await` (verified: the fake adversarial trips exactly this
  rule) — also behaviorally caught by `t1`.
- DON'T default the site config or read it with `tags.optional`/`seekTag` fallbacks —
  silence instead of loud failure. preference — behaviorally caught by `n2`.
- DON'T rebuild status imperatively from `captureReading` (state-as-flow confusion,
  decision table). preference — behaviorally caught by `b7` only if they ALSO forget the
  imperative call; residual noted below.
- DON'T suffix handles (`connectionAtom`) — `lint:pumped/no-definition-handle-suffix`.
- DON'T use module mocks — `lint:pumped/no-module-mocks` (I-20).

## Why the known attacks fail (executed proofs in adversarial/*/verdict.json)

- Transplant (H-T1's invoice-shell: everything mapped 1:1 to atoms/tags; work record =
  scope atom in the invoice `queueSignal` style; lint-clean AND typecheck-clean): fails
  exactly the ownership checks — `b2` (standalone plan returns accumulated count, second
  operation log carries four entries), `b3` (concurrent siblings observe each other's
  entries). 2/13 fail → checker exit 1.
- Fake (right vocabulary, wrong wiring: `resource` present but `ownership: "boundary"`;
  `watch` omitted; `ventDriver` tag exported but never consumed; weather awaited
  directly): fails 7/13 — `b2`, `b3` (boundary record shared across siblings), `b5`,
  `n3` (tag ignored), `b6`, `b7` (status frozen at first resolve), `t1` (no named span).

## Residual gaming risk (recorded, not hidden)

- A solver could hand-roll per-operation isolation without `resource()` by having
  `runVentAdjustment` inline the plan/apply logic against a local array and fake the
  child-execution names with `ctx.exec({ fn, name: "vent.plan" })`, keeping exported
  sub-steps as behavioral twins. The checker measures behavior, so this passes while
  being non-idiomatic; same residual class T-7 recorded. Chal-3 should attack here.
- A status node that recomputes on every `scope.resolve` (no caching, no watch) is
  behaviorally indistinguishable from a watched derived atom through the public surface
  used by `b7`; the DON'T list covers it as review-only.
- `n2` accepts any rejection whose chain mentions "site"; a hand-thrown guard error
  inside every factory would pass — loudness is what is graded, not the tag mechanism.

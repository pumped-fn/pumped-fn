# T-4 answer key — scooter-fleet telemetry daemon with audit trail

Hidden from the solver. Differentiators are G6 pass-gates (any absent ⇒ task score 0).
Machine floor: `harness/check-t4.mjs` run inside the instantiated workspace. Reviewer
quotes cover what the machine cannot bind (marked below).

## Differentiators (G6) → checker mapping

| ID | Differentiator (mechanism named) | Machine check | Reviewer quote required |
|----|----------------------------------|---------------|-------------------------|
| T4-D1 | `auditTrail` is a hand-written extension implementing BOTH `wrapExec` and `wrapResolve`, outcome taken from the wrapped promise settling (await next() / catch) — not console logging, not wrapper functions around flows, not a prebuilt extension | b1, b3, b4 (behavior can only come from installed wrap hooks: exec + resolve entries with correct ok, through the shipped root) | the `wrapExec`/`wrapResolve` sites in src/audit.ts showing try/await-next/catch outcome capture |
| T4-D2 | Ring eviction proven behaviorally: >100 entries driven, exactly 100 remain, OLDEST evicted by content | b5 (sentinel sweep + resolve entries recorded first must be gone; only recent report executions remain) | the bounded-buffer site (shift/index ring) in src/audit.ts |
| T4-D3 | Nested failure outcomes: rejected client call inside a succeeding-then-failing sweep yields BOTH `ok: false` entries — fn edge (parent `low-battery-sweep`) AND the sweep itself — child entry preceding parent (completion order), plus the succeeding dispatch `ok: true` | b3 | none (fully machine-bound) |
| T4-D4 | Reachability through the shipped composition root: `createApp` (src/wire.ts) installs the extension in the same `createScope` the daemon uses; the trail query returned by `createApp` observes the public operations the CHECKER drives | b1, b4, b5 all execute through `wire.createApp` — a test-only/detached extension yields an empty trail (proven: adversarial/fake fails exactly these) + bin/daemon.ts must be quoted importing `createApp` from src/wire.ts (machine does not run the daemon against the trail) | bin/daemon.ts's `createApp(...)` call — same root, no second wiring |
| T4-D5 | Parse at boundary: the two wire shapes are a zod union validated once at the wire (flow `parse:` or equivalent single boundary site); internal handoff typed, never re-validated; rejection names the offending field | b2 (behavior: `lat`, `kind` recoverable from message/fault/cause chain, nothing stored) + s1 (zod import + `union(`/`discriminatedUnion(` in src) | reviewer confirms NO second validation site on the internal path |

## Atomic checks (checker IDs)

- decl-exports — declaration: prescribed exports are real lite constructs
  (`isFlow(reportPosition)`, `isFlow(lowBatterySweep)`, `isTag(fleetOps)`, `auditTrail`
  and `createApp` functions).
- b1-shipped-root-observes-public-ops — behavior + reachability: 3 reports (both wire
  shapes) + 1 sweep driven through `createApp`; sweep result `{dispatched:["s-cell","s-gps"]}`
  in report order; checker-owned client log matches; trail exec entries are EXACTLY those
  operations with correct parent attribution; durationMs numeric from the injected clock.
- b2-boundary-parse-names-field — negative: `lat: "north"` rejects naming `lat`; unknown
  `kind` rejects naming `kind`; store untouched (subsequent sweep dispatches nothing).
- b3-nested-failure-dual-entries — behavior: scripted client rejects `s-dead`; sweep fails
  at the exec site carrying the scooter id; trail has dispatch entries `[ok, failed]`,
  sweep entry `failed`, failed child entry before parent entry.
- b4-resolve-entries-distinct — behavior: at least one `kind: "resolve"` entry with
  non-empty name, ok, completing before the first exec entry.
- b5-ring-evicts-oldest — behavior: sentinel sweep + resolve entries recorded first, then
  105 reports; trail length exactly 100, zero resolve entries, zero sweep entries.
- s1-zod-union-at-boundary — static floor for T4-D5's mechanism naming.

## DO/DON'T design trace (ratified section)

DOs a reviewer verifies (quote each):
- DO install observability once at the composition root: `extensions: [audit.extension]`
  inside `createApp`, nowhere else (I-25). Quote the `createScope` call in src/wire.ts.
- DO name the foreign edge: each client call is `ctx.exec({ fn, params, name: "fleetops.dispatchPickup" })`
  (I-26). Quote the exec site in src/telemetry.ts.
- DO take the outcome from the wrapped result: `await next()` try/catch inside
  `wrapExec`/`wrapResolve` (I-27). Quote src/audit.ts.
- DO inject the client and the clock as wiring-time capabilities (tag + factory options),
  swapped in tests at the seam only (I-20/I-21). Quote one test's wiring block.
- DO fail the sweep with a structured fault carrying the scooter id (I-17). Quote the
  `ctx.fail({ code: "dispatch-failed", scooterId, ... })` site.
- DO parse the wire once with the zod union and hand off typed values internally (I-9).
  Quote the single `parse:` site.

DON'Ts:
- DON'T log inside business logic (inline console in factories) — `preference` (review;
  the transplant does this and lints clean — the checker, not lint, kills it).
- DON'T consume a prebuilt/observability extension in place of the hand-rolled
  `auditTrail` — `preference` + machine-backed by b1/b3/b4 shape requirements.
- DON'T install the audit extension only in tests (detached proof harness) —
  machine-checked: b1/b3/b4/b5 through the shipped root (adversarial/fake proof).
- DON'T import a concrete fleet-ops client in product code — `lint:pumped/no-ambient-io-outside-boundary`
  catches raw fetch; a canned in-repo module escapes lint (transplant lints clean), so
  also machine-checked by b1 (checker-owned client must receive the dispatches).
- DON'T re-validate on internal handoffs — `preference` (reviewer confirms single parse site).
- DON'T call clocks in product code — `lint:pumped/no-ambient-io-outside-boundary`
  (Date.now outside composition paths); machine-backed by b1 (injected counter clock
  produces the durations).
- DON'T bypass `ctx.fail`/typed faults with bare `throw new Error` in factories —
  `lint:pumped/no-untyped-throw` (warn tier, fatal under --max-warnings 0).
- DON'T suffix handles (`reportPositionFlow`, `fleetStateAtom`) —
  `lint:pumped/no-definition-handle-suffix`.
- DON'T compose child flows via `ctx.exec({ flow })` inside factories —
  `lint:pumped/no-direct-flow-composition` (not needed here; fn edges are the taught shape
  for foreign calls).

## Fairness notes (probe-verified API facts the task relies on)

- `wrapExec` sees fn edges under `ctx.name` (edge name), flows under `ctx.name` = flow
  name; `ctx.parent?.name` gives the enclosing operation; top-level execs have a root
  context parent whose name is undefined → `parent: null` via `?? null`.
- `wrapResolve` fires for atoms (name via `event.target.factory.name` — a named factory
  function expression is the idiomatic naming device) and resources (`event.target.name`).
- Entries recorded after `await next()` are naturally in completion order (child before
  parent) — no sorting machinery needed.
- Flow `parse:` receives `rawInput` verbatim; a zod throw is wrapped in `ParseError` with
  the ZodError (issues[].path) on `.cause` — field names are recoverable from the chain.

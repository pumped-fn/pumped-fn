# T-10 answer key — atomic differentiators, each mapped to a deterministic checker assertion

Grading is EXECUTABLE: `harness/check-t10.mjs` (run inside the instantiated workspace via
`node --import tsx check-t10.mjs`) prints `{checks: {id: pass|fail}, errors, failed}` and
exits non-zero on any fail. No LLM judges behavior.

## Expected topology (VERIFIED against the library by probe, not assumed)

Chain (all verified against the pinned tarball `pumped-fn-lite-4.0.0.tgz` and
pkg/core/lite/src/scope.ts):

- `displayAddress` — atom holding the address (scope-global state; `ctrl.set` applies
  synchronously and fires `resolved` listeners, scope.ts `scheduleSet`).
- `displayFeed` — RESOURCE whose factory reads the address atom via
  `controller(displayAddress, { resolve: true })` and subscribes
  (`address.on("resolved", ...)`) to re-establish ITSELF (`ctx.controller(displayFeed)`
  → `release().then(resolve)`) when the address changes; the subscription is torn down
  via `ctx.cleanup(unsubscribe)`. This is the ONLY library-expressible bridge from atom
  state to resource re-establishment: atom-watch is rejected in resource deps and a flow
  cannot release a root-owned resource (both probed, see "library facts").
- `displaySession` — RESOURCE with `controller(displayFeed, { resolve: true, watch:
  true, eq: (a, b) => a.address === b.address })` **in resource deps** (the register's
  concept-only surface, PATTERNS.md L232-256; runtime rule scope.ts:1000-1027). The
  watch releases the session when the feed's address changes; re-creation is LAZY (next
  resolve). Factory opens via the `boardLink` dep and binds `ctx.cleanup(() =>
  session.close())` — lifecycle bound to context close.
- `renderDepartures` — flow with `deps: { session: displaySession }`; default (boundary)
  ownership stores the session on the flow child's PARENT (the root context), so it
  survives across execs and closes at `ctx.close`.
- `retarget` — flow that ONLY sets the address atom (plus `await feed.resolve()` to make
  upstream re-establishment deterministic before returning); it never touches
  `displaySession`.

### Library facts the topology rests on (probe: scratchpad probe.ts, run on the tarball)

1. `wireResourceWatch` (scope.ts:1179-1194): upstream `resolved` + `eq` false ⇒
   `ownerCtx.release(dependent)` — dependent's cleanups run (old session closes), entry
   deleted, re-created lazily on next resolve. Probed order:
   `open:A, render:A, [retarget ⇒ close:A], open:B, render:B`.
2. Resource-watch is legal ONLY in resource deps; atom-watch ONLY in atom deps
   (scope.ts:1000-1027, also asserted by pkg/core/lite/tests/scope.test.ts:971-1000).
3. `ExecutionContext.release` is owner-local (scope.ts:2072-2082): a
   `ResourceController.release()` obtained inside a FLOW (child ctx) against a
   root-owned resource is a silent NO-OP (probed: state stays `resolved`, no cleanup
   runs). Manual close/open choreography inside `retarget` therefore CANNOT work through
   resource controllers — it forces session state out of the graph, which n1/b5 catch.
4. Same-address retarget: feed re-resolves but `eq` suppresses the dependent release —
   no session churn (b4).

## Differentiators → atomic checks

| Diff | Claim | Kind | Checker IDs |
|---|---|---|---|
| T10-D1 | The session is a `resource()` whose deps carry a watched controller on the UPSTREAM FEED RESOURCE (`controller(feed, { resolve: true, watch: true, eq })` in resource deps); retarget re-establishment is graph-driven. Behavioral fingerprint: after a retarget the old session closes but NO new session opens until the next render (graph release is lazy; manual choreography is eager) | declaration + behavior | `decl-exports`, `b2-retarget-closes-old-first`, `b3-no-eager-reopen`, `b6-retarget-before-first-render` |
| T10-D2 | Teardown ordering proven on the fake BoardLink's call log: `close(old)` strictly before `open(new)`, which is before `render(new)` — across repeated retargets | behavior | `b2-retarget-closes-old-first`, `b7-multi-retarget-order` |
| T10-D3 | `retarget` only updates address state; render path and retarget path are decoupled through the graph (same-address retarget = zero churn; retarget-with-no-render leaves nothing to close but the already-closed old session) | behavior + negative | `b4-same-address-retarget-keeps-session`, `b3-no-eager-reopen` |
| T10-D4 | Session lifecycle bound to the execution context: opened lazily on first render, ONE live instance across execs, closed exactly once at `ctx.close` | behavior | `b1-lazy-single-session`, `b5-shutdown-closes-live-session` |
| T10-D5 | No state outside the graph: a fresh scope has a fresh session AND the initial address | negative | `n1-fresh-scope-isolation` |

Any absent differentiator ⇒ task score 0 (G6 gate, eval-suite-candidate-v2 sec.1).

## DO/DON'T design trace (ratified section — sourced from workers/dkr-1/idiom-register.md)

DOs a reviewer verifies:
- DO model the live session as a `resource()` with `ctx.cleanup` binding close to the
  owning context's lifecycle (register I-4/resource row; coverage risk sec.3 #1).
- DO express "dependent infra tracks upstream infra" as
  `controller(upstreamResource, { resolve: true, watch: true, eq })` in RESOURCE deps —
  the register's concept-only surface #2 (PATTERNS.md L232-256).
- DO give the watch an `eq` so equal upstream values do not cycle the dependent
  (mirrors I-11's eq discipline for derived state).
- DO keep operator state in an atom set via `controller(...).set` from the flow
  (register controller row: intentional state update).
- DO swap the hardware client at wiring only: adapter atom + `preset(boardLink, fake)`
  (register `createScope`/preset row; Testing Rule: scope is the single seam).
- DO keep the demo's ambient IO (console) inside the adapter/composition allowance
  (bin + adapter atom), nowhere else.

DON'Ts:
- DON'T close/reopen the session inside `retarget`, or check "did the address change?"
  inside `renderDepartures` — manual choreography instead of graph edges. `preference`
  (behaviorally gated by b3/b4/b6; no lint rule names this).
- DON'T hold the session or address in module-level mutable state. `lint:pumped/no-module-state`
  (warn tier — fatal under `--max-warnings 0`); behaviorally gated by n1.
- DON'T put `watch: true` on an atom controller in resource deps or on a resource
  controller in flow deps — the runtime rejects both (scope.ts:1000-1027). `preference`
  (runtime-enforced, surfaces as gate-5 failures).
- DON'T model the session as an atom with scope-dispose cleanup — lifecycle must bind to
  the CONTEXT close, not scope dispose (register resource-vs-atom row). `preference`
  (behaviorally gated by b5).
- DON'T compose child flows via `ctx.exec({ flow })` in factories.
  `lint:pumped/no-direct-flow-composition`.
- DON'T suffix handles (`sessionResource`, `retargetFlow`). `lint:pumped/no-definition-handle-suffix`.
- DON'T throw bare `Error` in factories. `lint:pumped/no-untyped-throw` (warn tier).
- DON'T reach for `process.env`/timers/naked globals in factories. `lint:pumped/no-naked-globals`
  (warn tier).

## Why the known attacks fail (executed proofs in adversarial/*/verdict.json)

- Transplant (invoice-triage shapes: module-level session + eager manual close/open in
  `retarget`, atom-held state): fails `b3` (eager `open:north-quay` right after
  retarget), `b5` (session not closed at `ctx.close`), `n1` (session/address bleed
  across scopes).
- Fake (verbatim watched-resource constructs present but detached; real path is
  module-level): passes `decl-exports`, fails the behavioral chain.

## Residual gaming risk (recorded, not hidden)

A solver could reproduce ALL behavioral fingerprints without resource-watch by
hand-rolling a lazy session holder INSIDE an atom-of-mutable-object (e.g. a `manager`
atom whose value carries open/close methods, wired so `ctx.onClose` in a boundary
resource triggers close). Matching every check (laziness, eq-style same-address
suppression, close-before-open, ctx-close binding, scope isolation) effectively requires
re-implementing the resource lifecycle by hand; the lint gate (no-module-state) blocks
the cheap variants, but a disciplined graph-shaped twin is not machine-distinguishable.
G6 quote-grading of T10-D1's declaration (`watch: true` on the feed controller inside
`displaySession` deps) closes this at the suite level. Chal-3 should attack here.

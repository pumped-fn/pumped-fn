# T-10 summary — ferry-terminal departure board (Tier C)

worker pkr-t10 · run pumped-fn-skill-20260710 · 2026-07-10

## What the task examines

Register coverage risk #2 (workers/dkr-1/idiom-register.md sec.3): **resource controllers
with `watch` in resource deps** (PATTERNS.md L232-256) — the register's concept-only
surface — plus resource lifecycle bound to context close (coverage risk #1 adjacency)
and the adapter-atom preset seam. Idiom IDs touched: I-11 (eq discipline, transposed to
resource watch), I-16 (no module state), resource row of the primitive table, preset row.

chal-2 amendments (verdicts.md H2-T10) applied: the upstream value IS a resource
(`displayFeed`); the dependent session watches it via
`controller(displayFeed, { resolve: true, watch: true, eq })` **in resource deps**; the
killed v1 atom-to-resource watch topology is gone.

## Library semantics verified by probe (not assumed)

1. Upstream resource re-resolution + `eq` false ⇒ dependent resource released
   (cleanups run: old session closes) and re-created LAZILY on next resolve
   (scope.ts:1179-1194 `wireResourceWatch`). Laziness is the behavioral fingerprint that
   separates graph-driven retargeting from manual close/open choreography (which is
   necessarily eager) — checks b3/b6.
2. Resource-watch only in resource deps; atom-watch only in atom deps
   (scope.ts:1000-1027).
3. `ExecutionContext.release` is owner-local (scope.ts:2072-2082): a flow (child ctx)
   CANNOT release a root-owned resource — probed no-op. Consequence: the only
   library-expressible bridge from operator state (atom) to upstream-resource
   re-establishment is the feed subscribing to the address atom inside its own factory
   (`ctx.controller(displayFeed).release().then(resolve)` — ResourceContext is
   owner-bound). The retarget flow itself only sets the atom (+ awaits feed readiness).
4. Default (boundary) resource ownership stores a session resolved from a flow child on
   the ROOT context — one live session across execs, closed at `ctx.close`.

## Checker check-list (harness/check-t10.mjs — pure node, JSON verdict, exit 0/1)

decl-exports · b1-lazy-single-session · b2-retarget-closes-old-first ·
b3-no-eager-reopen · b4-same-address-retarget-keeps-session ·
b5-shutdown-closes-live-session · b6-retarget-before-first-render ·
b7-multi-retarget-order · n1-fresh-scope-isolation

## Gate results (reference, gates/reference-gates.log)

| Gate | Command | Result |
|---|---|---|
| 1 lint | `node <lint>/cli.mjs --max-warnings 0 src bin tests` | 0 diagnostics, exit 0 |
| 2 typecheck | `npx tsgo --noEmit` | exit 0 |
| 3 tests | `npx vitest run` | 5/5 pass, exit 0 |
| 4 smoke | `npx tsx bin/board.ts` | frame rendered, clean close, exit 0 |
| 5 checker | `node --import tsx check-t10.mjs` | 9/9 pass, exit 0 |

lint dist sha256 at gate time:
`7ae4e6f7ff276490f80f7f49ddcced98331e9b628c188821844ece85c1d7ac79` (pkg/tool/lint/dist/cli.mjs)
Tarball: pumped-fn-lite-4.0.0.tgz sha256
`16001d130626e01b58d178c28f32250000dfb830b8df5620a02d690cefaee58a` (dkr-5 pinned, not repacked).

## Adversarial results (verdict.json each)

| Adversarial | Construction | Checker |
|---|---|---|
| transplant | invoice-triage shapes: atoms + flows only, module-level session, eager manual close/open inside `retarget` | FAIL 7/9 (decl, b2, b3, b4, b5, b7, n1) |
| fake | verbatim watched-resource constructs present (`displayFeed`/`displaySession` with `watch`+`eq`) but detached; real path is module-level lazy session with hand-rolled address diffing | FAIL 4/9 (b2, b3, b4, b5) |

Both carry `pumped/no-module-state` (1 warn diagnostic each) — the attack itself is the
lint violation; under `--max-warnings 0` they fail gate 1 too. Noted per AG-1 exemption
rule.

## Replay

```
bash workers/dkr-5/harness/instantiate.sh workers/pkr-t10/reference-solution /tmp/ws
cp workers/pkr-t10/harness/check-t10.mjs /tmp/ws/ && cd /tmp/ws
node /home/lagz0ne/dev/pumped-fn/pkg/tool/lint/dist/cli.mjs --max-warnings 0 src bin tests
npx tsgo --noEmit && npx vitest run && npx tsx bin/board.ts
node --import tsx check-t10.mjs
```

## Residual attack classes (honesty)

1. **Graph-shaped behavioral twin without resource-watch**: a hand-rolled lazy session
   manager living inside atom-held mutable state wired to context close could in
   principle reproduce every behavioral check. Cheap variants hit `no-module-state` or
   fail b5 (scope-dispose vs ctx-close binding); a disciplined twin is not
   machine-distinguishable — G6 quote-grading of T10-D1's declaration closes it at suite
   level. Chal-3 material.
2. **Checker scenario bleed**: the fake's n1 pass is partly an artifact of its own
   cross-scenario module-state bleed (sessions land on stale fakes). It still fails 4
   checks; a checker v2 could add a subprocess-per-scenario mode to remove the artifact.
3. **Determinism**: the retarget flow's `await feed.resolve()` makes upstream
   re-establishment synchronous with the operation; a solution relying on the
   fire-and-forget listener chain alone could in principle race an immediately-following
   render. The checker's strict call-order assertions surface such a race as a fail,
   which is intended (the contract says "closed before the new one serves a render").

## Cut lines (budget)

- No second-tier adversarial (disciplined atom-managed twin, residual #1) — recorded,
  not built.
- Checker does not spawn subprocess-per-scenario (residual #2).

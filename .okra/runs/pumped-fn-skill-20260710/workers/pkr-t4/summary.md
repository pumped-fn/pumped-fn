# T-4 summary — scooter-fleet telemetry daemon with audit trail (Tier D)

worker pkr-t4 · run pumped-fn-skill-20260710 · 2026-07-10

## What the task examines

Idioms: I-27 (hand-rolled `wrapExec` + `wrapResolve` extension with outcome from the
wrapped promise, primary), I-25 (observability installed once at the shipped composition
root), I-26 (named foreign edge `fleetops.dispatchPickup`), I-9 (zod union at the wire,
typed internal handoff, field-naming rejection), I-17 (structured sweep fault carrying the
scooter id), I-20/I-21 (client + clock swapped at the wiring seam only), I-1/I-10 (state
atom, daemon shutdown dumping the trail). Dims R1–R8.

chal-2 H2-T4 amendment (kill the detached proof-harness) implemented as the task's
structural core: TASK.md prescribes ONE exported composition root, `createApp` in
src/wire.ts, that `bin/daemon.ts` must build through — and the checker composes apps
through that same export, drives the PUBLIC operations (`reportPosition`,
`lowBatterySweep`), and reads the trail via `createApp`'s own query surface. The checker
never runs the solution's tests, so a test-only extension observing synthetic flows yields
an empty trail and fails 4 of 7 checks (proven, see adversarial/fake).

## Checker check-list (harness/check-t4.mjs)

decl-exports · b1-shipped-root-observes-public-ops · b2-boundary-parse-names-field ·
b3-nested-failure-dual-entries · b4-resolve-entries-distinct · b5-ring-evicts-oldest ·
s1-zod-union-at-boundary

Ring eviction is content-bound (packet differentiator 2): sentinel entries (one sweep +
the resolve entries) are recorded FIRST, then 105 reports; the trail must hold exactly 100
entries with the sentinels gone — a newest-out or count-only ring fails.

## Gate results (reference, gates/reference-gates.log)

| gate | command | exit |
|------|---------|------|
| lint | `node <main>/pkg/tool/lint/dist/cli.mjs --max-warnings 0 src bin tests` | 0 (0 diagnostics, 5 files) |
| typecheck | `npx tsgo --noEmit` | 0 |
| tests | `npx vitest run` | 0 (7 passed) |
| smoke | `printf '<4 lines incl. malformed>' \| npx tsx bin/daemon.ts` | 0 (structured field-naming rejections on stderr, trail dumped) |
| checker | `node --import tsx check-t4.mjs` | 0 (7/7 pass, gates/checker-reference.json) |

lint dist sha256 at gate time:
`7ae4e6f7ff276490f80f7f49ddcced98331e9b628c188821844ece85c1d7ac79` (recorded in log).

Adversarial (AG-2):
- transplant (invoice-triage-style intake shell: manual validation, console logging in
  factories, module-imported client, no auditTrail/createApp): checker exit 1, 7/7 checks
  failed (adversarial/transplant/verdict.json). NOTE: it lints CLEAN (0 diagnostics —
  console.log and a canned in-repo client escape every lint rule); the checker, not lint,
  is what kills it. No AG-1 exemption needed.
- fake (chal-2's exact killer, upgraded to the strongest form: reference-grade telemetry
  + audit ring + full export surface + green detached tests proving ring/nested-failure on
  synthetic flows — but `createApp` never installs the extension): checker exit 1 with
  decl/b2/s1 PASSING and b1/b3/b4/b5 failing on empty trail
  (adversarial/fake/verdict.json). Fake lints clean and its own vitest run is green (2
  passed) — G1–G3 cannot catch it; only the reachability-bound checker does.

Contribution metric: **admitted** — reference green on all 5 gates; both adversarials fail
the checker.

## API findings (probe-verified against pinned tarball 4.0.0, scratchpad probe)

1. Nested exec visibility: `wrapExec` fires for controller-handle child-flow execs
   (ctx.name = flow name) and fn edges (ctx.name = edge name); `ctx.parent?.name` names
   the enclosing operation; the top-level exec's parent is the root context (name
   undefined). Confirms and extends T-9 finding 3.
2. Failure propagation: `ctx.fail` inside a child rejects `next()` at every enclosing
   wrap level (fn edge Error → child FlowFault → parent FlowFault), so recording after
   `await next()` yields both correct outcomes AND completion order for free.
3. `wrapResolve` naming: resources carry `.name`; atoms don't — `event.target.factory.name`
   (named function expression) is the naming device (same as pkg/ext/observable).
4. Flow `parse:` + zod: a parse throw is wrapped in `ParseError` with the ZodError on
   `.cause` (issues[].path carries the field); parse failures do NOT produce a wrapExec
   event (the operation never starts) — audit contract must not require entries for
   rejected inputs.
5. Lint mapping for this topology: the shipped scope factory must live in a
   composition-named file (`wire|main|bootstrap|composition|...`); `src/app.ts` would risk
   `no-shared-scope-factory` (and daemon clock: `Date.now` needs an ambient-named
   declaration like `daemonClock` in bin — the sanctioned composition-root adapter route,
   noted openly, not hidden IO).

## Residual attack classes (honest)

- **bin/daemon.ts is review-gated, not machine-gated.** The checker proves createApp's
  reachability but does not run the daemon against the trail; a solution whose daemon
  wires a SECOND scope without audit passes the checker. Mitigation: T4-D4 reviewer quote
  (daemon must import createApp) + G4 smoke shows the dumped trail. A stronger machine
  gate would parse the smoke stdout for trail entries — cut for budget, ~10 lines if
  wanted.
- **Trail-shape widening.** b1 filters exec entries to the three prescribed names, so a
  solution adding extra internal named flows is not penalized — deliberate fairness
  choice; a solution could hide junk entries under unprescribed names (harmless: ring and
  outcome checks still bind).
- **Checker-aware hardcoding.** Scooter ids/battery values are fixed in the checker; a
  solver shown the checker could special-case them. Threat model excludes checker access.
- No second-tier behavioral twin (correct trail via non-extension mechanism, e.g. handles
  wrapped in recording proxies at createApp) attempted — it would have to reproduce
  resolve entries and parent attribution, which only the wrap hooks see; recorded as
  chal-3 material, same cut line as dkr-5/pkr-t9.

## Workspace note

Template extended vs dkr-5: `zod@^4` + `@types/node` added, tsconfig `types: ["node"]`
(stdin daemon needs process types) — harness/workspace-template/. Reuses the pinned lite
tarball (sha256 16001d13…, NOT repacked).

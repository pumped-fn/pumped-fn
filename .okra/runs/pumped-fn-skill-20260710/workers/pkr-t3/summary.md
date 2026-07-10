# T-3 summary — observatory nightly capture + upload (worker pkr-t3)

## What the task examines

Scheduled jobs with OPPOSITE delivery policies on both axes — capture
`{overlap: skip, catchUp: skip}` vs upload `{overlap: queue, catchUp: all}` — plus the
competence chal-2's amendment demanded: implementing the scheduler extension's public
`Scheduler.Backend` contract as a durable backend (injected `ScheduleStore` +
`BackendClock`, catch-up derivation from persisted `lastRunMs` at `register()`).
Idioms: port atoms + preset seam (I-1/I-2), keepAlive state atom (I-6), effect-commit
ordering (I-7), `ctx.exec({ fn, params: [], name })` spans, scheduler extension row of
the idiom register, tag-supplied backend at composition roots.

## chal-2 H2-T3 amendments applied

1. "Opposite was false" — fixed by pinning upload to `catchUp: "all"` + `overlap: "queue"`;
   the invoice example has only skip/skip and queue/skip and no durable backend, so the
   transplant fails the declaration and every catch-up behavior.
2. "ManualBackend can script outputs" — fixed structurally: the checker constructs the
   solution's PRODUCTION `createObservatoryBackend({store, clock})` itself (its own store
   contents, frozen clock) and presets the `instrument`/`archive` ports at scope level.
   Only `schedule()`'s tick closure can reach those ports; a backend that fabricates
   outcomes has no scope reference. Proven: the scripted-backend adversarial fabricates
   catch-up records and still shows 0 archive sends.
3. API probed BEFORE the answer key (pkg/ext/scheduler/src/index.ts): `catchUp:
   "skip"|"last"|"all"` is part of the public Backend contract; only the shipped
   `inProcess()` rejects `last`/`all`. Catch-up IS expressible — no hand-back needed.

## Checker check-list (harness/check-t3.mjs)

decl-jobs-register-opposite-policies · decl-tick-executes-production-flows ·
b1-capture-overlap-drops-not-defers · b2-upload-overlap-queues-strictly ·
b3-upload-catchup-runs-all-missed-windows · b3b-catchup-is-idempotent-across-restart ·
b4-capture-missed-windows-are-lost · b5-failed-upload-retries-frames-and-chain-survives ·
b6-fresh-station-starts-from-now · b7-dispose-awaits-inflight-run

Mid-run checker fix: an early version left `capEvery`/`upEvery` at 0 when the decl check
failed, making b4 vacuously seedable. Fixed (cadence parsed before policy asserts +
non-vacuous fallbacks); all three verdicts re-run after the fix.

## Gate results (reference solution, workspace via harness/instantiate.sh)

| Gate | Command | Exit |
|---|---|---|
| lint | `node <main>/pkg/tool/lint/dist/cli.mjs --max-warnings 0 src bin tests` | 0 (0 diagnostics) |
| typecheck | `npx tsgo --noEmit` | 0 |
| tests | `npx vitest run` | 0 (8/8) |
| smoke | `npx tsx bin/daemon.ts` (two-phase restart demo, self-verifying, exit-code-bound) | 0 |
| checker | `node --import tsx check-t3.mjs` | 0 (10/10 pass) |

lint dist sha256: 7ae4e6f7ff276490f80f7f49ddcced98331e9b628c188821844ece85c1d7ac79
Evidence: gates/reference-gates.log, gates/checker-reference.json.

## Adversarial results

| Adversarial | Construction | Checker | Failed |
|---|---|---|---|
| transplant | invoice-triage scheduler shell renamed: skip/skip + queue/skip jobs, flows on their own log atom (not the prescribed ports), `inProcess()` wrapped as `createObservatoryBackend` ignoring store/clock | exit 1 | 10/10 |
| fake | correct opposite declarations + real port-wired flows, but the backend scripts catch-up: fabricates run records into module-level history, marks the store caught-up without invoking `tick`, ignores overlap, `stop()` does not await | exit 1 | 5/10 (b1, b2, b3, b3b, b7) |

Verdicts: adversarial/*/verdict.json. Transplant src is lint-clean (0 diagnostics); fake
carries 2 lint errors (`no-module-state` on the history array — the attack itself — and
`no-unattributed-await` on a bare port await), noted per the AG-1 exemption.

## Environment facts for successors

- `npm pack` on pkg/ext/scheduler leaves `"croner": "catalog:"` unresolved → workspace
  npm install fails EUNSUPPORTEDPROTOCOL. Use `pnpm pack` (rewrites to `10.0.1`). Pinned:
  harness/tarballs/pumped-fn-lite-extension-scheduler-0.2.0.tgz sha256
  7b6f40c8e441bd71c74971003076032d8bac7350512f0e8bc8a17922d141fa62.
- scheduler 0.2.0 declares peer `@pumped-fn/lite ^3.1.0` vs pinned lite 4.0.0 →
  `npm install --legacy-peer-deps` in instantiate.sh. Worth an upstream peer-range bump.
- Queued/catch-up ticks open contexts via `ctx.scope.createContext`; a disposing scope
  kills them. `registration.stop()` must be awaited before `scope.dispose()` — surfaced
  as task rule R10 and relied on by tests/checker.
- `ctx.exec({ fn })` requires `params: []` (ExecFnOptions.params non-optional).
- `no-ambient-io-outside-boundary` flags `Date.now`/`setInterval` in src/ AND at module
  top-level of bin/ (function bodies in bin/ are allowed).
- keepAlive atoms resolve lazily (keepAlive only exempts from GC), so resolve-order-
  dependent checker scenarios are sound.

## Residual attack classes / cut lines (honesty)

- Natural-cadence path (`clock.every`) unproven: the frozen-clock checker never fires a
  natural tick, so a backend that ignores `clock.every` entirely still passes; the demo
  gate does not close this. Closing needs a fake-timer tick harness (cut for budget).
- `catchUp: "last"` never exercised (no prescribed job uses it).
- `next()` numeric behavior unasserted (only stop-related wording in R10).
- No second-tier adversarial (correct backend, subtly wrong bookkeeping) beyond what
  b3b/b4/b6 already kill.

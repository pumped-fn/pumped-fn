# T-3 answer key — atomic differentiators, each mapped to a deterministic checker assertion

Grading is EXECUTABLE: `harness/check-t3.mjs` (run inside the instantiated workspace via
`node --import tsx check-t3.mjs`) prints `{checks: {id: pass|fail}, errors, failed}` and
exits non-zero on any fail. No LLM judges behavior.

## Expected topology (verified against the library, not assumed)

- **API ground truth probed first (chal-2 H2-T3 amendment).** `pkg/ext/scheduler/src/index.ts`:
  `Scheduler.Backend.register(spec, tick)` is the PUBLIC pluggable contract; `spec` carries
  `{ name, cadence, overlap, catchUp, onError }` with `catchUp: "skip" | "last" | "all"`.
  Only the shipped `inProcess()` backend rejects `last`/`all` (it has no persistence to
  derive from) — the contract itself expresses catch-up, and `schedule()`'s tick closure
  (index.ts:52-63) is what execs the production flow in a fresh context. So catch-up IS
  expressible: the solution implements a durable backend; catch-up derivation happens at
  `register()` from the persisted `lastRunMs` + `every` cadence math. No hand-back needed.
- **Opposite policies for real (fixing chal-2's finding that invoice's dailyReportJob is
  already skip/skip):** capture = `{ overlap: "skip", catchUp: "skip" }`, upload =
  `{ overlap: "queue", catchUp: "all" }` — opposite on BOTH axes. The invoice example
  contains skip/skip and queue/skip; no job there uses `catchUp: "all"`, and it has no
  durable backend at all, so a transplant cannot satisfy the declaration or any catch-up
  behavior.
- **Anti-scripting binding (fixing chal-2's ManualBackend attack):** the checker never
  trusts a solution-chosen backend wiring. It constructs
  `createObservatoryBackend({ store, clock })` ITSELF with a store and frozen clock it
  owns, tags it as `scheduler.backend`, and presets `instrument`/`archive` with recorders
  at scope level. The only path from a scheduler run to those preset ports is
  `schedule()`'s tick closure exec-ing the production flows on the scope — a backend that
  fabricates outputs has no reference to the scope and cannot touch the recorders
  (proven: adversarial/fake records fabricated manifests and still shows 0 archive sends).
- Ports as atoms (`instrument`, `archive`), frame state as a keepAlive atom, port calls
  wrapped in `ctx.exec({ fn, params: [], name })` spans (lint `no-unattributed-await`
  fires on a bare `await port.call()` in a factory — verified on the fake adversarial).
- `stop()` awaits `Promise.all([inFlight, chain])`; queued catch-up runs must be awaited
  via `registration.stop()` BEFORE `scope.dispose()` starts tearing contexts down (R10;
  found empirically — ticks open contexts via `ctx.scope.createContext`, which a disposing
  scope refuses).
- History bookkeeping pinned by R8 so `lastRunMs` assertions are deterministic:
  attempted/dropped/lost ⇒ advanced; fresh registration ⇒ `lastRunMs = now`, zero runs.

## Differentiators → atomic checks

| Diff | Claim | Kind | Checker IDs |
|---|---|---|---|
| D1 | Both jobs are real `schedule()` registrations with genuinely opposite policies: capture skip/skip vs upload queue/all, `{ every }` cadence, prescribed names | declaration | `decl-jobs-register-opposite-policies` |
| D2 | The registered tick is the production pipeline: driving a captured tick executes the exported flows against the preset ports | declaration + reachability | `decl-tick-executes-production-flows` |
| D3 | No-overlap capture proven by a long-running run spanning a second due tick: the overlapping run neither starts nor runs later; capture resumes when idle | behavior | `b1-capture-overlap-drops-not-defers` |
| D4 | Queue-overlap upload: second run waits, runs after the first, never concurrent (`maxActive === 1`) | behavior | `b2-upload-overlap-queues-strictly` |
| D5 | Catch-up derivation through the backend contract: 3 missed windows ⇒ exactly 3 production upload runs, oldest first, first manifest carrying the real captured readings, history advanced to the newest window | behavior + persistence | `b3-upload-catchup-runs-all-missed-windows` |
| D6 | Catch-up is derived from persisted state, not replayed: a second boot on the same store runs nothing | persistence/negative | `b3b-catchup-is-idempotent-across-restart` |
| D7 | Opposite policy on the same backend: capture with the same stale history runs ZERO times and still marks windows handled | behavior + negative | `b4-capture-missed-windows-are-lost` |
| D8 | Failure semantics: a failed upload rejects its trigger, leaves frames unsent (next run re-ships them), and does not poison the queue chain | negative | `b5-failed-upload-retries-frames-and-chain-survives` |
| D9 | Fresh registration invents no history: zero runs, baseline `lastRunMs = now` | negative | `b6-fresh-station-starts-from-now` |
| D10 | Clean shutdown: dispose resolves only after the in-flight run settled | behavior | `b7-dispose-awaits-inflight-run` |

## DO/DON'T design trace (ratified section — sourced from workers/dkr-1/idiom-register.md)

DOs a reviewer verifies:
- DO model external effects as port atoms (`instrument`, `archive`) and preset them at
  the scope seam — I-1/I-2; the checker's entire authority rests on this seam.
- DO wrap foreign port calls in `ctx.exec({ fn, params: [], name })` spans — register
  table row `ctx.exec({ fn })`; also load-bearing here (bare await is a lint error).
- DO keep station state (frames) in a keepAlive atom resolved as a flow dep — I-6.
- DO declare recurring work as `scheduler.schedule({...})` atoms and supply the backend
  via the `scheduler.backend` tag at composition roots only — register scheduler row; the
  backend value is constructed per use site (`createScope({ tags: [...] })`), never a
  shared scope factory.
- DO inject clock/timer/persistence into the backend (`ScheduleStore`, `BackendClock`)
  so `src/` has no ambient time — I-2; this is what lets the grader freeze time.
- DO mark frames sent only AFTER the archive accepted the manifest, so a rejected send
  retries naturally — I-7 (effect commit ordering).

DON'Ts:
- DON'T touch ambient `Date.now`/`setInterval` in `src/` — `lint:no-ambient-io-outside-boundary`
  (verified: flagged at 4 sites in a probe, and flagged module-level `Date.now()` even in bin/).
- DON'T await a port call outside a span — `lint:no-unattributed-await` (verified on
  adversarial/fake).
- DON'T hold run history or frames at module level — `lint:no-module-state`.
- DON'T compose child flows via `ctx.exec({ flow })` in factories — `lint:no-direct-flow-composition`
  (not needed here; flagged if attempted).
- DON'T use `scheduler.inProcess()` as the "durable" backend — `preference`
  (machine-checked behaviorally: it throws on `catchUp: "all"`, and the transplant
  adversarial that wraps it fails 9/10 checks).
- DON'T fabricate run outcomes inside the backend instead of invoking `tick` —
  `preference` (machine-checked behaviorally by `b3`/`b3b`: fabricated records cannot
  reach the preset archive recorder).
- DON'T advance `lastRunMs` lazily or not at all — `preference` (machine-checked by
  `b3b`/`b4`/`b6` store assertions).

## Residual attack classes (honesty)

- A solution could implement the backend correctly but with `catchUp: "last"` support
  broken — the checker never exercises `"last"` (neither job uses it). Accepted: outside
  the two prescribed jobs.
- The natural-cadence path (`clock.every`) is only proven not-to-misfire under a frozen
  clock (no-op timer); a backend that ignores `clock.every` and never fires natural ticks
  passes the checker. The demo gate exercises real timers only incidentally. Recorded as
  residual; closing it needs a fake-timer harness tick, cut for budget.
- `next()` is only checked for `undefined`-after-stop implicitly via R10 wording, not
  asserted numerically.

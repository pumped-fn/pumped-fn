# @pumped-fn/lite-perf-bench

Benchmarks, CPU-profiling harness, and research log for the
`lite` / `lite-react` / `lite-legend` stack.

**Not published** — this is a workspace-internal tool. Separated from the
shipped packages so production artifacts don't carry bench/prof deps
(`global-jsdom`, `@testing-library/react`, `vitest`-bench setup).

All perf work lives here: the runners, the profile analyzers, the
per-session experiment log ([`RESEARCH.md`](./RESEARCH.md)), and the
consolidated lessons for future research ([`LESSONS.md`](./LESSONS.md)).

## Status

Cumulative wins across five autoresearch sessions (same-machine
baselines, 3-run median — see [`RESEARCH.md`](./RESEARCH.md) for
per-session detail):

| Metric | First baseline | Current | Δ |
|--------|---------------:|--------:|---:|
| `scope_select_100handles_hz` (microbench, primary) | 1965 | **2882** | **+47%** |
| `raw_set_100listeners_hz` | 18 054 | **27 467** | **+52%** |
| `many_atoms_single_set_hz` | 17 441 | **23 660** | **+36%** |
| `legend_large_hz` (React bench) | 33.6 | **86** | **+156%** |
| `legend_small_hz` (React bench) | 186 | **325** | **+75%** |
| `select_large_hz` (React bench) | 114 | **211** | **+92%** |
| `select_small_hz` (React bench) | 404 | **761** | **+88%** |
| `useatom_large_hz` (React bench) | 16 | **21** | **+30%** |

Summary:
- `lite-legend` bridge now runs at parity with (or slightly above) `lite-react/useSelect` — more than doubled from baseline.
- `lite-react/useAtom` picked up ~30% from bypassing `useSyncExternalStore` on the canonical Suspense fast path.
- `lite-react/useSelect` ~2× from delegating change detection to `scope.select()` handle (selector runs in the notify path, not the render path).
- Lite core picked up a sync fast-path for `ctrl.set`, a Controller-side entry-ref cache, and inlined notifyListeners/notifyEntry dispatches.

## Layout

```
benchmarks/lite-perf/
├── README.md            this file — overview + run instructions
├── RESEARCH.md          per-session, per-round experiment log (5 sessions, 38 rounds, 11 keeps)
├── LESSONS.md           what worked, what didn't, rules of thumb, future directions
├── bench/               vitest-bench scenarios (React + JSDOM)
│   └── granular.bench.tsx
├── prof/                standalone Node scripts for CPU profiling
│   ├── micro.mjs            pure lite-core microbench, no React/JSDOM
│   ├── micro-select.mjs     single-scenario variant for cpu-prof runs
│   ├── run.tsx              React + JSDOM profiler-friendly runner
│   ├── analyze.mjs          .cpuprofile → top self/total time report
│   ├── our-code.mjs         .cpuprofile filtered to our packages only
│   └── out/                 .cpuprofile files (gitignored)
└── scripts/
    ├── autoresearch.sh      microbench + React bench, emits METRIC lines
    └── parse-metrics.sh     METRIC lines → JSON object
```

## Running the benchmarks

**Microbench** (primary signal — no React/JSDOM, 92% of CPU samples land in our code):

```bash
pnpm -F '@pumped-fn/lite-perf-bench' micro
```

Output:
```
METRIC raw_set_100listeners_hz=26974.559
METRIC scope_select_100handles_hz=2739.333
METRIC raw_set_1000listeners_hz=2397.229
METRIC many_atoms_single_set_hz=22373.589
```

**React vitest bench** (real-world reference — variance ~50%, use for sanity checks):

```bash
pnpm -F '@pumped-fn/lite-perf-bench' bench
```

**Combined** (what the autoresearch loop uses):

```bash
bash benchmarks/lite-perf/scripts/autoresearch.sh \
  | bash benchmarks/lite-perf/scripts/parse-metrics.sh
```

Emits a single JSON object with every metric — consumable by the
`lagz0ne/1percent` autoresearch skill.

## Profiling workflow

1. Run the profile:
   ```bash
   cd benchmarks/lite-perf
   node --cpu-prof --cpu-prof-dir=prof/out --cpu-prof-name=micro.cpuprofile \
     prof/micro-select.mjs
   ```

2. Analyze — filtered to our code:
   ```bash
   node prof/our-code.mjs prof/out/micro.cpuprofile 30
   ```
   Report shows self-time per function bucketed by origin (ours / react /
   jsdom / node / tsx), then top `OUR code` entries.

3. Full top-30 self/total table:
   ```bash
   node prof/analyze.mjs prof/out/micro.cpuprofile 30
   ```

For React-side profiling (setup cost dominates, signal is weak — use sparingly):

```bash
NODE_OPTIONS="--cpu-prof --cpu-prof-dir=$(pwd)/prof/out" \
  ITERATIONS=100 SCENARIO=select-large tsx prof/run.tsx
```

**Tip**: `node --cpu-prof` works best when run *without* `tsx` as the
outer launcher; tsx's loader gets most of the samples otherwise. Use
`node --import <tsx-esm-path> --cpu-prof script.tsx` for React workloads.

## Why a dedicated microbench

The React bench creates a fresh `render()` tree per iteration, so ~98%
of CPU time is React reconciliation, JSDOM mutation observers, and
ESM/tsx loader overhead — not our code. Micro-optimizations in `lite` /
`lite-react` / `lite-legend` are invisible at that scale.

The microbench skips React entirely and stress-tests four scenarios:

| Bench | Setup | Measures |
|-------|-------|----------|
| `scope_select_100handles_hz` (primary) | 100 `scope.select()` handles subscribed to one atom | Selector fan-out + notifyListeners + handle eq check |
| `raw_set_100listeners_hz` | 100 plain `ctrl.on('*')` listeners | Pure notifyListeners fan-out at `size=100` |
| `raw_set_1000listeners_hz` | 1000 listeners | Stress test for notify at scale |
| `many_atoms_single_set_hz` | 100 atoms × 10 sets (size-1 listener sets) | Hot path for size-1 fast path + Controller cache |

92% of CPU samples in these benches land in our code — they're the real
signal when iterating on `packages/lite`, `packages/lite-react`, or
`packages/lite-legend` internals.

## Running a new autoresearch session

If you're picking up perf work, the loop the five recorded sessions
followed:

1. **Branch** — `git checkout -b autoresearch/<slug>` off the integration branch.
2. **Baseline** — run `bash scripts/autoresearch.sh | bash scripts/parse-metrics.sh`, log to `autoresearch.jsonl` with `status:"keep"` and `description:"baseline"`.
3. **Profile** — `node --cpu-prof prof/micro-select.mjs` → `node prof/our-code.mjs prof/out/*.cpuprofile`. Pick the biggest non-user hotspot.
4. **Hypothesize** — one focused change, write down the predicted impact.
5. **Implement** — touch only scoped files; tests must still pass.
6. **Bench** — run the autoresearch driver 2–3 times; median against the last kept baseline.
7. **Decide** — keep if primary improves ≥ 2% and no secondary drops > 5%; otherwise `git checkout -- .` to revert.
8. **Log** — append a JSONL entry with metrics + status + one-line description; commit kept changes with a `Result: ...` trailer.
9. **Repeat** until three consecutive discards or a natural stopping point.
10. **Summarize** — append a new session block to [`RESEARCH.md`](./RESEARCH.md) with the per-round table and cumulative deltas. Add any novel wins/dead-ends/rules to [`LESSONS.md`](./LESSONS.md).

Session-local scratch files (`autoresearch.md`, `autoresearch.sh`,
`autoresearch.jsonl` at the repo root) are gitignored. Only the kept
commits and the summary in `RESEARCH.md` / `LESSONS.md` are durable.

## Before you start (please read LESSONS.md)

Several patterns have been tried repeatedly and regressed:

- Replacing the `WeakMap<Set,snap>` listener-snapshot cache with a parallel array + setter-callback — the closure alloc per fire eats the win.
- Delegating `useSelect` to `scope.select()` *while keeping* the render-path selector cache — doubles work, regresses 19%.
- Maximal inlining of the `scheduleSet` fast path — exceeds V8's inline budget and regresses.
- Parallel `useSyncExternalStore` + `useReducer` — double-charges reconciliation.

Details, with numbers, in [`LESSONS.md`](./LESSONS.md) §"What didn't work".

## See also

- [`plans/2026-04-21-legend-state-integration-research.md`](../../plans/2026-04-21-legend-state-integration-research.md) — the upstream Legend-State integration research (POC, API design, recommendations) that kicked off this perf work.

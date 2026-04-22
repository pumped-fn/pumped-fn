# @pumped-fn/lite-perf-bench

Benchmarks and profiling harness for the `lite` / `lite-react` / `lite-legend`
stack. **Not published** — this is a workspace-internal tool.

Separated from the shipped packages so production builds and published
artifacts don't carry bench/prof deps (`global-jsdom`, `@testing-library/react`,
`vitest`-bench setup, etc.).

## Layout

```
benchmarks/lite-perf/
├── bench/          # vitest-bench scenarios (React + JSDOM)
│   └── granular.bench.tsx
├── prof/           # standalone Node scripts for CPU profiling
│   ├── micro.mjs            # pure lite-core microbench, no React/JSDOM
│   ├── micro-select.mjs     # single-scenario variant for cpu-prof runs
│   ├── run.tsx              # React + JSDOM profiler-friendly runner
│   ├── analyze.mjs          # .cpuprofile → top self/total time report
│   ├── our-code.mjs         # .cpuprofile filtered to our packages only
│   └── out/                 # .cpuprofile files (gitignored)
└── scripts/
    ├── autoresearch.sh      # microbench + React bench, emits METRIC lines
    └── parse-metrics.sh     # METRIC lines → JSON object
```

## Running

Micro only (fastest, most signal):

```bash
pnpm -F '@pumped-fn/lite-perf-bench' micro
```

React vitest bench:

```bash
pnpm -F '@pumped-fn/lite-perf-bench' bench
```

Combined for autoresearch:

```bash
bash benchmarks/lite-perf/scripts/autoresearch.sh | \
  bash benchmarks/lite-perf/scripts/parse-metrics.sh
```

## Profiling

Generate a CPU profile of the microbench:

```bash
cd benchmarks/lite-perf
node --cpu-prof --cpu-prof-dir=prof/out --cpu-prof-name=micro.cpuprofile \
  prof/micro-select.mjs

# Analyze (top hotspots overall):
node prof/analyze.mjs prof/out/micro.cpuprofile 30

# Analyze (filtered to our code vs react/jsdom/node):
node prof/our-code.mjs prof/out/micro.cpuprofile 30
```

For React-side profiling (setup cost dominates, signal is weak — use sparingly):

```bash
NODE_OPTIONS="--cpu-prof --cpu-prof-dir=$(pwd)/prof/out" \
  ITERATIONS=100 SCENARIO=select-large tsx prof/run.tsx
```

## Why the microbench is the primary signal

The React bench creates a fresh `render()` tree per iteration, which means
~98% of CPU time is React reconciliation, JSDOM mutation observers, and
ESM/tsx loader overhead — not our code. Micro-optimizations in `lite` /
`lite-react` / `lite-legend` are invisible at that scale.

The microbench skips React entirely and stress-tests:
- `scope_select_100handles_hz` — 100 `scope.select()` handles subscribed to one atom, 100 mutations/iter. Dominant hot path inside `notifyListeners` + handle listeners.
- `raw_set_100listeners_hz` — 100 plain `ctrl.on('*')` listeners, 100 mutations/iter.
- `raw_set_1000listeners_hz` — 1000 listeners, stress test for notify fan-out.
- `many_atoms_single_set_hz` — 100 atoms × 10 sequential sets (size-1 listener sets).

These four numbers track real library throughput; 92% of their CPU samples
land in our code.

## See also

- [`plans/2026-04-21-lessons-perf-research.md`](../../plans/2026-04-21-lessons-perf-research.md) — consolidated lessons across all autoresearch sessions.
- [`plans/2026-04-21-legend-state-integration-research.md`](../../plans/2026-04-21-legend-state-integration-research.md) — full research doc with per-round deltas.

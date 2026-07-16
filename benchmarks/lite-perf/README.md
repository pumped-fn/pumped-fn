# lite-perf

Micro-benchmarks for the built `dist` of `@pumped-fn/lite` and `@pumped-fn/lite-react`. The checked-in row manifest fixes 39 Lite rows and 8 Lite React rows. No source-tree fallback is allowed.

## Build and test the harness

```bash
pnpm -F @pumped-fn/lite build
pnpm -F @pumped-fn/lite-react build
pnpm --dir benchmarks/lite-perf perf:test
```

The harness test uses only Node built-ins. It proves exact 39/8 counts and rejects empty, missing, duplicate, non-finite, wrong-lane, wrong-order, environment-drifted, artifact-drifted, source-tree, and mixed false-green evidence.

Environment identity uses semantic bytes, not installation locations. Package name, version, and manifest bytes; Node version and binary bytes; browser provider version and manifest bytes; Chromium bytes; lockfile, config, harness, writer, rows, platform, kernel, architecture, and CPU remain fingerprinted. Dependency, Node, and browser installation paths are excluded. Checkout, command, working-directory, and raw-output paths remain observation provenance only. Baseline and candidate roots must use byte-identical benchmark-control files while keeping their product sources and built artifacts separate.

## Capture one independent process

Each command launches exactly one Vitest process. `variant`, `pair`, and `position` are evidence labels; capture derives artifact identity from the current built dist.

Lite-only works without a browser or Lite React build:

```bash
cd benchmarks/lite-perf
node scripts/capture.mjs \
  --lane lite \
  --variant baseline \
  --pair 1 \
  --position 1 \
  --output /tmp/lite-perf/1-1-baseline-lite.json
```

On an authorized host with pinned Chromium, capture both lanes:

```bash
cd benchmarks/lite-perf
node scripts/capture-all.mjs \
  --variant baseline \
  --pair 1 \
  --position 1 \
  --output-dir /tmp/lite-perf
```

If the host permits a direct Vitest launch but denies Node child processes, preserve the direct process outputs and record them fail-closed:

```bash
cd benchmarks/lite-perf
mkdir -p /tmp/lite-perf
started_at=$(date -u +%FT%TZ)
: >/tmp/lite-perf/direct-lite.resolution.log
set +e
PUMPED_PERF_RESOLUTION_TRACE=/tmp/lite-perf/direct-lite.resolution.log \
  ../../node_modules/.bin/vitest bench --run \
  --config vitest.config.ts \
  --project node \
  bench/lite \
  --outputJson /tmp/lite-perf/direct-lite.vitest.json \
  --no-color \
  >/tmp/lite-perf/direct-lite.stdout.log \
  2>/tmp/lite-perf/direct-lite.stderr.log
exit_code=$?
set -e
finished_at=$(date -u +%FT%TZ)
node scripts/record.mjs \
  --lane lite \
  --variant baseline \
  --pair 1 \
  --position 1 \
  --input /tmp/lite-perf/direct-lite.vitest.json \
  --stdout /tmp/lite-perf/direct-lite.stdout.log \
  --stderr /tmp/lite-perf/direct-lite.stderr.log \
  --resolution-trace /tmp/lite-perf/direct-lite.resolution.log \
  --exit-code "$exit_code" \
  --started-at "$started_at" \
  --finished-at "$finished_at" \
  --command "vitest bench --project node bench/lite" \
  --output /tmp/lite-perf/1-1-baseline-lite.json
```

Use the same observation writer for every position in one comparison. Writer hashes are part of the environment fingerprint, so mixing `capture.mjs` and `record.mjs` observations fails closed.

Capture five adjacent baseline/candidate pairs in this fixed first-stage order. Rebuild the named artifact before each command; do not batch all baseline observations before candidate observations.

| Pair | Position 1 | Position 2 |
| ---: | ---------- | ---------- |
|    1 | baseline   | candidate  |
|    2 | candidate  | baseline   |
|    3 | baseline   | candidate  |
|    4 | candidate  | baseline   |
|    5 | baseline   | candidate  |

Use the file name `<pair>-<position>-<variant>-<lane>.json`. `capture-all.mjs` creates that name automatically. For Lite-only capture, pass it explicitly as shown above.

## Compare with the predeclared fallback

The first stage uses exactly five pairs and requires unanimous `5/5` direction. Run one comparison after pair 5:

Lite-only comparison is useful locally but reports all 8 React rows as evidence gaps and never emits a full performance claim:

```bash
cd benchmarks/lite-perf
node scripts/compare.mjs \
  --mode lite-only \
  --input-dir /tmp/lite-perf \
  --pairs 5 \
  --output /tmp/lite-perf/lite-comparison.json
```

Full 47-row comparison on the authorized browser host:

```bash
cd benchmarks/lite-perf
node scripts/compare.mjs \
  --mode full \
  --input-dir /tmp/lite-perf \
  --pairs 5 \
  --output /tmp/lite-perf/full-comparison.json
```

If and only if the predeclared full first-stage comparison returns `evidence_inconclusive`, capture pairs 6 through 9 once in the continuing alternating order:

| Pair | Position 1 | Position 2 |
| ---: | ---------- | ---------- |
|    6 | candidate  | baseline   |
|    7 | baseline   | candidate  |
|    8 | candidate  | baseline   |
|    9 | baseline   | candidate  |

```bash
baseline_root=/tmp/lite-perf-baseline
candidate_root=/tmp/lite-perf-candidate
output_dir=/tmp/lite-perf

for pair in 6 7 8 9; do
  if ((pair % 2 == 1)); then
    variants=(baseline candidate)
  else
    variants=(candidate baseline)
  fi
  for lane in lite lite-react; do
    position=1
    for variant in "${variants[@]}"; do
      root_name="${variant}_root"
      root="${!root_name}"
      (
        cd "$root/benchmarks/lite-perf"
        node scripts/capture.mjs \
          --lane "$lane" \
          --variant "$variant" \
          --pair "$pair" \
          --position "$position" \
          --output "$output_dir/$pair-$position-$variant-$lane.json"
      )
      position=$((position + 1))
    done
  done
done

cd "$candidate_root/benchmarks/lite-perf"
node scripts/compare.mjs \
  --mode full \
  --input-dir "$output_dir" \
  --pairs 9 \
  --output "$output_dir/full-comparison-9-pair.json"
```

Do not inspect or stop after pair 6, 7, or 8. The fallback is one predeclared second look after pair 9, not repeated optional peeking.

| Pair count | `no_regression`                          | `confirmed_regression`             | Improvement support                      |
| ---------: | ---------------------------------------- | ---------------------------------- | ---------------------------------------- |
|          5 | `5/5` ratios at or above `0.95`          | `5/5` ratios below `0.95`          | `5/5` ratios at or above `1.10`          |
|          9 | at least `8/9` ratios at or above `0.95` | at least `8/9` ratios below `0.95` | at least `8/9` ratios at or above `1.10` |

Under independent fair directions at the tested threshold, the predeclared two-stage one-sided false-positive bound is `21/512 = 4.1015625%`: `16/512` for unanimous direction in the first five pairs plus `5/512` for the fallback-only path with exactly four of the first five and all four added pairs in the same direction.

The comparator normalizes cold-resolve and invalidation-cascade rows as `baseline_p75 / candidate_p75`; every other row uses `candidate_hz / baseline_hz`. It reports every row, median/MAD, agreement at `0.95` and `1.10`, five-row Lite and three-row Lite React geometric means, and the smaller representative lane ratio. Mixed evidence is inconclusive, not no-regression. Do not check a constrained-host observation in as a performance baseline.

Raw benchmark and behavior-probe commands remain available:

```bash
pnpm bench
pnpm bench:lite
pnpm bench:react
pnpm test
```

## Layout

- `bench/lite/baseline.bench.ts` — interpretation floors (`Map.get`, promise await). Warm `controller.get()` should sit near the `Map.get` floor; warm `scope.resolve()` near the promise floor.
- `bench/lite/resolve-cold.bench.ts` — cold resolve over chain/wide/diamond graphs, fresh scope per iteration (scope creation measured separately for subtraction).
- `bench/lite/warm.bench.ts` — already-resolved access paths.
- `bench/lite/update.bench.ts` — `set` dispatch by listener count, watch-cascade chains and fan-outs, eq-suppressed cascades.
- `bench/lite/select-events.bench.ts` — `scope.select` hit/miss gating at 100 handles, subscription churn.
- `bench/lite/flow.bench.ts` — execution context lifecycle, flow/fn exec, nesting, `onClose` churn.
- `bench/react/react.browser.bench.tsx` — update propagation through `useAtom`/`useSelect` at 100 consumers, mount/unmount.
- `tests/` — behavior probes that document re-render semantics and guard against the equal-count listener-replacement bug returning (the removed size-validated `listenerSnapshotCache`).

## Reading the numbers

- browser-mode React numbers are relative, not absolute — compare rows, not browsers.
- Cold-resolve means are skewed by GC pauses from per-iteration scope creation (rme ±15% typical); prefer p75.
- Listener callbacks must be distinct closures — identical function references dedupe in the listener `Set` and silently measure the single-listener fast path.
- Cascade rows measure `set` + `scope.flush()`: the dominant cost is per-atom factory re-resolution (~2µs/node), not notification dispatch.

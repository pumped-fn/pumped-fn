# lite-perf

Micro-benchmarks for `@pumped-fn/lite` and `@pumped-fn/lite-react`. Runs against the built `dist` of the workspace packages — rebuild (`pnpm build` in each package) before benching.

```bash
pnpm bench          # everything
pnpm bench:lite     # core: resolve, warm paths, updates, cascades, select, flow
pnpm bench:react    # jsdom: re-render fan-out, selector gating, mount churn
pnpm test           # behavior probes: re-render counts, listener-churn regression
```

## Layout

- `bench/lite/baseline.bench.ts` — interpretation floors (`Map.get`, promise await). Warm `controller.get()` should sit near the `Map.get` floor; warm `scope.resolve()` near the promise floor.
- `bench/lite/resolve-cold.bench.ts` — cold resolve over chain/wide/diamond graphs, fresh scope per iteration (scope creation measured separately for subtraction).
- `bench/lite/warm.bench.ts` — already-resolved access paths.
- `bench/lite/update.bench.ts` — `set` dispatch by listener count, watch-cascade chains and fan-outs, eq-suppressed cascades.
- `bench/lite/select-events.bench.ts` — `scope.select` hit/miss gating at 100 handles, subscription churn.
- `bench/lite/flow.bench.ts` — execution context lifecycle, flow/fn exec, nesting, `onClose` churn.
- `bench/react/react.bench.tsx` — update propagation through `useAtom`/`useSelect` at 100 consumers, mount/unmount.
- `tests/` — behavior probes that document re-render semantics and guard against the equal-count listener-replacement bug returning (the removed size-validated `listenerSnapshotCache`).

## Reading the numbers

- jsdom React numbers are relative, not absolute — compare rows, not browsers.
- Cold-resolve means are skewed by GC pauses from per-iteration scope creation (rme ±15% typical); prefer p75.
- Listener callbacks must be distinct closures — identical function references dedupe in the listener `Set` and silently measure the single-listener fast path.
- Cascade rows measure `set` + `scope.flush()`: the dominant cost is per-atom factory re-resolution (~2µs/node), not notification dispatch.

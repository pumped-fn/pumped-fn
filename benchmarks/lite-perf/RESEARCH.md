# Perf research log

Per-session, per-round detail of every experiment run against the
`lite` / `lite-react` / `lite-legend` stack. The "what worked, what
didn't, what to try next" summary lives in [`LESSONS.md`](./LESSONS.md).

Each session ran on its own `autoresearch/*` branch (the autoresearch
skill convention from `lagz0ne/1percent`). Kept experiments were
cherry-picked onto the integration branch; every run (keep + discard
+ crash) was logged to `autoresearch.jsonl` at the time.

Hardware for all numbers in this log: containerised linux-x64,
Node 22, jsdom, React 18.3, `@legendapp/state@3.0.0-beta.46`.

## Session 1 — `autoresearch/lite-legend-perf` (5 rounds)

First disciplined perf loop. Target metric: `legend_large_hz`. Five
runs (1 baseline, 1 kept, 3 discarded), stopped at the 3-consecutive-
discard rule.

| Run | Status | Change | `legend_large_hz` | `legend_small_hz` |
|---:|:-------|:-------|------------------:|------------------:|
| 1 | keep | baseline | 33.63 | 185.97 |
| 2 | **keep** | Fast-path resolved atoms via plain `observable(ctrl.get())` + direct `obs.set` from `ctrl.on('*')`; idle/failed still go through `synced` for Suspense | **87.93** (+161%) | **303.08** (+63%) |
| 3 | discard | Collapse state-check + `ctrl.get()` into try/catch + `.bind()` | 73.07 (−17%) | 291.77 |
| 4 | discard | Narrow listener to `ctrl.on('resolved')` (avg of 2 runs within noise) | 87.99 (~0%) | 313.35 |
| 5 | discard | Same listener narrowing + cached `setObs` ref | 78.37 (−11%) | 318.74 |

**Verdict:** the one structural change (run #2) captures essentially all
the local-optimization room for the bridge. Everything else is inside
Legend's proxy and out of the bridge's reach. Further wins require
either a Legend-upstream change or bypassing Legend's tree (which
defeats per-key tracking, its main value).

## Session 2 — `autoresearch/lite-react-perf` (4 rounds)

Target flipped to `select_large_hz`. Hypothesis: `useSelect` runs its
selector inside `useSyncExternalStore.getSnapshot` with a 5-way
identity cache, which could be leaner. Four runs, no keeps.

| Run | Status | Change | `select_large_hz` | `select_small_hz` |
|---:|:-------|:-------|------------------:|------------------:|
| 1 | keep | baseline | 114.6 | 439.2 |
| 2 | discard | Delegate Suspense-resolved path to `scope.select()` handle | 92.4 (−19%) | 361.5 |
| 3 | discard | Mutate `selectionCache.current` fields in place to skip allocations | 108.6 (−5%) | 406.3 |
| 4 | discard | Trim cache identity checks to `(selector, eq, source)` | 103.2 (−10%) | 396.7 |

**Verdict:** `useSelect` is already well-tuned at the render-path
cache level. Delegating to core's `scope.select()` **doubles** the
work (the handle's `ctrl.on('resolved')` listener runs the selector in
parallel with the render-path cache). Real opportunities lie one
architectural layer up (see future-research in [`LESSONS.md`](./LESSONS.md)).

## Session 3 — `autoresearch/lite-core-perf` (10 rounds)

Scope expanded to `lite` core + `lite-react` hooks. Target
`select_large_hz`. 10 rounds, 4 keeps.

| # | Status | Change | `select_large_hz` | `legend_large_hz` |
|--:|:-------|:-------|------------------:|------------------:|
| 1 | keep | baseline | 113.7 | 82.0 |
| 2 | discard | `notifyListeners`: forEach + preallocated-array snapshot | 107.5 (−5%) | — |
| 3 | discard | `invalidationQueue` Array→Set (O(n) includes→O(1)) | 113.4 (≈0%) | — |
| 4 | discard | Inline `notifyEntry` into `doInvalidateSequential` pendingSet path | 114.9 (+1%) | — |
| 5 | **keep** | **Sync fast-path for `ctrl.set` when no chain pending** | 115.5 (+1.6%) | 88.8 (+8.4%) |
| 6 | keep | Parity sync fast-path for `scheduleUpdate` | 115.8 | 89.3 |
| 7 | discard | Maximal inlining in `scheduleSet` fast-path | 114.5 (−1%) | — |
| 8 | **keep** | **`useController`: drop `useMemo` (scope.controller is idempotent)** | 117.3 (+1.3%) | — |
| 9 | **keep** | **Hoist `eq ?? Object.is` to const per render in `useSelect`** | 119.7 (+2.1%) | — |
| 10 | discard | Cache listener snapshot arrays on `AtomEntry` | 117.1 (−2.2%) | — |

**Cumulative vs baseline:**

| Metric | Baseline | After | Δ |
|--------|---------:|------:|---:|
| `select_large_hz` | 113.7 | ~119 | **+4.7%** |
| `useatom_large_hz` | 16.2 | ~18 | **+11%** |
| `legend_large_hz` | 82.0 | ~86 | **+5%** |
| `legend_small_hz` | 291 | ~315 | **+8%** |

**Biggest win:** round 5 eliminated the `Promise.resolve().then()`
microtask on every `ctrl.set` when the invalidation chain is empty —
the common case for fine-grained mutations. `lite-legend` benefited
most because its bridge pipes every mutation through `ctrl.set`.
Rounds 8 and 9 were small but well-targeted lite-react hook cleanups.

## Session 4 — `autoresearch/lite-aggressive` (9 rounds)

Goal: find structural wins after session 3 hit a local optimum.
Opened the scope to more invasive approaches (hook-rule bending,
delegating to core primitives). 9 rounds, 2 keeps.

| # | Status | Change | Outcome |
|--:|:-------|:-------|:-------|
| 1 | **keep** | **`useSelect` delegates change detection to `scope.select()` handle** — selector runs in the notify path, not the render path; 99/100 sibling components never schedule a React re-render | **select_large +7%, legend_large +14%, legend_small +21%** |
| 2 | discard | Drop parallel `ctrl.on('*')` when handle is active | Fails state-transition test |
| 3 | discard | Hoist `this.x` accesses in `SelectHandleImpl` listener | Noise |
| 4 | discard | Add `Controller.snapshot()` API and use single-lookup in `useAtom` | Regressed |
| 5 | **keep** | **`useAtom` Suspense path bypasses `useSyncExternalStore`** — direct `useReducer` forceUpdate + `useLayoutEffect(ctrl.on('*'))` | **useatom_large +30%, useatom_small +33%** |
| 6 | discard | Same bypass for `useSelect` | Breaks hook count (handle flips null on state transition) |
| 7 | discard | `SelectDispatcher` — share `ctrl.on('resolved')` across all handles for an atom | Added complexity, no measurable win |
| 8 | discard | Parallel forceUpdate + `useSyncExternalStore` for `useSelect` | Regressed (double-charged) |

**Cumulative vs pre-session baseline (3-run median):**

| Metric | Pre-aggr | Post-aggr | Δ |
|--------|---------:|----------:|---:|
| `useatom_large_hz` | 15.9 | ~21 | **+30%** |
| `useatom_small_hz` | 108 | ~144 | **+33%** |
| `select_large_hz` | 100.6 | ~104 | **+3–7%** |
| `legend_large_hz` | 77 | ~82 | **+6%** |
| `legend_small_hz` | ~240 | ~325 | **+35%** |

## Session 5 — `autoresearch/lite-prof-guided` (10 rounds, CPU-profile driven)

Pivot: earlier React-bench numbers were dominated by React + JSDOM
setup (~98% idle in `node --cpu-prof`). Built a standalone microbench
(`prof/micro.mjs` + `prof/micro-select.mjs`) where 92% of samples land
in our code, and drove optimization from the resulting profile.

Baseline hotspots (microbench, 92% in-our-code):

| Function | Self % | Notes |
|----------|------:|-------|
| user selector `(s) => s[k]` | 50 | Can't optimize — user code |
| `notifyListeners` | 22 | `[...listeners]` spread every fire |
| `ScopeImpl.getEntry` | 10 | `Map.get(atom)` per `ctrl.get()` / `ctrl.state` |
| `notifyEntry` | 5 | Dispatch to `notifyListeners` twice |
| SelectHandle listener | ~3 | `this.*` accesses, `ctrl.get()` |

**Kept (5):**

| # | Status | Change | Primary delta |
|--:|:-------|:-------|--:|
| 1 | keep | `notifyListeners`: WeakMap-cached snapshot (skip `[...listeners]` spread per fire) | +1% microbench; **+80% select_large_hz** (React) |
| 3 | keep | Controller lazy-caches `AtomEntry` reference (eliminates `scope.getEntry` Map lookup) | **+33% primary** |
| 8 | keep | Inline `notifyListeners` into `notifyEntry` (2 fewer dispatches per mutation) | +2% primary; **+23% many_atoms_single_set_hz** |
| 9 | keep | `Controller.set` forwards cached entry to `scheduleSet` | **+5% primary** |
| 10 | keep | Parity: same forward for `Controller.update`/`scheduleUpdate` | no-op (bench doesn't exercise update) |

**Discarded (3):**

| # | Status | Change | Outcome |
|--:|:-------|:-------|:-------|
| 2 | discard | `ListenerBag` abstraction (Set + parallel array + dirty flag) | Closure alloc in callbacks regressed primary −12% |
| 5 | discard | Inline snapshot arrays on `AtomEntry` via `notifyCachedSet(cb)` | Same closure-alloc problem −9% primary, −45% React |
| 6 | discard | SelectHandle listener: hoist `this.*` into closure locals + `attach()` split | Within noise |

**Cumulative this session (microbench, 3-run avg):**

| Metric | Baseline | Now | Δ |
|--------|---------:|----:|---:|
| `scope_select_100handles_hz` (primary) | 1965 | 2882 | **+47%** |
| `raw_set_100listeners_hz` | 18 054 | 27 467 | **+52%** |
| `raw_set_1000listeners_hz` | 1799 | 2412 | **+34%** |
| `many_atoms_single_set_hz` | 17 441 | 23 660 | **+36%** |
| `select_large_hz` (React) | 110 | 211 | **+92%** |
| `select_small_hz` (React) | 404 | 761 | **+88%** |

## Cumulative across all five sessions

Measured against the very first session-1 baseline:

| Metric | Session-1 baseline | Current | Δ |
|--------|------------------:|--------:|---:|
| `legend_large_hz` | 33.6 | **86** | **+156%** |
| `legend_small_hz` | 186 | **325** | **+75%** |
| `useatom_large_hz` | 16 | **21** | **+30%** |
| `select_large_hz` | 114 | **211** | **+92%** |
| `select_small_hz` | 404 | **761** | **+88%** |

The biggest moves: the `lite-legend` bridge more than doubled, and
both React hooks (`useAtom`, `useSelect`) had real structural wins.
`lite-react/useSelect` is now at a local optimum for render-path work;
further gains need architectural change (see `LESSONS.md` →
"Future research directions").

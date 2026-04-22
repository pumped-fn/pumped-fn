# Lessons from perf research on `lite` / `lite-react` / `lite-legend`

Date: 2026-04-22
Source sessions: `autoresearch/lite-legend-perf`, `autoresearch/lite-react-perf`,
`autoresearch/lite-core-perf`, `autoresearch/lite-aggressive`,
`autoresearch/lite-prof-guided`.

Consolidated here so future perf work doesn't re-discover the same dead ends.
Per-round detail lives in
[`2026-04-21-legend-state-integration-research.md`](./2026-04-21-legend-state-integration-research.md).

## Cumulative wins

Measured on the lite-perf microbench (same machine, 3-run avg):

| Metric | Session-1 baseline | Current | Δ |
|--------|------------------:|--------:|---:|
| `scope_select_100handles_hz` | 1965 | **2882** | **+47%** |
| `raw_set_100listeners_hz` | 18 054 | **27 467** | **+52%** |
| `raw_set_1000listeners_hz` | 1799 | **2412** | **+34%** |
| `many_atoms_single_set_hz` | 17 441 | **23 660** | **+36%** |
| `select_large_hz` (React) | 110 | **211** | **+92%** |
| `select_small_hz` (React) | 404 | **761** | **+88%** |
| `useatom_large_hz` (React) | 16 | **21** | **+30%** |
| `legend_large_hz` (React) | 33.6 | **86** | **+156%** |

## What worked

### 1. Cache listener-set snapshots via `WeakMap<Set, snap>` (round 1 of session 5)

`notifyListeners` used to spread `[...listeners]` on every fire to preserve
snapshot semantics (listeners added during dispatch don't fire in the same
cycle). For a `useSelect` consumer with 100 React subscribers, that was two
100-element array allocations per atom mutation.

Keying a snapshot array on the Set itself via `WeakMap` reuses the cached
array across fires and rebuilds only when `.size` changes. Snapshot semantics
preserved — add/delete changes size → cache miss → rebuild.

- **Primary microbench**: +1% (call-overhead dominates at 100 listeners).
- **React useSelect**: +80% and +78% small/large. Two Sets were being spread per mutation; cache nailed both.
- Lesson: `WeakMap` lookups are faster than they look, and snapshot invariants are cheap to preserve when tied to Set size.

### 2. Cache entry ref on `Controller` (round 3 of session 5)

Every `ctrl.state` and `ctrl.get()` did a `scope.cache.get(atom)` Map lookup.
At 100 subscribers × 100 mutations per iter, that's tens of millions of Map
lookups in the bench.

`Controller` now lazy-caches its `AtomEntry` reference; `scope.release()`
invalidates it via `_invalidateEntryCache()`. Entry is a private struct so
staleness isn't a correctness risk — release is the only way the entry leaves
`scope.cache`, and we plumb the invalidation there.

- **Primary microbench**: +33%.
- Profile: `getEntry` dropped from 10.1% self-time to invisible.
- Lesson: when a method is hot *and* its lookup is pointer-stable for the lifetime of an object, cache the reference. The cache invalidation is a single bounded callsite (release) — no need for a full invalidation protocol.

### 3. Forward the cached entry to `scheduleSet`/`scheduleUpdate` (round 9)

`Controller.set(value)` used to call `scope.scheduleSet(atom, value)`, which
then redid `scope.cache.get(atom)`. Adding an optional `cachedEntry` param on
both schedule methods and forwarding `this._entryCache` removes that second
lookup.

- **Primary**: +5%.
- Lesson: follow a single hot call site through the full stack. Caching at one level only helps so much if the delegated level re-does the lookup.

### 4. Sync fast-path for `ctrl.set` (session 3 round 5, still active)

`scope.scheduleSet` used to always queue via `Promise.resolve().then()`. For
mutations against an empty invalidation chain — the overwhelming common case
for fine-grained updates — the microtask dispatch is pure overhead.

The fast path applies the value, runs listeners, and returns synchronously
when `invalidationQueue.length === 0 && !chainPromise`. Batching semantics
kick in as soon as a second set lands while a chain exists, so existing tests
pass unchanged.

- Immediate: +8.4% `legend_large_hz`, +1.6% `select_large_hz`.
- Over the long term, this is the base all five sessions built on — `lite-legend` went from 30% to ~150% of `useSelect` throughput in large part because every bridge mutation now avoids a microtask.
- Lesson: ambient async for correctness is fine; ambient async that *could* be correctness-neutral is a tax.

### 5. Inline `notifyListeners` body into `notifyEntry` (round 8 of session 5)

`notifyEntry` was a thin wrapper calling `notifyListeners` twice (phase-
specific Set + `allListeners`). After rounds 1 + 3 the function-dispatch
overhead was proportionally a bigger slice. Manual inlining of the whole
body (size-1 fast path + WeakMap cache + loop) saved two dispatches per fire.

- Primary: +2%, `many_atoms_single_set_hz` +23%.
- Lesson: V8 will inline short functions automatically; what it *won't* always inline is a function that calls another function that calls the user's callback. Break the indirection chain near the hot call site.

### 6. `useSelect` delegates change detection to `scope.select()` handle (session 4 round 1)

`useSelect` used to run its selector inside `useSyncExternalStore.getSnapshot`,
which React calls multiple times per render. That meant 100 subscribers × N
getSnapshot calls per mutation = huge wasted selector runs (99 of which
short-circuit on `Object.is`).

Delegating to core's `scope.select` handle moves the selector into the store
notification path. The handle runs the selector once per atom change, applies
`eq`, and only fires `onStoreChange` when the selected value actually differs.

- **React**: +7% select_large, +14% legend_large, +21% legend_small.
- Lesson: when you have a store primitive that already does change detection, let it. Don't duplicate the work in the render path.

### 7. `useAtom` bypasses `useSyncExternalStore` on the Suspense fast path (session 4 round 5)

For the canonical case (Suspense + autoResolve + resolved atom), the
snapshot-cache machinery inside `useSyncExternalStore` is pure overhead —
`ctrl.get()` is a pure read and tearing isn't a concern. Direct
`useReducer` force-update + `useLayoutEffect(ctrl.on('*'))` replaces it.

- **React useAtom**: +12% sustained; +30% on small-scale in later sessions.
- Caveat: relies on `isSuspense` being stable per component lifetime (React's conditional-hook rule). Non-Suspense path still uses `useSyncExternalStore` for correctness.
- Lesson: React's built-ins are optimized for the general case; a hot path with narrower guarantees can run leaner.

## What didn't work

### A. Parallel array alongside the Set with a dirty flag / callback setter (sessions 3 round 10, 5 round 2, 5 round 5)

The idea: maintain a cached snapshot array directly on `AtomEntry` instead
of in a WeakMap. Every attempt either:

- **Required a closure callback** (`notifyCachedSet(set, arr, (a) => entry.x = a)`) — the per-fire closure allocation erased the snapshot-save win and regressed primary by 9–12%.
- **Needed an extra `dirty` flag** (the `ListenerBag` abstraction) — the branch check and field accesses added more overhead than the WeakMap lookup.

Stick with `WeakMap<Set, { size, arr }>` snapshot caching.

### B. `invalidationQueue` `Array → Set` (session 3 round 3)

O(n) `.includes()` lookup looked suspicious. In practice the queue depth is
1–2 items during bench work, and `includes` on a 2-element array is faster
than `Set.has` lookup. No measurable win; discarded.

Lesson: O-complexity wins on algorithms only matter when N is large enough
to overcome the constant-factor advantage of arrays.

### C. Hoisting `this.*` into closure locals in `SelectHandleImpl.ctrl.on` (sessions 3, 4, 5)

Repeatedly tried: pre-capture `this.selector`, `this.ctrl`, `this.eq`,
`this.listeners` as local consts in the listener closure. V8 optimizes
property-on-`this` access in hot paths already — we saw only noise.

### D. Delegating `useSelect` to `scope.select()` naively (session 2 round 2)

The *clean* version from session 4 works. The early attempt kept the
render-path selector cache *and* added a handle that ran the selector in its
own listener — doubling work. Regressed −19% primary.

Lesson: when adding a cache/handle, delete the thing it's replacing. Half-
implementations are worse than either endpoint.

### E. Maximal inlining of the `scheduleSet` sync fast path (session 3 round 7)

Inlining both `notifyEntry` and both `notifyListeners` calls *and* the
size-check fast paths into a single function made the function too large for
V8's inline budget and regressed overall. Partial inlining (round 8 session
5) found the sweet spot.

Lesson: there's an inline-budget ceiling. Measure after each inline — stop
when the curve bends.

### F. Parallel `useReducer` forceUpdate alongside `useSyncExternalStore` (session 4 round 8)

The hybrid where both subscription paths fire on every atom change double-
charged — React reconciled twice per update. −47% on React select bench.

If you can bypass `useSyncExternalStore` with `useReducer`, you must fully
bypass it (make its subscribe return a noop and its getSnapshot return a
stable constant). Anything in between regresses.

### G. Structural `ListenerSet` abstraction (session 5 round 2)

Wrapping Set + parallel array in a class with explicit `add/delete/notify`
methods introduced dispatch overhead that V8 didn't always inline. Keeping
the primitive Set and adding a sidecar WeakMap for caching was faster AND
simpler.

Lesson: abstraction has a runtime cost even in modern VMs, especially when
the hot path crosses polymorphic method boundaries.

## Rules of thumb

1. **Profile first, at the lowest-overhead bench you can build.** The React
   bench was 98% idle (setup + JSDOM) and made everything look noisy. The
   microbench puts 92% of samples in our code; optimization deltas become
   clearly visible.
2. **Snapshot-caching > hand-maintained parallel arrays.** The `WeakMap`
   trick is simpler, preserves semantics for free, and avoids closure
   allocation.
3. **Cache pointer-stable references through their full call chain**, not
   just at the outermost method. Forward the cached ref via an optional
   parameter if needed.
4. **Sync is better than async when async isn't required.** Promise
   microtasks are pure overhead on pure-set operations.
5. **Don't duplicate work across a store primitive + a render-path cache.**
   Pick one.
6. **Stay inside V8's inline budget.** Incremental inlining beats maximal
   inlining every time.
7. **React bench variance is ~50%; use it only for real-world sanity, not
   optimization signal.** Microbench deltas under 5% need multi-run averages
   to be credible.
8. **Hook-rule violations fail silently at runtime.** Any conditional hook
   call based on atom state will break when the atom transitions out of
   the expected state (our `useSelect` hybrids hit this repeatedly).

## Future research directions

Ideas profile-hinted but not yet attempted:

1. **Consolidate per-atom `scope.select()` subscriptions.** When N handles
   target the same (atom, selector-identity), they could share one
   `ctrl.on('resolved')` registration. Tried a partial version in session 4
   round 7 — broke even; a well-measured implementation against the
   microbench could yield real savings at large N.
2. **Pre-compiled path selectors.** A `scope.selectPath(atom, 'a.b.c', eq?)`
   API that walks a string path without a user closure would skip the 50%+
   self-time currently charged to user selectors in the microbench profile.
3. **Scope-level notification batching.** When many atoms are set within a
   microtask window, batch their `notifyEntry` fires into a single React
   update. Would reduce `useAtom` reconciliations in fan-out scenarios.
4. **`AtomEntry` shape specialization.** All 100 subscribers in the bench
   point to the same entry; V8's IC lookups on `.state` / `.value` could
   benefit from a monomorphic entry shape. Worth a `--trace-opt` investigation.
5. **Legend-State upstream.** The `synced({ subscribe })` path still carries
   sync-state machinery we don't need. A lighter "external source" primitive
   in Legend would shave the bridge's remaining overhead.

## Tooling notes

- Autoresearch session artifacts (`autoresearch.md`, `autoresearch.sh`,
  `autoresearch.jsonl`) at the repo root are gitignored — they're session-
  local scratch space.
- The bench driver `benchmarks/lite-perf/scripts/autoresearch.sh` is tracked
  and stable; use it to compare runs on your own machine.
- `node --cpu-prof` works well when run *without* `tsx` as the outer
  launcher; tsx's loader gets most of the samples otherwise. Use
  `node --import <tsx-esm-path> --cpu-prof script.tsx` for the real workload.

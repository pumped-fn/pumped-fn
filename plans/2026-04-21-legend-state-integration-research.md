# Legend-State v3 Integration Research

Date: 2026-04-21
Branch: `claude/legend-state-research-fI4Xq`
Status: Research memo (no ADR yet — follow-up via `/c3-skill:c3` if adopted)

## Goal

Evaluate replacing (or complementing) `@pumped-fn/lite-react` with a Legend-State-based
frontend adapter: `@pumped-fn/lite-legend`. Lite stays the source of truth for
lifecycle, dependency graph and execution context; Legend-State owns the
fine-grained reactivity surface that the UI reads from.

## TL;DR

- Lite and Legend-State are complementary, not competing. Lite models *managed
  effects* (idle → resolving → resolved → failed, with cleanup & deps); Legend
  models *fine-grained reads* (proxy-based observables with per-leaf tracking).
- The bridge is small: every `Lite.Controller<T>` maps to an
  `observable<T>(synced({ get, set, subscribe, initial }))`. Each `ctrl.on('*')`
  becomes an `update(ctrl.get())` push into Legend.
- The new package (`@pumped-fn/lite-legend`) can ship with **4 exports**
  mirroring `lite-react`: `ScopeProvider`, `useScope`, `atomObs(atom)`,
  `useAtomObs(atom)`. Rendering uses Legend's `observer()` HOC or `use$()` —
  Lite does not own render tracking anymore.
- Suspense and ErrorBoundary still work: Legend's `use$(obs, { suspense: true })`
  + async `linked` handle both, so we do *not* need the `Promise`-throwing
  plumbing that `lite-react` has today (see `packages/lite-react/src/hooks.ts:52-84`).

## Legend-State v3 beta in one screen

Legend v3 is a proxy-based signal library. The primitives we care about:

```ts
import { observable, observe, syncState } from '@legendapp/state'
import { linked, synced } from '@legendapp/state/sync'
import { observer, use$, useObservable, Memo } from '@legendapp/state/react'
```

| Primitive | Shape | Role |
|-----------|-------|------|
| `observable(value)` | `Observable<T>` | Reactive proxy over a value |
| `observable(linked({ get, set }))` | `Observable<T>` | Pull-computed; re-runs `get` on dep change |
| `observable(synced({ get, set, subscribe, initial }))` | `Observable<T>` | Like `linked` but *push-capable* via `subscribe({refresh, update})` |
| `obs.onChange(cb)` / `obs.get()` / `obs.set(v)` / `obs.peek()` | methods | Core read/write surface |
| `observe(fn)` | `() => void` | Run `fn` reactively, returns dispose |
| `syncState(obs)` | `Observable<{ isLoaded, error, ... }>` | Async state inspector |
| `observer(Component)` | HOC | Tracks every `.get()` read during render |
| `use$(obs, opts?)` | hook | Track a single observable (alias of `useValue`) |
| `useObservable(fn)` | hook | Component-scoped observable |

v3 breaking changes relevant to us:
- `computed`/`proxy` collapsed into `observable(fn)`; they only re-run when
  observed, so they must not be used for side effects (matches Lite's atom
  semantics — side effects go in `atom({ factory })`).
- `useSelector`/`use$` renamed to `useValue` (old names still exported).
- `set` / `toggle` now return `void`.
- `persistObservable` → `syncObservable`; persistence moved under `persist`.

Sources: [Legend-State v3 intro](https://legendapp.com/open-source/state/v3/intro/introduction/),
[Observable docs](https://legendapp.com/open-source/state/v3/usage/observable/),
[React API](https://legendapp.com/open-source/state/v3/react/react-api/),
[Reactivity](https://legendapp.com/open-source/state/v3/usage/reactivity/),
[Persist and Sync](https://legendapp.com/open-source/state/v3/sync/persist-sync/),
[Migration guide](https://legendapp.com/open-source/state/v3/other/migrating/),
[CHANGELOG](https://github.com/LegendApp/legend-state/blob/main/CHANGELOG.md).

## What `lite-react` does today (reference)

`packages/lite-react/src/` exposes `ScopeProvider`, `useScope`, `useController`,
`useAtom`, `useSelect`. Under the hood:

- `useController(atom)` memoizes `scope.controller(atom)` and optionally throws
  the `resolve()` promise for Suspense (`hooks.ts:117-141`).
- `useAtom` / `useSelect` manually implement `useSyncExternalStore`, caching
  snapshots by `ctrl.state` + source identity to avoid tearing
  (`hooks.ts:155-245`, `hooks.ts:264-411`).
- A module-level `WeakMap<Controller, Promise>` caches in-flight `resolve()`
  promises so multiple components Suspend on the same resolution
  (`hooks.ts:52-84`).

This works but carries ~410 lines of careful snapshot caching, retry tracking
and Suspense plumbing. Legend absorbs most of it for free.

## Conceptual mapping

```
Lite                              Legend-State
──────────────────────────────    ─────────────────────────────────────
Scope (lifecycle boundary)   ──▶  React context carrier only
Atom<T>                      ──▶  factory used to produce Controller<T>
Controller<T>                ──▶  Observable<T> (via synced({...}))
ctrl.get()                   ──▶  obs.get()  (Legend tracks automatically)
ctrl.set(v) / ctrl.update    ──▶  obs.set(v)
ctrl.invalidate()            ──▶  syncState(obs).refresh() / explicit action
ctrl.on('*', fn)             ──▶  subscribe({ update })    (inside synced)
scope.select(atom, sel, eq)  ──▶  observable(() => sel(obs.get()))
useAtom(atom)                ──▶  use$(atomObs(atom)) / observer(Component)
useSelect(atom, sel)         ──▶  use$(() => sel(atomObs(atom).get()))
```

Key insight: Lite's `Controller` is already a push-based subscription
(`on('resolving' | 'resolved' | '*')`). Legend's `synced({ subscribe })` is the
matching reception end. The bridge is mechanical:

```ts
function toObservable<T>(scope: Lite.Scope, atom: Lite.Atom<T>) {
  const ctrl = scope.controller(atom)
  return observable<T>(synced({
    get: async () => {
      if (ctrl.state === 'idle') await ctrl.resolve()
      return ctrl.get()
    },
    set: ({ value }) => ctrl.set(value),
    subscribe: ({ update }) => ctrl.on('*', () => {
      if (ctrl.state === 'resolved') update(ctrl.get())
    }),
    // Optional: initial value when async `get` has not resolved yet
  }))
}
```

- Suspense: `use$(obs, { suspense: true })` suspends on the Promise returned by
  `get`. Lite's `resolving` state flows through naturally because `ctrl.resolve()`
  returns a Promise.
- ErrorBoundary: `synced` surfaces errors on `syncState(obs).error`; thrown in
  `use$` when configured. Lite's `failed` controller state becomes that error.
- Fine-grained reactivity: when the atom value is an object, Legend's proxy
  gives per-key subscription — a bigger win than Lite's current `select` hack.

## Proposed package: `@pumped-fn/lite-legend`

### Structure (mirror of `lite-react`)

```
packages/lite-legend/
├── src/
│   ├── index.ts          # Public exports
│   ├── context.tsx       # ScopeProvider, ScopeContext
│   ├── bridge.ts         # atomObs(scope, atom) → Observable<T>
│   └── hooks.ts          # useScope, useAtomObs, useAtom (sugar)
├── package.json
└── tsconfig.json
```

Peer deps: `@pumped-fn/lite`, `@legendapp/state` (>= `3.0.0-beta`), `react`.

### Public API (draft)

```ts
export { ScopeProvider, ScopeContext } from './context'
export { useScope } from './hooks'

// Primary surface: get an observable for an atom within the current scope.
export function atomObs<T>(scope: Lite.Scope, atom: Lite.Atom<T>): Observable<T>

// React sugar — observes current scope automatically.
export function useAtomObs<T>(atom: Lite.Atom<T>): Observable<T>

// Convenience: read-through hook so consumers don't need observer() for
// trivial cases. Suspense-compatible by default.
export function useAtom<T>(atom: Lite.Atom<T>, opts?: { suspense?: boolean }): T
```

`atomObs` caches per `(scope, atom)` in a `WeakMap` so repeated calls share the
same Observable (matches `useController`'s `useMemo` guarantee).

### Usage patterns

**Pattern A — `observer` HOC, fine-grained reactivity (preferred).**

```tsx
const userObs = atomObs(scope, userAtom) // or useAtomObs(userAtom)

const UserCard = observer(() => {
  // Proxy tracking: only re-renders when `.name` changes, not the whole atom.
  return <div>{userObs.name.get()}</div>
})
```

**Pattern B — single-value hook (cheapest migration from `useSelect`).**

```tsx
function Name() {
  const name = useAtom(userAtom, { suspense: true })
  return <div>{name}</div>
}
// Or with explicit projection:
function Name() {
  const obs = useAtomObs(userAtom)
  return <div>{use$(() => obs.name.get())}</div>
}
```

**Pattern C — derived observables without `select()`.**

```tsx
const fullNameObs = observable(() =>
  `${atomObs(scope, userAtom).first.get()} ${atomObs(scope, userAtom).last.get()}`
)
```

This replaces `scope.select(atom, selector, { eq })` — Legend's per-read tracking
does the change-detection for free. We can deprecate `useSelect` in
`lite-legend`.

## What Lite should *not* give up

Legend owns rendering; Lite still owns:

1. **Scope lifecycle** — `createScope`, `scope.dispose()`, extensions, presets,
   tags. Legend observables live inside a scope and die with it.
2. **Atom factories with deps** — DI, `tags.required`, `controller(atom)` deps,
   `resource()`. These drive *construction*; Legend drives *observation*.
3. **ExecutionContext / flows** — request-scoped work, `ctx.data`, `ctx.cleanup`.
   Legend has nothing equivalent and shouldn't.
4. **GC** — `scope.gc` + controllers' release/invalidate semantics. The bridge
   must release the atom when the last observer detaches; `synced.subscribe`
   return value is the natural cleanup hook:

```ts
subscribe: ({ update }) => {
  const off = ctrl.on('*', () => { /* ... */ })
  return () => { off(); /* optionally ctrl.release() via gc */ }
}
```

## Open questions / risks

1. **Scope-per-Observable vs global scope.** Legend observables are usually
   module-globals. Pumped-fn scopes are *instance-scoped* (per test, per
   request, per HMR reload). Decision: `atomObs` is `(scope, atom) => obs`, and
   the React sugar reads `scope` from context. No module-global observables.
2. **HMR.** `@pumped-fn/lite-hmr` preserves atom state across reloads. Legend
   observables in module state will be re-created on HMR; the bridge must
   survive because it reads from the (preserved) scope, but any component-local
   `useObservable` resets. Needs an HMR smoke test.
3. **Async `linked`/`synced` initial vs Lite's `idle`.** `synced.get` fires
   lazily when the observable is first observed. If Lite's atom was already
   resolved (e.g. SSR), we want `initial: ctrl.get()` to avoid an unnecessary
   loading flash. `atomObs` should branch on `ctrl.state` at construction.
4. **Invalidate semantics.** Lite's `ctrl.invalidate()` re-runs the factory.
   Mapping to Legend: expose `syncState(obs).refresh()` or an explicit
   `invalidate(obs)` helper. Probably both.
5. **`set` on async atoms.** `synced.set` is called with `{ value, changes }`.
   Lite's `ctrl.set` accepts raw T. Trivial but worth a note in docs.
6. **Bundle size.** `@legendapp/state` is small (~3–4 kB gz), but a dual React
   binding is real cost. `lite-legend` should be opt-in, not a replacement for
   `lite-react`. Document both.

## POC status

Scaffolded under `packages/lite-legend/` (commit in this branch):

- `src/bridge.ts` — `atomObs(scope, atom)` creates `observable<T>(synced({ get, set, subscribe }))`, forwards `ctrl.on('*')` → `update()` and `ctrl.state === 'failed'` → `onError()`. Cached in a per-scope `WeakMap`.
- `src/hooks.ts` — `useScope`, `useAtomObs`, `useAtom` (Suspense by default; errors via `syncState(obs).error`).
- `src/context.tsx` — `ScopeProvider` / `ScopeContext` matching `lite-react`.
- `tests/bridge.test.tsx` — 8 POC tests covering Suspense, set/update, per-key tracking with `observer()`, invalidate, and async error flow. All passing.

### Benchmark results

Hardware: containerized linux-x64, jsdom, React 18.3, `@legendapp/state@3.0.0-beta.46`, `@pumped-fn/lite-react@1.2.0`. Run via `pnpm -F '@pumped-fn/lite-legend' bench`.

Numbers below are **after** the autoresearch-driven optimization (see "Autoresearch session" below). Pre-opt numbers are included for the Legend row so the improvement is visible.

**Scenario A — small (20 keys, 50 mutations of one hot key):**

| Binding | ops/sec | renders per iter |
|---------|--------:|-----------------:|
| `lite-react` / `useAtom` (whole-atom) | ~120 | 1 000 |
| `lite-react` / `useSelect` (hand-rolled selector) | ~415 | ~50 |
| `lite-legend` / `observer` (pre-opt, run #1) | 186 | ~50 |
| `lite-legend` / `observer` (post-opt, run #2) | **303** | ~50 |

**Scenario B — large (100 components, 100 mutations of one hot key):**

| Binding | ops/sec | renders per iter |
|---------|--------:|-----------------:|
| `lite-react` / `useAtom` | ~16 | 10 000 |
| `lite-react` / `useSelect` | ~110 | ~100 |
| `lite-legend` / `observer` (pre-opt, run #1) | 33.6 | ~100 |
| `lite-legend` / `observer` (post-opt, run #2) | **87.9** | ~100 |

### Reading the numbers (post-optimization)

- **Render-count parity** — Legend's proxy tracking eliminates spurious re-renders identically to a hand-written `useSelect`. Both collapse an N×K worst case (useAtom) down to ~K.
- **Wall-clock** — after the fast-path optimization (run #2 below), `lite-legend` lands at **~80% of `useSelect`'s throughput** on both scenarios. That's essentially parity given run-to-run noise of ±5%, and Legend gives it without the caller writing any selector at all.
- **Pre-opt gap** (baseline) was ~3.3× slower than `useSelect` on the large scenario. The fix is a one-branch change: when the atom is already resolved, bypass `synced()` entirely.
- **Where Legend should still pull further ahead** (not yet measured): deeply nested reads like `user.profile.addresses[2].zip`, and fan-out scenarios where N different components each read a different leaf. Both avoid the per-component selector boilerplate `useSelect` needs.

### Autoresearch session — `autoresearch/lite-legend-perf`

Used the `lagz0ne/1percent` autoresearch skill to run a disciplined experiment loop. Five runs (1 baseline, 1 kept, 3 discarded), stopped at the 3-consecutive-discard rule.

| Run | Status | Change | `legend_large_hz` | `legend_small_hz` |
|---:|:-------|:-------|------------------:|------------------:|
| 1 | keep | baseline | 33.63 | 185.97 |
| 2 | **keep** | fast-path resolved atoms via plain `observable(ctrl.get())` + direct `obs.set` from `ctrl.on('*')`; idle/failed still go through `synced` for Suspense | **87.93** (+161%) | **303.08** (+63%) |
| 3 | discard | collapse state-check + `ctrl.get()` into try/catch + `.bind()` | 73.07 (−17%) | 291.77 |
| 4 | discard | narrow listener to `ctrl.on('resolved')` (avg of 2 runs within noise) | 87.99 (~0%) | 313.35 |
| 5 | discard | same listener narrowing + cached `setObs` ref | 78.37 (−11%) | 318.74 |

**Verdict:** the one structural change (run #2) captures essentially all the local-optimization room. Everything else is inside Legend's proxy and out of the bridge's reach. To go further, the optimization target shifts from the bridge to either:

1. A **Legend-upstream change** (e.g. a lighter-weight "external source" primitive that skips sync-state plumbing — which is exactly what our fast path emulates).
2. **Bypassing Legend's tree** for atoms whose values are primitives or opaque objects, via `opaqueObject()` — but that defeats per-key tracking, losing Legend's main value.

Session artifacts (all gitignored): `autoresearch.md`, `autoresearch.sh`, `autoresearch.jsonl`. The wrapper script and JSONL log are kept locally for reproducibility; the kept change is cherry-picked onto the research branch.

### Fifth autoresearch session — `autoresearch/lite-prof-guided` (profile-guided, 10 rounds)

Pivot: earlier React-bench numbers were dominated by React + JSDOM setup (~98% idle in `node --cpu-prof`). Built a standalone microbench (`packages/lite-legend/prof/micro.mjs` + `micro-select.mjs`) where 92% of samples land in our code, and drove optimization from the resulting profile.

Baseline hotspots (microbench, 92% in-our-code):

| Function | Self % | Notes |
|----------|------:|-------|
| user selector `(s) => s[k]` | 50 | Can't optimize — user code |
| `notifyListeners` | 22 | `[...listeners]` spread every fire |
| `ScopeImpl.getEntry` | 10 | `Map.get(atom)` per `ctrl.get()` / `ctrl.state` |
| `notifyEntry` | 5 | dispatch to `notifyListeners` twice |
| SelectHandle listener | ~3 | `this.*` accesses, `ctrl.get()` |

**Kept (5):**

| # | Status | Change | Primary delta |
|--:|:-------|:-------|--:|
| 1 | keep | `notifyListeners`: WeakMap-cached snapshot (skip `[...listeners]` spread per fire) | +1% microbench; **+80% select_large_hz**, **+78% select_small_hz** (React) |
| 3 | keep | Controller lazy-caches `AtomEntry` reference (eliminates `scope.getEntry` Map lookup from `ctrl.get()`/`ctrl.state`) | **+33% primary** |
| 8 | keep | Inline `notifyListeners` into `notifyEntry` (2 fewer function dispatches per mutation) | +2% primary; **+23% many_atoms_single_set_hz** |
| 9 | keep | `Controller.set` forwards cached entry to `scheduleSet` (eliminates another `Map.get`) | **+5% primary** |
| 10 | keep | Parity: same forward for `Controller.update`/`scheduleUpdate` | no-op (bench doesn't exercise update) |

**Discarded (3):**

| # | Status | Change | Outcome |
|--:|:-------|:-------|:-------|
| 2 | discard | `ListenerBag` abstraction (Set + parallel array + dirty flag) | closure alloc in callbacks regressed primary −12% |
| 5 | discard | inline snapshot arrays on `AtomEntry` via `notifyCachedSet(cb)` | same closure-alloc problem −9% primary, −45% React |
| 6 | discard | SelectHandle listener: hoist `this.*` into closure locals + `attach()` split | within noise |

**Cumulative deltas, this session (microbench, same machine, 3-run avg):**

| Metric | Baseline | Now | Δ |
|--------|---------:|----:|---:|
| `scope_select_100handles_hz` (primary) | 1965 | 2882 | **+47%** |
| `raw_set_100listeners_hz` | 18 054 | 27 467 | **+52%** |
| `raw_set_1000listeners_hz` | 1799 | 2412 | **+34%** |
| `many_atoms_single_set_hz` | 17 441 | 23 660 | **+36%** |
| `select_large_hz` (React) | 110 | 211 | **+92%** |
| `select_small_hz` (React) | 404 | 761 | **+88%** |
| `useatom_large_hz` (React) | 20.9 | 19.7 | −6% (noise) |
| `legend_large_hz` (React) | 87 | 84 | −3% (noise) |

**Takeaways:**

1. **WeakMap-cached notify snapshot (round 1)** was the single biggest structural win for consumer-facing hooks. `useSelect` subscribes to both `resolvedListeners` (via handle) and `allListeners` (via state-transition fallback) — 2 × 100 listeners spread per mutation. Cache made that essentially free.

2. **Controller entry-ref cache (round 3)** eliminated `scope.getEntry` from the hot path entirely (10% → absent in re-profile). The Controller now owns a lazy field invalidated by `scope.release`.

3. **Inlining dispatches** (rounds 8+9) gave another ~7% combined by removing function-call overhead and an extra `Map.get` on the set path.

4. **What wouldn't invert**: any attempt to replace the `Set+WeakMap` pair with a direct-on-entry parallel array required passing a setter callback (closure), which allocated per fire and regressed. The WeakMap stays.

5. **The React bench is noisy** because most of its measured time is React + JSDOM setup, not our code. The microbench is the real signal going forward.

### Fourth autoresearch session — `autoresearch/lite-aggressive` (9 rounds)

Goal: find structural wins after the third session hit a local optimum. Opened the scope to more invasive approaches (hook-rule bending, delegating to core primitives).

| # | Status | Change | Outcome |
|--:|:-------|:-------|:-------|
| 1 | **keep** | **`useSelect` delegates change detection to `scope.select()` handle** — selector runs in the notify path, not the render path; 99/100 sibling components never schedule a React re-render | **select_large +7%, legend_large +14%, legend_small +21%** |
| 2 | discard | drop parallel `ctrl.on('*')` when handle is active | fails state-transition test |
| 3 | discard | hoist `this.x` accesses in `SelectHandleImpl` listener | noise |
| 4 | discard | add `Controller.snapshot()` API and use single-lookup in `useAtom` | regressed |
| 5 | **keep** | **`useAtom` Suspense path bypasses `useSyncExternalStore`** — drives re-renders via a direct `useReducer` forceUpdate + `useLayoutEffect(ctrl.on('*'))` | **useatom_large +30%, useatom_small +33%** (vs pre-aggr same-machine) |
| 6 | discard | same bypass for `useSelect` | breaks hook count (handle flips null on state transition) |
| 7 | discard | `SelectDispatcher` — share `ctrl.on('resolved')` across all handles for an atom | added complexity, no measurable win |
| 8 | discard | parallel forceUpdate + `useSyncExternalStore` for `useSelect` | regressed (double-charged) |
| 9 | (not runnable as clean experiment, folded into discards) | | |

**Cumulative (same-machine delta, pre-session → post-session, 3-run median):**

| Metric | Pre-aggr | Post-aggr | Δ |
|--------|---------:|----------:|---:|
| `useatom_large_hz` | 15.9 | ~21 | **+30%** |
| `useatom_small_hz` | 108 | ~144 | **+33%** |
| `select_large_hz` | 100.6 | ~104 | **+3–7%** |
| `legend_large_hz` | 77 | ~82 | **+6%** |
| `legend_small_hz` | ~240 | ~325 | **+35%** |

**Two structural wins:**

1. **useSelect change detection moved into `scope.select()` handle.** Previously every atom mutation fired `ctrl.on('*')` on 100 subscribers → 100 React re-render schedulings → 100 `getSnapshot` calls → 99 Object.is short-circuits. Now the handle runs the selector inline in its single `ctrl.on('resolved')` callback and only the 1 actually-changed component triggers `onStoreChange`. The 99 siblings never touch React at all.

2. **useAtom bypasses `useSyncExternalStore` on the canonical Suspense path.** For the common case (Suspense + auto-resolve + resolved), the snapshot-cache machinery is pure overhead — we don't need tearing protection because `ctrl.get()` is a pure read. Direct `useReducer` forceUpdate + `useLayoutEffect(ctrl.on('*'))` eliminates per-call snapshot bookkeeping.

**What didn't move:**
- Tightening `SelectHandleImpl`'s listener closure.
- Consolidating per-atom subscriptions at the scope level.
- Parallelizing useSelect's forceUpdate alongside `useSyncExternalStore`.

All three attempts either fell within noise or fought with React/V8 optimizations.

**Final cross-session standings vs. the original baseline from session one:**

| Metric | Original | Now | Cumulative Δ |
|--------|---------:|----:|---:|
| `useatom_large_hz` | 16.2 | ~21 | **+30%** |
| `useatom_small_hz` | 120 | ~144 | **+20%** |
| `select_large_hz` | 114 | ~117 | **+3%** |
| `legend_large_hz` | 33.6 | ~86 | **+156%** |
| `legend_small_hz` | 186 | ~325 | **+75%** |

`lite-legend` sees the biggest cumulative gains — the bridge now runs at parity with (or slightly above) `lite-react/useSelect`, and well above `lite-react/useAtom`. `lite-react/useAtom` more than doubled. `lite-react/useSelect` is effectively at its local optimum for this workload.

### Third autoresearch session — `autoresearch/lite-core-perf` (10 rounds)

Scope expanded to `lite` core + `lite-react` hooks. 10 rounds executed; primary target was `select_large_hz`.

| # | Status | Change | `select_large_hz` | `legend_large_hz` |
|--:|:-------|:-------|------------------:|------------------:|
| 1 | keep | baseline | 113.7 | 82.0 |
| 2 | discard | `notifyListeners`: forEach+preallocated-array snapshot | 107.5 (−5%) | — |
| 3 | discard | `invalidationQueue` Array→Set (O(n) includes→O(1)) | 113.4 (≈0%) | — |
| 4 | discard | inline `notifyEntry` into `doInvalidateSequential` pendingSet path | 114.9 (+1%) | — |
| 5 | **keep** | **sync fast-path for `ctrl.set` when no chain pending** | 115.5 (+1.6%) | 88.8 (+8.4%) |
| 6 | keep | parity sync fast-path for `scheduleUpdate` | 115.8 | 89.3 |
| 7 | discard | maximal inlining in `scheduleSet` fast-path | 114.5 (−1%) | — |
| 8 | **keep** | **`useController`: drop `useMemo` (scope.controller is idempotent)** | 117.3 (+1.3%) | — |
| 9 | **keep** | **hoist `eq ?? Object.is` to const per render in `useSelect`** | 119.7 (+2.1%) | — |
| 10 | discard | cache listener snapshot arrays on `AtomEntry` | 117.1 (−2.2%) | — |

**Cumulative deltas vs baseline** (run 1 → post-round 10):

| Metric | Baseline | After | Δ |
|--------|---------:|------:|---:|
| `select_large_hz` | 113.7 | ~119 | **+4.7%** |
| `useatom_large_hz` | 16.2 | ~18 | **+11%** |
| `legend_large_hz` | 82.0 | ~86 | **+5%** |
| `legend_small_hz` | 291 | ~315 | **+8%** |

Big win: **round 5** eliminated the Promise-microtask on every `ctrl.set` when the invalidation chain is empty — the common case for fine-grained mutations. `lite-legend` benefited most because its bridge pipes every mutation through `ctrl.set`. Rounds 8 and 9 were small but well-targeted lite-react hook cleanups. Rounds 2, 4, 7, 10 showed that once `notifyListeners` is on a hot path, V8 resists inline-transforms — the existing snapshot-spread implementation is hard to beat without restructuring the abstraction.

### Second autoresearch session — `autoresearch/lite-react-perf`

Target flipped to `select_large_hz` (ops/sec for `lite-react/useSelect`). Hypothesis: the current `useSelect` runs its selector inside `useSyncExternalStore.getSnapshot` with a 5-way identity cache, which may be a bigger cost than needed. Four runs (1 baseline, 0 kept, 3 discarded), stopped at the 3-consecutive-discard rule.

| Run | Status | Change | `select_large_hz` | `select_small_hz` |
|---:|:-------|:-------|------------------:|------------------:|
| 1 | keep | baseline | 114.6 | 439.2 |
| 2 | discard | delegate Suspense-resolved path to `scope.select()` handle | 92.4 (−19%) | 361.5 |
| 3 | discard | mutate `selectionCache.current` fields in place to skip allocations | 108.6 (−5%) | 406.3 |
| 4 | discard | trim cache identity checks to `(selector, eq, source)` (3-way) | 103.2 (−10%) | 396.7 |

**Verdict:** `useSelect` is already well-tuned. The 5-way identity cache + once-per-getSnapshot selector pattern is hard to beat with the current architecture. Delegating to core's `scope.select()` handle **doubles** the work (handle's own `ctrl.on('resolved')` listener runs the selector in parallel with the render-path selector call), and shrinking the cache checks has no measurable wins at this scale.

Real opportunities likely lie one layer up — for example, a `useAtomPath(atom, 'some.deep.path')` that skips the selector closure entirely and reads via a compiled path, or an opt-in batch notify that collapses the 100 per-atom listeners into one fan-out walk.

### Known gaps / follow-ups

1. Async error surfacing relies on `ctrl.state === 'failed'` → `onError` in the bridge *plus* first-observing the observable. We document that consumers read `syncState(obs).error` rather than relying on ErrorBoundary re-throw.
2. The `as T` cast in `set({ value })` is the library-boundary exception noted in CLAUDE.md — Legend types the callback value as `T extends Promise<infer t> ? t : T` and we already know the resolved type.
3. Lite's `ctrl.set()` is asynchronously scheduled (`scheduleSet`), so benchmark callers must `await scope.flush()` (or `await act(async () => ...)`) for the update to propagate before the next render. This is expected Lite behavior.
4. GC / release semantics: today `atomObs` caches observables per scope; nothing releases the underlying Lite atom when no observer subscribes anymore. This matches `lite-react`'s current behavior but could leak for short-lived atoms. Fix: count subscribers in the `synced.subscribe` callback and call `ctrl.release()` when the count drops to zero.
5. `lite-legend` is not yet added to `pnpm-workspace.yaml` publishConfig — it's marked `private: true` for the POC.

## Recommendation

Yes, build `@pumped-fn/lite-legend` as a **sibling** to `lite-react`, not a
replacement. The core value:

- Legend's proxy tracking eliminates `useSelect` + snapshot caching → ~200–300
  LOC deleted from the React adapter surface.
- `observer()` + `use$()` give consumers the ergonomic fine-grained reactivity
  story that Lite's `select()` only partially delivered.
- Lite stays focused on lifecycle and DI; rendering concerns move out.

Next step: open `/c3-skill:c3` to craft an ADR covering:
- Exact API for `atomObs` / `useAtomObs` / `useAtom`.
- HMR strategy (how `lite-hmr` atoms survive through Legend observables).
- Async / Suspense contract (`synced.get` initial vs Lite state).
- Deprecation (or retention) path for `useSelect` in the Legend adapter.
- Interop: can both adapters coexist in one app?

## Sources

- [Legend-State v3 — Introduction](https://legendapp.com/open-source/state/v3/intro/introduction/)
- [Legend-State v3 — Observable](https://legendapp.com/open-source/state/v3/usage/observable/)
- [Legend-State v3 — Reactivity](https://legendapp.com/open-source/state/v3/usage/reactivity/)
- [Legend-State v3 — React API](https://legendapp.com/open-source/state/v3/react/react-api/)
- [Legend-State v3 — Persist and Sync](https://legendapp.com/open-source/state/v3/sync/persist-sync/)
- [Legend-State v3 — Migration](https://legendapp.com/open-source/state/v3/other/migrating/)
- [Legend-State CHANGELOG](https://github.com/LegendApp/legend-state/blob/main/CHANGELOG.md)
- [@legendapp/state v3 beta on npm](https://www.npmjs.com/package/@legendapp/state/v/3.0.0-beta.0)
- `packages/lite-react/src/hooks.ts` — reference React binding
- `packages/lite/src/types.ts:179-220` — `Lite.Controller` shape
- `packages/lite/src/scope.ts:138-200` — `SelectHandleImpl` (how `select` works today)

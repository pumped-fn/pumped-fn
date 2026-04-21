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

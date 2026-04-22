# @pumped-fn/lite-react

## 1.2.1

### Patch Changes

- 593e023: Performance optimizations from autoresearch sessions:

  - **lite**: Cache listener snapshots via `WeakMap<Set, snap>` (rebuild only when set size changes), cache controller entry references (`Controller._entryCache`) to skip repeated `scope.cache.get(atom)` lookups on hot paths, and add a sync fast-path for `ctrl.set` / `ctrl.update` that applies mutations synchronously when the invalidation queue is empty.
  - **lite-react**: Drop `useMemo` wrapper around `useController` (idempotent), add Suspense fast-path in `useAtom` for resolved atoms that bypasses `useSyncExternalStore`, and hoist `eq ?? Object.is` per render.

- d2fb81f: Tighten lite controller and dependency contracts, restore extension-safe scope initialization, and align the lite-react branch changes with the verified React test runtime.

## 1.2.0

### Minor Changes

- 10ec5a7: **@pumped-fn/lite-react** — Harden for modern React (RSC, Compiler, useSelect non-suspense)

  - Add `'use client'` directive for RSC/Next.js App Router compatibility
  - `useController({ resolve: true })` retries once on failed atoms before throwing to ErrorBoundary
  - `useSelect` gains `{ suspense: false }` mode returning `UseSelectState<S>` with data/loading/error
  - Selector errors in non-suspense `useSelect` now surface in the `error` field
  - React Compiler-safe: selector/eq via plain closures, useRef caches in getSnapshot only
  - `UseSelectOptions<S>` split into discriminated union for sound overload resolution
  - New exports: `UseSelectSuspenseOptions`, `UseSelectManualOptions`, `UseSelectOptions`, `UseSelectState`

  **@pumped-fn/lite** — `release()` now notifies listeners before cache deletion (fixes hanging promises)

### Patch Changes

- **@pumped-fn/lite** — Expand CLI corpus for LLM comprehension

  - New `mental-model` category: atom/flow/resource lifetimes, scope vs context, key invariant
  - New `tanstack-start` category: singleton scope, per-request execContext middleware, tag-seeding, client hydration
  - `primitives`: add `resource()`, clarify ResolveContext vs ExecutionContext factory types
  - `context`: split two context types with full API surfaces
  - `reactivity`: disambiguate `controller()` dep marker vs `scope.controller()`, document `watch:true`
  - `tags`: add 6-level resolution hierarchy (exec > flow > context > data > scope > default)

  **@pumped-fn/lite-react** — Test consolidation and coverage improvements

  - 50 → 37 tests (-26%) with coverage increase: 90.5% → 97.3% stmt, 81.6% → 94.3% branch
  - Add useSelect non-suspense coverage tests (auto-resolve, failed, refresh error)
  - Import from barrel file, exclude uninstrumentable index.ts from coverage config

  **@pumped-fn/lite-hmr** — Widen vite peer dependency to `^5 || ^6 || ^7 || ^8`

  **All packages** — Upgrade vitest 4.0.18 → 4.1.0, pin vite 6.x in catalog

## 1.1.1

### Patch Changes

- 8ed17e7: - Fix watch and invalidation edge cases in `@pumped-fn/lite` by aligning `select()` with `Object.is`, snapshotting select listeners during notification, making watch option typing match the runtime contract, and surfacing invalidation-chain failures from `flush()` instead of leaking them as background rejections.
  - Fix `@pumped-fn/lite-react` hook refresh behavior by keeping stale values visible during re-resolution, recomputing `useSelect` snapshots when selector or equality semantics change, tracking pending promises per controller, and suppressing non-Suspense `unhandledRejection` leaks on failed refreshes.

## 1.1.0

### Minor Changes

- 1624845: feat(lite-react): add non-Suspense mode and resolve options for useAtom/useController

  - Add `{ suspense: false }` option to `useAtom` returning `UseAtomState<T>` with `data`, `loading`, `error`, `controller`
  - Add `{ resolve: boolean }` option to control auto-resolution behavior
    - Suspense mode: `resolve` defaults to `true` (auto-resolves idle atoms)
    - Non-Suspense mode: `resolve` defaults to `false` (no auto-resolve)
  - Add `{ resolve: true }` option to `useController` for Suspense integration
  - Export new types: `UseAtomSuspenseOptions`, `UseAtomManualOptions`, `UseAtomOptions`, `UseAtomState`, `UseControllerOptions`

## 1.0.0

### Major Changes

- 236aa4a: Rename packages to follow `lite-` prefix convention

  **Breaking Change:** Package names have been renamed:

  - `@pumped-fn/devtools` → `@pumped-fn/lite-devtools`
  - `@pumped-fn/react-lite` → `@pumped-fn/lite-react`
  - `@pumped-fn/vite-hmr` → `@pumped-fn/lite-hmr`

  This establishes a consistent naming convention where all packages in the lite ecosystem use the `lite-` prefix.

  **Migration:**

  ```bash
  # Update your dependencies
  pnpm remove @pumped-fn/devtools @pumped-fn/react-lite @pumped-fn/vite-hmr
  pnpm add @pumped-fn/lite-devtools @pumped-fn/lite-react @pumped-fn/lite-hmr
  ```

  ```typescript
  // Update imports
  - import { createDevtools } from '@pumped-fn/devtools'
  + import { createDevtools } from '@pumped-fn/lite-devtools'

  - import { ScopeProvider, useAtom } from '@pumped-fn/react-lite'
  + import { ScopeProvider, useAtom } from '@pumped-fn/lite-react'

  - import { pumpedHmr } from '@pumped-fn/vite-hmr'
  + import { pumpedHmr } from '@pumped-fn/lite-hmr'
  ```

## 0.3.0

### Minor Changes

- a0362d7: ### Features

  - Re-export `createScope`, `atom`, `flow`, `preset` from `@pumped-fn/lite` for convenience
  - Update React peer dependency to support both React 18 and React 19 (`^18.0.0 || ^19.0.0`)

  ### Bug Fixes

  - **Critical**: Fix Suspense infinite loop by caching pending promises (React expects same promise during re-renders)
  - Auto-resolve idle atoms lazily instead of throwing error (more ergonomic)
  - Subscribe only to `resolved` events instead of `*` to avoid unnecessary re-renders

## 0.2.0

### Minor Changes

- 1587c37: feat(lite-react): initial release of React integration for @pumped-fn/lite

  Adds minimal React bindings with Suspense and ErrorBoundary integration:

  - ScopeProvider and ScopeContext for scope provisioning
  - useScope hook for accessing scope from context
  - useController hook for obtaining memoized controllers
  - useAtom hook with full Suspense/ErrorBoundary integration
  - useSelect hook for fine-grained reactivity with custom equality

  SSR-compatible, zero-tolerance for `any` types, comprehensive TSDoc.

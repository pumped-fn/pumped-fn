---
"@pumped-fn/lite": patch
"@pumped-fn/lite-react": patch
---

Performance optimizations from autoresearch sessions:

- **lite**: Cache listener snapshots via `WeakMap<Set, snap>` (rebuild only when set size changes), cache controller entry references (`Controller._entryCache`) to skip repeated `scope.cache.get(atom)` lookups on hot paths, and add a sync fast-path for `ctrl.set` / `ctrl.update` that applies mutations synchronously when the invalidation queue is empty.
- **lite-react**: Drop `useMemo` wrapper around `useController` (idempotent), add Suspense fast-path in `useAtom` for resolved atoms that bypasses `useSyncExternalStore`, and hoist `eq ?? Object.is` per render.

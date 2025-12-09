# @pumped-fn/lite-react

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

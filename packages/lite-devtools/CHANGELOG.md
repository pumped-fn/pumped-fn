# @pumped-fn/lite-devtools

## 2.0.0

### Major Changes

- e87f8c9: feat(lite): add `resource()` execution-scoped dependency primitive

  BREAKING CHANGE: `wrapResolve` extension hook signature changed from `(next, atom, scope)` to `(next, event: ResolveEvent)` where `ResolveEvent` is a discriminated union (`{ kind: "atom" }` or `{ kind: "resource" }`).

  New `resource({ deps, factory })` primitive for execution-level dependencies (logger, transaction, trace span). Resources are resolved fresh per execution chain, shared via seek-up within nested execs, and cleaned up with `ctx.onClose()`.

  Migration: update `wrapResolve(next, atom, scope)` → `wrapResolve(next, event)`, dispatch on `event.kind`.

## 1.1.0

### Minor Changes

- 2d6dae1: Add HTTP transport and standalone devtools server

  - Add `httpTransport()` to `@pumped-fn/lite-devtools` for cross-process event streaming
  - Create new `@pumped-fn/lite-devtools-server` package with TUI dashboard

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

## 0.1.2

### Patch Changes

- 54db29b: fix: correct package exports for TypeScript type resolution

  - Add `types` conditions to exports map for ESM and CJS
  - Correct file extensions from `.js`/`.d.ts` to `.mjs`/`.d.mts` and `.cjs`/`.d.cts`

## 0.1.1

### Patch Changes

- Fix package exports configuration for proper TypeScript type resolution
  - Add `types` conditions to exports map for ESM and CJS
  - Correct file extensions from `.js`/`.d.ts` to `.mjs`/`.d.mts` and `.cjs`/`.d.cts`

## 0.1.0

### Minor Changes

- 5a7fd67: Add @pumped-fn/lite-devtools package - observability extension for @pumped-fn/lite with fire-and-forget transport-based event streaming

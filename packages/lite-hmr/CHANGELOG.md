# @pumped-fn/lite-hmr

## 1.0.1

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

## 0.1.0

### Minor Changes

- 954d9d9: Add @pumped-fn/lite-hmr package for HMR compatibility

  - Vite plugin that preserves atom state across hot module reloads
  - Build-time AST transform wraps atom declarations with registry helper
  - Runtime stores atom refs in import.meta.hot.data for reference stability
  - Automatically disabled in production builds

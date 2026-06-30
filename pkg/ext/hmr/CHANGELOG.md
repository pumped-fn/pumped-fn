# @pumped-fn/lite-hmr

## 1.0.1

### Patch Changes

- b366df0: Add tag-first agent workflow helpers and tighten context tag handling across lite primitives.

  Move serializability policy out of lite core, remove the experimental primitive `use` surface, make `workflowRun()` a composable workflow tag, expose workflow and agent runtime contracts as required tags, and split workflow replay/logging from agent remote routing.

  Preserve exec extension async error semantics, make the lite CLI bin install-safe before build, and suppress the lite-hmr CJS import.meta build warning.

  Upgrade the repo build/test toolchain for the Vite 8 ecosystem, remove the stale docs site generation path, and refresh affected package build metadata.

  Remove the unmaintained `@pumped-fn/lite-devtools-server` package.

  Breaking extension note: `wrapExec` now wraps dependency resolution as well as factories so extensions can install tags before deps resolve. `ResolveEvent` now carries atom resolve context and resource context shapes explicitly.

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

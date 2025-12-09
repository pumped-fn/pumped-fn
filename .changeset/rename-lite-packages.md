---
"@pumped-fn/lite-devtools": major
"@pumped-fn/lite-react": major
"@pumped-fn/lite-hmr": major
---

Rename packages to follow `lite-` prefix convention

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

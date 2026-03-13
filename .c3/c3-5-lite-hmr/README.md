---
id: c3-5
c3-version: 4
title: Lite HMR Plugin (@pumped-fn/lite-hmr)
type: container
boundary: library
parent: c3-0
goal: Preserve lite atom identity and state continuity across Vite hot module reloads.
summary: >
  Build-time Vite plugin preserving atom state across hot module reloads.
---

# Lite HMR Plugin (@pumped-fn/lite-hmr)

## Goal

Keep lite applications from losing atom identity and scope state when Vite replaces modules during development.

## Overview {#c3-5-overview}

Vite plugin that transforms atom declarations at build time to preserve state across HMR reloads. No changes required to @pumped-fn/lite.

**Problem:** Scope caches atoms by object reference. HMR reloads create new references, causing cache misses.

**Solution:** Transform `atom({...})` → `__hmr_register(key, atom({...}))` to return cached references.

## Responsibilities

- Rewrite module output so hot-reloaded atoms keep stable identity
- Cooperate with lite runtime expectations without changing userland atom APIs
- Scope the solution to development-time HMR behavior

## Components

| ID | Name | Category | Status | Goal Contribution |
|----|------|----------|--------|-------------------|
| c3-501 | Vite Plugin | foundation | active | Filters source files and applies the build-time atom rewrite during development. |
| c3-502 | HMR Runtime | foundation | active | Preserves atom identity through `import.meta.hot` storage so scopes keep their cached state. |

## Architecture {#c3-5-architecture}

```
┌─────────────────────────────────────────────────────────────┐
│                      Build Time                              │
│  ┌─────────────────┐    ┌────────────────────────────────┐  │
│  │   Vite Plugin   │───▶│  AST Transform (dev only)      │  │
│  └─────────────────┘    │  - Detect atom() declarations  │  │
│                         │  - Inject __hmr_register()      │  │
│                         └────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Runtime                                │
│  ┌─────────────────┐    ┌────────────────────────────────┐  │
│  │ __hmr_register  │───▶│  import.meta.hot.data registry │  │
│  └─────────────────┘    │  - Returns cached atom ref     │  │
│                         │  - Scope cache naturally works │  │
│                         └────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## API {#c3-5-api}

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { pumpedHmr } from '@pumped-fn/lite-hmr'

export default defineConfig({
  plugins: [pumpedHmr()]
})
```

**Options:**
| Option | Default | Description |
|--------|---------|-------------|
| `include` | `/\.[jt]sx?$/` | Files to transform |
| `exclude` | `/node_modules/` | Files to skip |

## Transform Rules {#c3-5-transforms}

| Pattern | Transforms |
|---------|------------|
| `const foo = atom({...})` | ✅ Yes |
| `let foo = atom({...})` | ✅ Yes |
| `export const foo = atom({...})` | ✅ Yes |
| `atoms.push(atom({...}))` | ❌ No (dynamic) |
| `factory(() => atom({...}))` | ❌ No (nested) |

## Production Safety {#c3-5-production}

- Transform skipped when `NODE_ENV=production`
- Runtime returns atom as-is when `import.meta.hot` undefined
- Zero overhead in production builds

## Source Organization {#c3-5-source}

```
packages/lite-hmr/
├── src/
│   ├── index.ts      # Plugin export
│   ├── plugin.ts     # Vite plugin implementation
│   ├── runtime.ts    # __hmr_register() helper
│   ├── transform.ts  # AST transform logic
│   └── types.ts      # PumpedHmrOptions
├── tests/
├── package.json
└── tsdown.config.ts
```

## Related {#c3-5-related}

- [c3-2 Scope](../c3-2-lite/c3-201-scope.md) - Cache behavior
- [Design Doc](../../plans/2025-12-08-hmr-compatibility-design.md)

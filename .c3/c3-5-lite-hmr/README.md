---
id: c3-5
c3-version: 3
title: Lite HMR Plugin (@pumped-fn/lite-hmr)
summary: >
  Build-time Vite plugin preserving atom state across hot module reloads.
---

# Lite HMR Plugin (@pumped-fn/lite-hmr)

## Overview {#c3-5-overview}

Vite plugin that transforms atom declarations at build time to preserve state across HMR reloads. No changes required to @pumped-fn/lite.

**Problem:** Scope caches atoms by object reference. HMR reloads create new references, causing cache misses.

**Solution:** Transform `atom({...})` → `__hmr_register(key, atom({...}))` to return cached references.

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

## Related {#c3-5-related}

- [c3-2 Scope](../c3-2-lite/c3-201-scope.md) - Cache behavior
- [Design Doc](../../plans/2025-12-08-hmr-compatibility-design.md)

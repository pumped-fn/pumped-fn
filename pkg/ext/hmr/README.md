# @pumped-fn/lite-hmr

Vite HMR plugin for `@pumped-fn/lite` that preserves atom state across hot module reloads.

**Dev only** · **Production transform returns `null`** · **Vite plugin**

## How It Works

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant Vite
    participant Plugin as pumpedHmr()
    participant HMR as import.meta.hot.data
    participant Scope

    Note over Vite,Plugin: Build Time Transform

    Dev->>Vite: Save file with atom()
    Vite->>Plugin: transform(code)
    Plugin->>Plugin: AST detect: const foo = atom({...})
    Plugin-->>Vite: const foo = __hmr_register('key', atom({...}))

    Note over HMR,Scope: Runtime (HMR Reload)

    Vite->>HMR: Module reload
    HMR->>HMR: Check registry for 'key'
    alt First load
        HMR->>HMR: Store new atom reference
        HMR-->>Scope: New atom
    else Reload
        HMR-->>Scope: Cached atom (same reference)
    end

    Note over Scope: Cache hit - state preserved!
```

## Usage

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { pumpedHmr } from '@pumped-fn/lite-hmr'

export default defineConfig({
  plugins: [
    pumpedHmr(),  // Add before other plugins
    react()
  ]
})
```

## Transform Example

The plugin transforms named atom declarations at build time:

```typescript
// Your code
const configAtom = atom({ factory: () => loadConfig() })

// Transformed (dev only)
const configAtom = __hmr_register('src/atoms.ts:1:18', atom({ factory: () => loadConfig() }))
```

The `__hmr_register` helper stores atom references in `import.meta.hot.data`. On HMR reload, it returns the cached reference, preserving Scope cache hits.

## What Gets Transformed

| Pattern | Transformed |
|---------|-------------|
| `const foo = atom({...})` | Yes |
| `let foo = atom({...})` | Yes |
| `export const foo = atom({...})` | Yes |
| `atoms.push(atom({...}))` | No (dynamic) |
| `createAtom(() => atom({...}))` | No (nested) |

## Options

```typescript
pumpedHmr({
  include: /\.[jt]sx?$/,  // Files to transform (default)
  exclude: /node_modules/ // Files to skip (default)
})
```

## Production

When `NODE_ENV=production`, the plugin transform returns `null` and does not inject the HMR helper.

## License

MIT

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).

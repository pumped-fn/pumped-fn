# HMR Compatibility Design for @pumped-fn/lite

**Date:** 2025-12-08
**Status:** Approved with Fixes

## Problem Statement

The `@pumped-fn/lite` Scope caches atoms by object reference (`scope.ts:165`):

```typescript
private cache = new Map<Lite.Atom<unknown>, AtomEntry<unknown>>()
```

When Vite HMR reloads a module, `atom({...})` creates new object references, causing cache misses and losing resolved state.

## Solution Overview

A **build-time Vite plugin** that transforms atom declarations to preserve references across HMR reloads.

### Architecture

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

### Packages

| Package | Purpose |
|---------|---------|
| `@pumped-fn/lite` | **NO CHANGES** - stays zero-dependency |
| `@pumped-fn/vite-hmr` | Vite plugin + runtime helper |

## Detailed Design

### 1. Vite Plugin Transform

**File:** `packages/vite-hmr/src/plugin.ts`

```typescript
import type { Plugin } from 'vite'
import MagicString from 'magic-string'
import { parse } from 'acorn'
import { walk } from 'estree-walker'

export function pumpedHmr(): Plugin {
  return {
    name: 'pumped-fn-hmr',
    enforce: 'pre',

    transform(code, id) {
      // CRITICAL: Skip in production
      if (process.env.NODE_ENV === 'production') {
        return null
      }

      // Skip non-JS/TS files
      if (!/\.[jt]sx?$/.test(id)) return null

      // Skip node_modules
      if (id.includes('node_modules')) return null

      // Quick check before parsing
      if (!code.includes('atom(')) return null

      return transformAtoms(code, id)
    }
  }
}
```

### 2. Transform Logic

**Key Format:** `filePath:line:column` (collision-resistant)

```typescript
function transformAtoms(code: string, filePath: string) {
  const ast = parse(code, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    locations: true
  })

  const s = new MagicString(code)
  let needsImport = false

  walk(ast, {
    enter(node, parent) {
      // Match: const/let foo = atom({...})
      if (
        node.type === 'VariableDeclarator' &&
        node.init?.type === 'CallExpression' &&
        node.init.callee.type === 'Identifier' &&
        node.init.callee.name === 'atom' &&
        node.id.type === 'Identifier'
      ) {
        const { line, column } = node.init.loc.start
        const key = `${filePath}:${line}:${column}`

        needsImport = true

        // Wrap: atom({...}) → __hmr_register('key', atom({...}))
        s.prependLeft(node.init.start, `__hmr_register('${key}', `)
        s.appendRight(node.init.end, ')')
      }
    }
  })

  if (!needsImport) return null

  // Inject import (no dispose needed - registry intentionally persists)
  s.prepend(`import { __hmr_register } from '@pumped-fn/vite-hmr/runtime';\n`)

  return {
    code: s.toString(),
    map: s.generateMap({ hires: true })
  }
}
```

### 3. Runtime Helper

**File:** `packages/vite-hmr/src/runtime.ts`

```typescript
import type { Lite } from '@pumped-fn/lite'

type AtomRegistry = Map<string, Lite.Atom<unknown>>

function getRegistry(): AtomRegistry | null {
  if (!import.meta.hot) {
    return null
  }

  if (!import.meta.hot.data.atomRegistry) {
    import.meta.hot.data.atomRegistry = new Map<string, Lite.Atom<unknown>>()
  }

  return import.meta.hot.data.atomRegistry
}

export function __hmr_register<T>(
  key: string,
  atom: Lite.Atom<T>
): Lite.Atom<T> {
  const registry = getRegistry()

  // Production or non-HMR: return atom as-is
  if (!registry) {
    return atom
  }

  // Return cached reference if exists (preserves Scope cache hit)
  if (registry.has(key)) {
    return registry.get(key) as Lite.Atom<T>
  }

  // First time: store and return
  registry.set(key, atom)
  return atom
}
```

**Memory considerations:**
- Registry intentionally persists across HMR reloads (that's the point!)
- Deleted atoms remain in registry (minor memory leak in dev only)
- Full page reload clears everything
- Acceptable trade-off for reliable HMR

### 4. Transform Rules

| Pattern | Transforms | Key Example |
|---------|------------|-------------|
| `const foo = atom({...})` | ✅ Yes | `src/atoms.ts:12:14` |
| `let foo = atom({...})` | ✅ Yes | `src/atoms.ts:15:8` |
| `export const foo = atom({...})` | ✅ Yes | `src/atoms.ts:18:21` |
| `atoms.push(atom({...}))` | ❌ No | Can't derive stable position |
| `factory(() => atom({...}))` | ❌ No | Dynamic, unstable |

### 5. HMR Lifecycle Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Initial Load                                                 │
├─────────────────────────────────────────────────────────────┤
│ 1. Plugin transforms: atom({...}) → __hmr_register(key, atom({...})) │
│ 2. __hmr_register stores atom in registry (import.meta.hot.data)     │
│ 3. scope.resolve(configAtom) caches by atom reference       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ HMR Reload                                                   │
├─────────────────────────────────────────────────────────────┤
│ 1. Module re-executes with new atom({...}) calls            │
│ 2. __hmr_register finds cached ref → returns ORIGINAL ref   │
│ 3. configAtom === originalConfigAtom (same object!)         │
│ 4. scope.resolve(configAtom) → cache hit → state preserved  │
└─────────────────────────────────────────────────────────────┘
```

**Key insight:** The registry never clears during a dev session. This is intentional - we WANT old atom references to persist so new code reuses them.

## Edge Cases

### Multiple Scopes

```typescript
const scope1 = createScope()
const scope2 = createScope()

// Both scopes use the SAME atom reference (from registry)
// But each scope has its own resolution cache
// This is CORRECT behavior - atom identity is global, resolution is per-scope
```

### Dynamic Atoms (Documented Limitation)

```typescript
// ❌ Will lose state on HMR (cannot transform)
const atoms = [atom({ factory: () => 'a' })]

// ✅ Will preserve state on HMR
export const atomA = atom({ factory: () => 'a' })
const atoms = [atomA]
```

### React Fast Refresh

Works correctly because:
1. HMR returns stable atom reference
2. React hooks using `useSyncExternalStore` see same reference
3. Component state preserved by React Fast Refresh
4. Atom state preserved by stable reference

## Production Safety

1. **Transform skipped:** `NODE_ENV === 'production'` check in plugin
2. **Runtime no-op:** `import.meta.hot` check returns atom immediately
3. **Bundle verification:** CI test ensures `__hmr_register` not in production build

## Package Structure

```
packages/vite-hmr/
├── src/
│   ├── index.ts          # Plugin export
│   ├── plugin.ts         # Vite plugin
│   ├── transform.ts      # AST transformation
│   └── runtime.ts        # __hmr_register, __hmr_dispose
├── package.json
├── tsconfig.json
└── tsdown.config.ts
```

## Usage

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { pumpedHmr } from '@pumped-fn/vite-hmr'

export default defineConfig({
  plugins: [
    pumpedHmr(),  // Add before react plugin
    react()
  ]
})
```

## Testing Requirements

1. **Basic HMR preservation** - atom state survives module reload
2. **Multiple scope isolation** - scopes maintain independent resolution
3. **Production build** - verify `__hmr_register` not in bundle
4. **React Fast Refresh** - component + atom state preserved
5. **Transform accuracy** - only named declarations transformed

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Key format? | `filePath:line:column` (collision-resistant) |
| Production safety? | Skip transform + runtime no-op |
| Memory leaks? | Accepted trade-off for dev only; full reload clears |
| Multi-scope? | Atom identity shared, resolution separate |

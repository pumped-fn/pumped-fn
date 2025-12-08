# Vite HMR Plugin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create `@pumped-fn/vite-hmr` package that preserves atom state across Vite HMR reloads via build-time AST transformation.

**Architecture:** Vite plugin transforms `const foo = atom({...})` declarations to wrap with `__hmr_register(key, atom({...}))`. The runtime helper stores atom references in `import.meta.hot.data`, returning cached references on HMR reload to preserve Scope cache hits.

**Tech Stack:** Vite plugin API, acorn (AST parsing), estree-walker (AST traversal), magic-string (source transformation), TypeScript, Vitest

---

## Task 1: Initialize Package Structure

**Files:**
- Create: `packages/vite-hmr/package.json`
- Create: `packages/vite-hmr/tsconfig.json`
- Create: `packages/vite-hmr/tsdown.config.ts`
- Create: `packages/vite-hmr/src/index.ts`

**Step 1: Create package.json**

```json
{
  "name": "@pumped-fn/vite-hmr",
  "version": "0.0.1",
  "description": "Vite HMR plugin for @pumped-fn/lite atoms",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    },
    "./runtime": {
      "import": "./dist/runtime.js",
      "require": "./dist/runtime.cjs",
      "types": "./dist/runtime.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "peerDependencies": {
    "vite": "^5.0.0 || ^6.0.0"
  },
  "dependencies": {
    "acorn": "^8.14.0",
    "estree-walker": "^3.0.3",
    "magic-string": "^0.30.17"
  },
  "devDependencies": {
    "@pumped-fn/lite": "workspace:*",
    "vite": "^6.0.0",
    "vitest": "^3.0.0",
    "typescript": "^5.9.0"
  },
  "keywords": ["vite", "hmr", "pumped-fn", "dependency-injection"],
  "license": "MIT"
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 3: Create tsdown.config.ts**

```typescript
import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts", "src/runtime.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  splitting: false,
})
```

**Step 4: Create placeholder src/index.ts**

```typescript
export { pumpedHmr } from "./plugin"
export type { PumpedHmrOptions } from "./plugin"
```

**Step 5: Install dependencies**

Run: `pnpm install`
Expected: Dependencies installed, lockfile updated

**Step 6: Commit**

```bash
git add packages/vite-hmr/
git commit -m "feat(vite-hmr): initialize package structure"
```

---

## Task 2: Implement Runtime Helper

**Files:**
- Create: `packages/vite-hmr/src/runtime.ts`
- Create: `packages/vite-hmr/src/types.ts`
- Create: `packages/vite-hmr/tests/runtime.test.ts`

**Step 1: Create types.ts**

```typescript
import type { Lite } from "@pumped-fn/lite"

export type AtomRegistry = Map<string, Lite.Atom<unknown>>

export interface HotModule {
  data: {
    atomRegistry?: AtomRegistry
  }
  accept(): void
  dispose(cb: () => void): void
}

declare global {
  interface ImportMeta {
    hot?: HotModule
  }
}
```

**Step 2: Write failing test for __hmr_register**

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest"
import { atom } from "@pumped-fn/lite"

describe("__hmr_register", () => {
  beforeEach(() => {
    vi.stubGlobal("import", { meta: { hot: undefined } })
  })

  it("returns atom as-is when import.meta.hot is undefined", async () => {
    const { __hmr_register } = await import("../src/runtime")
    const testAtom = atom({ factory: () => "value" })

    const result = __hmr_register("key", testAtom)

    expect(result).toBe(testAtom)
  })

  it("caches and returns same reference on second call", async () => {
    const mockHot = {
      data: {},
      accept: vi.fn(),
      dispose: vi.fn(),
    }
    vi.stubGlobal("import", { meta: { hot: mockHot } })

    const { __hmr_register } = await import("../src/runtime")
    const atom1 = atom({ factory: () => "first" })
    const atom2 = atom({ factory: () => "second" })

    const result1 = __hmr_register("same-key", atom1)
    const result2 = __hmr_register("same-key", atom2)

    expect(result1).toBe(atom1)
    expect(result2).toBe(atom1)
    expect(result2).not.toBe(atom2)
  })

  it("uses different entries for different keys", async () => {
    const mockHot = {
      data: {},
      accept: vi.fn(),
      dispose: vi.fn(),
    }
    vi.stubGlobal("import", { meta: { hot: mockHot } })

    const { __hmr_register } = await import("../src/runtime")
    const atom1 = atom({ factory: () => "first" })
    const atom2 = atom({ factory: () => "second" })

    const result1 = __hmr_register("key-1", atom1)
    const result2 = __hmr_register("key-2", atom2)

    expect(result1).toBe(atom1)
    expect(result2).toBe(atom2)
  })
})
```

**Step 3: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/vite-hmr test`
Expected: FAIL - module not found

**Step 4: Implement runtime.ts**

```typescript
import type { Lite } from "@pumped-fn/lite"
import type { AtomRegistry } from "./types"

function getRegistry(): AtomRegistry | null {
  if (typeof import.meta.hot === "undefined" || !import.meta.hot) {
    return null
  }

  if (!import.meta.hot.data.atomRegistry) {
    import.meta.hot.data.atomRegistry = new Map<string, Lite.Atom<unknown>>()
  }

  return import.meta.hot.data.atomRegistry
}

/**
 * Registers an atom for HMR persistence.
 * Returns cached reference if key exists, otherwise stores and returns the atom.
 * In production (no import.meta.hot), returns atom unchanged.
 */
export function __hmr_register<T>(
  key: string,
  atom: Lite.Atom<T>
): Lite.Atom<T> {
  const registry = getRegistry()

  if (!registry) {
    return atom
  }

  if (registry.has(key)) {
    return registry.get(key) as Lite.Atom<T>
  }

  registry.set(key, atom)
  return atom
}
```

**Step 5: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/vite-hmr test`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/vite-hmr/src/runtime.ts packages/vite-hmr/src/types.ts packages/vite-hmr/tests/
git commit -m "feat(vite-hmr): implement __hmr_register runtime helper"
```

---

## Task 3: Implement AST Transform

**Files:**
- Create: `packages/vite-hmr/src/transform.ts`
- Create: `packages/vite-hmr/tests/transform.test.ts`

**Step 1: Write failing test for transform**

```typescript
import { describe, it, expect } from "vitest"
import { transformAtoms } from "../src/transform"

describe("transformAtoms", () => {
  it("transforms const atom declaration", () => {
    const code = `import { atom } from '@pumped-fn/lite'
const configAtom = atom({ factory: () => ({}) })`
    const filePath = "src/atoms.ts"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.code).toContain("import { __hmr_register }")
    expect(result!.code).toContain("__hmr_register('src/atoms.ts:")
    expect(result!.code).toContain(", atom({ factory:")
  })

  it("transforms export const atom declaration", () => {
    const code = `import { atom } from '@pumped-fn/lite'
export const dbAtom = atom({ factory: async () => createDb() })`
    const filePath = "src/db.ts"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.code).toContain("__hmr_register('src/db.ts:")
  })

  it("transforms let atom declaration", () => {
    const code = `import { atom } from '@pumped-fn/lite'
let mutableAtom = atom({ factory: () => 0 })`
    const filePath = "src/state.ts"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.code).toContain("__hmr_register('src/state.ts:")
  })

  it("does NOT transform dynamic atom creation", () => {
    const code = `import { atom } from '@pumped-fn/lite'
const atoms = [atom({ factory: () => 1 })]`
    const filePath = "src/dynamic.ts"

    const result = transformAtoms(code, filePath)

    expect(result).toBeNull()
  })

  it("does NOT transform atom in function call", () => {
    const code = `import { atom } from '@pumped-fn/lite'
registerAtom(atom({ factory: () => 1 }))`
    const filePath = "src/register.ts"

    const result = transformAtoms(code, filePath)

    expect(result).toBeNull()
  })

  it("returns null when no atom() calls present", () => {
    const code = `const x = 1`
    const filePath = "src/noatom.ts"

    const result = transformAtoms(code, filePath)

    expect(result).toBeNull()
  })

  it("uses line:column for unique keys", () => {
    const code = `import { atom } from '@pumped-fn/lite'
const a = atom({ factory: () => 1 })
const b = atom({ factory: () => 2 })`
    const filePath = "src/multi.ts"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.code).toMatch(/__hmr_register\('src\/multi\.ts:2:\d+'/)
    expect(result!.code).toMatch(/__hmr_register\('src\/multi\.ts:3:\d+'/)
  })

  it("generates sourcemap", () => {
    const code = `import { atom } from '@pumped-fn/lite'
const configAtom = atom({ factory: () => ({}) })`
    const filePath = "src/atoms.ts"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.map).toBeDefined()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/vite-hmr test`
Expected: FAIL - module not found

**Step 3: Implement transform.ts**

```typescript
import { parse } from "acorn"
import { walk } from "estree-walker"
import MagicString from "magic-string"
import type { Node } from "estree"

interface TransformResult {
  code: string
  map: ReturnType<MagicString["generateMap"]>
}

export function transformAtoms(
  code: string,
  filePath: string
): TransformResult | null {
  let ast: Node

  try {
    ast = parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
    }) as Node
  } catch {
    return null
  }

  const s = new MagicString(code)
  let needsImport = false

  walk(ast, {
    enter(node: Node, parent: Node | null) {
      if (
        node.type === "VariableDeclarator" &&
        node.init &&
        node.init.type === "CallExpression" &&
        node.init.callee.type === "Identifier" &&
        node.init.callee.name === "atom" &&
        node.id.type === "Identifier" &&
        parent?.type === "VariableDeclaration"
      ) {
        const initNode = node.init as Node & {
          start: number
          end: number
          loc: { start: { line: number; column: number } }
        }

        const { line, column } = initNode.loc.start
        const key = `${filePath}:${line}:${column}`

        needsImport = true

        s.prependLeft(initNode.start, `__hmr_register('${key}', `)
        s.appendRight(initNode.end, ")")
      }
    },
  })

  if (!needsImport) {
    return null
  }

  s.prepend(`import { __hmr_register } from '@pumped-fn/vite-hmr/runtime';\n`)

  return {
    code: s.toString(),
    map: s.generateMap({ hires: true }),
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/vite-hmr test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/vite-hmr/src/transform.ts packages/vite-hmr/tests/transform.test.ts
git commit -m "feat(vite-hmr): implement AST transform for atom declarations"
```

---

## Task 4: Implement Vite Plugin

**Files:**
- Create: `packages/vite-hmr/src/plugin.ts`
- Create: `packages/vite-hmr/tests/plugin.test.ts`

**Step 1: Write failing test for plugin**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { pumpedHmr } from "../src/plugin"

describe("pumpedHmr plugin", () => {
  const originalEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
  })

  it("has correct plugin name", () => {
    const plugin = pumpedHmr()
    expect(plugin.name).toBe("pumped-fn-hmr")
  })

  it("enforces pre transform order", () => {
    const plugin = pumpedHmr()
    expect(plugin.enforce).toBe("pre")
  })

  it("skips transform in production", () => {
    process.env.NODE_ENV = "production"
    const plugin = pumpedHmr()
    const transform = plugin.transform as Function

    const result = transform(
      `const x = atom({ factory: () => 1 })`,
      "src/atoms.ts"
    )

    expect(result).toBeNull()
  })

  it("skips non-JS/TS files", () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const transform = plugin.transform as Function

    expect(transform("const x = 1", "src/styles.css")).toBeNull()
    expect(transform("const x = 1", "src/data.json")).toBeNull()
  })

  it("skips node_modules", () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const transform = plugin.transform as Function

    const result = transform(
      `const x = atom({ factory: () => 1 })`,
      "node_modules/@pumped-fn/lite/index.js"
    )

    expect(result).toBeNull()
  })

  it("skips files without atom() calls", () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const transform = plugin.transform as Function

    const result = transform(`const x = 1`, "src/utils.ts")

    expect(result).toBeNull()
  })

  it("transforms files with atom() calls", () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const transform = plugin.transform as Function

    const result = transform(
      `import { atom } from '@pumped-fn/lite'
const configAtom = atom({ factory: () => ({}) })`,
      "src/atoms.ts"
    )

    expect(result).not.toBeNull()
    expect(result.code).toContain("__hmr_register")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/vite-hmr test`
Expected: FAIL - module not found

**Step 3: Implement plugin.ts**

```typescript
import type { Plugin } from "vite"
import { transformAtoms } from "./transform"

export interface PumpedHmrOptions {
  include?: RegExp
  exclude?: RegExp
}

export function pumpedHmr(options: PumpedHmrOptions = {}): Plugin {
  const {
    include = /\.[jt]sx?$/,
    exclude = /node_modules/,
  } = options

  return {
    name: "pumped-fn-hmr",
    enforce: "pre",

    transform(code, id) {
      if (process.env.NODE_ENV === "production") {
        return null
      }

      if (!include.test(id)) {
        return null
      }

      if (exclude.test(id)) {
        return null
      }

      if (!code.includes("atom(")) {
        return null
      }

      return transformAtoms(code, id)
    },
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/vite-hmr test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/vite-hmr/src/plugin.ts packages/vite-hmr/tests/plugin.test.ts
git commit -m "feat(vite-hmr): implement Vite plugin"
```

---

## Task 5: Complete Package Exports

**Files:**
- Modify: `packages/vite-hmr/src/index.ts`
- Create: `packages/vite-hmr/vitest.config.ts`

**Step 1: Update src/index.ts**

```typescript
export { pumpedHmr } from "./plugin"
export type { PumpedHmrOptions } from "./plugin"
```

**Step 2: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
})
```

**Step 3: Build and typecheck**

Run: `pnpm -F @pumped-fn/vite-hmr build && pnpm -F @pumped-fn/vite-hmr typecheck`
Expected: Build succeeds, no type errors

**Step 4: Run all tests**

Run: `pnpm -F @pumped-fn/vite-hmr test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add packages/vite-hmr/
git commit -m "feat(vite-hmr): complete package exports and build config"
```

---

## Task 6: Add Integration Test with Example

**Files:**
- Create: `packages/vite-hmr/tests/integration.test.ts`

**Step 1: Write integration test**

```typescript
import { describe, it, expect } from "vitest"
import { createScope, atom } from "@pumped-fn/lite"
import { __hmr_register } from "../src/runtime"

describe("integration: HMR preserves scope cache", () => {
  it("scope cache hit when using registered atom", async () => {
    const mockHot = { data: {}, accept: () => {}, dispose: () => {} }

    Object.defineProperty(import.meta, "hot", {
      value: mockHot,
      writable: true,
      configurable: true,
    })

    const originalAtom = atom({
      factory: () => ({ timestamp: Date.now() }),
    })
    const registeredAtom = __hmr_register("test:1:1", originalAtom)

    const scope = createScope()
    const value1 = await scope.resolve(registeredAtom)

    const newAtom = atom({
      factory: () => ({ timestamp: Date.now() }),
    })
    const reregisteredAtom = __hmr_register("test:1:1", newAtom)

    expect(reregisteredAtom).toBe(originalAtom)

    const value2 = await scope.resolve(reregisteredAtom)
    expect(value2).toBe(value1)
  })
})
```

**Step 2: Run integration test**

Run: `pnpm -F @pumped-fn/vite-hmr test`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/vite-hmr/tests/integration.test.ts
git commit -m "test(vite-hmr): add integration test for scope cache preservation"
```

---

## Task 7: Add Documentation

**Files:**
- Create: `packages/vite-hmr/README.md`

**Step 1: Create README.md**

```markdown
# @pumped-fn/vite-hmr

Vite HMR plugin for `@pumped-fn/lite` that preserves atom state across hot module reloads.

## Installation

```bash
pnpm add -D @pumped-fn/vite-hmr
```

## Usage

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { pumpedHmr } from '@pumped-fn/vite-hmr'

export default defineConfig({
  plugins: [
    pumpedHmr(),  // Add before other plugins
    react()
  ]
})
```

## How It Works

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
| `const foo = atom({...})` | ✅ Yes |
| `let foo = atom({...})` | ✅ Yes |
| `export const foo = atom({...})` | ✅ Yes |
| `atoms.push(atom({...}))` | ❌ No (dynamic) |
| `createAtom(() => atom({...}))` | ❌ No (nested) |

## Options

```typescript
pumpedHmr({
  include: /\.[jt]sx?$/,  // Files to transform (default)
  exclude: /node_modules/ // Files to skip (default)
})
```

## Production

The plugin is automatically disabled in production builds (`NODE_ENV=production`).

## License

MIT
```

**Step 2: Commit**

```bash
git add packages/vite-hmr/README.md
git commit -m "docs(vite-hmr): add package README"
```

---

## Task 8: Final Verification

**Step 1: Run full test suite**

Run: `pnpm -F @pumped-fn/vite-hmr test`
Expected: All tests pass

**Step 2: Build package**

Run: `pnpm -F @pumped-fn/vite-hmr build`
Expected: Build succeeds, dist/ contains index.js, index.cjs, runtime.js, runtime.cjs, and .d.ts files

**Step 3: Typecheck**

Run: `pnpm -F @pumped-fn/vite-hmr typecheck`
Expected: No errors

**Step 4: Verify production build excludes HMR code**

Run: `grep -r "__hmr_register" packages/vite-hmr/dist/`
Expected: Only appears in runtime.js/cjs (not in plugin output)

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(vite-hmr): complete v0.0.1 implementation"
```

---

## Summary

| Task | Description | Tests |
|------|-------------|-------|
| 1 | Package structure | - |
| 2 | Runtime helper | 3 |
| 3 | AST transform | 7 |
| 4 | Vite plugin | 7 |
| 5 | Package exports | - |
| 6 | Integration test | 1 |
| 7 | Documentation | - |
| 8 | Final verification | - |

**Total: 18 tests**

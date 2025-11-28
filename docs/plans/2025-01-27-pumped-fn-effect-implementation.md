# @pumped-fn/effect Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a lightweight, performance-focused dependency injection and execution library from scratch.

**Architecture:** Minimal API surface with object-only dependencies, monomorphic calls for performance, and clear separation between singleton atoms (cached) and per-request flows (not cached). Tags resolved via deps declaration, extensions with separate resolve/exec hooks.

**Tech Stack:** TypeScript 5.x, Vitest for testing, tsdown for build, pnpm workspace

---

## Phase 1: Package Setup

### Task 1: Create Package Structure

**Files:**
- Create: `packages/effect/package.json`
- Create: `packages/effect/tsconfig.json`
- Create: `packages/effect/src/index.ts`

**Step 1: Create package.json**

```json
{
  "name": "@pumped-fn/effect",
  "version": "0.0.1",
  "description": "Lightweight dependency injection and execution library",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsdown src/index.ts --format esm,cjs --dts --clean",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "tsdown": "^0.12.6",
    "typescript": "^5.9.3",
    "vitest": "^4.0.5"
  },
  "peerDependencies": {},
  "keywords": ["dependency-injection", "di", "effects", "typescript"],
  "license": "MIT"
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 3: Create empty index.ts**

```typescript
export const VERSION = "0.0.1"
```

**Step 4: Install dependencies**

Run: `pnpm install`

**Step 5: Verify typecheck**

Run: `pnpm -F @pumped-fn/effect typecheck`
Expected: No errors

**Step 6: Commit**

```bash
git add packages/effect/
git commit -m "feat(effect): initialize package structure"
```

---

## Phase 2: Core Types

### Task 2: Define Core Type Symbols and Brands

**Files:**
- Create: `packages/effect/src/symbols.ts`
- Create: `packages/effect/src/types.ts`

**Step 1: Create symbols.ts**

```typescript
export const atomSymbol: unique symbol = Symbol.for("@pumped-fn/effect/atom")
export const flowSymbol: unique symbol = Symbol.for("@pumped-fn/effect/flow")
export const tagSymbol: unique symbol = Symbol.for("@pumped-fn/effect/tag")
export const taggedSymbol: unique symbol = Symbol.for("@pumped-fn/effect/tagged")
export const lazySymbol: unique symbol = Symbol.for("@pumped-fn/effect/lazy")
export const presetSymbol: unique symbol = Symbol.for("@pumped-fn/effect/preset")
export const accessorSymbol: unique symbol = Symbol.for("@pumped-fn/effect/accessor")
```

**Step 2: Create types.ts with core interfaces**

```typescript
import type {
  atomSymbol,
  flowSymbol,
  tagSymbol,
  taggedSymbol,
  lazySymbol,
  presetSymbol,
  accessorSymbol,
} from "./symbols"

export type MaybePromise<T> = T | Promise<T>

export namespace Lite {
  export interface Scope {
    resolve<T>(atom: Atom<T>): Promise<T>
    accessor<T>(atom: Atom<T>): Accessor<T>
    release<T>(atom: Atom<T>): Promise<void>
    dispose(): Promise<void>
    createContext(options?: CreateContextOptions): ExecutionContext
  }

  export interface CreateContextOptions {
    tags?: Tagged<unknown>[]
  }

  export interface ScopeOptions {
    extensions?: Extension[]
    tags?: Tagged<unknown>[]
    presets?: Preset<unknown>[]
  }

  export interface Atom<T> {
    readonly [atomSymbol]: true
    readonly factory: AtomFactory<T, Record<string, Dependency>>
    readonly deps?: Record<string, Dependency>
    readonly tags?: Tagged<unknown>[]
  }

  export interface Flow<TOutput, TInput = unknown> {
    readonly [flowSymbol]: true
    readonly factory: FlowFactory<TOutput, TInput, Record<string, Dependency>>
    readonly deps?: Record<string, Dependency>
    readonly tags?: Tagged<unknown>[]
  }

  export interface ResolveContext {
    cleanup(fn: () => MaybePromise<void>): void
    readonly scope: Scope
  }

  export interface ExecutionContext {
    readonly input: unknown
    readonly scope: Scope
    exec<T>(options: ExecFlowOptions<T>): Promise<T>
    exec<T>(options: ExecFnOptions<T>): Promise<T>
    onClose(fn: () => MaybePromise<void>): void
    close(): Promise<void>
  }

  export interface ExecFlowOptions<T> {
    flow: Flow<T, unknown>
    input: unknown
    tags?: Tagged<unknown>[]
  }

  export interface ExecFnOptions<T> {
    fn: (...args: unknown[]) => MaybePromise<T>
    params: unknown[]
    tags?: Tagged<unknown>[]
  }

  export interface Accessor<T> {
    readonly [accessorSymbol]: true
    get(): T
    resolve(): Promise<T>
    release(): Promise<void>
  }

  export interface Tag<T, HasDefault extends boolean = false> {
    readonly [tagSymbol]: true
    readonly key: symbol
    readonly label: string
    readonly defaultValue: HasDefault extends true ? T : undefined
    readonly hasDefault: HasDefault
    (value: T): Tagged<T>
    get(source: TagSource): HasDefault extends true ? T : T
    find(source: TagSource): HasDefault extends true ? T : T | undefined
    collect(source: TagSource): T[]
  }

  export interface Tagged<T> {
    readonly [taggedSymbol]: true
    readonly key: symbol
    readonly value: T
  }

  export type TagSource = Tagged<unknown>[] | { tags?: Tagged<unknown>[] }

  export interface TagExecutor<T, TRequired extends boolean = true> {
    readonly tag: Tag<T, boolean>
    readonly mode: "required" | "optional" | "all"
  }

  export interface Lazy<T> {
    readonly [lazySymbol]: true
    readonly atom: Atom<T>
  }

  export interface Preset<T> {
    readonly [presetSymbol]: true
    readonly atom: Atom<T>
    readonly value: T | Atom<T>
  }

  export interface Extension {
    readonly name: string
    init?(scope: Scope): MaybePromise<void>
    wrapResolve?<T>(
      next: () => Promise<T>,
      atom: Atom<T>,
      scope: Scope
    ): Promise<T>
    wrapExec?<T>(
      next: () => Promise<T>,
      target: Flow<T, unknown> | ((...args: unknown[]) => MaybePromise<T>),
      ctx: ExecutionContext
    ): Promise<T>
    dispose?(scope: Scope): MaybePromise<void>
  }

  export type Dependency =
    | Atom<unknown>
    | Lazy<unknown>
    | TagExecutor<unknown, boolean>

  export type InferDep<D> = D extends Atom<infer T>
    ? T
    : D extends Lazy<infer T>
      ? Accessor<T>
      : D extends TagExecutor<infer T, infer R>
        ? R extends true
          ? T
          : T | undefined
        : never

  export type InferDeps<D extends Record<string, Dependency>> = {
    [K in keyof D]: InferDep<D[K]>
  }

  export type AtomFactory<T, D extends Record<string, Dependency>> =
    keyof D extends never
      ? (ctx: ResolveContext) => MaybePromise<T>
      : (ctx: ResolveContext, deps: InferDeps<D>) => MaybePromise<T>

  export type FlowFactory<
    TOutput,
    TInput,
    D extends Record<string, Dependency>,
  > = keyof D extends never
    ? (ctx: ExecutionContext) => MaybePromise<TOutput>
    : (ctx: ExecutionContext, deps: InferDeps<D>) => MaybePromise<TOutput>
}
```

**Step 3: Export from index.ts**

```typescript
export { Lite } from "./types"
export {
  atomSymbol,
  flowSymbol,
  tagSymbol,
  taggedSymbol,
  lazySymbol,
  presetSymbol,
  accessorSymbol,
} from "./symbols"

export const VERSION = "0.0.1"
```

**Step 4: Verify typecheck**

Run: `pnpm -F @pumped-fn/effect typecheck`
Expected: No errors

**Step 5: Commit**

```bash
git add packages/effect/src/
git commit -m "feat(effect): add core type definitions"
```

---

## Phase 3: Tag System

### Task 3: Implement Tag Creation and Reading

**Files:**
- Create: `packages/effect/src/tag.ts`
- Create: `packages/effect/tests/tag.test.ts`

**Step 1: Write failing tests for tag creation**

```typescript
import { describe, it, expect } from "vitest"
import { tag, tags, isTag, isTagged } from "../src/tag"

describe("Tag", () => {
  describe("tag()", () => {
    it("creates a tag with label", () => {
      const myTag = tag<string>({ label: "myTag" })

      expect(isTag(myTag)).toBe(true)
      expect(myTag.label).toBe("myTag")
      expect(myTag.hasDefault).toBe(false)
    })

    it("creates a tag with default value", () => {
      const myTag = tag<number>({ label: "count", default: 0 })

      expect(myTag.hasDefault).toBe(true)
      expect(myTag.defaultValue).toBe(0)
    })

    it("creates tagged value when called", () => {
      const myTag = tag<string>({ label: "myTag" })
      const tagged = myTag("hello")

      expect(isTagged(tagged)).toBe(true)
      expect(tagged.value).toBe("hello")
      expect(tagged.key).toBe(myTag.key)
    })
  })

  describe("tag.get()", () => {
    it("returns value from tagged array", () => {
      const myTag = tag<string>({ label: "myTag" })
      const source = [myTag("hello")]

      expect(myTag.get(source)).toBe("hello")
    })

    it("throws when tag not found and no default", () => {
      const myTag = tag<string>({ label: "myTag" })
      const source: unknown[] = []

      expect(() => myTag.get(source)).toThrow()
    })

    it("returns default when tag not found", () => {
      const myTag = tag<number>({ label: "count", default: 42 })
      const source: unknown[] = []

      expect(myTag.get(source)).toBe(42)
    })
  })

  describe("tag.find()", () => {
    it("returns value from tagged array", () => {
      const myTag = tag<string>({ label: "myTag" })
      const source = [myTag("hello")]

      expect(myTag.find(source)).toBe("hello")
    })

    it("returns undefined when tag not found", () => {
      const myTag = tag<string>({ label: "myTag" })
      const source: unknown[] = []

      expect(myTag.find(source)).toBeUndefined()
    })

    it("returns default when tag not found and has default", () => {
      const myTag = tag<number>({ label: "count", default: 42 })
      const source: unknown[] = []

      expect(myTag.find(source)).toBe(42)
    })
  })

  describe("tag.collect()", () => {
    it("returns all values for tag", () => {
      const myTag = tag<string>({ label: "myTag" })
      const source = [myTag("a"), myTag("b"), myTag("c")]

      expect(myTag.collect(source)).toEqual(["a", "b", "c"])
    })

    it("returns empty array when tag not found", () => {
      const myTag = tag<string>({ label: "myTag" })
      const source: unknown[] = []

      expect(myTag.collect(source)).toEqual([])
    })
  })

  describe("tags helpers", () => {
    it("tags.required() creates required tag executor", () => {
      const myTag = tag<string>({ label: "myTag" })
      const executor = tags.required(myTag)

      expect(executor.mode).toBe("required")
      expect(executor.tag).toBe(myTag)
    })

    it("tags.optional() creates optional tag executor", () => {
      const myTag = tag<string>({ label: "myTag" })
      const executor = tags.optional(myTag)

      expect(executor.mode).toBe("optional")
    })

    it("tags.all() creates all tag executor", () => {
      const myTag = tag<string>({ label: "myTag" })
      const executor = tags.all(myTag)

      expect(executor.mode).toBe("all")
    })
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm -F @pumped-fn/effect test`
Expected: FAIL - module not found

**Step 3: Implement tag.ts**

```typescript
import { tagSymbol, taggedSymbol } from "./symbols"
import type { Lite } from "./types"

export interface TagOptions<T, HasDefault extends boolean> {
  label: string
  default?: HasDefault extends true ? T : never
  schema?: unknown
}

export function tag<T>(options: { label: string }): Lite.Tag<T, false>
export function tag<T>(options: {
  label: string
  default: T
}): Lite.Tag<T, true>
export function tag<T>(options: TagOptions<T, boolean>): Lite.Tag<T, boolean> {
  const key = Symbol.for(`@pumped-fn/effect/tag/${options.label}`)
  const hasDefault = "default" in options
  const defaultValue = hasDefault ? options.default : undefined

  function createTagged(value: T): Lite.Tagged<T> {
    return {
      [taggedSymbol]: true,
      key,
      value,
    }
  }

  function normalizeSource(source: Lite.TagSource): Lite.Tagged<unknown>[] {
    if (Array.isArray(source)) {
      return source
    }
    return source.tags ?? []
  }

  function get(source: Lite.TagSource): T {
    const tags = normalizeSource(source)
    const found = tags.find((t) => t.key === key)
    if (found) {
      return found.value as T
    }
    if (hasDefault) {
      return defaultValue as T
    }
    throw new Error(`Tag "${options.label}" not found and has no default`)
  }

  function find(source: Lite.TagSource): T | undefined {
    const tags = normalizeSource(source)
    const found = tags.find((t) => t.key === key)
    if (found) {
      return found.value as T
    }
    if (hasDefault) {
      return defaultValue as T
    }
    return undefined
  }

  function collect(source: Lite.TagSource): T[] {
    const tags = normalizeSource(source)
    return tags.filter((t) => t.key === key).map((t) => t.value as T)
  }

  const tagInstance = createTagged as Lite.Tag<T, boolean>

  Object.defineProperties(tagInstance, {
    [tagSymbol]: { value: true, enumerable: false },
    key: { value: key, enumerable: true },
    label: { value: options.label, enumerable: true },
    hasDefault: { value: hasDefault, enumerable: true },
    defaultValue: { value: defaultValue, enumerable: true },
    get: { value: get, enumerable: false },
    find: { value: find, enumerable: false },
    collect: { value: collect, enumerable: false },
  })

  return tagInstance
}

export function isTag(value: unknown): value is Lite.Tag<unknown, boolean> {
  return (
    typeof value === "function" &&
    (value as Record<symbol, unknown>)[tagSymbol] === true
  )
}

export function isTagged(value: unknown): value is Lite.Tagged<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[taggedSymbol] === true
  )
}

export const tags = {
  required<T>(tag: Lite.Tag<T, boolean>): Lite.TagExecutor<T, true> {
    return { tag, mode: "required" }
  },

  optional<T>(tag: Lite.Tag<T, boolean>): Lite.TagExecutor<T | undefined, false> {
    return { tag, mode: "optional" } as Lite.TagExecutor<T | undefined, false>
  },

  all<T>(tag: Lite.Tag<T, boolean>): Lite.TagExecutor<T[], true> {
    return { tag, mode: "all" } as Lite.TagExecutor<T[], true>
  },
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm -F @pumped-fn/effect test`
Expected: All tests pass

**Step 5: Export from index.ts**

```typescript
export { Lite } from "./types"
export {
  atomSymbol,
  flowSymbol,
  tagSymbol,
  taggedSymbol,
  lazySymbol,
  presetSymbol,
  accessorSymbol,
} from "./symbols"
export { tag, tags, isTag, isTagged } from "./tag"

export const VERSION = "0.0.1"
```

**Step 6: Commit**

```bash
git add packages/effect/
git commit -m "feat(effect): implement tag system"
```

---

## Phase 4: Atom and Lazy

### Task 4: Implement Atom Creation

**Files:**
- Create: `packages/effect/src/atom.ts`
- Create: `packages/effect/tests/atom.test.ts`

**Step 1: Write failing tests for atom creation**

```typescript
import { describe, it, expect } from "vitest"
import { atom, isAtom, lazy, isLazy } from "../src/atom"

describe("Atom", () => {
  describe("atom()", () => {
    it("creates an atom without deps", () => {
      const myAtom = atom({
        factory: () => 42,
      })

      expect(isAtom(myAtom)).toBe(true)
      expect(myAtom.deps).toBeUndefined()
    })

    it("creates an atom with deps", () => {
      const configAtom = atom({ factory: () => ({ port: 3000 }) })
      const serverAtom = atom({
        deps: { cfg: configAtom },
        factory: (ctx, { cfg }) => ({ server: true, port: cfg.port }),
      })

      expect(isAtom(serverAtom)).toBe(true)
      expect(serverAtom.deps).toEqual({ cfg: configAtom })
    })

    it("creates an atom with tags", () => {
      const myAtom = atom({
        factory: () => 42,
        tags: [],
      })

      expect(myAtom.tags).toEqual([])
    })
  })

  describe("lazy()", () => {
    it("wraps an atom as lazy", () => {
      const myAtom = atom({ factory: () => 42 })
      const lazyAtom = lazy(myAtom)

      expect(isLazy(lazyAtom)).toBe(true)
      expect(lazyAtom.atom).toBe(myAtom)
    })
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm -F @pumped-fn/effect test`
Expected: FAIL

**Step 3: Implement atom.ts**

```typescript
import { atomSymbol, lazySymbol } from "./symbols"
import type { Lite } from "./types"

export interface AtomConfig<T, D extends Record<string, Lite.Dependency>> {
  deps?: D
  factory: Lite.AtomFactory<T, D>
  tags?: Lite.Tagged<unknown>[]
}

export function atom<T>(config: {
  factory: (ctx: Lite.ResolveContext) => Lite.MaybePromise<T>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Atom<T>

export function atom<T, D extends Record<string, Lite.Dependency>>(config: {
  deps: D
  factory: (
    ctx: Lite.ResolveContext,
    deps: Lite.InferDeps<D>
  ) => Lite.MaybePromise<T>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Atom<T>

export function atom<T, D extends Record<string, Lite.Dependency>>(
  config: AtomConfig<T, D>
): Lite.Atom<T> {
  return {
    [atomSymbol]: true,
    factory: config.factory as Lite.AtomFactory<T, Record<string, Lite.Dependency>>,
    deps: config.deps as Record<string, Lite.Dependency> | undefined,
    tags: config.tags,
  }
}

export function isAtom(value: unknown): value is Lite.Atom<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[atomSymbol] === true
  )
}

export function lazy<T>(atom: Lite.Atom<T>): Lite.Lazy<T> {
  return {
    [lazySymbol]: true,
    atom,
  }
}

export function isLazy(value: unknown): value is Lite.Lazy<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[lazySymbol] === true
  )
}
```

**Step 4: Run tests**

Run: `pnpm -F @pumped-fn/effect test`
Expected: All pass

**Step 5: Export from index.ts**

Add to exports:
```typescript
export { atom, isAtom, lazy, isLazy } from "./atom"
```

**Step 6: Commit**

```bash
git add packages/effect/
git commit -m "feat(effect): implement atom and lazy"
```

---

## Phase 5: Preset

### Task 5: Implement Preset

**Files:**
- Create: `packages/effect/src/preset.ts`
- Create: `packages/effect/tests/preset.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect } from "vitest"
import { atom } from "../src/atom"
import { preset, isPreset } from "../src/preset"

describe("Preset", () => {
  it("creates preset with static value", () => {
    const configAtom = atom({ factory: () => ({ port: 3000 }) })
    const p = preset(configAtom, { port: 8080 })

    expect(isPreset(p)).toBe(true)
    expect(p.atom).toBe(configAtom)
    expect(p.value).toEqual({ port: 8080 })
  })

  it("creates preset with another atom", () => {
    const configAtom = atom({ factory: () => ({ port: 3000 }) })
    const testConfigAtom = atom({ factory: () => ({ port: 9999 }) })
    const p = preset(configAtom, testConfigAtom)

    expect(p.atom).toBe(configAtom)
    expect(p.value).toBe(testConfigAtom)
  })
})
```

**Step 2: Run tests**

Run: `pnpm -F @pumped-fn/effect test`
Expected: FAIL

**Step 3: Implement preset.ts**

```typescript
import { presetSymbol } from "./symbols"
import type { Lite } from "./types"

export function preset<T>(
  atom: Lite.Atom<T>,
  value: T | Lite.Atom<T>
): Lite.Preset<T> {
  return {
    [presetSymbol]: true,
    atom,
    value,
  }
}

export function isPreset(value: unknown): value is Lite.Preset<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[presetSymbol] === true
  )
}
```

**Step 4: Run tests**

Run: `pnpm -F @pumped-fn/effect test`
Expected: All pass

**Step 5: Export from index.ts**

Add:
```typescript
export { preset, isPreset } from "./preset"
```

**Step 6: Commit**

```bash
git add packages/effect/
git commit -m "feat(effect): implement preset"
```

---

## Phase 6: Flow

### Task 6: Implement Flow Creation

**Files:**
- Create: `packages/effect/src/flow.ts`
- Create: `packages/effect/tests/flow.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect } from "vitest"
import { flow, isFlow } from "../src/flow"
import { atom } from "../src/atom"
import { tag, tags } from "../src/tag"

describe("Flow", () => {
  describe("flow()", () => {
    it("creates a flow without deps", () => {
      const myFlow = flow({
        factory: (ctx) => ctx.input,
      })

      expect(isFlow(myFlow)).toBe(true)
      expect(myFlow.deps).toBeUndefined()
    })

    it("creates a flow with deps", () => {
      const dbAtom = atom({ factory: () => ({ query: () => [] }) })
      const requestId = tag<string>({ label: "requestId" })

      const myFlow = flow({
        deps: { db: dbAtom, reqId: tags.required(requestId) },
        factory: (ctx, { db, reqId }) => {
          return { db, reqId, input: ctx.input }
        },
      })

      expect(isFlow(myFlow)).toBe(true)
      expect(myFlow.deps).toBeDefined()
    })

    it("creates a flow with tags", () => {
      const myFlow = flow({
        factory: (ctx) => ctx.input,
        tags: [],
      })

      expect(myFlow.tags).toEqual([])
    })
  })
})
```

**Step 2: Run tests**

Run: `pnpm -F @pumped-fn/effect test`
Expected: FAIL

**Step 3: Implement flow.ts**

```typescript
import { flowSymbol } from "./symbols"
import type { Lite } from "./types"

export interface FlowConfig<
  TOutput,
  TInput,
  D extends Record<string, Lite.Dependency>,
> {
  deps?: D
  factory: Lite.FlowFactory<TOutput, TInput, D>
  tags?: Lite.Tagged<unknown>[]
}

export function flow<TOutput, TInput = unknown>(config: {
  factory: (ctx: Lite.ExecutionContext) => Lite.MaybePromise<TOutput>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Flow<TOutput, TInput>

export function flow<
  TOutput,
  TInput,
  D extends Record<string, Lite.Dependency>,
>(config: {
  deps: D
  factory: (
    ctx: Lite.ExecutionContext,
    deps: Lite.InferDeps<D>
  ) => Lite.MaybePromise<TOutput>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Flow<TOutput, TInput>

export function flow<
  TOutput,
  TInput,
  D extends Record<string, Lite.Dependency>,
>(config: FlowConfig<TOutput, TInput, D>): Lite.Flow<TOutput, TInput> {
  return {
    [flowSymbol]: true,
    factory: config.factory as Lite.FlowFactory<
      TOutput,
      TInput,
      Record<string, Lite.Dependency>
    >,
    deps: config.deps as Record<string, Lite.Dependency> | undefined,
    tags: config.tags,
  }
}

export function isFlow(value: unknown): value is Lite.Flow<unknown, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[flowSymbol] === true
  )
}
```

**Step 4: Run tests**

Run: `pnpm -F @pumped-fn/effect test`
Expected: All pass

**Step 5: Export from index.ts**

Add:
```typescript
export { flow, isFlow } from "./flow"
```

**Step 6: Commit**

```bash
git add packages/effect/
git commit -m "feat(effect): implement flow"
```

---

## Phase 7: Scope and Resolution

### Task 7: Implement Scope Core

**Files:**
- Create: `packages/effect/src/scope.ts`
- Create: `packages/effect/tests/scope.test.ts`

**Step 1: Write failing tests for basic scope operations**

```typescript
import { describe, it, expect } from "vitest"
import { createScope } from "../src/scope"
import { atom, lazy } from "../src/atom"
import { preset } from "../src/preset"
import { tag, tags } from "../src/tag"

describe("Scope", () => {
  describe("createScope()", () => {
    it("creates a scope", () => {
      const scope = createScope()
      expect(scope).toBeDefined()
      expect(scope.resolve).toBeTypeOf("function")
      expect(scope.accessor).toBeTypeOf("function")
      expect(scope.release).toBeTypeOf("function")
      expect(scope.dispose).toBeTypeOf("function")
    })
  })

  describe("scope.resolve()", () => {
    it("resolves atom without deps", async () => {
      const scope = createScope()
      const myAtom = atom({ factory: () => 42 })

      const result = await scope.resolve(myAtom)
      expect(result).toBe(42)
    })

    it("resolves atom with deps", async () => {
      const scope = createScope()
      const configAtom = atom({ factory: () => ({ port: 3000 }) })
      const serverAtom = atom({
        deps: { cfg: configAtom },
        factory: (ctx, { cfg }) => ({ port: cfg.port }),
      })

      const result = await scope.resolve(serverAtom)
      expect(result).toEqual({ port: 3000 })
    })

    it("caches resolved values", async () => {
      const scope = createScope()
      let callCount = 0
      const myAtom = atom({
        factory: () => {
          callCount++
          return callCount
        },
      })

      const first = await scope.resolve(myAtom)
      const second = await scope.resolve(myAtom)

      expect(first).toBe(1)
      expect(second).toBe(1)
      expect(callCount).toBe(1)
    })

    it("resolves async factories", async () => {
      const scope = createScope()
      const myAtom = atom({
        factory: async () => {
          await new Promise((r) => setTimeout(r, 10))
          return "async result"
        },
      })

      const result = await scope.resolve(myAtom)
      expect(result).toBe("async result")
    })

    it("uses preset value", async () => {
      const configAtom = atom({ factory: () => ({ port: 3000 }) })
      const scope = createScope({
        presets: [preset(configAtom, { port: 8080 })],
      })

      const result = await scope.resolve(configAtom)
      expect(result).toEqual({ port: 8080 })
    })

    it("uses preset atom", async () => {
      const configAtom = atom({ factory: () => ({ port: 3000 }) })
      const testConfigAtom = atom({ factory: () => ({ port: 9999 }) })
      const scope = createScope({
        presets: [preset(configAtom, testConfigAtom)],
      })

      const result = await scope.resolve(configAtom)
      expect(result).toEqual({ port: 9999 })
    })
  })

  describe("scope.accessor()", () => {
    it("returns accessor for atom", async () => {
      const scope = createScope()
      const myAtom = atom({ factory: () => 42 })

      const accessor = scope.accessor(myAtom)
      expect(accessor).toBeDefined()

      await accessor.resolve()
      expect(accessor.get()).toBe(42)
    })

    it("accessor.get() throws if not resolved", () => {
      const scope = createScope()
      const myAtom = atom({ factory: () => 42 })

      const accessor = scope.accessor(myAtom)
      expect(() => accessor.get()).toThrow()
    })
  })

  describe("lazy deps", () => {
    it("resolves lazy dep as accessor", async () => {
      const scope = createScope()
      const optionalAtom = atom({ factory: () => "optional" })
      const mainAtom = atom({
        deps: { opt: lazy(optionalAtom) },
        factory: async (ctx, { opt }) => {
          await opt.resolve()
          return opt.get()
        },
      })

      const result = await scope.resolve(mainAtom)
      expect(result).toBe("optional")
    })
  })

  describe("tag deps", () => {
    it("resolves required tag from scope tags", async () => {
      const tenantId = tag<string>({ label: "tenantId" })
      const scope = createScope({
        tags: [tenantId("tenant-123")],
      })

      const myAtom = atom({
        deps: { tenant: tags.required(tenantId) },
        factory: (ctx, { tenant }) => tenant,
      })

      const result = await scope.resolve(myAtom)
      expect(result).toBe("tenant-123")
    })

    it("throws for missing required tag", async () => {
      const tenantId = tag<string>({ label: "tenantId" })
      const scope = createScope()

      const myAtom = atom({
        deps: { tenant: tags.required(tenantId) },
        factory: (ctx, { tenant }) => tenant,
      })

      await expect(scope.resolve(myAtom)).rejects.toThrow()
    })

    it("resolves optional tag as undefined", async () => {
      const tenantId = tag<string>({ label: "tenantId" })
      const scope = createScope()

      const myAtom = atom({
        deps: { tenant: tags.optional(tenantId) },
        factory: (ctx, { tenant }) => tenant,
      })

      const result = await scope.resolve(myAtom)
      expect(result).toBeUndefined()
    })
  })

  describe("cleanup", () => {
    it("runs cleanup on release", async () => {
      const scope = createScope()
      let cleaned = false
      const myAtom = atom({
        factory: (ctx) => {
          ctx.cleanup(() => {
            cleaned = true
          })
          return 42
        },
      })

      await scope.resolve(myAtom)
      expect(cleaned).toBe(false)

      await scope.release(myAtom)
      expect(cleaned).toBe(true)
    })

    it("runs cleanups in LIFO order", async () => {
      const scope = createScope()
      const order: number[] = []
      const myAtom = atom({
        factory: (ctx) => {
          ctx.cleanup(() => order.push(1))
          ctx.cleanup(() => order.push(2))
          ctx.cleanup(() => order.push(3))
          return 42
        },
      })

      await scope.resolve(myAtom)
      await scope.release(myAtom)

      expect(order).toEqual([3, 2, 1])
    })
  })

  describe("dispose", () => {
    it("releases all atoms", async () => {
      const scope = createScope()
      const cleanups: string[] = []

      const a = atom({
        factory: (ctx) => {
          ctx.cleanup(() => cleanups.push("a"))
          return "a"
        },
      })
      const b = atom({
        factory: (ctx) => {
          ctx.cleanup(() => cleanups.push("b"))
          return "b"
        },
      })

      await scope.resolve(a)
      await scope.resolve(b)
      await scope.dispose()

      expect(cleanups).toContain("a")
      expect(cleanups).toContain("b")
    })
  })
})
```

**Step 2: Run tests**

Run: `pnpm -F @pumped-fn/effect test`
Expected: FAIL

**Step 3: Implement scope.ts**

```typescript
import { accessorSymbol } from "./symbols"
import type { Lite } from "./types"
import { isAtom, isLazy } from "./atom"
import { isPreset } from "./preset"

interface ResolveState<T> {
  value: T
  cleanups: (() => Lite.MaybePromise<void>)[]
}

class AccessorImpl<T> implements Lite.Accessor<T> {
  readonly [accessorSymbol] = true

  constructor(
    private atom: Lite.Atom<T>,
    private scope: ScopeImpl
  ) {}

  get(): T {
    const state = this.scope.getState(this.atom)
    if (!state) {
      throw new Error("Atom not resolved")
    }
    return state.value
  }

  async resolve(): Promise<T> {
    return this.scope.resolve(this.atom)
  }

  async release(): Promise<void> {
    return this.scope.release(this.atom)
  }
}

class ScopeImpl implements Lite.Scope {
  private cache = new Map<Lite.Atom<unknown>, ResolveState<unknown>>()
  private presets = new Map<Lite.Atom<unknown>, unknown | Lite.Atom<unknown>>()
  private extensions: Lite.Extension[]
  private tags: Lite.Tagged<unknown>[]
  private resolving = new Set<Lite.Atom<unknown>>()

  constructor(options?: Lite.ScopeOptions) {
    this.extensions = options?.extensions ?? []
    this.tags = options?.tags ?? []

    for (const p of options?.presets ?? []) {
      this.presets.set(p.atom, p.value)
    }
  }

  async init(): Promise<void> {
    for (const ext of this.extensions) {
      if (ext.init) {
        await ext.init(this)
      }
    }
  }

  getState<T>(atom: Lite.Atom<T>): ResolveState<T> | undefined {
    return this.cache.get(atom) as ResolveState<T> | undefined
  }

  async resolve<T>(atom: Lite.Atom<T>): Promise<T> {
    const cached = this.cache.get(atom)
    if (cached) {
      return cached.value as T
    }

    if (this.resolving.has(atom)) {
      throw new Error("Circular dependency detected")
    }

    const presetValue = this.presets.get(atom)
    if (presetValue !== undefined) {
      if (isAtom(presetValue)) {
        return this.resolve(presetValue as Lite.Atom<T>)
      }
      const state: ResolveState<T> = {
        value: presetValue as T,
        cleanups: [],
      }
      this.cache.set(atom, state)
      return state.value
    }

    this.resolving.add(atom)

    try {
      const resolvedDeps = await this.resolveDeps(atom.deps)
      const cleanups: (() => Lite.MaybePromise<void>)[] = []

      const ctx: Lite.ResolveContext = {
        cleanup: (fn) => cleanups.push(fn),
        scope: this,
      }

      let value: T
      const factory = atom.factory as (
        ctx: Lite.ResolveContext,
        deps?: Record<string, unknown>
      ) => Lite.MaybePromise<T>

      const doResolve = async () => {
        if (atom.deps && Object.keys(atom.deps).length > 0) {
          value = await factory(ctx, resolvedDeps)
        } else {
          value = await factory(ctx)
        }
        return value
      }

      value = await this.applyResolveExtensions(atom, doResolve)

      const state: ResolveState<T> = { value, cleanups }
      this.cache.set(atom, state)

      return value
    } finally {
      this.resolving.delete(atom)
    }
  }

  private async applyResolveExtensions<T>(
    atom: Lite.Atom<T>,
    doResolve: () => Promise<T>
  ): Promise<T> {
    let next = doResolve

    for (let i = this.extensions.length - 1; i >= 0; i--) {
      const ext = this.extensions[i]
      if (ext?.wrapResolve) {
        const currentNext = next
        const wrap = ext.wrapResolve.bind(ext)
        next = () => wrap(currentNext, atom, this)
      }
    }

    return next()
  }

  private async resolveDeps(
    deps: Record<string, Lite.Dependency> | undefined
  ): Promise<Record<string, unknown>> {
    if (!deps) return {}

    const result: Record<string, unknown> = {}

    for (const [key, dep] of Object.entries(deps)) {
      if (isAtom(dep)) {
        result[key] = await this.resolve(dep)
      } else if (isLazy(dep)) {
        result[key] = new AccessorImpl(dep.atom, this)
      } else if ("mode" in dep && "tag" in dep) {
        const tagExecutor = dep as Lite.TagExecutor<unknown, boolean>
        const source = this.tags

        switch (tagExecutor.mode) {
          case "required":
            result[key] = tagExecutor.tag.get(source)
            break
          case "optional":
            result[key] = tagExecutor.tag.find(source)
            break
          case "all":
            result[key] = tagExecutor.tag.collect(source)
            break
        }
      }
    }

    return result
  }

  accessor<T>(atom: Lite.Atom<T>): Lite.Accessor<T> {
    return new AccessorImpl(atom, this)
  }

  async release<T>(atom: Lite.Atom<T>): Promise<void> {
    const state = this.cache.get(atom)
    if (!state) return

    for (let i = state.cleanups.length - 1; i >= 0; i--) {
      const cleanup = state.cleanups[i]
      if (cleanup) {
        await cleanup()
      }
    }

    this.cache.delete(atom)
  }

  async dispose(): Promise<void> {
    for (const ext of this.extensions) {
      if (ext.dispose) {
        await ext.dispose(this)
      }
    }

    const atoms = Array.from(this.cache.keys())
    for (const atom of atoms) {
      await this.release(atom as Lite.Atom<unknown>)
    }
  }

  createContext(options?: Lite.CreateContextOptions): Lite.ExecutionContext {
    return new ExecutionContextImpl(this, options)
  }
}

class ExecutionContextImpl implements Lite.ExecutionContext {
  private cleanups: (() => Lite.MaybePromise<void>)[] = []
  private closed = false
  private _input: unknown = undefined
  private tags: Lite.Tagged<unknown>[]

  constructor(
    readonly scope: ScopeImpl,
    options?: Lite.CreateContextOptions
  ) {
    this.tags = options?.tags ?? []
  }

  get input(): unknown {
    return this._input
  }

  async exec<T>(options: Lite.ExecFlowOptions<T> | Lite.ExecFnOptions<T>): Promise<T> {
    if (this.closed) {
      throw new Error("ExecutionContext is closed")
    }

    if ("flow" in options) {
      return this.execFlow(options)
    } else {
      return this.execFn(options)
    }
  }

  private async execFlow<T>(options: Lite.ExecFlowOptions<T>): Promise<T> {
    const { flow, input, tags: execTags } = options

    const allTags = [
      ...(execTags ?? []),
      ...this.tags,
      ...(this.scope as ScopeImpl)["tags"],
      ...(flow.tags ?? []),
    ]

    const resolvedDeps = await this.resolveDepsWithTags(flow.deps, allTags)

    this._input = input

    const factory = flow.factory as (
      ctx: Lite.ExecutionContext,
      deps?: Record<string, unknown>
    ) => Lite.MaybePromise<T>

    if (flow.deps && Object.keys(flow.deps).length > 0) {
      return factory(this, resolvedDeps)
    } else {
      return factory(this)
    }
  }

  private async execFn<T>(options: Lite.ExecFnOptions<T>): Promise<T> {
    const { fn, params } = options
    return fn(...params) as Promise<T>
  }

  private async resolveDepsWithTags(
    deps: Record<string, Lite.Dependency> | undefined,
    tags: Lite.Tagged<unknown>[]
  ): Promise<Record<string, unknown>> {
    if (!deps) return {}

    const result: Record<string, unknown> = {}

    for (const [key, dep] of Object.entries(deps)) {
      if (isAtom(dep)) {
        result[key] = await this.scope.resolve(dep)
      } else if (isLazy(dep)) {
        result[key] = new AccessorImpl(dep.atom, this.scope as ScopeImpl)
      } else if ("mode" in dep && "tag" in dep) {
        const tagExecutor = dep as Lite.TagExecutor<unknown, boolean>

        switch (tagExecutor.mode) {
          case "required":
            result[key] = tagExecutor.tag.get(tags)
            break
          case "optional":
            result[key] = tagExecutor.tag.find(tags)
            break
          case "all":
            result[key] = tagExecutor.tag.collect(tags)
            break
        }
      }
    }

    return result
  }

  onClose(fn: () => Lite.MaybePromise<void>): void {
    this.cleanups.push(fn)
  }

  async close(): Promise<void> {
    if (this.closed) return

    this.closed = true

    for (let i = this.cleanups.length - 1; i >= 0; i--) {
      const cleanup = this.cleanups[i]
      if (cleanup) {
        await cleanup()
      }
    }
  }
}

export async function createScope(
  options?: Lite.ScopeOptions
): Promise<Lite.Scope> {
  const scope = new ScopeImpl(options)
  await scope.init()
  return scope
}
```

**Step 4: Run tests**

Run: `pnpm -F @pumped-fn/effect test`
Expected: All pass

**Step 5: Export from index.ts**

Add:
```typescript
export { createScope } from "./scope"
```

**Step 6: Commit**

```bash
git add packages/effect/
git commit -m "feat(effect): implement scope and resolution"
```

---

## Phase 8: ExecutionContext and Flow Execution

### Task 8: Add ExecutionContext Tests

**Files:**
- Update: `packages/effect/tests/scope.test.ts`

**Step 1: Add ExecutionContext tests**

```typescript
describe("ExecutionContext", () => {
  describe("createContext()", () => {
    it("creates execution context", async () => {
      const scope = await createScope()
      const ctx = scope.createContext()

      expect(ctx).toBeDefined()
      expect(ctx.exec).toBeTypeOf("function")
      expect(ctx.close).toBeTypeOf("function")
    })

    it("creates context with tags", async () => {
      const requestId = tag<string>({ label: "requestId" })
      const scope = await createScope()
      const ctx = scope.createContext({
        tags: [requestId("req-123")],
      })

      expect(ctx).toBeDefined()
    })
  })

  describe("ctx.exec() with flow", () => {
    it("executes flow without deps", async () => {
      const scope = await createScope()
      const ctx = scope.createContext()

      const myFlow = flow({
        factory: (ctx) => `input: ${ctx.input}`,
      })

      const result = await ctx.exec({
        flow: myFlow,
        input: "hello",
      })

      expect(result).toBe("input: hello")
      await ctx.close()
    })

    it("executes flow with deps", async () => {
      const dbAtom = atom({ factory: () => ({ query: () => "data" }) })
      const scope = await createScope()
      const ctx = scope.createContext()

      const myFlow = flow({
        deps: { db: dbAtom },
        factory: (ctx, { db }) => db.query(),
      })

      const result = await ctx.exec({
        flow: myFlow,
        input: null,
      })

      expect(result).toBe("data")
      await ctx.close()
    })

    it("resolves tag deps from merged sources", async () => {
      const requestId = tag<string>({ label: "requestId" })
      const tenantId = tag<string>({ label: "tenantId" })

      const scope = await createScope({
        tags: [tenantId("tenant-1")],
      })

      const ctx = scope.createContext({
        tags: [requestId("req-123")],
      })

      const myFlow = flow({
        deps: {
          reqId: tags.required(requestId),
          tenant: tags.required(tenantId),
        },
        factory: (ctx, { reqId, tenant }) => ({ reqId, tenant }),
      })

      const result = await ctx.exec({
        flow: myFlow,
        input: null,
      })

      expect(result).toEqual({
        reqId: "req-123",
        tenant: "tenant-1",
      })

      await ctx.close()
    })

    it("exec tags override context tags", async () => {
      const requestId = tag<string>({ label: "requestId" })

      const scope = await createScope()
      const ctx = scope.createContext({
        tags: [requestId("ctx-id")],
      })

      const myFlow = flow({
        deps: { reqId: tags.required(requestId) },
        factory: (ctx, { reqId }) => reqId,
      })

      const result = await ctx.exec({
        flow: myFlow,
        input: null,
        tags: [requestId("exec-id")],
      })

      expect(result).toBe("exec-id")
      await ctx.close()
    })
  })

  describe("ctx.exec() with fn", () => {
    it("executes plain function", async () => {
      const scope = await createScope()
      const ctx = scope.createContext()

      const result = await ctx.exec({
        fn: (a: number, b: number) => a + b,
        params: [1, 2],
      })

      expect(result).toBe(3)
      await ctx.close()
    })
  })

  describe("ctx.onClose()", () => {
    it("runs cleanup on close", async () => {
      const scope = await createScope()
      const ctx = scope.createContext()

      let cleaned = false
      ctx.onClose(() => {
        cleaned = true
      })

      expect(cleaned).toBe(false)
      await ctx.close()
      expect(cleaned).toBe(true)
    })

    it("runs cleanups in LIFO order", async () => {
      const scope = await createScope()
      const ctx = scope.createContext()

      const order: number[] = []
      ctx.onClose(() => order.push(1))
      ctx.onClose(() => order.push(2))
      ctx.onClose(() => order.push(3))

      await ctx.close()
      expect(order).toEqual([3, 2, 1])
    })
  })

  describe("closed context", () => {
    it("throws when executing on closed context", async () => {
      const scope = await createScope()
      const ctx = scope.createContext()
      await ctx.close()

      const myFlow = flow({ factory: () => 42 })

      await expect(
        ctx.exec({ flow: myFlow, input: null })
      ).rejects.toThrow("closed")
    })
  })
})
```

**Step 2: Run tests**

Run: `pnpm -F @pumped-fn/effect test`
Expected: All pass (implementation already in scope.ts)

**Step 3: Commit**

```bash
git add packages/effect/
git commit -m "test(effect): add ExecutionContext tests"
```

---

## Phase 9: Extensions

### Task 9: Add Extension Tests

**Files:**
- Create: `packages/effect/tests/extension.test.ts`

**Step 1: Write extension tests**

```typescript
import { describe, it, expect, vi } from "vitest"
import { createScope } from "../src/scope"
import { atom } from "../src/atom"
import { flow } from "../src/flow"
import type { Lite } from "../src/types"

describe("Extension", () => {
  describe("init", () => {
    it("calls init on scope creation", async () => {
      const init = vi.fn()
      const ext: Lite.Extension = {
        name: "test",
        init,
      }

      await createScope({ extensions: [ext] })
      expect(init).toHaveBeenCalledTimes(1)
    })

    it("calls init with scope", async () => {
      let receivedScope: Lite.Scope | undefined
      const ext: Lite.Extension = {
        name: "test",
        init: (scope) => {
          receivedScope = scope
        },
      }

      const scope = await createScope({ extensions: [ext] })
      expect(receivedScope).toBe(scope)
    })
  })

  describe("wrapResolve", () => {
    it("wraps atom resolution", async () => {
      const calls: string[] = []
      const ext: Lite.Extension = {
        name: "test",
        wrapResolve: async (next, atom, scope) => {
          calls.push("before")
          const result = await next()
          calls.push("after")
          return result
        },
      }

      const scope = await createScope({ extensions: [ext] })
      const myAtom = atom({ factory: () => 42 })

      await scope.resolve(myAtom)
      expect(calls).toEqual(["before", "after"])
    })

    it("can transform result", async () => {
      const ext: Lite.Extension = {
        name: "test",
        wrapResolve: async (next) => {
          const result = await next()
          return (result as number) * 2
        },
      }

      const scope = await createScope({ extensions: [ext] })
      const myAtom = atom({ factory: () => 21 })

      const result = await scope.resolve(myAtom)
      expect(result).toBe(42)
    })

    it("chains multiple extensions", async () => {
      const order: string[] = []

      const ext1: Lite.Extension = {
        name: "ext1",
        wrapResolve: async (next) => {
          order.push("ext1-before")
          const result = await next()
          order.push("ext1-after")
          return result
        },
      }

      const ext2: Lite.Extension = {
        name: "ext2",
        wrapResolve: async (next) => {
          order.push("ext2-before")
          const result = await next()
          order.push("ext2-after")
          return result
        },
      }

      const scope = await createScope({ extensions: [ext1, ext2] })
      const myAtom = atom({ factory: () => 42 })

      await scope.resolve(myAtom)

      expect(order).toEqual([
        "ext2-before",
        "ext1-before",
        "ext1-after",
        "ext2-after",
      ])
    })
  })

  describe("wrapExec", () => {
    it("wraps flow execution", async () => {
      const calls: string[] = []
      const ext: Lite.Extension = {
        name: "test",
        wrapExec: async (next, target, ctx) => {
          calls.push("before")
          const result = await next()
          calls.push("after")
          return result
        },
      }

      const scope = await createScope({ extensions: [ext] })
      const ctx = scope.createContext()
      const myFlow = flow({ factory: () => 42 })

      await ctx.exec({ flow: myFlow, input: null })
      expect(calls).toEqual(["before", "after"])

      await ctx.close()
    })
  })

  describe("dispose", () => {
    it("calls dispose on scope dispose", async () => {
      const dispose = vi.fn()
      const ext: Lite.Extension = {
        name: "test",
        dispose,
      }

      const scope = await createScope({ extensions: [ext] })
      await scope.dispose()

      expect(dispose).toHaveBeenCalledTimes(1)
    })
  })
})
```

**Step 2: Run tests**

Run: `pnpm -F @pumped-fn/effect test`
Expected: Most pass, wrapExec may need implementation update

**Step 3: Update scope.ts to support wrapExec**

In `ExecutionContextImpl.execFlow()`, add extension wrapping:

```typescript
private async execFlow<T>(options: Lite.ExecFlowOptions<T>): Promise<T> {
  const { flow, input, tags: execTags } = options

  const allTags = [
    ...(execTags ?? []),
    ...this.tags,
    ...(this.scope as ScopeImpl)["tags"],
    ...(flow.tags ?? []),
  ]

  const resolvedDeps = await this.resolveDepsWithTags(flow.deps, allTags)

  this._input = input

  const factory = flow.factory as (
    ctx: Lite.ExecutionContext,
    deps?: Record<string, unknown>
  ) => Lite.MaybePromise<T>

  const doExec = async (): Promise<T> => {
    if (flow.deps && Object.keys(flow.deps).length > 0) {
      return factory(this, resolvedDeps)
    } else {
      return factory(this)
    }
  }

  return this.applyExecExtensions(flow, doExec)
}

private async applyExecExtensions<T>(
  target: Lite.Flow<T, unknown> | ((...args: unknown[]) => Lite.MaybePromise<T>),
  doExec: () => Promise<T>
): Promise<T> {
  const extensions = (this.scope as ScopeImpl)["extensions"]
  let next = doExec

  for (let i = extensions.length - 1; i >= 0; i--) {
    const ext = extensions[i]
    if (ext?.wrapExec) {
      const currentNext = next
      const wrap = ext.wrapExec.bind(ext)
      next = () => wrap(currentNext, target, this)
    }
  }

  return next()
}
```

**Step 4: Run tests**

Run: `pnpm -F @pumped-fn/effect test`
Expected: All pass

**Step 5: Commit**

```bash
git add packages/effect/
git commit -m "feat(effect): implement extension hooks"
```

---

## Phase 10: Final Integration and Export

### Task 10: Final Index and Build

**Files:**
- Update: `packages/effect/src/index.ts`

**Step 1: Update index.ts with complete exports**

```typescript
export type { Lite } from "./types"

export {
  atomSymbol,
  flowSymbol,
  tagSymbol,
  taggedSymbol,
  lazySymbol,
  presetSymbol,
  accessorSymbol,
} from "./symbols"

export { tag, tags, isTag, isTagged } from "./tag"
export { atom, isAtom, lazy, isLazy } from "./atom"
export { flow, isFlow } from "./flow"
export { preset, isPreset } from "./preset"
export { createScope } from "./scope"

export const VERSION = "0.0.1"
```

**Step 2: Run full test suite**

Run: `pnpm -F @pumped-fn/effect test`
Expected: All pass

**Step 3: Run typecheck**

Run: `pnpm -F @pumped-fn/effect typecheck`
Expected: No errors

**Step 4: Build package**

Run: `pnpm -F @pumped-fn/effect build`
Expected: Success

**Step 5: Commit**

```bash
git add packages/effect/
git commit -m "feat(effect): complete initial implementation"
```

---

## Summary

**Total Tasks:** 10
**Estimated Time:** 4-6 hours

**Package Structure:**
```
packages/effect/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── symbols.ts
│   ├── types.ts
│   ├── tag.ts
│   ├── atom.ts
│   ├── flow.ts
│   ├── preset.ts
│   └── scope.ts
└── tests/
    ├── tag.test.ts
    ├── atom.test.ts
    ├── preset.test.ts
    ├── scope.test.ts
    └── extension.test.ts
```

**Public API:**
- `atom()` - create singleton
- `flow()` - create per-request handler
- `tag()` - create metadata tag
- `tags.required/optional/all()` - tag dep helpers
- `lazy()` - wrap atom for lazy resolution
- `preset()` - create override
- `createScope()` - create runtime container

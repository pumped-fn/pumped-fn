# Service Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `service()` primitive for defining context-aware method containers.

**Architecture:** Service is a narrowed-down atom that returns an object where all methods take `(ctx: ExecutionContext, ...args)`. Methods are auto-bound. Resolved as singleton. Invoked via `ctx.exec({ fn, params })`.

**Tech Stack:** TypeScript, Vitest

**Progress Tracking:** Use TodoWrite for each task. Mark complete only after verification passes.

---

## Task 1: Add serviceSymbol

**Files:**
- Modify: `packages/lite/src/symbols.ts`

**Step 1: Add the symbol**

Add to end of file:

```typescript
export const serviceSymbol: unique symbol = Symbol.for("@pumped-fn/lite/service")
```

**Step 2: Verify no syntax errors**

Run: `pnpm -F @pumped-fn/lite typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/lite/src/symbols.ts
git commit -m "feat(lite): add serviceSymbol"
```

---

## Task 2: Add Service types to Lite namespace

**Files:**
- Modify: `packages/lite/src/types.ts`

**Step 1: Add import for serviceSymbol**

At top of file, add `serviceSymbol` to imports:

```typescript
import type {
  atomSymbol,
  flowSymbol,
  tagSymbol,
  taggedSymbol,
  controllerDepSymbol,
  presetSymbol,
  controllerSymbol,
  tagExecutorSymbol,
  typedSymbol,
  serviceSymbol,
} from "./symbols"
```

**Step 2: Add Service types inside Lite namespace**

Add after `FlowFactory` type (around line 258):

```typescript
  export type ServiceMethod<TArgs extends unknown[], TReturn> = (
    ctx: ExecutionContext,
    ...args: TArgs
  ) => MaybePromise<TReturn>

  export type ServiceMethods = Record<
    string,
    (ctx: ExecutionContext, ...args: unknown[]) => MaybePromise<unknown>
  >

  export interface Service<T extends ServiceMethods> {
    readonly [serviceSymbol]: true
    readonly factory: ServiceFactory<T, Record<string, Dependency>>
    readonly deps?: Record<string, Dependency>
    readonly tags?: Tagged<unknown>[]
  }

  export type ServiceFactory<T extends ServiceMethods, D extends Record<string, Dependency>> =
    keyof D extends never
      ? (ctx: ResolveContext) => MaybePromise<T>
      : (ctx: ResolveContext, deps: InferDeps<D>) => MaybePromise<T>
```

**Step 3: Verify types compile**

Run: `pnpm -F @pumped-fn/lite typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/lite/src/types.ts
git commit -m "feat(lite): add Service types to Lite namespace"
```

---

## Task 3: Write failing test for service() and isService()

**Files:**
- Create: `packages/lite/tests/service.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, it, expect } from "vitest"
import { service, isService } from "../src/service"
import { atom } from "../src/atom"
import { createScope } from "../src/scope"
import type { Lite } from "../src/types"

describe("Service", () => {
  it("creates service and identifies via type guard", () => {
    const dbService = service({
      factory: () => ({
        query: (ctx: Lite.ExecutionContext, sql: string) => `result: ${sql}`,
      }),
    })

    expect(isService(dbService)).toBe(true)
    expect(isService({})).toBe(false)
    expect(isService(null)).toBe(false)
  })

  it("service with deps", () => {
    const configAtom = atom({ factory: () => ({ connectionString: "postgres://..." }) })

    const dbService = service({
      deps: { config: configAtom },
      factory: (ctx, { config }) => ({
        query: (ctx: Lite.ExecutionContext, sql: string) => `${config.connectionString}: ${sql}`,
      }),
    })

    expect(isService(dbService)).toBe(true)
    expect(dbService.deps).toHaveProperty("config")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/lite test -- tests/service.test.ts`
Expected: FAIL - Cannot find module '../src/service'

**Step 3: Commit failing test**

```bash
git add packages/lite/tests/service.test.ts
git commit -m "test(lite): add failing tests for service"
```

---

## Task 4: Implement service() and isService()

**Files:**
- Create: `packages/lite/src/service.ts`

**Step 1: Write the implementation**

```typescript
import { serviceSymbol } from "./symbols"
import type { Lite, MaybePromise } from "./types"

export interface ServiceConfig<T extends Lite.ServiceMethods, D extends Record<string, Lite.Dependency>> {
  deps?: D
  factory: Lite.ServiceFactory<T, D>
  tags?: Lite.Tagged<unknown>[]
}

/**
 * Creates a context-aware service that exposes multiple methods.
 * Each method receives ExecutionContext as its first parameter.
 *
 * @param config - Configuration object containing factory function, optional dependencies, and tags
 * @returns A Service instance that can be resolved to produce methods
 *
 * @example
 * ```typescript
 * const dbService = service({
 *   deps: { pool: poolAtom },
 *   factory: (ctx, { pool }) => ({
 *     query: (ctx, sql: string) => pool.query(sql),
 *     transaction: (ctx, fn) => pool.withTransaction(fn),
 *   })
 * })
 * ```
 */
export function service<T extends Lite.ServiceMethods>(config: {
  deps?: undefined
  factory: (ctx: Lite.ResolveContext) => MaybePromise<T>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Service<T>

export function service<
  T extends Lite.ServiceMethods,
  const D extends Record<string, Lite.Atom<unknown> | Lite.ControllerDep<unknown> | { mode: string }>,
>(config: {
  deps: D
  factory: (ctx: Lite.ResolveContext, deps: Lite.InferDeps<D>) => MaybePromise<T>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Service<T>

export function service<T extends Lite.ServiceMethods, D extends Record<string, Lite.Dependency>>(
  config: ServiceConfig<T, D>
): Lite.Service<T> {
  return {
    [serviceSymbol]: true,
    factory: config.factory as unknown as Lite.ServiceFactory<T, Record<string, Lite.Dependency>>,
    deps: config.deps as unknown as Record<string, Lite.Dependency> | undefined,
    tags: config.tags,
  }
}

/**
 * Type guard to check if a value is a Service.
 *
 * @param value - The value to check
 * @returns True if the value is a Service, false otherwise
 *
 * @example
 * ```typescript
 * if (isService(value)) {
 *   const methods = await scope.resolve(value)
 * }
 * ```
 */
export function isService(value: unknown): value is Lite.Service<Lite.ServiceMethods> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[serviceSymbol] === true
  )
}
```

**Step 2: Run tests to verify they pass**

Run: `pnpm -F @pumped-fn/lite test -- tests/service.test.ts`
Expected: PASS (2 tests)

**Step 3: Commit**

```bash
git add packages/lite/src/service.ts
git commit -m "feat(lite): implement service() and isService()"
```

---

## Task 5: Export service from index.ts

**Files:**
- Modify: `packages/lite/src/index.ts`

**Step 1: Add exports**

Add after preset exports:

```typescript
export { service, isService } from "./service"
```

Add `serviceSymbol` to symbols export:

```typescript
export {
  atomSymbol,
  flowSymbol,
  tagSymbol,
  taggedSymbol,
  controllerDepSymbol,
  presetSymbol,
  controllerSymbol,
  tagExecutorSymbol,
  typedSymbol,
  serviceSymbol,
} from "./symbols"
```

**Step 2: Verify exports work**

Run: `pnpm -F @pumped-fn/lite typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/lite/src/index.ts
git commit -m "feat(lite): export service from index"
```

---

## Task 6: Write test for service resolution

**Files:**
- Modify: `packages/lite/tests/service.test.ts`

**Step 1: Add resolution test**

Add to describe block:

```typescript
  it("resolves service and calls methods via ctx.exec", async () => {
    const dbService = service({
      factory: () => ({
        query: (ctx: Lite.ExecutionContext, sql: string) => `executed: ${sql}`,
        count: (ctx: Lite.ExecutionContext) => 42,
      }),
    })

    const scope = createScope()
    await scope.ready

    const db = await scope.resolve(dbService as unknown as Lite.Atom<{
      query: (ctx: Lite.ExecutionContext, sql: string) => string
      count: (ctx: Lite.ExecutionContext) => number
    }>)

    const ctx = scope.createContext()
    const result = await ctx.exec({ fn: db.query, params: [ctx, "SELECT 1"] })

    expect(result).toBe("executed: SELECT 1")

    await ctx.close()
    await scope.dispose()
  })
```

**Step 2: Run test**

Run: `pnpm -F @pumped-fn/lite test -- tests/service.test.ts`
Expected: PASS (3 tests)

**Step 3: Commit**

```bash
git add packages/lite/tests/service.test.ts
git commit -m "test(lite): add service resolution test"
```

---

## Task 7: Write test for service with deps resolution

**Files:**
- Modify: `packages/lite/tests/service.test.ts`

**Step 1: Add test with dependencies**

Add to describe block:

```typescript
  it("resolves service with dependencies", async () => {
    const configAtom = atom({ factory: () => ({ prefix: "DB" }) })

    const dbService = service({
      deps: { config: configAtom },
      factory: (ctx, { config }) => ({
        query: (ctx: Lite.ExecutionContext, sql: string) => `[${config.prefix}] ${sql}`,
      }),
    })

    const scope = createScope()
    await scope.ready

    const db = await scope.resolve(dbService as unknown as Lite.Atom<{
      query: (ctx: Lite.ExecutionContext, sql: string) => string
    }>)

    const ctx = scope.createContext()
    const result = await ctx.exec({ fn: db.query, params: [ctx, "SELECT 1"] })

    expect(result).toBe("[DB] SELECT 1")

    await ctx.close()
    await scope.dispose()
  })
```

**Step 2: Run test**

Run: `pnpm -F @pumped-fn/lite test -- tests/service.test.ts`
Expected: PASS (4 tests)

**Step 3: Commit**

```bash
git add packages/lite/tests/service.test.ts
git commit -m "test(lite): add service with deps resolution test"
```

---

## Task 8: Add method binding test

**Files:**
- Modify: `packages/lite/tests/service.test.ts`

**Step 1: Add binding test**

Add to describe block:

```typescript
  it("service methods preserve this binding", async () => {
    const dbService = service({
      factory: () => {
        const state = { counter: 0 }
        return {
          increment: (ctx: Lite.ExecutionContext) => {
            state.counter++
            return state.counter
          },
          getCount: (ctx: Lite.ExecutionContext) => state.counter,
        }
      },
    })

    const scope = createScope()
    await scope.ready

    const db = await scope.resolve(dbService as unknown as Lite.Atom<{
      increment: (ctx: Lite.ExecutionContext) => number
      getCount: (ctx: Lite.ExecutionContext) => number
    }>)

    const ctx = scope.createContext()

    await ctx.exec({ fn: db.increment, params: [ctx] })
    await ctx.exec({ fn: db.increment, params: [ctx] })
    const count = await ctx.exec({ fn: db.getCount, params: [ctx] })

    expect(count).toBe(2)

    await ctx.close()
    await scope.dispose()
  })
```

**Step 2: Run test**

Run: `pnpm -F @pumped-fn/lite test -- tests/service.test.ts`
Expected: PASS (5 tests)

**Step 3: Commit**

```bash
git add packages/lite/tests/service.test.ts
git commit -m "test(lite): add service method binding test"
```

---

## Task 9: Run full test suite

**Step 1: Run all tests**

Run: `pnpm -F @pumped-fn/lite test`
Expected: All 135 tests pass

**Step 2: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck:full`
Expected: No errors

---

## Task 10: Run C3 audit

**Step 1: Run audit**

Run: `/c3-skill:c3-audit`

Follow audit instructions to update `.c3/c3-2-lite/` docs if needed.

**Step 2: Commit any doc updates**

```bash
git add .c3/
git commit -m "docs(c3): update lite docs for service"
```

---

## Task 11: Run noslop cleanup

**Step 1: Run cleanup**

Run: `/noslop`

Follow instructions to remove any residual code smells.

**Step 2: Commit any fixes**

```bash
git add -A
git commit -m "chore(lite): cleanup from noslop"
```

---

## Task 12: Final verification and commit

**Step 1: Verify everything passes**

Run: `pnpm -F @pumped-fn/lite test && pnpm -F @pumped-fn/lite typecheck:full`
Expected: All tests pass, no type errors

**Step 2: Check for any uncommitted changes**

Run: `git status`
Expected: Clean working tree or only expected changes

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Add serviceSymbol |
| 2 | Add Service types |
| 3 | Write failing tests |
| 4 | Implement service() and isService() |
| 5 | Export from index |
| 6 | Test resolution |
| 7 | Test with deps |
| 8 | Test method binding |
| 9 | Full test suite |
| 10 | C3 audit |
| 11 | Noslop cleanup |
| 12 | Final verification |

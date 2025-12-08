# Service Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `service()` primitive for defining context-aware method containers.

**Architecture:** Service is a narrowed-down atom returning object where all methods take `(ctx: ExecutionContext, ...args)`. Resolved as singleton. Invoked via `ctx.exec({ fn, params })`.

**Progress Tracking:** Use TodoWrite for each task.

---

## Task 1: Add serviceSymbol and Service types

**Files:**
- `packages/lite/src/symbols.ts`
- `packages/lite/src/types.ts`

Add to `symbols.ts`:
```typescript
export const serviceSymbol: unique symbol = Symbol.for("@pumped-fn/lite/service")
```

Add `serviceSymbol` to imports in `types.ts`, then add inside Lite namespace:
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

Verify: `pnpm -F @pumped-fn/lite typecheck`

---

## Task 2: Implement service() and isService()

**Files:**
- Create: `packages/lite/src/service.ts`
- Modify: `packages/lite/src/index.ts`

Create `service.ts`:
```typescript
import { serviceSymbol } from "./symbols"
import type { Lite, MaybePromise } from "./types"

export interface ServiceConfig<T extends Lite.ServiceMethods, D extends Record<string, Lite.Dependency>> {
  deps?: D
  factory: Lite.ServiceFactory<T, D>
  tags?: Lite.Tagged<unknown>[]
}

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

export function isService(value: unknown): value is Lite.Service<Lite.ServiceMethods> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[serviceSymbol] === true
  )
}
```

Add to `index.ts`:
```typescript
export { service, isService } from "./service"
export { serviceSymbol } from "./symbols"  // add to existing symbols export
```

Verify: `pnpm -F @pumped-fn/lite typecheck`

---

## Task 3: Write tests

**Files:**
- Create: `packages/lite/tests/service.test.ts`

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
        query: (ctx, sql: string) => `result: ${sql}`,
      }),
    })

    expect(isService(dbService)).toBe(true)
    expect(isService({})).toBe(false)
  })

  it("resolves service with deps and calls via ctx.exec", async () => {
    const configAtom = atom({ factory: () => ({ prefix: "DB" }) })

    const dbService = service({
      deps: { config: configAtom },
      factory: (ctx, { config }) => ({
        query: (ctx, sql: string) => `[${config.prefix}] ${sql}`,
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
})
```

Verify: `pnpm -F @pumped-fn/lite test -- tests/service.test.ts`

---

## Task 4: Full verification

Run:
```bash
pnpm -F @pumped-fn/lite test
pnpm -F @pumped-fn/lite typecheck:full
```

---

## Task 5: C3 audit and cleanup

Run: `/c3-skill:c3-audit`
Run: `/noslop`

Commit any updates.

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Add symbol + types |
| 2 | Implement service() + isService() |
| 3 | Write tests |
| 4 | Full verification |
| 5 | C3 audit + cleanup |

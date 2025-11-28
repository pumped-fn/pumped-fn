# Controller-based Reactivity Implementation Plan

**Date:** 2025-11-28
**ADR:** [ADR-003 Controller-based Reactivity](../../.c3/adr/adr-003-controller-reactivity.md)
**Package:** `@pumped-fn/lite` (packages/lite/)

## Overview

This plan implements minimal reactivity for `@pumped-fn/lite` through:
1. Renaming `lazy` → `controller` and `Accessor` → `Controller`
2. Adding state machine (`idle` | `resolving` | `resolved` | `failed`)
3. Adding `ctx.invalidate()` for self-invalidation from within factories
4. Adding `controller.invalidate()` and `controller.on()` for external control
5. Adding `scope.on()` for event listening

## Prerequisites

```bash
cd packages/lite
pnpm test         # Verify baseline passes
pnpm typecheck    # Verify types compile
```

---

## Task 1: Add New Symbols

**File:** `packages/lite/src/symbols.ts`

### 1.1 Add controllerSymbol and controllerDepSymbol

**Current content:**
```typescript
export const atomSymbol: unique symbol = Symbol.for("@pumped-fn/effect/atom")
export const flowSymbol: unique symbol = Symbol.for("@pumped-fn/effect/flow")
export const tagSymbol: unique symbol = Symbol.for("@pumped-fn/effect/tag")
export const taggedSymbol: unique symbol = Symbol.for("@pumped-fn/effect/tagged")
export const lazySymbol: unique symbol = Symbol.for("@pumped-fn/effect/lazy")
export const presetSymbol: unique symbol = Symbol.for("@pumped-fn/effect/preset")
export const accessorSymbol: unique symbol = Symbol.for("@pumped-fn/effect/accessor")
export const tagExecutorSymbol: unique symbol = Symbol.for("@pumped-fn/effect/tag-executor")
```

**Replace with:**
```typescript
export const atomSymbol: unique symbol = Symbol.for("@pumped-fn/lite/atom")
export const flowSymbol: unique symbol = Symbol.for("@pumped-fn/lite/flow")
export const tagSymbol: unique symbol = Symbol.for("@pumped-fn/lite/tag")
export const taggedSymbol: unique symbol = Symbol.for("@pumped-fn/lite/tagged")
export const controllerDepSymbol: unique symbol = Symbol.for("@pumped-fn/lite/controller-dep")
export const presetSymbol: unique symbol = Symbol.for("@pumped-fn/lite/preset")
export const controllerSymbol: unique symbol = Symbol.for("@pumped-fn/lite/controller")
export const tagExecutorSymbol: unique symbol = Symbol.for("@pumped-fn/lite/tag-executor")
```

**Notes:**
- `lazySymbol` becomes `controllerDepSymbol` (the dependency marker)
- `accessorSymbol` becomes `controllerSymbol` (the runtime accessor)
- All symbols renamed from `@pumped-fn/effect` to `@pumped-fn/lite`

**Verification:**
```bash
pnpm typecheck  # Will fail until types.ts updated
```

---

## Task 2: Update Types

**File:** `packages/lite/src/types.ts`

### 2.1 Update symbol imports

**Current:**
```typescript
import type {
  atomSymbol,
  flowSymbol,
  tagSymbol,
  taggedSymbol,
  lazySymbol,
  presetSymbol,
  accessorSymbol,
  tagExecutorSymbol,
} from "./symbols"
```

**Replace with:**
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
} from "./symbols"
```

### 2.2 Add AtomState type

**Add after `MaybePromise` type:**
```typescript
export type AtomState = 'idle' | 'resolving' | 'resolved' | 'failed'
```

### 2.3 Update Scope interface

**Current:**
```typescript
export interface Scope {
  resolve<T>(atom: Atom<T>): Promise<T>
  accessor<T>(atom: Atom<T>): Accessor<T>
  release<T>(atom: Atom<T>): Promise<void>
  dispose(): Promise<void>
  createContext(options?: CreateContextOptions): ExecutionContext
}
```

**Replace with:**
```typescript
export interface Scope {
  resolve<T>(atom: Atom<T>): Promise<T>
  controller<T>(atom: Atom<T>): Controller<T>
  release<T>(atom: Atom<T>): Promise<void>
  dispose(): Promise<void>
  createContext(options?: CreateContextOptions): ExecutionContext
  on(event: AtomState, atom: Atom<unknown>, listener: () => void): () => void
}
```

### 2.4 Update ResolveContext interface

**Current:**
```typescript
export interface ResolveContext {
  cleanup(fn: () => MaybePromise<void>): void
  readonly scope: Scope
}
```

**Replace with:**
```typescript
export interface ResolveContext {
  cleanup(fn: () => MaybePromise<void>): void
  invalidate(): void
  readonly scope: Scope
}
```

### 2.5 Replace Accessor with Controller

**Current:**
```typescript
export interface Accessor<T> {
  readonly [accessorSymbol]: true
  get(): T
  resolve(): Promise<T>
  release(): Promise<void>
}
```

**Replace with:**
```typescript
export interface Controller<T> {
  readonly [controllerSymbol]: true
  readonly state: AtomState
  get(): T
  resolve(): Promise<T>
  release(): Promise<void>
  invalidate(): void
  on(listener: () => void): () => void
}
```

### 2.6 Replace Lazy with ControllerDep

**Current:**
```typescript
export interface Lazy<T> {
  readonly [lazySymbol]: true
  readonly atom: Atom<T>
}
```

**Replace with:**
```typescript
export interface ControllerDep<T> {
  readonly [controllerDepSymbol]: true
  readonly atom: Atom<T>
}
```

### 2.7 Update Dependency type

**Current:**
```typescript
export type Dependency =
  | Atom<unknown>
  | Lazy<unknown>
  | TagExecutor<unknown>
```

**Replace with:**
```typescript
export type Dependency =
  | Atom<unknown>
  | ControllerDep<unknown>
  | TagExecutor<unknown>
```

### 2.8 Update InferDep type

**Current:**
```typescript
export type InferDep<D> = D extends Atom<infer T>
  ? T
  : D extends Lazy<infer T>
    ? Accessor<T>
    : D extends TagExecutor<infer TOutput, infer _TTag>
      ? TOutput
      : never
```

**Replace with:**
```typescript
export type InferDep<D> = D extends Atom<infer T>
  ? T
  : D extends ControllerDep<infer T>
    ? Controller<T>
    : D extends TagExecutor<infer TOutput, infer _TTag>
      ? TOutput
      : never
```

**Verification:**
```bash
pnpm typecheck  # Will fail until atom.ts updated
```

---

## Task 3: Update Atom Module

**File:** `packages/lite/src/atom.ts`

### 3.1 Update imports

**Current:**
```typescript
import { atomSymbol, lazySymbol } from "./symbols"
import type { Lite, MaybePromise } from "./types"
```

**Replace with:**
```typescript
import { atomSymbol, controllerDepSymbol } from "./symbols"
import type { Lite, MaybePromise } from "./types"
```

### 3.2 Update atom function overloads

**Current (deps overload):**
```typescript
export function atom<
  T,
  const D extends Record<string, Lite.Atom<unknown> | Lite.Lazy<unknown> | { mode: string }>,
>(config: {
  deps: D
  factory: (ctx: Lite.ResolveContext, deps: Lite.InferDeps<D>) => MaybePromise<T>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Atom<T>
```

**Replace with:**
```typescript
export function atom<
  T,
  const D extends Record<string, Lite.Atom<unknown> | Lite.ControllerDep<unknown> | { mode: string }>,
>(config: {
  deps: D
  factory: (ctx: Lite.ResolveContext, deps: Lite.InferDeps<D>) => MaybePromise<T>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Atom<T>
```

### 3.3 Replace lazy with controller

**Current:**
```typescript
/**
 * Wraps an Atom for deferred resolution, providing an accessor instead of the resolved value.
 *
 * @param atom - The Atom to wrap
 * @returns A Lazy wrapper that resolves to an Accessor for the Atom
 *
 * @example
 * ```typescript
 * const lazyDb = lazy(dbAtom)
 * const myAtom = atom({
 *   deps: { db: lazyDb },
 *   factory: (ctx, { db }) => db.get()
 * })
 * ```
 */
export function lazy<T>(atom: Lite.Atom<T>): Lite.Lazy<T> {
  return {
    [lazySymbol]: true,
    atom,
  }
}

/**
 * Type guard to check if a value is a Lazy wrapper.
 *
 * @param value - The value to check
 * @returns True if the value is a Lazy wrapper, false otherwise
 *
 * @example
 * ```typescript
 * if (isLazy(dep)) {
 *   const accessor = await scope.resolveDeps({ dep })
 * }
 * ```
 */
export function isLazy(value: unknown): value is Lite.Lazy<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[lazySymbol] === true
  )
}
```

**Replace with:**
```typescript
/**
 * Wraps an Atom to receive a Controller instead of the resolved value.
 * The Controller provides full lifecycle control: get, resolve, release, invalidate, and subscribe.
 *
 * @param atom - The Atom to wrap
 * @returns A ControllerDep that resolves to a Controller for the Atom
 *
 * @example
 * ```typescript
 * const configAtom = atom({ factory: () => fetchConfig() })
 * const serverAtom = atom({
 *   deps: { config: controller(configAtom) },
 *   factory: (ctx, { config }) => {
 *     const unsub = config.on(() => ctx.invalidate())
 *     ctx.cleanup(unsub)
 *     return createServer(config.get().port)
 *   }
 * })
 * ```
 */
export function controller<T>(atom: Lite.Atom<T>): Lite.ControllerDep<T> {
  return {
    [controllerDepSymbol]: true,
    atom,
  }
}

/**
 * Type guard to check if a value is a ControllerDep wrapper.
 *
 * @param value - The value to check
 * @returns True if the value is a ControllerDep wrapper, false otherwise
 *
 * @example
 * ```typescript
 * if (isControllerDep(dep)) {
 *   const ctrl = scope.controller(dep.atom)
 * }
 * ```
 */
export function isControllerDep(value: unknown): value is Lite.ControllerDep<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[controllerDepSymbol] === true
  )
}
```

**Verification:**
```bash
pnpm typecheck  # Will fail until scope.ts updated
```

---

## Task 4: Implement Controller in Scope

**File:** `packages/lite/src/scope.ts`

This is the largest change. We need to:
1. Add state tracking with AtomState
2. Implement ControllerImpl with all new methods
3. Add invalidation logic
4. Add event emission

### 4.1 Update imports

**Current:**
```typescript
import { accessorSymbol, tagExecutorSymbol } from "./symbols"
import type { Lite, MaybePromise } from "./types"
import { isAtom, isLazy } from "./atom"
```

**Replace with:**
```typescript
import { controllerSymbol, tagExecutorSymbol } from "./symbols"
import type { Lite, MaybePromise, AtomState } from "./types"
import { isAtom, isControllerDep } from "./atom"
```

### 4.2 Update ResolveState interface

**Current:**
```typescript
interface ResolveState<T> {
  value: T
  cleanups: (() => MaybePromise<void>)[]
}
```

**Replace with:**
```typescript
interface AtomEntry<T> {
  state: AtomState
  value?: T
  error?: Error
  cleanups: (() => MaybePromise<void>)[]
  listeners: Set<() => void>
  pendingInvalidate: boolean
}
```

### 4.3 Implement ControllerImpl

**Current AccessorImpl:**
```typescript
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
```

**Replace with:**
```typescript
class ControllerImpl<T> implements Lite.Controller<T> {
  readonly [controllerSymbol] = true

  constructor(
    private atom: Lite.Atom<T>,
    private scope: ScopeImpl
  ) {}

  get state(): AtomState {
    const entry = this.scope.getEntry(this.atom)
    return entry?.state ?? 'idle'
  }

  get(): T {
    const entry = this.scope.getEntry(this.atom)
    if (!entry) {
      throw new Error("Atom not resolved")
    }
    if (entry.state === 'failed') {
      throw entry.error
    }
    if (entry.state === 'idle') {
      throw new Error("Atom not resolved")
    }
    return entry.value as T
  }

  async resolve(): Promise<T> {
    return this.scope.resolve(this.atom)
  }

  async release(): Promise<void> {
    return this.scope.release(this.atom)
  }

  invalidate(): void {
    this.scope.invalidate(this.atom)
  }

  on(listener: () => void): () => void {
    return this.scope.addListener(this.atom, listener)
  }
}
```

### 4.4 Update ScopeImpl

**Replace the entire ScopeImpl class with:**

```typescript
class ScopeImpl implements Lite.Scope {
  private cache = new Map<Lite.Atom<unknown>, AtomEntry<unknown>>()
  private presets = new Map<Lite.Atom<unknown>, unknown | Lite.Atom<unknown>>()
  private resolving = new Set<Lite.Atom<unknown>>()
  private pending = new Map<Lite.Atom<unknown>, Promise<unknown>>()
  private stateListeners = new Map<AtomState, Map<Lite.Atom<unknown>, Set<() => void>>>()
  readonly extensions: Lite.Extension[]
  readonly tags: Lite.Tagged<unknown>[]

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

  getEntry<T>(atom: Lite.Atom<T>): AtomEntry<T> | undefined {
    return this.cache.get(atom) as AtomEntry<T> | undefined
  }

  private getOrCreateEntry<T>(atom: Lite.Atom<T>): AtomEntry<T> {
    let entry = this.cache.get(atom) as AtomEntry<T> | undefined
    if (!entry) {
      entry = {
        state: 'idle',
        cleanups: [],
        listeners: new Set(),
        pendingInvalidate: false,
      }
      this.cache.set(atom, entry as AtomEntry<unknown>)
    }
    return entry
  }

  addListener<T>(atom: Lite.Atom<T>, listener: () => void): () => void {
    const entry = this.getOrCreateEntry(atom)
    entry.listeners.add(listener)
    return () => {
      entry.listeners.delete(listener)
    }
  }

  private notifyListeners<T>(atom: Lite.Atom<T>): void {
    const entry = this.cache.get(atom)
    if (entry) {
      for (const listener of entry.listeners) {
        listener()
      }
    }
  }

  private emitStateChange(state: AtomState, atom: Lite.Atom<unknown>): void {
    const stateMap = this.stateListeners.get(state)
    if (stateMap) {
      const listeners = stateMap.get(atom)
      if (listeners) {
        for (const listener of listeners) {
          listener()
        }
      }
    }
  }

  on(event: AtomState, atom: Lite.Atom<unknown>, listener: () => void): () => void {
    let stateMap = this.stateListeners.get(event)
    if (!stateMap) {
      stateMap = new Map()
      this.stateListeners.set(event, stateMap)
    }
    let listeners = stateMap.get(atom)
    if (!listeners) {
      listeners = new Set()
      stateMap.set(atom, listeners)
    }
    listeners.add(listener)
    return () => {
      listeners!.delete(listener)
      if (listeners!.size === 0) {
        stateMap!.delete(atom)
      }
    }
  }

  async resolve<T>(atom: Lite.Atom<T>): Promise<T> {
    const entry = this.cache.get(atom) as AtomEntry<T> | undefined
    if (entry?.state === 'resolved') {
      return entry.value as T
    }

    const pendingPromise = this.pending.get(atom)
    if (pendingPromise) {
      return pendingPromise as Promise<T>
    }

    if (this.resolving.has(atom)) {
      throw new Error("Circular dependency detected")
    }

    const presetValue = this.presets.get(atom)
    if (presetValue !== undefined) {
      if (isAtom(presetValue)) {
        return this.resolve(presetValue as Lite.Atom<T>)
      }
      const newEntry = this.getOrCreateEntry(atom)
      newEntry.state = 'resolved'
      newEntry.value = presetValue as T
      this.emitStateChange('resolved', atom)
      this.notifyListeners(atom)
      return newEntry.value
    }

    this.resolving.add(atom)

    const promise = this.doResolve(atom)
    this.pending.set(atom, promise as Promise<unknown>)

    try {
      return await promise
    } finally {
      this.resolving.delete(atom)
      this.pending.delete(atom)
    }
  }

  private async doResolve<T>(atom: Lite.Atom<T>): Promise<T> {
    const entry = this.getOrCreateEntry(atom)
    entry.state = 'resolving'
    this.emitStateChange('resolving', atom)
    this.notifyListeners(atom)

    const resolvedDeps = await this.resolveDeps(atom.deps)

    let invalidateCalled = false
    const ctx: Lite.ResolveContext = {
      cleanup: (fn) => entry.cleanups.push(fn),
      invalidate: () => {
        invalidateCalled = true
      },
      scope: this,
    }

    const factory = atom.factory as (
      ctx: Lite.ResolveContext,
      deps?: Record<string, unknown>
    ) => MaybePromise<T>

    const doResolve = async () => {
      if (atom.deps && Object.keys(atom.deps).length > 0) {
        return factory(ctx, resolvedDeps)
      } else {
        return factory(ctx)
      }
    }

    try {
      const value = await this.applyResolveExtensions(atom, doResolve)
      entry.state = 'resolved'
      entry.value = value
      entry.error = undefined
      this.emitStateChange('resolved', atom)
      this.notifyListeners(atom)

      if (invalidateCalled) {
        queueMicrotask(() => this.invalidate(atom))
      }

      return value
    } catch (err) {
      entry.state = 'failed'
      entry.error = err instanceof Error ? err : new Error(String(err))
      entry.value = undefined
      this.emitStateChange('failed', atom)
      this.notifyListeners(atom)
      throw entry.error
    }
  }

  private async applyResolveExtensions<T>(
    atom: Lite.Atom<T>,
    doResolve: () => Promise<T>
  ): Promise<T> {
    let next = doResolve

    for (let i = this.extensions.length - 1; i >= 0; i--) {
      const ext = this.extensions[i]!
      if (ext.wrapResolve) {
        const currentNext = next
        const wrap = ext.wrapResolve.bind(ext)
        next = () => wrap(currentNext, atom, this)
      }
    }

    return next()
  }

  async resolveDeps(
    deps: Record<string, Lite.Dependency> | undefined,
    tagSource?: Lite.Tagged<unknown>[]
  ): Promise<Record<string, unknown>> {
    if (!deps) return {}

    const result: Record<string, unknown> = {}
    const tags = tagSource ?? this.tags

    for (const [key, dep] of Object.entries(deps)) {
      if (isAtom(dep)) {
        result[key] = await this.resolve(dep)
      } else if (isControllerDep(dep)) {
        result[key] = new ControllerImpl(dep.atom, this)
      } else if (tagExecutorSymbol in (dep as object)) {
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

  controller<T>(atom: Lite.Atom<T>): Lite.Controller<T> {
    return new ControllerImpl(atom, this)
  }

  invalidate<T>(atom: Lite.Atom<T>): void {
    const entry = this.cache.get(atom)
    if (!entry) return

    if (entry.state === 'resolving') {
      entry.pendingInvalidate = true
      return
    }

    this.doInvalidate(atom, entry as AtomEntry<T>)
  }

  private async doInvalidate<T>(atom: Lite.Atom<T>, entry: AtomEntry<T>): Promise<void> {
    for (let i = entry.cleanups.length - 1; i >= 0; i--) {
      await entry.cleanups[i]!()
    }
    entry.cleanups = []
    entry.value = undefined
    entry.error = undefined
    entry.pendingInvalidate = false

    this.resolve(atom).catch(() => {})
  }

  async release<T>(atom: Lite.Atom<T>): Promise<void> {
    const entry = this.cache.get(atom)
    if (!entry) return

    for (let i = entry.cleanups.length - 1; i >= 0; i--) {
      await entry.cleanups[i]!()
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
```

### 4.5 Update ExecutionContextImpl resolveDeps call

No changes needed - it already calls `this.scope.resolveDeps()` which we've updated.

**Verification:**
```bash
pnpm typecheck  # Will fail until index.ts updated
```

---

## Task 5: Update Index Exports

**File:** `packages/lite/src/index.ts`

**Current:**
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
  tagExecutorSymbol,
} from "./symbols"
export { tag, tags, isTag, isTagged, isTagExecutor } from "./tag"
export { atom, isAtom, lazy, isLazy } from "./atom"
export { flow, isFlow } from "./flow"
export { preset, isPreset } from "./preset"
export { createScope } from "./scope"

export const VERSION = "0.0.1"
```

**Replace with:**
```typescript
export type { Lite, AtomState } from "./types"
export {
  atomSymbol,
  flowSymbol,
  tagSymbol,
  taggedSymbol,
  controllerDepSymbol,
  presetSymbol,
  controllerSymbol,
  tagExecutorSymbol,
} from "./symbols"
export { tag, tags, isTag, isTagged, isTagExecutor } from "./tag"
export { atom, isAtom, controller, isControllerDep } from "./atom"
export { flow, isFlow } from "./flow"
export { preset, isPreset } from "./preset"
export { createScope } from "./scope"

export const VERSION = "0.0.1"
```

**Verification:**
```bash
pnpm typecheck  # Should pass now
```

---

## Task 6: Update Tests

**File:** `packages/lite/tests/scope.test.ts`

### 6.1 Update imports

**Current:**
```typescript
import { atom, lazy } from "../src/atom"
```

**Replace with:**
```typescript
import { atom, controller } from "../src/atom"
```

### 6.2 Update createScope test

**Current:**
```typescript
it("creates a scope", async () => {
  const scope = await createScope()
  expect(scope).toBeDefined()
  expect(scope.resolve).toBeTypeOf("function")
  expect(scope.accessor).toBeTypeOf("function")
  expect(scope.release).toBeTypeOf("function")
  expect(scope.dispose).toBeTypeOf("function")
})
```

**Replace with:**
```typescript
it("creates a scope", async () => {
  const scope = await createScope()
  expect(scope).toBeDefined()
  expect(scope.resolve).toBeTypeOf("function")
  expect(scope.controller).toBeTypeOf("function")
  expect(scope.release).toBeTypeOf("function")
  expect(scope.dispose).toBeTypeOf("function")
  expect(scope.on).toBeTypeOf("function")
})
```

### 6.3 Rename accessor tests to controller tests

**Current:**
```typescript
describe("scope.accessor()", () => {
  it("returns accessor for atom", async () => {
    const scope = await createScope()
    const myAtom = atom({ factory: () => 42 })

    const accessor = scope.accessor(myAtom)
    expect(accessor).toBeDefined()

    await accessor.resolve()
    expect(accessor.get()).toBe(42)
  })

  it("accessor.get() throws if not resolved", async () => {
    const scope = await createScope()
    const myAtom = atom({ factory: () => 42 })

    const accessor = scope.accessor(myAtom)
    expect(() => accessor.get()).toThrow()
  })
})
```

**Replace with:**
```typescript
describe("scope.controller()", () => {
  it("returns controller for atom", async () => {
    const scope = await createScope()
    const myAtom = atom({ factory: () => 42 })

    const ctrl = scope.controller(myAtom)
    expect(ctrl).toBeDefined()
    expect(ctrl.state).toBe('idle')

    await ctrl.resolve()
    expect(ctrl.state).toBe('resolved')
    expect(ctrl.get()).toBe(42)
  })

  it("controller.get() throws if not resolved", async () => {
    const scope = await createScope()
    const myAtom = atom({ factory: () => 42 })

    const ctrl = scope.controller(myAtom)
    expect(() => ctrl.get()).toThrow("not resolved")
  })

  it("controller.get() throws error on failed state", async () => {
    const scope = await createScope()
    const myAtom = atom({
      factory: () => {
        throw new Error("factory failed")
      }
    })

    const ctrl = scope.controller(myAtom)
    await expect(ctrl.resolve()).rejects.toThrow("factory failed")
    expect(ctrl.state).toBe('failed')
    expect(() => ctrl.get()).toThrow("factory failed")
  })

  it("controller.get() returns stale value during resolving", async () => {
    const scope = await createScope()
    let resolveCount = 0
    const myAtom = atom({
      factory: async () => {
        resolveCount++
        await new Promise(r => setTimeout(r, 50))
        return resolveCount
      }
    })

    const ctrl = scope.controller(myAtom)
    await ctrl.resolve()
    expect(ctrl.get()).toBe(1)

    ctrl.invalidate()
    expect(ctrl.state).toBe('resolving')
    expect(ctrl.get()).toBe(1)

    await new Promise(r => setTimeout(r, 100))
    expect(ctrl.state).toBe('resolved')
    expect(ctrl.get()).toBe(2)
  })
})
```

### 6.4 Rename lazy deps tests to controller deps tests

**Current:**
```typescript
describe("lazy deps", () => {
  it("resolves lazy dep as accessor", async () => {
    const scope = await createScope()
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
```

**Replace with:**
```typescript
describe("controller deps", () => {
  it("resolves controller dep", async () => {
    const scope = await createScope()
    const optionalAtom = atom({ factory: () => "optional" })
    const mainAtom = atom({
      deps: { opt: controller(optionalAtom) },
      factory: async (ctx, { opt }) => {
        await opt.resolve()
        return opt.get()
      },
    })

    const result = await scope.resolve(mainAtom)
    expect(result).toBe("optional")
  })

  it("controller dep has full interface", async () => {
    const scope = await createScope()
    const innerAtom = atom({ factory: () => 42 })
    const outerAtom = atom({
      deps: { inner: controller(innerAtom) },
      factory: async (ctx, { inner }) => {
        expect(inner.state).toBe('idle')
        await inner.resolve()
        expect(inner.state).toBe('resolved')
        expect(inner.get()).toBe(42)
        expect(typeof inner.invalidate).toBe('function')
        expect(typeof inner.on).toBe('function')
        return inner.get()
      },
    })

    const result = await scope.resolve(outerAtom)
    expect(result).toBe(42)
  })
})
```

### 6.5 Rename accessor edge cases to controller edge cases

**Current:**
```typescript
describe("accessor edge cases", () => {
  it("throws when get called before resolve", async () => {
    const scope = await createScope()
    const myAtom = atom({ factory: () => 42 })

    const accessor = scope.accessor(myAtom)
    expect(() => accessor.get()).toThrow("not resolved")
  })
})
```

**Replace with:**
```typescript
describe("controller edge cases", () => {
  it("throws when get called before resolve", async () => {
    const scope = await createScope()
    const myAtom = atom({ factory: () => 42 })

    const ctrl = scope.controller(myAtom)
    expect(() => ctrl.get()).toThrow("not resolved")
  })
})
```

### 6.6 Add new test sections for reactivity

**Add these new describe blocks:**

```typescript
describe("ctx.invalidate()", () => {
  it("schedules re-resolution after factory completes", async () => {
    const scope = await createScope()
    let resolveCount = 0
    const myAtom = atom({
      factory: (ctx) => {
        resolveCount++
        if (resolveCount === 1) {
          ctx.invalidate()
        }
        return resolveCount
      }
    })

    const result = await scope.resolve(myAtom)
    expect(result).toBe(1)

    await new Promise(r => setTimeout(r, 10))
    const ctrl = scope.controller(myAtom)
    expect(ctrl.get()).toBe(2)
  })

  it("does not interrupt current factory execution", async () => {
    const scope = await createScope()
    const events: string[] = []
    const myAtom = atom({
      factory: async (ctx) => {
        events.push("start")
        ctx.invalidate()
        events.push("after-invalidate")
        await new Promise(r => setTimeout(r, 10))
        events.push("end")
        return events.length
      }
    })

    await scope.resolve(myAtom)
    expect(events).toEqual(["start", "after-invalidate", "end"])
  })
})

describe("controller.invalidate()", () => {
  it("runs cleanups in LIFO order", async () => {
    const scope = await createScope()
    const order: number[] = []
    const myAtom = atom({
      factory: (ctx) => {
        ctx.cleanup(() => { order.push(1) })
        ctx.cleanup(() => { order.push(2) })
        ctx.cleanup(() => { order.push(3) })
        return 42
      }
    })

    await scope.resolve(myAtom)
    const ctrl = scope.controller(myAtom)
    ctrl.invalidate()

    await new Promise(r => setTimeout(r, 10))
    expect(order).toEqual([3, 2, 1])
  })

  it("triggers re-resolution", async () => {
    const scope = await createScope()
    let resolveCount = 0
    const myAtom = atom({
      factory: () => {
        resolveCount++
        return resolveCount
      }
    })

    await scope.resolve(myAtom)
    expect(resolveCount).toBe(1)

    const ctrl = scope.controller(myAtom)
    ctrl.invalidate()

    await new Promise(r => setTimeout(r, 10))
    expect(resolveCount).toBe(2)
    expect(ctrl.get()).toBe(2)
  })
})

describe("controller.on()", () => {
  it("notifies on state change", async () => {
    const scope = await createScope()
    const states: string[] = []
    const myAtom = atom({
      factory: async () => {
        await new Promise(r => setTimeout(r, 10))
        return 42
      }
    })

    const ctrl = scope.controller(myAtom)
    ctrl.on(() => states.push(ctrl.state))

    await ctrl.resolve()

    expect(states).toContain('resolving')
    expect(states).toContain('resolved')
  })

  it("returns unsubscribe function", async () => {
    const scope = await createScope()
    let notifyCount = 0
    const myAtom = atom({ factory: () => 42 })

    const ctrl = scope.controller(myAtom)
    const unsub = ctrl.on(() => notifyCount++)

    await ctrl.resolve()
    const countAfterResolve = notifyCount

    unsub()
    ctrl.invalidate()
    await new Promise(r => setTimeout(r, 10))

    expect(notifyCount).toBe(countAfterResolve)
  })
})

describe("scope.on()", () => {
  it("fires for specific state transitions", async () => {
    const scope = await createScope()
    const events: string[] = []
    const myAtom = atom({
      factory: async () => {
        await new Promise(r => setTimeout(r, 10))
        return 42
      }
    })

    scope.on('resolving', myAtom, () => events.push('resolving'))
    scope.on('resolved', myAtom, () => events.push('resolved'))

    await scope.resolve(myAtom)

    expect(events).toEqual(['resolving', 'resolved'])
  })

  it("fires failed event on error", async () => {
    const scope = await createScope()
    let failedCalled = false
    const myAtom = atom({
      factory: () => {
        throw new Error("oops")
      }
    })

    scope.on('failed', myAtom, () => { failedCalled = true })

    await expect(scope.resolve(myAtom)).rejects.toThrow("oops")
    expect(failedCalled).toBe(true)
  })

  it("returns unsubscribe function", async () => {
    const scope = await createScope()
    let count = 0
    const myAtom = atom({ factory: () => count++ })

    const unsub = scope.on('resolved', myAtom, () => count += 10)

    await scope.resolve(myAtom)
    expect(count).toBe(11)

    unsub()
    await scope.release(myAtom)
    await scope.resolve(myAtom)
    expect(count).toBe(12)
  })
})

describe("self-invalidating atom", () => {
  it("supports polling pattern", async () => {
    const scope = await createScope()
    let pollCount = 0
    const myAtom = atom({
      factory: (ctx) => {
        pollCount++
        if (pollCount < 3) {
          const timeout = setTimeout(() => ctx.invalidate(), 20)
          ctx.cleanup(() => clearTimeout(timeout))
        }
        return pollCount
      }
    })

    await scope.resolve(myAtom)
    expect(pollCount).toBe(1)

    await new Promise(r => setTimeout(r, 100))
    expect(pollCount).toBe(3)
  })
})

describe("downstream subscribes to upstream", () => {
  it("invalidates when upstream changes", async () => {
    const scope = await createScope()
    let configValue = "initial"
    let serverCreateCount = 0

    const configAtom = atom({
      factory: () => configValue
    })

    const serverAtom = atom({
      deps: { config: controller(configAtom) },
      factory: (ctx, { config }) => {
        serverCreateCount++
        const unsub = config.on(() => ctx.invalidate())
        ctx.cleanup(unsub)
        return `server:${config.get()}`
      }
    })

    await scope.resolve(serverAtom)
    expect(serverCreateCount).toBe(1)

    configValue = "updated"
    const configCtrl = scope.controller(configAtom)
    configCtrl.invalidate()

    await new Promise(r => setTimeout(r, 50))
    const serverCtrl = scope.controller(serverAtom)
    expect(serverCtrl.get()).toBe("server:updated")
    expect(serverCreateCount).toBe(2)
  })
})
```

**Verification:**
```bash
pnpm test  # All tests should pass
```

---

## Task 7: Rename Package (Optional - if not already done)

**File:** `packages/lite/package.json`

**Update name field:**
```json
{
  "name": "@pumped-fn/lite",
  ...
}
```

---

## Verification Checklist

After completing all tasks, run:

```bash
cd packages/lite
pnpm typecheck       # Types compile
pnpm test            # All tests pass
```

### Type System Verification
- [ ] `controller(atom)` returns `ControllerDep<T>` with correct T
- [ ] `Controller<T>.get()` returns T
- [ ] `Controller<T>.on()` accepts `() => void` listener, returns unsubscribe
- [ ] `scope.on()` is type-safe for AtomState events

### Runtime Behavior Verification
- [ ] `ctx.invalidate()` schedules re-resolution after factory completes
- [ ] `controller.invalidate()` runs cleanups in LIFO order
- [ ] `controller.get()` returns stale value during resolving
- [ ] `controller.get()` throws on failed state
- [ ] `controller.on()` notifies on any state change
- [ ] `scope.on()` fires for specific state transitions
- [ ] Multiple subscribers receive notifications
- [ ] Unsubscribe functions work correctly

### Integration Verification
- [ ] Downstream atoms can subscribe to upstream changes
- [ ] Cleanup runs before re-resolution
- [ ] Self-invalidating atoms work (polling pattern)

---

## Implementation Order

Execute tasks in this order:

1. **Task 1**: Add symbols (quick, foundation)
2. **Task 2**: Update types (defines contracts)
3. **Task 3**: Update atom module (controller helper)
4. **Task 4**: Implement scope (main logic)
5. **Task 5**: Update exports (public API)
6. **Task 6**: Update tests (verify everything works)
7. **Task 7**: Rename package (if needed)

After each task, run `pnpm typecheck` to catch issues early.

# @pumped-fn/effect Design

## Overview

A lightweight, performance-focused version of pumped-fn built from scratch. Retains core concepts from `@pumped-fn/core-next` while optimizing for minimal API surface, high DX, and runtime performance.

## Goals

1. **Minimal API** - fewer functions, consistent patterns
2. **High DX** - intuitive, self-documenting, great TypeScript inference
3. **Performance** - monomorphic calls, minimal allocations, no polymorphic overhead
4. **Emulatable** - can build higher-level patterns without overreaching

## What's Included

- Scope (runtime container)
- Atom (singleton executor)
- Flow (per-request executor)
- Tag (metadata system)
- Accessor (lazy resolution handle)
- Extension (cross-cutting hooks)
- Lifecycle (cleanup management)

## What's NOT Included (yet)

- Multi (keyed executor pools)
- Reactivity (auto-re-resolve)
- Static (accessor after resolving)
- Schema validation (optional, not enforced)

---

## Core Concepts

### Atom

An atom is a singleton unit of work. Resolved once per scope, cached.

```typescript
// No dependencies
const config = atom({
  factory: (ctx) => ({ port: 3000 })
})

// With dependencies (object only - no array deps)
const server = atom({
  deps: { cfg: config, log: logger },
  factory: (ctx, { cfg, log }) => {
    ctx.cleanup(() => server.close())
    return createServer(cfg, log)
  }
})

// With lazy dependency
const worker = atom({
  deps: { cfg: config, opt: lazy(optionalService) },
  factory: async (ctx, { cfg, opt }) => {
    if (needsOptional) {
      await opt.resolve()
      const service = opt.get()
    }
    return new Worker(cfg)
  }
})

// With tags
const cached = atom({
  deps: { db: dbAtom },
  tags: [cacheTag("1h"), retryTag(3)],
  factory: (ctx, { db }) => new CachedRepo(db)
})
```

### Flow

A flow is a per-request unit of work. Executed each time, not cached.

```typescript
// No dependencies
const simple = flow({
  factory: (ctx) => processInput(ctx.input)
})

// With dependencies
const handler = flow({
  deps: {
    db: dbAtom,
    reqId: tags.required(requestId),
    user: tags.optional(userId)
  },
  tags: [timeoutTag(5000)],
  factory: (ctx, { db, reqId, user }) => {
    const input = ctx.input
    ctx.onClose(() => logCompletion(reqId))
    return handleRequest(db, reqId, user, input)
  }
})
```

### Scope

Runtime container that resolves atoms and manages lifecycle.

```typescript
const scope = createScope({
  extensions: [loggingExt, tracingExt],
  tags: [appVersion("1.0")],
  presets: [preset(configAtom, mockConfig)]
})

// Resolve atom - returns value (always async)
const cfg = await scope.resolve(config)

// Get accessor for lifecycle control
const accessor = scope.accessor(config)
await accessor.resolve()  // resolve if not already
const value = accessor.get()
accessor.release()

// Release specific atom
scope.release(configAtom)

// Dispose entire scope
scope.dispose()
```

### ExecutionContext

Request-scoped context for executing flows.

```typescript
const ctx = scope.createContext({
  tags: [requestId("abc-123")]
})

// Execute flow
const result = await ctx.exec({
  flow: handler,
  input: requestData,
  tags: [traceId("xyz")]
})

// Execute plain function
const computed = await ctx.exec({
  fn: calculateSomething,
  params: [arg1, arg2],
  tags: [operationTag("compute")]
})

// Cleanup
ctx.close()
```

### Accessor

Handle for lazy resolution and lifecycle control.

```typescript
const accessor = scope.accessor(myAtom)

// Resolve (if not already)
await accessor.resolve()

// Get cached value
const value = accessor.get()

// Release (cleanup and uncache)
accessor.release()
```

### Tags

Type-safe metadata system.

```typescript
// Create tags
const requestId = tag<string>({ label: "requestId" })
const retryCount = tag<number>({ label: "retry", default: 3 })
const validated = tag({ schema: userSchema, label: "user" })

// Read from source
const id = requestId.get(source)      // throws if missing (unless has default)
const id = requestId.find(source)     // undefined if missing (or default)
const ids = requestId.collect(source) // all values as array

// Use as dependencies
atom({
  deps: {
    reqId: tags.required(requestId),    // throws if missing
    user: tags.optional(userId),        // undefined if missing
    features: tags.all(featureFlags)    // array of all values
  },
  factory: (ctx, { reqId, user, features }) => ...
})

// Tag hierarchy (most specific wins):
// execution tags → executionContext tags → scope tags → flow/atom tags
```

### Preset

Override atom values in scope.

```typescript
// Static value
preset(configAtom, { port: 8080 })

// Another atom
preset(configAtom, testConfigAtom)

// Usage
const scope = createScope({
  presets: [
    preset(dbAtom, mockDb),
    preset(loggerAtom, testLogger)
  ]
})
```

### Extension

Cross-cutting behavior hooks.

```typescript
const loggingExt = {
  name: "logging",

  init: (scope) => {
    console.log("Scope created")
  },

  wrapResolve: (next, atom, scope) => {
    console.log("Resolving atom")
    return next()
  },

  wrapExec: (next, target, ctx) => {
    console.log("Executing", target)
    return next()
  },

  dispose: (scope) => {
    console.log("Scope disposed")
  }
}

const scope = createScope({
  extensions: [loggingExt]
})
```

---

## Context APIs

### ResolveContext (passed to atom factory)

```typescript
interface ResolveContext {
  cleanup(fn: () => void | Promise<void>): void
  scope: Scope
}
```

### ExecutionContext (passed to flow factory via ctx)

```typescript
interface ExecutionContext {
  input: unknown                    // input from exec()
  scope: Scope                      // parent scope

  exec(options: ExecOptions): Promise<unknown>
  onClose(fn: () => void | Promise<void>): void
  close(): Promise<void>
}

type ExecOptions =
  | { flow: Flow; input: unknown; tags?: Tagged[] }
  | { fn: Function; params: unknown[]; tags?: Tagged[] }
```

---

## Type Signatures

### atom()

```typescript
function atom<T>(config: {
  factory: (ctx: ResolveContext) => T | Promise<T>
  tags?: Tagged[]
}): Atom<T>

function atom<T, D extends Record<string, Dependency>>(config: {
  deps: D
  factory: (ctx: ResolveContext, deps: InferDeps<D>) => T | Promise<T>
  tags?: Tagged[]
}): Atom<T>
```

### flow()

```typescript
function flow<T>(config: {
  factory: (ctx: ExecutionContext) => T | Promise<T>
  tags?: Tagged[]
}): Flow<T>

function flow<T, D extends Record<string, Dependency>>(config: {
  deps: D
  factory: (ctx: ExecutionContext, deps: InferDeps<D>) => T | Promise<T>
  tags?: Tagged[]
}): Flow<T>
```

### tag()

```typescript
function tag<T>(options: { label: string }): Tag<T, false>
function tag<T>(options: { label: string; default: T }): Tag<T, true>
function tag<T>(options: { schema: Schema<T>; label: string }): Tag<T, false>
function tag<T>(options: { schema: Schema<T>; label: string; default: T }): Tag<T, true>
```

### createScope()

```typescript
function createScope(options?: {
  extensions?: Extension[]
  tags?: Tagged[]
  presets?: Preset[]
}): Scope
```

### lazy()

```typescript
function lazy<T>(atom: Atom<T>): LazyAtom<T>
// In deps, resolves to Accessor<T> instead of T
```

### preset()

```typescript
function preset<T>(atom: Atom<T>, value: T): Preset
function preset<T>(atom: Atom<T>, replacement: Atom<T>): Preset
```

---

## Design Decisions

### Object-only dependencies

Array deps were removed to:
1. Eliminate polymorphic dispatch overhead
2. Improve TypeScript type inference
3. Provide self-documenting named dependencies
4. Simplify mental model (one pattern)

### Input on ctx for flows

Flow factory is `(ctx, deps)` with input accessed via `ctx.input` to:
1. Keep positional args to two
2. Make deps consistently the second param (same as atom)
3. Allow input to be typed per-flow

### Tag resolution via deps

All tag access goes through deps declaration:
1. Enables resolution-time optimization
2. Makes dependencies explicit
3. Prevents hidden tag lookups in factory body

### Merged tag hierarchy

Tags resolve from most specific to least specific:
- execution tags → executionContext tags → scope tags → flow/atom tags

First match wins.

### Minimal context APIs

ResolveContext: `cleanup()`, `scope`
ExecutionContext: `input`, `exec()`, `onClose()`, `close()`, `scope`

No tag read/write methods on context - use deps for tag access.

---

## Public API Surface

### Functions

- `atom(config)` - create singleton atom
- `flow(config)` - create per-request flow
- `tag(options)` - create metadata tag
- `createScope(options)` - create runtime scope
- `lazy(atom)` - wrap atom for lazy resolution
- `preset(atom, value)` - create preset override

### Namespaces

- `tags.required(tag)` - tag dep that throws if missing
- `tags.optional(tag)` - tag dep that returns undefined if missing
- `tags.all(tag)` - tag dep that returns array of all values

### Types

- `Atom<T>` - singleton executor
- `Flow<T>` - per-request executor
- `Tag<T, HasDefault>` - metadata definition
- `Tagged<T>` - concrete tag value
- `Scope` - runtime container
- `Accessor<T>` - lazy resolution handle
- `ResolveContext` - atom factory context
- `ExecutionContext` - flow factory context
- `Extension` - cross-cutting hooks
- `Preset` - value override

---

## Next Steps

1. Set up package structure (`packages/effect/`)
2. Implement core types
3. Implement Scope and resolution
4. Implement Atom
5. Implement Flow and ExecutionContext
6. Implement Tag system
7. Implement Extension hooks
8. Add tests
9. Performance benchmarks vs core-next

---
id: c3-101
c3-version: 3
title: Scope & Executor
summary: >
  Core dependency injection - executor creation, scope lifecycle,
  dependency resolution, and accessor pattern.
---

# Scope & Executor

## Overview {#c3-101-overview}
<!-- Foundation of the DI system -->

The Scope and Executor subsystem is the foundation of pumped-fn's dependency injection:

- **Executor** - A declarative unit describing how to produce a value
- **Scope** - Runtime container that resolves executors and manages their lifecycle
- **Accessor** - Handle providing access to resolved values with lifecycle control

The key insight: executors are **definitions** (what to create), scopes are **runtime** (where things live).

## Concepts {#c3-101-concepts}

### Executor

An executor is a blueprint for producing a value. Think of it as a "recipe" - it describes:

1. **Factory** - The function that creates the value
2. **Dependencies** - Other executors this one needs
3. **Tags** - Metadata attached to the executor
4. **Compiled** - JIT-compiled optimized factory (via Sucrose analysis)

Executors are created declaratively at module load time. At creation time, Sucrose analyzes the factory function and generates an optimized compiled version. The compiled factory runs when resolved within a scope.

**Creation patterns:**

| Pattern | Use Case |
|---------|----------|
| `provide(factory)` | Leaf values with no dependencies |
| `derive(deps, factory)` | Values that depend on other executors |
| `preset(executor, value)` | Override an executor's value in a scope |

**Executor variants:**

Every executor has three "channels" for different resolution behaviors:

| Channel | Behavior | Use Case |
|---------|----------|----------|
| `executor` | Resolve and return value directly | Default - get the actual value |
| `executor.lazy` | Return accessor without resolving | Deferred access, optional dependencies |
| `executor.reactive` | Auto-re-resolve when dependency updates | Live updates, subscriptions |
| `executor.static` | Return accessor after resolving | Access to both value and lifecycle |

### Scope

A scope is the runtime environment where executors come to life. It:

1. **Resolves** - Calls factories, resolves dependencies, handles async
2. **Caches** - Stores resolved values (singleton per scope)
3. **Manages lifecycle** - Tracks cleanups, handles disposal
4. **Applies extensions** - Wraps resolution/execution with cross-cutting behavior

**Resolution flow:**

```
scope.resolve(executor)
    │
    ├── Check cache → return if exists
    │
    ├── Process presets → may override factory/value
    │
    ├── Resolve dependencies recursively
    │   └── Detect circular dependencies → throw error
    │
    ├── Call factory with controller
    │
    ├── Apply extension wrappers
    │
    └── Cache result → return accessor
```

**Scope lifecycle:**

| Method | Purpose |
|--------|---------|
| `resolve(executor)` | Get value (resolves if needed) |
| `release(executor)` | Run cleanups, remove from cache |
| `update(executor, value)` | Update cached value, notify subscribers |
| `dispose()` | Release all, cleanup extensions |

### Accessor

An accessor is a handle to a resolved executor. It provides controlled access to:

- **Value access** - `get()` returns the cached value
- **Resolution** - `resolve(force?)` triggers resolution
- **State query** - `lookup()` returns current state (pending/resolved/rejected)
- **Lifecycle** - `release()`, `update()`, `set()`
- **Subscriptions** - `subscribe(callback)` for reactive updates

**Why accessors?**

Instead of returning values directly, pumped-fn returns accessors because:

1. Values may still be resolving (async factories)
2. Need to control when cleanup runs
3. Enable reactive updates and subscriptions
4. Provide consistent interface regardless of resolution state

### Controller

The controller is passed to every factory, providing:

| Method | Purpose |
|--------|---------|
| `cleanup(fn)` | Register cleanup function (LIFO order) |
| `release()` | Release this executor from scope |
| `reload()` | Force re-resolution |
| `scope` | Reference to parent scope |

**Cleanup pattern:**

```typescript
provide((ctl) => {
  const conn = new DbConnection();
  ctl.cleanup(() => conn.close());
  return conn;
});
```

### Sucrose (Static Analysis)

Sucrose analyzes factory functions at creation time to enable:

1. **Fail-fast validation** - Detect issues before runtime
2. **Code generation** - Produce optimized compiled factories via `new Function()`
3. **Metadata extraction** - Know what the factory actually uses

**Analysis detects:**

| Property | Purpose |
|----------|---------|
| `async` | Is factory async? |
| `usesCleanup` | Calls `ctl.cleanup()`? |
| `usesRelease` | Calls `ctl.release()`? |
| `usesReload` | Calls `ctl.reload()`? |
| `usesScope` | Accesses `ctl.scope`? |
| `dependencyShape` | `'single'` / `'array'` / `'record'` / `'none'` |
| `dependencyAccess` | Which dependencies are actually accessed |

**Supported function syntax:**

- Arrow functions: `(x) => expr`, `(x) => { ... }`
- Regular functions: `function(x) { ... }`
- Named functions: `function name(x) { ... }`
- Async variants of all above

**Generated code signature:** `(deps, ctl) => result`

```typescript
// provide((ctl) => new Service())
// Generated: new Function('deps', 'ctl', `"use strict"; return new Service()`)

// derive([dbExec, cacheExec], ([db, cache], ctl) => new Repo(db, cache))
// Generated: new Function('deps', 'ctl', `"use strict"; return new Repo(deps[0], deps[1])`)
```

**Compilation skip reasons:**

Compilation may be skipped when the factory cannot be safely compiled:

| Skip Reason | When |
|-------------|------|
| `free-variables` | Factory references closure variables |
| `unsupported-syntax` | Function parsing failed |
| `compilation-error` | `new Function()` threw |

When skipped, `metadata.skipReason` and `metadata.skipDetail` explain why. Original factory is still used at runtime.

**Debugging support:**

- Call site captured at creation via `new Error().stack`
- Original factory preserved for inspection
- `//# sourceURL=pumped-fn://executorName.js` in generated code

### Preset (Override)

Presets allow overriding executor values in a scope:

| Override Type | Behavior |
|---------------|----------|
| `preset(exec, value)` | Use static value instead of factory |
| `preset(exec, otherExec)` | Use another executor's factory |

Common uses:
- Testing (mock dependencies)
- Configuration (environment-specific values)
- Multi-tenant (tenant-specific instances)

## Dependency Resolution {#c3-101-dependencies}

Dependencies can be specified in three shapes:

| Shape | Input | Output |
|-------|-------|--------|
| Single | `executor` | `T` |
| Array | `[exec1, exec2]` | `[T1, T2]` |
| Record | `{ a: exec1, b: exec2 }` | `{ a: T1, b: T2 }` |

**Circular dependency detection:**

The scope tracks resolution stack. If an executor appears twice in the same resolution path, it throws `DependencyResolutionError` with the circular path.

## Event Hooks {#c3-101-events}

Scopes emit events for observability:

| Hook | When Fired |
|------|------------|
| `onChange(callback)` | After resolve or update |
| `onRelease(callback)` | Before release |
| `onError(callback)` | On resolution error |
| `onUpdate(executor, callback)` | When specific executor updates |

## Configuration {#c3-101-config}

`ScopeOption` configures scope creation:

| Option | Purpose |
|--------|---------|
| `initialValues` | Array of presets to apply |
| `registry` | Pre-registered executors |
| `extensions` | Extensions to apply |
| `tags` | Tags attached to scope |

## Source Files {#c3-101-source}

| File | Contents |
|------|----------|
| `scope.ts` | BaseScope, AccessorImpl, createScope, ScopeOption |
| `executor.ts` | provide, derive, preset, isExecutor, type guards |
| `sucrose.ts` | Static analysis, code generation, metadata extraction (ADR-002) |
| `internal/dependency-utils.ts` | resolveShape - dependency tree resolution |

## Testing {#c3-101-testing}

Primary tests: `index.test.ts` - "Scope & Executor" describe block

Key test scenarios:
- Dependency graph resolution
- Circular dependency detection
- Cache behavior
- Cleanup ordering (LIFO)
- Reactive updates via accessor
- Preset overrides
- Sucrose analysis detection (async, ctl methods, dependency access)
- Generated code correctness (all dependency shapes)
- Call site capture in errors
- Error enrichment with `name` tag

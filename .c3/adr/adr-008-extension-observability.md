---
id: ADR-008-extension-observability
title: Hybrid Extension API for Atom Lifecycle Observability
summary: >
  Enhance @pumped-fn/lite Extension interface with ResolveInfo context and lifecycle
  hooks, enabling production-ready observability while maintaining wrapper pattern
  for control flow.
status: proposed
date: 2025-12-01
---

# [ADR-008] Hybrid Extension API for Atom Lifecycle Observability

## Status {#adr-008-status}
**Proposed** - 2025-12-01

## Problem/Requirement {#adr-008-problem}

With ADR-007 adding `ctx.data` (per-atom private storage), extensions cannot observe this new state. The current Extension interface receives only `(next, atom, scope)` in `wrapResolve`, missing:

1. **ctx.data access** - Cannot observe what atoms store privately
2. **isInvalidation flag** - Cannot distinguish first resolve from re-resolve after invalidation
3. **Post-factory state** - Cannot see ctx.data mutations that occurred during factory execution

**Production use cases blocked:**

| Use Case | Blocked Because |
|----------|-----------------|
| Distributed tracing | Can't correlate invalidation with original resolve |
| Debug inspector | Can't observe ctx.data before/after factory |
| Metrics collection | Can't track invalidation counts accurately |
| Circuit breaker | Can't reset on explicit invalidation |

## Exploration Journey {#adr-008-exploration}

**Initial hypothesis:** Pass `ctx.data` to `wrapResolve` wrapper.

**Explored alternatives:**

| Approach | Verdict |
|----------|---------|
| Pass ctx to wrapResolve only | Insufficient - can't observe post-factory data mutations |
| Stage hooks only | Insufficient - can't implement retry/circuit breaker |
| Operation object (like core-next) | Overkill for lite's simplicity |
| **Hybrid: wrapper + hooks** | **Selected** - covers all use cases |

**Key insight from engineering review:**

- **Wrappers** are essential for control flow (retry, cache, block)
- **Hooks** are essential for observation (metrics, logging, tracing)
- Neither alone is sufficient for production applications

## Solution {#adr-008-solution}

Enhance Extension interface with both:
1. `ResolveInfo` context passed to `wrapResolve` (adds `isInvalidation` + `context`)
2. Lifecycle hooks for post-resolution observation

### API

```typescript
interface ResolveInfo {
  readonly isInvalidation: boolean      // true if triggered by invalidate()
  readonly context: ResolveContext      // access to ctx.data, scope
}

interface Extension {
  readonly name: string

  init?(scope: Scope): MaybePromise<void>
  dispose?(scope: Scope): MaybePromise<void>

  wrapResolve?<T>(
    next: () => Promise<T>,
    atom: Atom<T>,
    info: ResolveInfo                   // NEW: replaces scope parameter
  ): Promise<T>

  wrapExec?<T>(
    next: () => Promise<T>,
    target: Flow<T, unknown> | ((...args: unknown[]) => MaybePromise<T>),
    ctx: ExecutionContext
  ): Promise<T>

  onResolveSuccess?<T>(              // NEW
    atom: Atom<T>,
    ctx: ResolveContext,
    value: T
  ): void

  onResolveError?<T>(                // NEW
    atom: Atom<T>,
    ctx: ResolveContext,
    error: Error
  ): void

  onInvalidate?<T>(                  // NEW
    atom: Atom<T>,
    ctx: ResolveContext
  ): void
}
```

### Usage Examples

**Retry with invalidation awareness:**

```typescript
const retryExtension: Lite.Extension = {
  name: 'retry',

  async wrapResolve<T>(next, atom, info) {
    if (info.isInvalidation) return next()

    let attempt = 0
    while (attempt < 3) {
      try {
        return await next()
      } catch (error) {
        if (++attempt >= 3) throw error
        await delay(Math.pow(2, attempt) * 1000)
      }
    }
    throw new Error('Unreachable')
  }
}
```

**Metrics with ctx.data observation:**

```typescript
const metricsExtension: Lite.Extension = {
  name: 'metrics',

  onResolveSuccess<T>(atom, ctx, value) {
    metrics.counter('atom_success_total').inc()
    metrics.gauge('atom_data_size').set(ctx.data.size)
  },

  onResolveError<T>(atom, ctx, error) {
    metrics.counter('atom_error_total').inc()
  },

  onInvalidate<T>(atom, ctx) {
    metrics.counter('atom_invalidation_total').inc()
  }
}
```

**Debug inspector with before/after data:**

```typescript
const debugExtension: Lite.Extension = {
  name: 'debug',

  wrapResolve<T>(next, atom, info) {
    console.log('[BEFORE]', Object.fromEntries(info.context.data))
    return next()
  },

  onResolveSuccess<T>(atom, ctx, value) {
    console.log('[AFTER]', Object.fromEntries(ctx.data))
  }
}
```

### Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│ resolve(atom)                                                       │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │ wrapResolve(next, atom, info)                               │   │
│   │   info.isInvalidation = false                               │   │
│   │   info.context.data = Map (empty or from previous resolve)  │   │
│   │                                                             │   │
│   │   await next()                                              │   │
│   │     ├── factory(ctx, deps)                                  │   │
│   │     │     ctx.data.set('key', value)                        │   │
│   │     │     return result                                     │   │
│   │     ▼                                                       │   │
│   │   return result                                             │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                      success │ or error                             │
│                              ▼                                      │
│   ┌────────────────────┐    ┌────────────────────┐                  │
│   │ onResolveSuccess   │ OR │ onResolveError     │                  │
│   │   ctx.data visible │    │   ctx.data visible │                  │
│   │   after mutations  │    │   at error time    │                  │
│   └────────────────────┘    └────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ invalidate(atom)                                                    │
│                                                                     │
│   ┌────────────────────┐                                            │
│   │ onInvalidate       │ ◄── Called before cleanup runs             │
│   │   ctx.data visible │                                            │
│   └────────────────────┘                                            │
│              │                                                      │
│              ▼                                                      │
│   run cleanups (LIFO)                                               │
│              │                                                      │
│              ▼                                                      │
│   resolve(atom) with info.isInvalidation = true                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Breaking Change Analysis

| Change | Breaking? | Migration |
|--------|-----------|-----------|
| `wrapResolve` signature | ⚠️ Soft break | `scope` → `info.context.scope` |
| New hooks | No | Optional, ignored if not implemented |

**Migration for existing extensions:**

```typescript
// Before
wrapResolve(next, atom, scope) {
  // use scope
}

// After
wrapResolve(next, atom, info) {
  const scope = info.context.scope  // Migration path
}
```

## Changes Across Layers {#adr-008-changes}

### Types (types.ts)

```typescript
export namespace Lite {
  export interface ResolveInfo {
    readonly isInvalidation: boolean
    readonly context: ResolveContext
  }

  export interface Extension {
    readonly name: string
    init?(scope: Scope): MaybePromise<void>
    dispose?(scope: Scope): MaybePromise<void>

    wrapResolve?<T>(
      next: () => Promise<T>,
      atom: Atom<T>,
      info: ResolveInfo                    // CHANGED: was scope: Scope
    ): Promise<T>

    wrapExec?<T>(
      next: () => Promise<T>,
      target: Flow<T, unknown> | ((...args: unknown[]) => MaybePromise<T>),
      ctx: ExecutionContext
    ): Promise<T>

    onResolveSuccess?<T>(                  // NEW
      atom: Atom<T>,
      ctx: ResolveContext,
      value: T
    ): void

    onResolveError?<T>(                    // NEW
      atom: Atom<T>,
      ctx: ResolveContext,
      error: Error
    ): void

    onInvalidate?<T>(                      // NEW
      atom: Atom<T>,
      ctx: ResolveContext
    ): void
  }
}
```

### Scope Implementation (scope.ts)

1. Track `isInvalidation` state during resolve
2. Create `ResolveInfo` object for wrapResolve
3. Call hooks at appropriate lifecycle points
4. Call `onInvalidate` before running cleanups

### Component Docs (c3-201-scope.md, c3-2 README)

Update Extension System section with new hooks and usage examples.

## Verification {#adr-008-verification}

### Type System
- [ ] `ResolveInfo` interface exported in types.ts
- [ ] `wrapResolve` signature accepts `ResolveInfo`
- [ ] New hooks are optional (extension still valid without them)

### Runtime Behavior
- [ ] `info.isInvalidation` is `false` for first resolve
- [ ] `info.isInvalidation` is `true` for resolve triggered by invalidate()
- [ ] `info.context.data` is the same Map instance as factory receives
- [ ] `onResolveSuccess` receives ctx.data after factory mutations
- [ ] `onResolveError` called on factory throw
- [ ] `onInvalidate` called before cleanups run

### Integration
- [ ] Multiple extensions: hooks called in registration order
- [ ] Wrappers: innermost first, hooks after all wrappers complete
- [ ] Existing extensions without hooks still work (backward compat)

### Production Use Cases
- [ ] Retry extension works with isInvalidation flag
- [ ] Metrics extension can count invalidations
- [ ] Debug extension can log ctx.data before/after

## Alternatives Considered {#adr-008-alternatives}

### 1. Stage hooks only (no wrapper enhancement)

```typescript
onResolveStart?(atom, ctx): void
onResolveSuccess?(atom, ctx, value): void
onResolveError?(atom, ctx, error): void
```

**Rejected:** Cannot implement retry, circuit breaker, caching - no control flow.

### 2. Enhanced wrapper only (no hooks)

```typescript
wrapResolve?(next, atom, info): Promise<T>
```

**Rejected:** Cannot observe ctx.data mutations after factory completes.

### 3. Operation object pattern (like core-next)

```typescript
wrap?(scope, next, operation: Operation): Promised<unknown>
```

**Rejected:** Too complex for lite's "very light, very compact" principle.

### 4. Observable Map for ctx.data

```typescript
interface ResolveContext {
  readonly data: ObservableMap<string, unknown>
}
```

**Rejected:** Adds complexity, breaks Map compatibility, overkill for use cases.

## Related {#adr-008-related}

- [ADR-007](./adr-007-resolve-context-data.md) - Per-Atom Private Storage that this observes
- [ADR-003](./adr-003-controller-reactivity.md) - Controller reactivity that enables invalidation
- [c3-104](../c3-1-core/c3-104-extension.md) - Core library extension system (reference)
- [c3-2](../c3-2-lite/README.md) - Lite container extension section

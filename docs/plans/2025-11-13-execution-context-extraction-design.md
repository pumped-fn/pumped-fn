# Execution Context Extraction Design

**Date:** 2025-11-13
**Status:** Design Phase
**Goal:** Extract execution context as standalone primitive enabling new patterns beyond Flow

## Problem Statement

Currently, execution context and tracing are tightly coupled to Flow. The concept of execution context (context with lifecycle + tracing) is valuable for operations beyond Flow's constraints:

- Short-running operations (HTTP requests, middleware)
- Medium-running operations (cron jobs, schedulers)
- Custom orchestration patterns (streaming, long-running tasks)

The core insight: Rather than building stack-based execution within Flow, pass context around explicitly with `ctx.exec()` and let details attach automatically through extensions.

## Design Goals

1. **Enable new patterns** - Execution patterns that don't fit Flow model
2. **Flow wraps ExecutionContext** - Flow provides convenience layer but doesn't own primitive
3. **Scope is master lifecycle** - ExecutionContext are branches, share extension system
4. **Explicit context passing** - No async context magic
5. **Minimal core** - Keep execution details + trace shape only, extensions handle collection

## Architecture Overview

### Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Scope (master lifecycle)                                     │
│ - extensions: Extension[]                                    │
│ - resolved dependencies stored here                          │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    │ creates
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ Flow.Context (execution API)                                 │
│ - scope: Scope                                               │
│ - tags: Tag.Tagged[]  ← metadata for THIS execution         │
│ - signal: AbortSignal                                        │
│ - exec(flow/fn) → creates child execution                   │
│ - get/set(tag) → read/write metadata                        │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    │ ctx.exec() creates
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ Flow.Execution<T> (execution tracking)                       │
│ - id: string                                                 │
│ - flowName: string                                           │
│ - status: ExecutionStatus                                    │
│ - ctx: ExecutionData (tag access)                           │
│ - result: Promised<T>                                        │
│ - abort: AbortController                                     │
└─────────────────────────────────────────────────────────────┘
                    │
                    │ wrapped in
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ Extension.ExecutionOperation                                 │
│ - kind: "execution"                                          │
│ - context: Tag.Store ← tag storage for extensions          │
│ - target: FlowTarget | FnTarget | ParallelTarget            │
└─────────────────────────────────────────────────────────────┘
```

### Proposed Consolidated Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Scope (master lifecycle)                                     │
│ - extensions: Extension[]                                    │
│ - resolved dependencies                                      │
│ - createExecution() ← NEW: create ExecutionContext directly │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    │ creates
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ ExecutionContext (PRIMITIVE - consolidates Context+Execution)│
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Core Data (combines Context + Execution data)           │ │
│ │ - scope: Scope                                          │ │
│ │ - parent: ExecutionContext | undefined                  │ │
│ │ - id: string                                            │ │
│ │ - tagStore: Tag.Store ← UNIFIED metadata storage       │ │
│ │ - signal: AbortSignal                                   │ │
│ │ - details: { name, startedAt, completedAt, error }     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                              │
│ API Methods:                                                 │
│ - exec(name, fn) → creates child ExecutionContext          │
│ - get/set(tag) → tag access                                 │
│ - end() → complete execution                                │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ exec() triggers
                      ↓
            Extension.wrap(operation)
            - operation.executionContext: ExecutionContext
```

## The Overlap Problem

Current types have significant overlap:

```
┌────────────────────────┐
│   Flow.Context         │
│  ├─ scope              │ ← SHARED: both need scope
│  ├─ tags[]             │ ← SHARED: execution metadata
│  ├─ exec()             │ ← SHARED: create child executions
│  ├─ get/set(tag)       │ ← SHARED: tag access
│  └─ signal             │
└────────────────────────┘

┌────────────────────────┐
│   Flow.Execution       │
│  ├─ id                 │ ← SHARED: execution identity
│  ├─ flowName           │ ← SHARED: execution metadata
│  ├─ status             │ ← NEW: execution lifecycle
│  ├─ ctx (tags access)  │ ← SHARED: tag access
│  ├─ result             │ ← NEW: async tracking
│  └─ abort              │ ← SHARED: cancellation
└────────────────────────┘

┌────────────────────────┐
│Extension.ExecutionOp   │
│  ├─ context: Tag.Store │ ← SHARED: tag storage
│  ├─ target             │ ← NEW: operation metadata
│  └─ input              │
└────────────────────────┘
```

**Solution:** Merge Flow.Context + Flow.Execution → ExecutionContext with unified tag storage.

## Data Storage & Inheritance

```
╔═══════════════════════════════════════════════════════════╗
║ Scope                                                      ║
║ ┌────────────────────────────────────────────────────┐   ║
║ │ Resolved Dependencies (per executor)                │   ║
║ │ - dbExecutor → Database instance                    │   ║
║ │ - authExecutor → Auth service                       │   ║
║ └────────────────────────────────────────────────────┘   ║
║ ┌────────────────────────────────────────────────────┐   ║
║ │ Extensions                                          │   ║
║ │ - TracingExtension, LoggingExtension                │   ║
║ └────────────────────────────────────────────────────┘   ║
╚═══════════════════════════════════════════════════════════╝
                        │
                        │ ExecutionContext REFERENCES scope
                        │ (doesn't duplicate data)
                        ↓
┌─────────────────────────────────────────────────────────┐
│ ExecutionContext (root)                                  │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ tagStore: Tag.Store                                 │ │
│ │ - requestId: "req-123"                              │ │
│ │ - userId: "user-456"                                │ │
│ └─────────────────────────────────────────────────────┘ │
└───────────────────┬─────────────────────────────────────┘
                    │
                    │ INHERITANCE: child accesses parent
                    │ tags through tagStore chain
                    ↓
┌─────────────────────────────────────────────────────────┐
│ ExecutionContext (child - Authorization)                 │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ tagStore: Tag.Store (chained to parent)             │ │
│ │ - LOCAL: flowName: "Authorization"                  │ │
│ │ - LOCAL: authMethod: "oauth"                        │ │
│ │ - INHERITED: requestId: "req-123" (from parent)    │ │
│ │ - INHERITED: userId: "user-456" (from parent)      │ │
│ └─────────────────────────────────────────────────────┘ │
└───────────────────┬─────────────────────────────────────┘
                    │
                    │ further nesting
                    ↓
┌─────────────────────────────────────────────────────────┐
│ ExecutionContext (grandchild - getUserFlow)              │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ tagStore: Tag.Store (chained to parent)             │ │
│ │ - LOCAL: flowName: "getUserFlow"                    │ │
│ │ - INHERITED: authMethod, requestId, userId          │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Example Scenario

```
scope.createExecution({ name: "request-handler" })
│
└─> ExecutionContext (root)
    - id: "ctx-root"
    - tagStore: Tag.Store {}
    - parent: undefined
    - details: { name: "request-handler", startedAt: 1234 }
    │
    ├─> ctx.exec("Authorization", (childCtx) => ...)
    │   │
    │   └─> ExecutionContext (child)
    │       - id: "ctx-1"
    │       - parent: ctx-root
    │       - tagStore: Tag.Store { inherited + local tags }
    │       - details: { name: "Authorization", ... }
    │       │
    │       ├─> childCtx.exec("getUserFlow", ...)
    │       │   └─> ExecutionContext (grandchild)
    │       │       - parent: ctx-1
    │       │       - tagStore inherits from ctx-1
    │       │
    │       └─> childCtx.exec("checkOAuthFlow", ...)
    │           └─> ExecutionContext (grandchild)
    │
    └─> ctx.exec("RequestApproval", (childCtx) => ...)
        │
        └─> ExecutionContext (child)
            - id: "ctx-2"
            - parent: ctx-root
            - tagStore: Tag.Store { inherited + local tags }
            │
            ├─> getDatabaseFlow → grandchild ExecutionContext
            ├─> checkChangesFlow → grandchild ExecutionContext
            ├─> makeChangeFlow → grandchild ExecutionContext
            └─> announceChangeFlow → grandchild ExecutionContext
```

## Core Type Structure

```typescript
interface ExecutionContext<TScope extends Scope = Scope> {
  readonly scope: TScope
  readonly parent?: ExecutionContext<TScope>
  readonly id: string
  readonly tagStore: Tag.Store
  readonly signal: AbortSignal
  readonly details: ExecutionDetails

  exec<T>(name: string, fn: (ctx: ExecutionContext<TScope>) => T): Promised<T>
  get<T>(tag: Tag.Tag<T>): T
  set<T>(tag: Tag.Tag<T>, value: T): void
  end(): void
}

interface ExecutionDetails {
  name: string
  startedAt: number
  completedAt?: number
  error?: unknown
  metadata?: Record<string, unknown>
}

interface Scope {
  createExecution(details?: Partial<ExecutionDetails>): ExecutionContext<this>
}

namespace Flow {
  export type Context = ExecutionContext

  export interface Execution<T> {
    readonly result: Promised<T>
    readonly context: ExecutionContext
    readonly id: string
    readonly status: ExecutionStatus
  }
}
```

## Extension Integration

Extensions continue using wrap pattern, now receive ExecutionContext directly:

```typescript
namespace Extension {
  export type ExecutionOperation = {
    kind: "execution"
    target: FlowTarget | FnTarget | ParallelTarget
    executionContext: ExecutionContext  // NEW: direct reference
    input: unknown
  }

  export interface Extension {
    name: string
    init?(scope: Core.Scope): MaybePromised<void>
    wrap?(
      scope: Core.Scope,
      next: () => Promised<unknown>,
      operation: ResolveOperation | ExecutionOperation
    ): Promised<unknown>
    onError?(error: ExecutorError, scope: Core.Scope): void
    dispose?(scope: Core.Scope): MaybePromised<void>
  }
}

class TracingExtension implements Extension.Extension {
  name = "tracing"
  private traces = new Map<string, ExecutionTrace>()

  wrap(scope, next, operation) {
    if (operation.kind !== "execution") return next()

    const ctx = operation.executionContext
    const traceId = ctx.id

    this.traces.set(traceId, {
      id: traceId,
      parentId: ctx.parent?.id,
      name: ctx.details.name,
      startedAt: ctx.details.startedAt,
      children: []
    })

    return next()
      .then(result => {
        const trace = this.traces.get(traceId)!
        trace.completedAt = ctx.details.completedAt
        return result
      })
      .catch(error => {
        const trace = this.traces.get(traceId)!
        trace.error = error
        throw error
      })
  }
}
```

## Migration Strategy

**Approach:** Big bang refactor - extract ExecutionContext, update all Flow code, update all tests/examples in single PR.

### Key Consolidation Points

1. **Merge Flow.Context + Flow.Execution → ExecutionContext**
   - Context API (exec, get/set tags) + Execution tracking (id, status, details)
   - Single source of truth for execution metadata

2. **Unified Tag Storage**
   - `tagStore: Tag.Store` in ExecutionContext
   - Replaces: Flow.Context.tags[], Flow.Execution.ctx, Extension.ExecutionOperation.context
   - Inheritance via chain (child → parent → grandparent)

3. **Lifecycle tied to Scope**
   - Scope creates ExecutionContext via `scope.createExecution()`
   - Scope extensions receive ExecutionContext in wrap() operation
   - Dependencies still resolved from Scope

4. **Flow becomes thin wrapper**
   - Flow.run() internally uses scope.createExecution()
   - Flow.Context = type alias for ExecutionContext
   - Flow.Execution = async wrapper around ExecutionContext for promises

### Breaking Changes

- `Flow.Context` now resolves to `ExecutionContext` (API compatible)
- `Flow.Execution.ctx` becomes `Flow.Execution.context`
- Extensions receive `ExecutionContext` in operation instead of Tag.Store

### Migration Checklist

1. Create src/execution-context.ts (new file)
2. Update src/scope.ts (add createExecution)
3. Update src/flow.ts (use ExecutionContext)
4. Update src/extension.ts (operation type)
5. Update all tests in packages/next/tests/
6. Update all examples in examples/
7. Update docs/guides/
8. Update .claude/skills/pumped-design/references/

## Design Validation

**Enables new patterns?** ✓
- Can create ExecutionContext independently via scope.createExecution()
- Can use ctx.exec() for custom orchestration
- Not limited to Flow's execution model

**Flow wraps ExecutionContext?** ✓
- Flow.Context = type alias
- Flow.run() uses scope.createExecution() internally
- Flow doesn't own the primitive

**Scope is master lifecycle?** ✓
- Scope creates ExecutionContext
- Scope extensions apply to all contexts
- Dependencies resolved from Scope

**Explicit passing?** ✓
- ExecutionContext passed as parameter
- No AsyncLocalStorage magic

**Minimal core?** ✓
- ExecutionContext: id, details, tagStore, scope ref, parent ref
- Extensions handle collection strategy
- No built-in trace storage

# Flow Execution Tracking Design

**Date:** 2025-11-03
**Status:** Approved

## Overview

Enhance the execution model to track concurrent flow executions with unique IDs, provide cancellation capabilities, and expose execution metadata. Unify context execution APIs into a single `ctx.exec()` pattern.

## Problem Statement

Current `scope.exec()`:
- Returns only `Promised<T>` - no execution metadata
- No tracking of concurrent executions
- No cancellation mechanism
- No access to execution ID, status, or context data
- `ctx.run()` and `ctx.exec()` create API complexity

## Goals

1. Track all concurrent executions independently
2. Auto-cleanup completed executions (prevent memory leaks)
3. AbortSignal pattern for cancellation
4. Expose metadata: execution ID, flow name, status, context data
5. Unified API: single `ctx.exec()` for flows and functions
6. Consistent patterns: scope.exec ↔ ctx.exec

## Design

### 1. FlowExecution Return Type

`scope.exec()` returns `FlowExecution<T>` instead of `Promised<T>`:

```typescript
class FlowExecution<T> {
  result: Promised<T>

  id: string
  flowName: string | undefined
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

  ctx: Flow.ExecutionData
  abort: AbortController

  onStatusChange(
    callback: (status: ExecutionStatus, execution: FlowExecution<T>) => void | Promise<void>
  ): Core.Cleanup

  then/catch/finally // Optional: delegate to result for backward compat
}
```

**Usage:**
```typescript
const execution = scope.exec({ flow, input })

await execution.result // T
execution.id // string
execution.status // 'running'
execution.ctx // ExecutionData
execution.abort.abort() // cancel
execution.onStatusChange((status, exec) => console.log(status))
```

### 2. Execution Registry

Scope maintains registry of active executions with auto-cleanup:

```typescript
class BaseScope {
  private executions: Map<string, ExecutionMetadata> = new Map()

  type ExecutionMetadata = {
    execution: FlowExecution<unknown>
    startTime: number
  }

  exec(...) {
    const id = crypto.randomUUID()
    const execution = new FlowExecution(...)

    this.executions.set(id, { execution, startTime: Date.now() })

    execution.result.finally(() => {
      this.executions.delete(id)
    })

    return execution
  }
}
```

**Lifecycle:**
- Register on `scope.exec()` call
- Auto-delete when execution settles
- No memory leaks, no queryable history

### 3. Cancellation with AbortSignal

AbortController passed through execution context:

```typescript
class FlowContext {
  private abortController: AbortController

  get signal(): AbortSignal {
    return this.abortController.signal
  }

  throwIfAborted(): void {
    if (this.signal.aborted) {
      throw new Error('Flow execution cancelled')
    }
  }
}

namespace Flow {
  export type C = {
    readonly signal: AbortSignal
    throwIfAborted(): void
    // ... existing methods
  }
}
```

**Cascading cancellation:**
- `ctx.exec()` checks abort state before execution
- `ctx.throwIfAborted()` fails fast if cancelled
- Subflows inherit abort signal
- No racing - check at boundaries only

**Flow cooperation:**
```typescript
const flow = flow((ctx, input) => {
  ctx.throwIfAborted() // Manual check
  const data = await fetch(url, { signal: ctx.signal }) // Use signal
  return data
})

const exec = scope.exec({ flow, input })
exec.abort.abort() // Cancel
```

**Important:** Cancellation is cooperative - flows must check `ctx.signal` or `ctx.throwIfAborted()`. We only control entry points (ctx.exec boundaries), not user code execution.

### 4. Timeout Support

Timeout combined with AbortController:

```typescript
interface ExecOptions {
  timeout?: number
  retry?: number
  tags?: Tag.Tagged[]
}

// At scope level
scope.exec({
  flow,
  input,
  timeout: 5000 // Aborts after 5s
})

// At context level
ctx.exec({
  flow: childFlow,
  input: data,
  timeout: 1000 // Individual operation timeout
})
```

**Implementation:**
```typescript
if (options?.timeout) {
  setTimeout(() => {
    if (!abortController.signal.aborted) {
      abortController.abort(new Error(`Timeout after ${options.timeout}ms`))
    }
  }, options.timeout)
}
```

### 5. Unified ctx.exec() API

Remove `ctx.run()`, unify to `ctx.exec()` with config pattern:

```typescript
namespace Flow {
  export type C = {
    exec<F extends Flow.UFlow>(config: {
      flow: F
      input: Flow.InferInput<F>
      key?: string
      timeout?: number
      retry?: number
      tags?: Tag.Tagged[]
    }): Promised<Flow.InferOutput<F>>

    exec<T>(config: {
      fn: () => T | Promise<T>
      params?: never
      key?: string
      timeout?: number
      retry?: number
      tags?: Tag.Tagged[]
    }): Promised<T>

    exec<Fn extends (...args: any[]) => any>(config: {
      fn: Fn
      params: Parameters<Fn>
      key?: string
      timeout?: number
      retry?: number
      tags?: Tag.Tagged[]
    }): Promised<ReturnType<Fn>>
  }
}
```

**Usage:**
```typescript
const flow = flow((ctx, input) => {
  const order = await ctx.exec({
    flow: fetchOrderFlow,
    input: { id: input.orderId },
    timeout: 5000
  })

  const discount = await ctx.exec({
    fn: () => calculateDiscount(order),
    key: 'calc-discount'
  })

  const total = await ctx.exec({
    fn: (amount: number, disc: number) => amount - disc,
    params: [order.amount, discount],
    key: 'apply-discount'
  })

  return total
})
```

### 6. Consistent scope.exec()

Same config pattern at scope level:

```typescript
interface Core.Scope {
  exec<S, I>(config: {
    flow: Core.Executor<Flow.Handler<S, I>>
    timeout?: number
    tags?: Tag.Tagged[]
  } & (I extends void | undefined ? { input?: I } : { input: I })): FlowExecution<S>

  exec<S, D extends Core.DependencyLike>(config: {
    dependencies: D
    fn: (deps: Core.InferOutput<D>) => S | Promise<S>
    timeout?: number
    tags?: Tag.Tagged[]
  }): FlowExecution<S>

  exec<S, I, D extends Core.DependencyLike>(config: {
    dependencies: D
    fn: (deps: Core.InferOutput<D>, input: I) => S | Promise<S>
    input: I
    timeout?: number
    tags?: Tag.Tagged[]
  }): FlowExecution<S>
}
```

**Usage:**
```typescript
// Flow
scope.exec({
  flow: orderFlow,
  input: { orderId: '123' },
  timeout: 30000
})

// Ad-hoc with dependencies
scope.exec({
  dependencies: [db, cache],
  fn: ([db, cache], input: { id: string }) => db.query(input.id),
  input: { id: '123' }
})

// Ad-hoc no input
scope.exec({
  dependencies: [config],
  fn: ([cfg]) => cfg.get('setting')
})
```

## Breaking Changes

1. `scope.exec()` returns `FlowExecution<T>` instead of `Promised<T>`
   - Migration: `await execution.result` instead of `await execution`
   - Backward compat: Make FlowExecution PromiseLike (delegates to result)

2. Remove `ctx.run()` entirely
   - Migration: `ctx.run('key', fn, ...params)` → `ctx.exec({ fn, params, key })`

3. Remove `scope.exec(flow, input, { details: true })` option
   - Migration: Execution details always available on FlowExecution

## Implementation Strategy

1. Add FlowExecution class and types
2. Update scope.exec() to return FlowExecution, add registry
3. Add AbortController support to FlowContext
4. Add timeout support to scope and context
5. Add ctx.exec() config overloads
6. Deprecate ctx.run() (add migration warnings)
7. Update all tests and examples
8. Update skill references (.claude/skills/pumped-design/)
9. Update documentation (docs/guides/)

## Benefits

- Track concurrent executions independently
- Memory-safe (auto-cleanup)
- Cancellation via standard AbortSignal
- Timeout at all levels
- Single API pattern (config objects)
- Type-safe with full inference
- AI-friendly (consistent, self-documenting)

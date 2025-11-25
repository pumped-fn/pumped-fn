---
id: ADR-001-execution-context-lifecycle
title: ExecutionContext Explicit Lifecycle with close()
summary: >
  Add close() method to ExecutionContext for middleware integration patterns,
  enabling explicit lifecycle management with graceful/abort modes and cascading
  to child contexts.
status: accepted
date: 2025-01-24
---

# [ADR-001] ExecutionContext Explicit Lifecycle with close()

## Status {#adr-001-status}
**Accepted** - 2025-01-24

## Problem/Requirement {#adr-001-problem}

ExecutionContext currently lacks explicit lifecycle control. The `end()` method only marks timing metadata - it doesn't:
- Wait for in-flight nested executions
- Provide a clear "request boundary" for middleware patterns
- Allow graceful or abortive shutdown

**Use case:** HTTP middleware pattern where:
1. Request arrives → create ExecutionContext with request tags
2. Execute multiple flows within context
3. Request ends → close context, ensuring all work completes or aborts

```typescript
// Desired pattern
async function middleware(req: Request, next: NextFn) {
  const ctx = scope.createExecution({
    tags: [requestIdTag(req.id)]
  })

  try {
    const result = await ctx.exec(handleRequestFlow, req.body)
    return result
  } finally {
    await ctx.close()  // <-- This doesn't exist today
  }
}
```

## Exploration Journey {#adr-001-exploration}

**Initial hypothesis:** This primarily affects c3-102 (Flow & ExecutionContext) at the Component level.

**Explored:**

- **Isolated (c3-102):** Current lifecycle is Creation → Initialization → Execution → `end()` → Cleanup (scope-level). The `end()` method only sets `completedAt` timestamp. No mechanism to await in-flight work or cascade close to children.

- **Upstream (c3-101 Scope):** Scope creates ExecutionContext via `createExecution()` and `exec()`. Scope has `dispose()` for its own lifecycle. No changes needed - `createExecution()` already exists.

- **Adjacent (c3-104 Extension):** Extensions have scope-level lifecycle (`init`, `dispose`) but no context-level hooks. Adding `onContextCreate()` and `onContextClose()` hooks enables extensions to participate in context lifecycle.

- **Downstream:** Child contexts are created via `ctx.exec()`. They inherit parent context and AbortSignal. Signal propagation already works for abort - need to add graceful close cascade.

**Discovered:**
- ExecutionContext already has AbortController/AbortSignal - abort mode is nearly free
- Child contexts already track parent via `parent` property - cascade is straightforward
- No cleanup registration needed at context level - existing signal handles cancellation

**Confirmed:**
- Scope interface doesn't need changes
- Extensions use existing `wrap()` with new `context-lifecycle` operation kind
- Change is additive to ExecutionContext interface and Operation type union

## Solution {#adr-001-solution}

Add `close(options?)` method to ExecutionContext with:

### API

```typescript
interface CloseOptions {
  mode?: 'graceful' | 'abort'  // default: 'graceful'
}

type ContextState = 'active' | 'closing' | 'closed'

interface ExecutionContext.Context {
  // ... existing properties ...

  /**
   * Close this execution context and all nested contexts.
   *
   * @param options.mode
   *   - 'graceful' (default): Wait for all in-flight executions to complete
   *   - 'abort': Trigger AbortController, reject pending executions
   *
   * @returns Promise that resolves when context and all children are closed
   */
  close(options?: CloseOptions): Promise<void>

  /**
   * Current lifecycle state of the context.
   */
  readonly state: ContextState

  /**
   * Convenience property: true when state === 'closed'.
   */
  readonly closed: boolean

  /**
   * Subscribe to state changes.
   *
   * @param callback - Called when state transitions
   * @returns Cleanup function to unsubscribe
   */
  onStateChange(callback: (state: ContextState, prev: ContextState) => void): () => void
}
```

### Extension Integration

Extensions participate in context lifecycle via the existing `wrap()` pattern with a new operation kind:

```typescript
type ContextLifecycleOperation = {
  kind: "context-lifecycle"
  phase: "create" | "closing" | "closed"
  context: ExecutionContext.Context
  mode?: 'graceful' | 'abort'  // present when phase is 'closing'
}

// Updated Operation union
type Operation = ResolveOperation | ExecutionOperation | ContextLifecycleOperation
```

**Phases:**

| Phase | When | Purpose |
|-------|------|---------|
| `create` | Context constructed | Setup tracing spans, request logging |
| `closing` | `close()` called, before drain | Pre-cleanup, cancel pending work |
| `closed` | After drain complete | Final cleanup, flush metrics, end spans |

**Example - Tracing Extension:**

```typescript
const tracingExtension = extension({
  name: 'tracing',
  wrap(scope, next, operation) {
    if (operation.kind === 'context-lifecycle') {
      const { phase, context } = operation

      if (phase === 'create') {
        const span = tracer.startSpan(context.details.name)
        context.set(spanTag, span)
      }

      if (phase === 'closed') {
        const span = context.find(spanTag)
        span?.end()
      }
    }
    return next()
  }
})
```

This aligns with the existing `wrap()` interception pattern - no new hooks needed.

### Error Types

```typescript
/**
 * Thrown when attempting exec() on a closing or closed context.
 */
class ExecutionContextClosedError extends Error {
  readonly contextId: string
  readonly state: ContextState

  constructor(contextId: string, state: ContextState) {
    super(`ExecutionContext ${contextId} is ${state}`)
    this.name = 'ExecutionContextClosedError'
    this.contextId = contextId
    this.state = state
  }
}
```

### Behavior

**Graceful mode (default):**
1. Mark context as closing (reject new `exec()` calls)
2. Cascade `close({ mode: 'graceful' })` to all tracked child contexts
3. Wait for all in-flight executions to settle (fulfill or reject)
4. Call `end()` to mark completion
5. Mark context as closed

**Abort mode:**
1. Mark context as closing
2. Trigger `abortController.abort()`
3. Cascade `close({ mode: 'abort' })` to all child contexts
4. Wait for abort to propagate (executions reject with AbortError)
5. Call `end()` to mark completion
6. Mark context as closed

### State Transitions

```
                    ┌─────────────────────────────────────┐
                    │                                     │
  ┌──────────┐      │   ┌──────────┐      ┌──────────┐   │   ┌──────────┐
  │  active  │──────┼──▶│ closing  │─────▶│ draining │───┼──▶│  closed  │
  └──────────┘      │   └──────────┘      └──────────┘   │   └──────────┘
       │            │        │                  │        │
       │            │        │ (abort mode)     │        │
       │            │        ▼                  │        │
       │            │   ┌──────────┐            │        │
       │            │   │ aborting │────────────┘        │
       │            │   └──────────┘                     │
       │            │                                    │
       │            └────────────────────────────────────┘
       │
       │ (error during exec)
       ▼
  ┌──────────┐
  │  error   │ (context remains usable, error is per-execution)
  └──────────┘
```

### In-Flight Execution Tracking

ExecutionContext tracks all in-flight executions via `Promised` - the unit of execution control:

```typescript
class ExecutionContextImpl {
  private inFlight: Set<Promised<unknown>> = new Set()
  private children: Set<ExecutionContextImpl> = new Set()

  // When starting any execution (flow or fn):
  private trackExecution<T>(promised: Promised<T>): Promised<T> {
    this.inFlight.add(promised)
    promised.finally(() => this.inFlight.delete(promised))
    return promised
  }

  // When creating child context:
  private registerChild(child: ExecutionContextImpl): void {
    this.children.add(child)
  }

  // During close:
  private async drainInFlight(): Promise<void> {
    await Promise.allSettled([...this.inFlight])
  }
}
```

This tracks:
- Flow executions (`ctx.exec(flow, input)`)
- Function executions (`ctx.exec({ fn, params })`)
- Parallel executions (`ctx.parallel([...])`, `ctx.parallelSettled([...])`)

### Parallel Execution Behavior

`parallel()` and `parallelSettled()` are tracked as single `Promised` entries:
- **Graceful close:** Waits for the parallel operation to complete
- **Abort close:** Triggers abort signal, which propagates to all parallel branches via shared `AbortController`

### Scope.exec() Integration

`Scope.exec()` creates an internal ExecutionContext. This context is **auto-closed** when the flow completes:

```typescript
// Internal behavior of scope.exec()
const execution = scope.exec({ flow, input })

// Internally:
// 1. Create ExecutionContext
// 2. Execute flow
// 3. Auto-close context (graceful) when flow settles
// 4. Return Promised with result
```

This ensures contexts created via `scope.exec()` don't leak. Users who need manual control should use `scope.createExecution()` instead.

### Error Handling

- `close()` on already-closed context: No-op, returns resolved promise
- `exec()` on closing/closed context: Throws `ExecutionContextClosedError`
- Errors during close: Collected from in-flight executions, thrown as `AggregateError` after all settle
- In-flight execution errors: Included in AggregateError only if close itself needs to report them; individual execution errors are still available via their `Promised` results

## Changes Across Layers {#adr-001-changes}

### Context Level
No changes to c3-0.

### Container Level
No changes to c3-1 container doc.

### Component Level

**c3-102 (Flow & ExecutionContext):**

1. Add `close()` method to `ExecutionContext.Context` interface
2. Add `state` and `closed` readonly properties
3. Add `onStateChange()` subscription method
4. Update Execution Lifecycle section to document close states
5. Add new section: "Context Lifecycle Management"
6. Update source files table to note changes to `execution-context.ts`
7. Add test scenarios for close behavior

**c3-104 (Extension System):**

1. Add `ContextLifecycleOperation` type to `Extension.Operation` union
2. Document the three phases: `create`, `closing`, `closed`
3. Add example patterns for context lifecycle in `wrap()`

**Source file changes:**
- `execution-context.ts`: Add `close()`, `state`, `closed`, `onStateChange()`, child tracking, in-flight tracking
- `types.ts`: Update `ExecutionContext.Context` interface, add `ContextLifecycleOperation`
- `scope.ts`: Emit `context-lifecycle` operations through extension pipeline

## Verification {#adr-001-verification}

### Core Behavior
- [x] `close()` awaits all in-flight `exec()` calls in graceful mode
- [x] `close()` triggers abort and rejects pending in abort mode
- [x] Child contexts are cascaded (both modes)
- [x] `exec()` throws `ExecutionContextClosedError` after `close()` is called
- [x] Multiple `close()` calls are idempotent (returns same promise)

### State Management
- [x] `state` property transitions: `active` → `closing` → `closed`
- [x] `closed` property returns `true` only when `state === 'closed'`
- [x] State is `closing` during drain/abort phase
- [x] `onStateChange()` callback fires on each transition
- [x] `onStateChange()` returns cleanup function that unsubscribes

### Execution Tracking
- [x] Flow executions (`ctx.exec(flow, input)`) are tracked and awaited
- [x] Function executions (`ctx.exec({ fn })`) are tracked and awaited
- [x] `parallel()` operations are tracked as single unit
- [x] `parallelSettled()` operations are tracked as single unit

### Error Handling
- [x] Error during child close doesn't prevent other children from closing
- [x] Errors collected into `AggregateError` when multiple failures
- [x] Individual execution errors still available via `Promised` results

### Extension Integration
- [x] `wrap()` receives `context-lifecycle` operation with `phase: 'create'` on context creation
- [x] `wrap()` receives `context-lifecycle` operation with `phase: 'closing'` when close starts
- [x] `wrap()` receives `context-lifecycle` operation with `phase: 'closed'` after drain completes
- [x] `closing` phase includes correct `mode` parameter
- [x] Extension errors in `wrap()` don't prevent context close

### Integration
- [x] `Scope.exec()` auto-closes its internal context on completion
- [x] `scope.createExecution()` returns context requiring manual close
- [x] AbortSignal propagation still works as before
- [x] Existing tests continue to pass

## Future Considerations {#adr-001-future}

### Symbol.asyncDispose Support

The explicit `close()` pattern pairs well with TC39 Explicit Resource Management (`using`/`await using`). A future enhancement could add:

```typescript
interface ExecutionContext.Context {
  [Symbol.asyncDispose](): Promise<void>  // equivalent to close()
}

// Usage:
await using ctx = scope.createExecution({ tags: [...] })
// Automatically closed at end of block
```

This is deferred as the proposal is still Stage 3 and TypeScript support is recent. Can be added without breaking changes.

## Alternatives Considered {#adr-001-alternatives}

### 1. Add `onCleanup()` registration

```typescript
ctx.onCleanup(async () => {
  await flushMetrics()
})
```

**Rejected:** The Controller pattern already exists for executor cleanup. Context-level cleanup can be handled by the caller wrapping `close()`. Adds API surface without clear benefit.

### 2. Extend Scope.dispose() to close all contexts

**Rejected:** Scope is long-lived, contexts are short-lived. Scope may have many concurrent contexts (multi-tenant, parallel requests). Coupling lifecycle doesn't fit the model.

### 3. Auto-close context when root flow completes

**Rejected for `createExecution()`:** User may want to execute multiple sequential flows in same context. Explicit `close()` gives control to caller.

**Accepted for `scope.exec()`:** Internal contexts from `scope.exec()` are auto-closed since they represent single flow executions.

## Related {#adr-001-related}

- [c3-102](../c3-1-core/c3-102-flow.md) - Flow & ExecutionContext (primary change)
- [c3-101](../c3-1-core/c3-101-scope.md) - Scope & Executor (context creation)
- [c3-104](../c3-1-core/c3-104-extension.md) - Extension System (context lifecycle hooks)

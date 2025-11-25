# ExecutionContext Lifecycle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `close()` method to ExecutionContext with graceful/abort modes, state tracking, and extension integration via `context-lifecycle` operations.

**Architecture:** ExecutionContext gains lifecycle state machine (`active` → `closing` → `closed`), tracks in-flight `Promised` executions, cascades close to children, and emits `context-lifecycle` operations through extension `wrap()`. Scope.exec() auto-closes its internal context.

**Tech Stack:** TypeScript, Vitest, existing pumped-fn patterns

**Reference:** ADR at `.c3/adr/adr-001-execution-context-lifecycle.md`

---

## Task 1: Add ContextState Type and ExecutionContextClosedError

**Files:**
- Modify: `packages/next/src/types.ts`
- Modify: `packages/next/src/errors.ts`

**Step 1: Add ContextState type to types.ts**

In `packages/next/src/types.ts`, add inside the `ExecutionContext` namespace (around line 590):

```typescript
export type ContextState = 'active' | 'closing' | 'closed'
```

**Step 2: Add ContextLifecycleOperation type**

In `packages/next/src/types.ts`, add inside the `Extension` namespace (after ExecutionOperation, around line 700):

```typescript
export type ContextLifecycleOperation = {
  kind: "context-lifecycle"
  phase: "create" | "closing" | "closed"
  context: ExecutionContext.Context
  mode?: 'graceful' | 'abort'
}

// Update Operation union
export type Operation = ResolveOperation | ExecutionOperation | ContextLifecycleOperation
```

**Step 3: Add ExecutionContextClosedError to errors.ts**

In `packages/next/src/errors.ts`, add:

```typescript
export class ExecutionContextClosedError extends Error {
  readonly contextId: string
  readonly state: ExecutionContext.ContextState

  constructor(contextId: string, state: ExecutionContext.ContextState) {
    super(`ExecutionContext ${contextId} is ${state}`)
    this.name = 'ExecutionContextClosedError'
    this.contextId = contextId
    this.state = state
  }
}
```

**Step 4: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS (no type errors)

**Step 5: Commit**

```bash
git add packages/next/src/types.ts packages/next/src/errors.ts
git commit -m "feat(core): add ContextState type and ExecutionContextClosedError"
```

---

## Task 2: Add State and Closed Properties to ExecutionContext Interface

**Files:**
- Modify: `packages/next/src/types.ts`

**Step 1: Update ExecutionContext.Context interface**

In `packages/next/src/types.ts`, find `ExecutionContext.Context` interface and add:

```typescript
export interface Context {
  // ... existing properties ...

  readonly state: ContextState
  readonly closed: boolean

  close(options?: { mode?: 'graceful' | 'abort' }): Promise<void>

  onStateChange(callback: (state: ContextState, prev: ContextState) => void): () => void
}
```

**Step 2: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: FAIL - ExecutionContextImpl doesn't implement new properties yet (this is expected)

**Step 3: Commit interface changes**

```bash
git add packages/next/src/types.ts
git commit -m "feat(core): add lifecycle methods to ExecutionContext.Context interface"
```

---

## Task 3: Implement State Management in ExecutionContextImpl

**Files:**
- Modify: `packages/next/src/execution-context.ts`
- Test: `packages/next/tests/execution-context.behavior.test.ts`

**Step 1: Write failing test for state property**

Add to `packages/next/tests/execution-context.behavior.test.ts`:

```typescript
describe("ExecutionContext lifecycle", () => {
  it("starts in active state", async () => {
    const scope = createScope()
    const ctx = scope.createExecution({ name: "test" })

    expect(ctx.state).toBe("active")
    expect(ctx.closed).toBe(false)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test -- --run execution-context.behavior`
Expected: FAIL - `state` property doesn't exist

**Step 3: Add state property to ExecutionContextImpl**

In `packages/next/src/execution-context.ts`, add to class:

```typescript
export class ExecutionContextImpl implements ExecutionContext.Context {
  // ... existing properties ...

  private _state: ExecutionContext.ContextState = 'active'
  private stateChangeCallbacks: Set<(state: ExecutionContext.ContextState, prev: ExecutionContext.ContextState) => void> = new Set()

  get state(): ExecutionContext.ContextState {
    return this._state
  }

  get closed(): boolean {
    return this._state === 'closed'
  }

  private setState(newState: ExecutionContext.ContextState): void {
    const prev = this._state
    if (prev === newState) return
    this._state = newState
    for (const cb of this.stateChangeCallbacks) {
      try {
        cb(newState, prev)
      } catch {
        // ignore callback errors
      }
    }
  }

  onStateChange(callback: (state: ExecutionContext.ContextState, prev: ExecutionContext.ContextState) => void): () => void {
    this.stateChangeCallbacks.add(callback)
    return () => {
      this.stateChangeCallbacks.delete(callback)
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test -- --run execution-context.behavior`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/next/src/execution-context.ts packages/next/tests/execution-context.behavior.test.ts
git commit -m "feat(core): implement state property on ExecutionContextImpl"
```

---

## Task 4: Implement onStateChange Subscription

**Files:**
- Modify: `packages/next/src/execution-context.ts`
- Test: `packages/next/tests/execution-context.behavior.test.ts`

**Step 1: Write failing test for onStateChange**

Add to `packages/next/tests/execution-context.behavior.test.ts`:

```typescript
it("notifies subscribers on state change", async () => {
  const scope = createScope()
  const ctx = scope.createExecution({ name: "test" })

  const transitions: Array<{ state: string; prev: string }> = []
  const cleanup = ctx.onStateChange((state, prev) => {
    transitions.push({ state, prev })
  })

  // Force state change via internal method for now
  ;(ctx as any).setState('closing')
  ;(ctx as any).setState('closed')

  expect(transitions).toEqual([
    { state: 'closing', prev: 'active' },
    { state: 'closed', prev: 'closing' }
  ])

  cleanup()
  ;(ctx as any).setState('active') // won't notify after cleanup
  expect(transitions.length).toBe(2)
})
```

**Step 2: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test -- --run execution-context.behavior`
Expected: PASS (implementation from Task 3 should cover this)

**Step 3: Commit**

```bash
git add packages/next/tests/execution-context.behavior.test.ts
git commit -m "test(core): add onStateChange subscription tests"
```

---

## Task 5: Add In-Flight Execution Tracking

**Files:**
- Modify: `packages/next/src/execution-context.ts`
- Test: `packages/next/tests/execution-context.behavior.test.ts`

**Step 1: Add tracking infrastructure**

In `packages/next/src/execution-context.ts`, add to class:

```typescript
export class ExecutionContextImpl implements ExecutionContext.Context {
  // ... existing properties ...

  private inFlight: Set<Promise<unknown>> = new Set()
  private children: Set<ExecutionContextImpl> = new Set()

  private trackExecution<T>(promise: Promise<T>): Promise<T> {
    this.inFlight.add(promise)
    promise.finally(() => {
      this.inFlight.delete(promise)
    })
    return promise
  }

  private registerChild(child: ExecutionContextImpl): void {
    this.children.add(child)
  }

  private unregisterChild(child: ExecutionContextImpl): void {
    this.children.delete(child)
  }
}
```

**Step 2: Update exec() to track executions**

Find the `exec()` method and wrap the returned Promised:

```typescript
exec<F extends Flow.UFlow>(
  // ... overloads ...
): Promised<any> {
  this.throwIfAborted()
  this.throwIfClosed() // Add this check

  // ... existing implementation ...

  const result = Promised.create(
    executeWithTimeout(wrapped, config.timeout, timeoutId, controller)
  )

  // Track the execution
  this.trackExecution(result.toPromise())

  return result
}
```

**Step 3: Add throwIfClosed check**

```typescript
private throwIfClosed(): void {
  if (this._state !== 'active') {
    throw new ExecutionContextClosedError(this.id, this._state)
  }
}
```

**Step 4: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/next/src/execution-context.ts
git commit -m "feat(core): add in-flight execution tracking"
```

---

## Task 6: Implement close() Method - Graceful Mode

**Files:**
- Modify: `packages/next/src/execution-context.ts`
- Test: `packages/next/tests/execution-context.behavior.test.ts`

**Step 1: Write failing test for graceful close**

Add to `packages/next/tests/execution-context.behavior.test.ts`:

```typescript
it("close() waits for in-flight executions in graceful mode", async () => {
  const scope = createScope()
  const ctx = scope.createExecution({ name: "test" })

  let resolved = false
  const slowFlow = flow({
    name: "slow",
    input: custom<void>(),
    output: custom<string>()
  }).handler(async () => {
    await new Promise(r => setTimeout(r, 50))
    resolved = true
    return "done"
  })

  const execution = ctx.exec(slowFlow, undefined)

  expect(ctx.state).toBe("active")

  const closePromise = ctx.close()

  expect(ctx.state).toBe("closing")
  expect(resolved).toBe(false)

  await closePromise

  expect(ctx.state).toBe("closed")
  expect(resolved).toBe(true)
  expect(ctx.closed).toBe(true)
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test -- --run execution-context.behavior`
Expected: FAIL - `close` method doesn't exist

**Step 3: Implement close() method**

In `packages/next/src/execution-context.ts`:

```typescript
private closePromise: Promise<void> | null = null

async close(options?: { mode?: 'graceful' | 'abort' }): Promise<void> {
  // Idempotent - return existing promise if already closing/closed
  if (this.closePromise) {
    return this.closePromise
  }

  if (this._state === 'closed') {
    return Promise.resolve()
  }

  const mode = options?.mode ?? 'graceful'

  this.closePromise = this.performClose(mode)
  return this.closePromise
}

private async performClose(mode: 'graceful' | 'abort'): Promise<void> {
  this.setState('closing')

  // Abort mode: trigger abort controller
  if (mode === 'abort') {
    this.abortController.abort(new Error('Context closed'))
  }

  // Cascade to children
  const childClosePromises = Array.from(this.children).map(child =>
    child.close({ mode }).catch(() => {})
  )
  await Promise.allSettled(childClosePromises)

  // Wait for in-flight executions
  await Promise.allSettled([...this.inFlight])

  // Mark complete
  this.end()
  this.setState('closed')
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test -- --run execution-context.behavior`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/next/src/execution-context.ts packages/next/tests/execution-context.behavior.test.ts
git commit -m "feat(core): implement close() with graceful mode"
```

---

## Task 7: Implement close() Method - Abort Mode

**Files:**
- Modify: `packages/next/src/execution-context.ts`
- Test: `packages/next/tests/execution-context.behavior.test.ts`

**Step 1: Write failing test for abort close**

Add to `packages/next/tests/execution-context.behavior.test.ts`:

```typescript
it("close() aborts in-flight executions in abort mode", async () => {
  const scope = createScope()
  const ctx = scope.createExecution({ name: "test" })

  const neverFlow = flow({
    name: "never",
    input: custom<void>(),
    output: custom<void>()
  }).handler(async (flowCtx) => {
    await new Promise((_, reject) => {
      flowCtx.signal.addEventListener('abort', () => {
        reject(new Error('Aborted'))
      })
    })
  })

  const execution = ctx.exec(neverFlow, undefined)

  await ctx.close({ mode: 'abort' })

  expect(ctx.state).toBe("closed")
  await expect(execution).rejects.toThrow()
})
```

**Step 2: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test -- --run execution-context.behavior`
Expected: PASS (implementation from Task 6 covers abort mode)

**Step 3: Commit**

```bash
git add packages/next/tests/execution-context.behavior.test.ts
git commit -m "test(core): add abort mode close tests"
```

---

## Task 8: Test exec() Throws After Close

**Files:**
- Test: `packages/next/tests/execution-context.behavior.test.ts`

**Step 1: Write test for exec after close**

Add to `packages/next/tests/execution-context.behavior.test.ts`:

```typescript
import { ExecutionContextClosedError } from "../src/errors"

it("exec() throws ExecutionContextClosedError after close", async () => {
  const scope = createScope()
  const ctx = scope.createExecution({ name: "test" })

  await ctx.close()

  const simpleFlow = flow({
    name: "simple",
    input: custom<void>(),
    output: custom<string>()
  }).handler(async () => "result")

  expect(() => ctx.exec(simpleFlow, undefined)).toThrow(ExecutionContextClosedError)
})

it("exec() throws ExecutionContextClosedError while closing", async () => {
  const scope = createScope()
  const ctx = scope.createExecution({ name: "test" })

  const slowFlow = flow({
    name: "slow",
    input: custom<void>(),
    output: custom<void>()
  }).handler(async () => {
    await new Promise(r => setTimeout(r, 100))
  })

  ctx.exec(slowFlow, undefined)
  const closePromise = ctx.close()

  const simpleFlow = flow({
    name: "simple",
    input: custom<void>(),
    output: custom<string>()
  }).handler(async () => "result")

  expect(() => ctx.exec(simpleFlow, undefined)).toThrow(ExecutionContextClosedError)

  await closePromise
})
```

**Step 2: Run tests**

Run: `pnpm -F @pumped-fn/core-next test -- --run execution-context.behavior`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/next/tests/execution-context.behavior.test.ts
git commit -m "test(core): verify exec throws after close"
```

---

## Task 9: Implement Child Context Registration

**Files:**
- Modify: `packages/next/src/execution-context.ts`
- Test: `packages/next/tests/execution-context.behavior.test.ts`

**Step 1: Write test for child cascade**

Add to `packages/next/tests/execution-context.behavior.test.ts`:

```typescript
it("close() cascades to child contexts", async () => {
  const scope = createScope()
  const ctx = scope.createExecution({ name: "parent" })

  const childStates: string[] = []

  const nestedFlow = flow({
    name: "nested",
    input: custom<void>(),
    output: custom<void>()
  }).handler(async (flowCtx) => {
    flowCtx.onStateChange((state) => {
      childStates.push(state)
    })
    await new Promise(r => setTimeout(r, 100))
  })

  ctx.exec(nestedFlow, undefined)

  await new Promise(r => setTimeout(r, 10)) // Let child start

  await ctx.close()

  expect(childStates).toContain('closing')
  expect(childStates).toContain('closed')
})
```

**Step 2: Update createChildContext to register with parent**

In `packages/next/src/execution-context.ts`, update `createChildContext`:

```typescript
const createChildContext = (config: ContextConfig): ExecutionContextImpl => {
  const childCtx = new ExecutionContextImpl({
    scope: config.parent.scope,
    extensions: config.parent["extensions"],
    tags: config.tags,
    parent: config.parent,
    abortController: config.abortController,
    details: { name: config.flowName }
  })
  childCtx.initializeExecutionContext(config.flowName, config.isParallel)

  // Register with parent
  config.parent.registerChild(childCtx)

  return childCtx
}
```

**Step 3: Make registerChild accessible**

Change `registerChild` from private to package-accessible or add a method to expose it.

**Step 4: Run tests**

Run: `pnpm -F @pumped-fn/core-next test -- --run execution-context.behavior`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/next/src/execution-context.ts packages/next/tests/execution-context.behavior.test.ts
git commit -m "feat(core): register child contexts for cascade close"
```

---

## Task 10: Add ContextLifecycleOperation to Extension Pipeline

**Files:**
- Modify: `packages/next/src/execution-context.ts`
- Modify: `packages/next/src/scope.ts`
- Test: `packages/next/tests/extensions.behavior.test.ts`

**Step 1: Write failing test for extension wrap**

Add to `packages/next/tests/extensions.behavior.test.ts`:

```typescript
describe("context lifecycle operations", () => {
  it("wrap receives context-lifecycle operations", async () => {
    const operations: Array<{ kind: string; phase?: string }> = []

    const trackingExt = {
      name: "tracking",
      wrap(scope: any, next: any, operation: any) {
        if (operation.kind === "context-lifecycle") {
          operations.push({ kind: operation.kind, phase: operation.phase })
        }
        return next()
      }
    }

    const scope = createScope({ extensions: [trackingExt] })
    const ctx = scope.createExecution({ name: "test" })

    await ctx.close()

    expect(operations).toContainEqual({ kind: "context-lifecycle", phase: "create" })
    expect(operations).toContainEqual({ kind: "context-lifecycle", phase: "closing" })
    expect(operations).toContainEqual({ kind: "context-lifecycle", phase: "closed" })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test -- --run extensions.behavior`
Expected: FAIL - operations not emitted

**Step 3: Emit create operation in scope.createExecution**

In `packages/next/src/scope.ts`, update `createExecution`:

```typescript
createExecution(details?: Partial<ExecutionContext.Details> & { tags?: Tag.Tagged[] }): ExecutionContext.Context {
  this["~ensureNotDisposed"]();
  const ctx = new ExecutionContextImpl({
    scope: this,
    extensions: this.extensions,
    details: details || {},
    tags: details?.tags
  });

  // Emit create operation through extension pipeline
  this.emitContextLifecycle(ctx, 'create')

  return ctx;
}

private emitContextLifecycle(
  context: ExecutionContext.Context,
  phase: 'create' | 'closing' | 'closed',
  mode?: 'graceful' | 'abort'
): void {
  const operation: Extension.ContextLifecycleOperation = {
    kind: 'context-lifecycle',
    phase,
    context,
    mode
  }

  const noop = () => Promised.create(Promise.resolve(undefined))
  const wrapped = this.wrapWithExtensions(noop, operation)
  wrapped()
}
```

**Step 4: Emit closing/closed operations in ExecutionContextImpl.close**

In `packages/next/src/execution-context.ts`, update `performClose`:

```typescript
private async performClose(mode: 'graceful' | 'abort'): Promise<void> {
  this.setState('closing')

  // Emit closing operation
  this.emitLifecycleOperation('closing', mode)

  if (mode === 'abort') {
    this.abortController.abort(new Error('Context closed'))
  }

  const childClosePromises = Array.from(this.children).map(child =>
    child.close({ mode }).catch(() => {})
  )
  await Promise.allSettled(childClosePromises)

  await Promise.allSettled([...this.inFlight])

  this.end()
  this.setState('closed')

  // Emit closed operation
  this.emitLifecycleOperation('closed')
}

private emitLifecycleOperation(phase: 'closing' | 'closed', mode?: 'graceful' | 'abort'): void {
  const operation: Extension.ContextLifecycleOperation = {
    kind: 'context-lifecycle',
    phase,
    context: this,
    mode
  }

  const noop = () => Promised.create(Promise.resolve(undefined))
  const wrapped = applyExtensions(this.extensions, noop, this.scope, operation)
  wrapped()
}
```

**Step 5: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test -- --run extensions.behavior`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/next/src/execution-context.ts packages/next/src/scope.ts packages/next/tests/extensions.behavior.test.ts
git commit -m "feat(core): emit context-lifecycle operations through extension wrap"
```

---

## Task 11: Auto-close Context in Scope.exec()

**Files:**
- Modify: `packages/next/src/scope.ts`
- Test: `packages/next/tests/execution-context.behavior.test.ts`

**Step 1: Write test for auto-close**

Add to `packages/next/tests/execution-context.behavior.test.ts`:

```typescript
it("scope.exec() auto-closes internal context", async () => {
  const closedContexts: string[] = []

  const trackingExt = {
    name: "tracking",
    wrap(scope: any, next: any, operation: any) {
      if (operation.kind === "context-lifecycle" && operation.phase === "closed") {
        closedContexts.push(operation.context.id)
      }
      return next()
    }
  }

  const scope = createScope({ extensions: [trackingExt] })

  const simpleFlow = flow({
    name: "simple",
    input: custom<void>(),
    output: custom<string>()
  }).handler(async () => "result")

  await scope.exec({ flow: simpleFlow, input: undefined }).result

  expect(closedContexts.length).toBe(1)
})
```

**Step 2: Update scope.exec to auto-close**

In `packages/next/src/scope.ts`, in the `~executeFlow` method, add auto-close:

```typescript
private "~executeFlow"<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>>,
  input: I,
  executionTags?: Tag.Tagged[],
  abortController?: AbortController
): Promised<S> {
  // ... existing implementation ...

  const promise = (async () => {
    // ... existing flow execution ...

    try {
      const result = await executor()
      context.end()

      // Auto-close the context
      await context.close()

      resolveSnapshot(context.createSnapshot())
      return result
    } catch (error) {
      context.details.error = error
      context.end()

      // Auto-close even on error
      await context.close().catch(() => {})

      resolveSnapshot(context.createSnapshot())
      throw error
    }
  })()

  return Promised.create(promise, snapshotPromise)
}
```

**Step 3: Run test**

Run: `pnpm -F @pumped-fn/core-next test -- --run execution-context.behavior`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/next/src/scope.ts packages/next/tests/execution-context.behavior.test.ts
git commit -m "feat(core): auto-close context in scope.exec()"
```

---

## Task 12: Export New Types from Index

**Files:**
- Modify: `packages/next/src/index.ts`

**Step 1: Export ExecutionContextClosedError**

In `packages/next/src/index.ts`, add:

```typescript
export { ExecutionContextClosedError } from "./errors"
```

**Step 2: Ensure ContextState is accessible via ExecutionContext namespace**

Verify that `ExecutionContext.ContextState` is already exported (it should be via the namespace re-export).

**Step 3: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 4: Run all tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/next/src/index.ts
git commit -m "feat(core): export ExecutionContextClosedError"
```

---

## Task 13: Update C3 Documentation

**Files:**
- Modify: `.c3/c3-1-core/c3-102-flow.md`
- Modify: `.c3/c3-1-core/c3-104-extension.md`

**Step 1: Update c3-102 Execution Lifecycle section**

Add new section to `.c3/c3-1-core/c3-102-flow.md`:

```markdown
## Context Lifecycle Management {#c3-102-lifecycle-management}

ExecutionContext has explicit lifecycle control:

| Property/Method | Purpose |
|-----------------|---------|
| `state` | Current state: `'active'` \| `'closing'` \| `'closed'` |
| `closed` | Convenience: `true` when `state === 'closed'` |
| `close(options?)` | Close context with `mode: 'graceful'` (default) or `'abort'` |
| `onStateChange(cb)` | Subscribe to state transitions, returns cleanup function |

**Graceful close:** Waits for all in-flight executions to complete.

**Abort close:** Triggers AbortController, rejects pending executions.

Both modes cascade to child contexts.
```

**Step 2: Update c3-104 Extension Operations section**

Add to `.c3/c3-1-core/c3-104-extension.md`:

```markdown
**ContextLifecycleOperation:**
```typescript
{
  kind: "context-lifecycle",
  phase: "create" | "closing" | "closed",
  context: ExecutionContext.Context,
  mode?: "graceful" | "abort"  // present for "closing" phase
}
```

Emitted when ExecutionContext is created, closing, or closed. Use for tracing spans, request logging, cleanup.
```

**Step 3: Commit**

```bash
git add .c3/c3-1-core/c3-102-flow.md .c3/c3-1-core/c3-104-extension.md
git commit -m "docs: update C3 docs for ExecutionContext lifecycle"
```

---

## Task 14: Final Verification

**Step 1: Run full test suite**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests PASS

**Step 2: Run typecheck including tests**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: PASS

**Step 3: Run examples typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: PASS

**Step 4: Build**

Run: `pnpm -F @pumped-fn/core-next build`
Expected: PASS

**Step 5: Commit final state**

```bash
git add -A
git commit -m "feat(core): complete ExecutionContext lifecycle implementation

- Add close() with graceful/abort modes
- Add state, closed properties
- Add onStateChange() subscription
- Track in-flight executions via Promised
- Cascade close to child contexts
- Emit context-lifecycle operations for extensions
- Auto-close context in scope.exec()
- Add ExecutionContextClosedError

Implements ADR-001."
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add types | types.ts, errors.ts |
| 2 | Update interface | types.ts |
| 3 | Implement state | execution-context.ts |
| 4 | onStateChange | execution-context.ts |
| 5 | In-flight tracking | execution-context.ts |
| 6 | close() graceful | execution-context.ts |
| 7 | close() abort | tests |
| 8 | exec throws after close | tests |
| 9 | Child registration | execution-context.ts |
| 10 | Extension operations | execution-context.ts, scope.ts |
| 11 | Auto-close in scope.exec | scope.ts |
| 12 | Export types | index.ts |
| 13 | Update docs | c3-102, c3-104 |
| 14 | Final verification | all |

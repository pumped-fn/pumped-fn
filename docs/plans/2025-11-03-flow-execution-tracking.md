# Flow Execution Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add execution tracking with IDs, cancellation, timeout, and unified ctx.exec() API

**Architecture:** FlowExecution class wraps Promised<T> with metadata (id, status, abort, ctx). Scope maintains execution registry with auto-cleanup. AbortController propagates through FlowContext. Unify ctx.run/exec into single ctx.exec() config API.

**Tech Stack:** TypeScript, existing Promised/FlowContext/BaseScope classes

---

## Task 1: Add FlowExecution Types and Status Enum

**Files:**
- Modify: `packages/next/src/types.ts` (add to Flow namespace)

**Step 1: Write type definitions**

Add to `packages/next/src/types.ts` after line 620:

```typescript
export namespace Flow {
  // ... existing types

  export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

  export interface FlowExecution<T> {
    readonly result: Promised<T>;
    readonly id: string;
    readonly flowName: string | undefined;
    readonly status: ExecutionStatus;
    readonly ctx: ExecutionData;
    readonly abort: AbortController;

    onStatusChange(
      callback: (status: ExecutionStatus, execution: FlowExecution<T>) => void | Promise<void>
    ): Core.Cleanup;
  }
}
```

**Step 2: Verify types compile**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/next/src/types.ts
git commit -m "feat: add FlowExecution types and ExecutionStatus"
```

---

## Task 2: Add FlowExecution Class Implementation

**Files:**
- Create: `packages/next/src/flow-execution.ts`

**Step 1: Write FlowExecution class**

Create `packages/next/src/flow-execution.ts`:

```typescript
import { Promised } from "./promises";
import { type Flow, type Core } from "./types";

type StatusCallback<T> = (
  status: Flow.ExecutionStatus,
  execution: Flow.FlowExecution<T>
) => void | Promise<void>;

export class FlowExecutionImpl<T> implements Flow.FlowExecution<T> {
  readonly result: Promised<T>;
  readonly id: string;
  readonly flowName: string | undefined;
  readonly abort: AbortController;

  private _status: Flow.ExecutionStatus = 'pending';
  private statusCallbacks = new Set<StatusCallback<T>>();
  private _ctx: Flow.ExecutionData;

  constructor(config: {
    id: string;
    flowName: string | undefined;
    abort: AbortController;
    result: Promised<T>;
    ctx: Flow.ExecutionData;
  }) {
    this.id = config.id;
    this.flowName = config.flowName;
    this.abort = config.abort;
    this._ctx = config.ctx;
    this.result = config.result;
  }

  get status(): Flow.ExecutionStatus {
    return this._status;
  }

  get ctx(): Flow.ExecutionData {
    return this._ctx;
  }

  setStatus(newStatus: Flow.ExecutionStatus): void {
    if (this._status === newStatus) return;

    this._status = newStatus;

    for (const callback of this.statusCallbacks) {
      Promise.resolve(callback(newStatus, this)).catch((err) => {
        console.error('Error in status change callback:', err);
      });
    }
  }

  onStatusChange(callback: StatusCallback<T>): Core.Cleanup {
    this.statusCallbacks.add(callback);
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }
}
```

**Step 2: Export from index**

Add to `packages/next/src/index.ts`:

```typescript
export { FlowExecutionImpl } from "./flow-execution";
```

**Step 3: Verify types compile**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/next/src/flow-execution.ts packages/next/src/index.ts
git commit -m "feat: implement FlowExecution class"
```

---

## Task 3: Add AbortController to FlowContext

**Files:**
- Modify: `packages/next/src/flow.ts:140-156` (FlowContext constructor)
- Modify: `packages/next/src/types.ts:551-602` (Flow.C interface)

**Step 1: Write test for abort signal**

Add to `packages/next/tests/flow-expected.test.ts`:

```typescript
test('flow context provides abort signal', async () => {
  const abortController = new AbortController();
  let capturedSignal: AbortSignal | undefined;

  const testFlow = flow((ctx) => {
    capturedSignal = ctx.signal;
    expect(ctx.signal).toBeDefined();
    expect(ctx.signal.aborted).toBe(false);
    return 42;
  });

  const scope = createScope();
  // TODO: Pass abortController to exec
  await scope.resolve(testFlow).map((handler) => handler(scope as any, undefined));

  expect(capturedSignal).toBeDefined();
  expect(capturedSignal!.aborted).toBe(false);
});

test('flow context throwIfAborted throws when aborted', async () => {
  const abortController = new AbortController();

  const testFlow = flow((ctx) => {
    abortController.abort();
    ctx.throwIfAborted();
    return 42;
  });

  const scope = createScope();

  await expect(async () => {
    await scope.resolve(testFlow).map((handler) => handler(scope as any, undefined));
  }).rejects.toThrow('Flow execution cancelled');
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test flow-expected`
Expected: FAIL - signal/throwIfAborted not defined

**Step 3: Add signal and throwIfAborted to Flow.C interface**

Modify `packages/next/src/types.ts` in Flow.C interface (around line 551):

```typescript
export type C = {
  readonly scope: Core.Scope;
  readonly tags: Tag.Tagged[] | undefined;
  readonly signal: AbortSignal;

  throwIfAborted(): void;

  get<T>(
    accessor:
      | import("./tag-types").Tag.Tag<T, false>
      | import("./tag-types").Tag.Tag<T, true>
  ): T;
  // ... rest of interface
```

**Step 4: Implement in FlowContext**

Modify `packages/next/src/flow.ts` FlowContext class:

```typescript
class FlowContext implements Flow.Context {
  private contextData = new Map<unknown, unknown>();
  private journal: Map<string, unknown> | null = null;
  public readonly scope: Core.Scope;
  private reversedExtensions: Extension.Extension[];
  public readonly tags: Tag.Tagged[] | undefined;
  private abortController: AbortController;  // ADD THIS

  constructor(
    scope: Core.Scope,
    private extensions: Extension.Extension[],
    tags?: Tag.Tagged[],
    private parent?: FlowContext | undefined,
    abortController?: AbortController  // ADD THIS
  ) {
    this.scope = scope;
    this.reversedExtensions = [...extensions].reverse();
    this.tags = tags;
    this.abortController = abortController || new AbortController();  // ADD THIS
  }

  get signal(): AbortSignal {  // ADD THIS METHOD
    return this.abortController.signal;
  }

  throwIfAborted(): void {  // ADD THIS METHOD
    if (this.signal.aborted) {
      throw new Error('Flow execution cancelled');
    }
  }

  // ... rest of methods
```

**Step 5: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test flow-expected`
Expected: PASS

**Step 6: Verify all types compile**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: No errors

**Step 7: Commit**

```bash
git add packages/next/src/flow.ts packages/next/src/types.ts packages/next/tests/flow-expected.test.ts
git commit -m "feat: add AbortController support to FlowContext"
```

---

## Task 4: Update scope.exec() to Return FlowExecution

**Files:**
- Modify: `packages/next/src/scope.ts:1084-1132` (exec method)
- Modify: `packages/next/src/types.ts:365-407` (Core.Scope interface)

**Step 1: Write test for FlowExecution return**

Add to `packages/next/tests/flow-expected.test.ts`:

```typescript
test('scope.exec returns FlowExecution with metadata', async () => {
  const testFlow = flow((ctx, input: number) => input * 2);
  const scope = createScope();

  const execution = scope.exec({ flow: testFlow, input: 5 });

  expect(execution.id).toBeDefined();
  expect(typeof execution.id).toBe('string');
  expect(execution.status).toBe('pending');
  expect(execution.abort).toBeInstanceOf(AbortController);
  expect(execution.result).toBeDefined();

  const result = await execution.result;
  expect(result).toBe(10);
  expect(execution.status).toBe('completed');
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test flow-expected`
Expected: FAIL - exec doesn't accept config object

**Step 3: Update Core.Scope interface**

Modify `packages/next/src/types.ts` Core.Scope interface (around line 365):

```typescript
export interface Scope {
  // ... existing methods

  exec<S, I>(config: {
    flow: Executor<Flow.Handler<S, I>>;
    input?: I;
    timeout?: number;
    tags?: Tag.Tagged[];
  }): Flow.FlowExecution<S>;

  exec<S, D extends DependencyLike>(config: {
    dependencies: D;
    fn: (deps: InferOutput<D>) => S | Promise<S>;
    timeout?: number;
    tags?: Tag.Tagged[];
  }): Flow.FlowExecution<S>;

  exec<S, I, D extends DependencyLike>(config: {
    dependencies: D;
    fn: (deps: InferOutput<D>, input: I) => S | Promise<S>;
    input: I;
    timeout?: number;
    tags?: Tag.Tagged[];
  }): Flow.FlowExecution<S>;
}
```

**Step 4: Import FlowExecutionImpl in scope.ts**

Add to imports in `packages/next/src/scope.ts`:

```typescript
import { FlowExecutionImpl } from "./flow-execution";
```

**Step 5: Implement new exec signature**

Replace the entire `exec` method in `packages/next/src/scope.ts` (lines 1084-1132):

```typescript
exec<S, I = undefined>(
  configOrFlow:
    | { flow: Core.Executor<Flow.Handler<S, I>>; input?: I; timeout?: number; tags?: Tag.Tagged[] }
    | { dependencies: Core.DependencyLike; fn: (...args: any[]) => S | Promise<S>; input?: any; timeout?: number; tags?: Tag.Tagged[] }
    | Core.Executor<Flow.Handler<S, I>>,
  input?: I,
  options?: { tags?: Tag.Tagged[]; details?: boolean }
): Flow.FlowExecution<S> | Promised<S> | Promised<Flow.ExecutionDetails<S>> {
  this["~ensureNotDisposed"]();

  // Handle old signature for backward compat
  if (typeof configOrFlow === 'object' && 'factory' in configOrFlow) {
    // Old signature: exec(flow, input, options)
    const flow = configOrFlow as Core.Executor<Flow.Handler<S, I>>;
    const executionTags = options?.tags;

    if (options?.details === true) {
      const result = this["~executeFlow"](flow, input as I, executionTags);
      return Promised.create(
        result.then(async (r) => {
          const ctx = await result.ctx();
          if (!ctx) {
            throw new Error("Execution context not available");
          }
          return { success: true as const, result: r, ctx };
        }).catch(async (error) => {
          const ctx = await result.ctx();
          if (!ctx) {
            throw new Error("Execution context not available");
          }
          return { success: false as const, error, ctx };
        })
      );
    }

    return this["~executeFlow"](flow, input as I, executionTags);
  }

  // New config signature
  const config = configOrFlow as any;
  const executionId = crypto.randomUUID ? crypto.randomUUID() : `exec-${Date.now()}-${Math.random()}`;
  const abortController = new AbortController();

  let timeoutId: NodeJS.Timeout | undefined;
  if (config.timeout) {
    timeoutId = setTimeout(() => {
      if (!abortController.signal.aborted) {
        abortController.abort(new Error(`Flow execution timeout after ${config.timeout}ms`));
      }
    }, config.timeout);
  }

  let flowPromise: Promised<S>;
  let flowName: string | undefined;

  if ('flow' in config) {
    // Flow execution
    flowPromise = this["~executeFlow"](config.flow, config.input as I, config.tags, abortController);
    const definition = flowDefinitionMeta.readFrom(config.flow);
    flowName = definition?.name;
  } else {
    // Ad-hoc function execution
    flowPromise = Promised.create(
      (async () => {
        const deps = await this["~resolveDependencies"](
          config.dependencies,
          { [executorSymbol]: "main" as const } as any
        );

        if ('input' in config) {
          return config.fn(deps, config.input);
        } else {
          return config.fn(deps);
        }
      })()
    );
    flowName = undefined;
  }

  const execution = new FlowExecutionImpl<S>({
    id: executionId,
    flowName,
    abort: abortController,
    result: flowPromise,
    ctx: null as any, // Will be set when flow executes
  });

  execution.setStatus('running');

  flowPromise
    .then(() => {
      execution.setStatus('completed');
      if (timeoutId) clearTimeout(timeoutId);
    })
    .catch((error) => {
      if (abortController.signal.aborted) {
        execution.setStatus('cancelled');
      } else {
        execution.setStatus('failed');
      }
      if (timeoutId) clearTimeout(timeoutId);
    });

  return execution;
}
```

**Step 6: Update ~executeFlow to accept AbortController**

Modify `~executeFlow` method signature in `packages/next/src/scope.ts` (around line 1134):

```typescript
private "~executeFlow"<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>>,
  input: I,
  executionTags?: Tag.Tagged[],
  abortController?: AbortController
): Promised<S> {
  let resolveSnapshot!: (snapshot: Flow.ExecutionData | undefined) => void;
  const snapshotPromise = new Promise<Flow.ExecutionData | undefined>(
    (resolve) => {
      resolveSnapshot = resolve;
    }
  );

  const promise = (async () => {
    const context = new FlowContext(
      this,
      this.extensions,
      executionTags,
      undefined,
      abortController  // Pass abort controller
    );

    // ... rest of method unchanged
  })();

  return Promised.create(promise, snapshotPromise);
}
```

**Step 7: Add execution registry**

Add to BaseScope class in `packages/next/src/scope.ts` (after line 407):

```typescript
class BaseScope implements Core.Scope {
  protected disposed: boolean = false;
  protected cache: Map<UE, ExecutorState> = new Map();
  protected executions: Map<string, { execution: Flow.FlowExecution<unknown>; startTime: number }> = new Map();  // ADD THIS

  // ... rest of class
```

Update exec method to register executions:

```typescript
// In exec method, after creating execution:
this.executions.set(executionId, { execution, startTime: Date.now() });

execution.result.finally(() => {
  this.executions.delete(executionId);
});
```

**Step 8: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test flow-expected`
Expected: PASS

**Step 9: Verify all types compile**

Run: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No errors

**Step 10: Commit**

```bash
git add packages/next/src/scope.ts packages/next/src/types.ts packages/next/tests/flow-expected.test.ts
git commit -m "feat: update scope.exec to return FlowExecution with registry"
```

---

## Task 5: Add Unified ctx.exec() Config API

**Files:**
- Modify: `packages/next/src/flow.ts:306-404` (FlowContext.exec method)
- Modify: `packages/next/src/types.ts:576-601` (Flow.C interface)

**Step 1: Write tests for new ctx.exec API**

Add to `packages/next/tests/flow-expected.test.ts`:

```typescript
test('ctx.exec with flow config', async () => {
  const childFlow = flow((ctx, input: number) => input * 2);
  const parentFlow = flow(async (ctx, input: number) => {
    const result = await ctx.exec({
      flow: childFlow,
      input: input + 1,
      key: 'double',
      timeout: 1000
    });
    return result;
  });

  const scope = createScope();
  const execution = scope.exec({ flow: parentFlow, input: 5 });
  const result = await execution.result;

  expect(result).toBe(12);
});

test('ctx.exec with function no params', async () => {
  const parentFlow = flow(async (ctx) => {
    const result = await ctx.exec({
      fn: () => 42,
      key: 'compute'
    });
    return result;
  });

  const scope = createScope();
  const execution = scope.exec({ flow: parentFlow, input: undefined });
  const result = await execution.result;

  expect(result).toBe(42);
});

test('ctx.exec with function and params', async () => {
  const parentFlow = flow(async (ctx, input: number) => {
    const result = await ctx.exec({
      fn: (a: number, b: number) => a + b,
      params: [input, 10],
      key: 'add'
    });
    return result;
  });

  const scope = createScope();
  const execution = scope.exec({ flow: parentFlow, input: 5 });
  const result = await execution.result;

  expect(result).toBe(15);
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm -F @pumped-fn/core-next test flow-expected`
Expected: FAIL - exec doesn't accept config

**Step 3: Update Flow.C interface**

Replace exec methods in `packages/next/src/types.ts` Flow.C interface (around line 576):

```typescript
exec<F extends UFlow>(config: {
  flow: F;
  input: InferInput<F>;
  key?: string;
  timeout?: number;
  retry?: number;
  tags?: Tag.Tagged[];
}): Promised<InferOutput<F>>;

exec<T>(config: {
  fn: () => T | Promise<T>;
  params?: never;
  key?: string;
  timeout?: number;
  retry?: number;
  tags?: Tag.Tagged[];
}): Promised<T>;

exec<Fn extends (...args: any[]) => any>(config: {
  fn: Fn;
  params: Parameters<Fn>;
  key?: string;
  timeout?: number;
  retry?: number;
  tags?: Tag.Tagged[];
}): Promised<ReturnType<Fn>>;
```

**Step 4: Implement new exec in FlowContext**

Replace exec method in `packages/next/src/flow.ts` FlowContext class:

```typescript
exec<F extends Flow.UFlow>(
  config:
    | { flow: F; input: Flow.InferInput<F>; key?: string; timeout?: number; retry?: number; tags?: Tag.Tagged[] }
    | { fn: (...args: any[]) => any; params?: any[]; key?: string; timeout?: number; retry?: number; tags?: Tag.Tagged[] }
): Promised<any> {
  this.throwIfAborted();

  // Create child abort controller
  const childAbort = new AbortController();

  if (this.signal.aborted) {
    childAbort.abort(this.signal.reason);
  } else {
    this.signal.addEventListener('abort', () => {
      childAbort.abort(this.signal.reason);
    }, { once: true });
  }

  if (config.timeout) {
    setTimeout(() => {
      if (!childAbort.signal.aborted) {
        childAbort.abort(new Error(`Operation timeout after ${config.timeout}ms`));
      }
    }, config.timeout);
  }

  if ('flow' in config) {
    // Flow execution
    const flow = config.flow;
    const input = config.input;

    if (config.key) {
      // Journaled execution
      if (!this.journal) {
        this.journal = new Map();
      }

      const flowName = this.find(flowMeta.flowName) || "unknown";
      const depth = this.get(flowMeta.depth);
      const journalKey = `${flowName}:${depth}:${config.key}`;

      const promise = (async () => {
        const journal = this.journal!;

        if (journal.has(journalKey)) {
          const entry = journal.get(journalKey);
          if (isErrorEntry(entry)) {
            throw entry.error;
          }
          return entry as Flow.InferOutput<F>;
        }

        this.throwIfAborted();

        const handler = await this.scope.resolve(flow);
        const definition = flowDefinitionMeta.readFrom(flow);

        if (definition) {
          const validated = validate(definition.input, input);
          const childContext = new FlowContext(this.scope, this.extensions, config.tags, this, childAbort);
          childContext.initializeExecutionContext(definition.name, false);

          try {
            const result = await handler(childContext, validated);
            validate(definition.output, result);
            journal.set(journalKey, result);
            return result;
          } catch (error) {
            journal.set(journalKey, { __error: true, error });
            throw error;
          }
        } else {
          throw new Error("Flow definition not found");
        }
      })();

      return Promised.create(promise);
    } else {
      // Non-journaled execution
      return this.scope.resolve(flow).map(async (handler) => {
        this.throwIfAborted();

        const definition = flowDefinitionMeta.readFrom(flow);
        if (definition) {
          const validated = validate(definition.input, input);
          const childContext = new FlowContext(this.scope, this.extensions, config.tags, this, childAbort);
          childContext.initializeExecutionContext(definition.name, false);

          const result = await handler(childContext, validated);
          validate(definition.output, result);
          return result;
        } else {
          throw new Error("Flow definition not found");
        }
      });
    }
  } else {
    // Function execution
    const fn = config.fn;
    const params = 'params' in config ? config.params || [] : [];

    if (config.key) {
      // Journaled execution
      return this.run(config.key, fn, {}, ...params);
    } else {
      // Non-journaled execution
      this.throwIfAborted();
      return Promised.try(async () => {
        const result = await fn(...params);
        return result;
      });
    }
  }
}
```

**Step 5: Run tests to verify they pass**

Run: `pnpm -F @pumped-fn/core-next test flow-expected`
Expected: PASS

**Step 6: Verify all types compile**

Run: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No errors

**Step 7: Commit**

```bash
git add packages/next/src/flow.ts packages/next/src/types.ts packages/next/tests/flow-expected.test.ts
git commit -m "feat: add unified ctx.exec config API with timeout/abort"
```

---

## Task 6: Update Examples to Use New API

**Files:**
- Modify: `examples/http-server/flow-composition.ts`
- Modify: `examples/http-server/database-transaction.ts`
- Modify: `examples/http-server/error-handling.ts`

**Step 1: Update flow-composition example**

Modify `examples/http-server/flow-composition.ts`:

Replace old `ctx.run()` calls with `ctx.exec()`:

```typescript
// Before:
const user = await ctx.run('fetch-user', () => fetchUser(userId));

// After:
const user = await ctx.exec({
  fn: () => fetchUser(userId),
  key: 'fetch-user',
  timeout: 5000
});
```

**Step 2: Update database-transaction example**

Modify `examples/http-server/database-transaction.ts`:

```typescript
// Replace ctx.run with ctx.exec using config
```

**Step 3: Update error-handling example**

Modify `examples/http-server/error-handling.ts`:

```typescript
// Replace ctx.run with ctx.exec using config
```

**Step 4: Verify examples typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: No errors

**Step 5: Commit**

```bash
git add examples/http-server/*.ts
git commit -m "refactor: update examples to use new ctx.exec API"
```

---

## Task 7: Deprecate ctx.run() (Add Warnings)

**Files:**
- Modify: `packages/next/src/flow.ts:244-304` (FlowContext.run)

**Step 1: Add deprecation comment and console warning**

Add to `FlowContext.run` method in `packages/next/src/flow.ts`:

```typescript
/**
 * @deprecated Use ctx.exec({ fn, params, key }) instead
 */
run<T>(key: string, fn: () => Promise<T> | T): Promised<T>;
/**
 * @deprecated Use ctx.exec({ fn, params, key }) instead
 */
run<T, P extends readonly unknown[]>(
  key: string,
  fn: (...args: P) => Promise<T> | T,
  ...params: P
): Promised<T>;

run<T, P extends readonly unknown[]>(
  key: string,
  fn: ((...args: P) => Promise<T> | T) | (() => Promise<T> | T),
  ...params: P
): Promised<T> {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `ctx.run() is deprecated. Use ctx.exec({ fn: ${fn.name || 'function'}, params: [...], key: '${key}' }) instead.`
    );
  }

  // ... existing implementation
}
```

**Step 2: Verify types compile**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/next/src/flow.ts
git commit -m "deprecate: add warnings to ctx.run()"
```

---

## Task 8: Update Documentation

**Files:**
- Modify: `docs/guides/flows.md`
- Create: `docs/guides/execution-tracking.md`

**Step 1: Create execution tracking guide**

Create `docs/guides/execution-tracking.md`:

```markdown
# Execution Tracking

Track and control flow executions with IDs, status, cancellation, and timeout.

## FlowExecution

`scope.exec()` returns FlowExecution with metadata:

\`\`\`typescript
const execution = scope.exec({
  flow: orderFlow,
  input: { orderId: '123' },
  timeout: 30000
});

console.log(execution.id); // UUID
console.log(execution.status); // 'running'
console.log(execution.flowName); // 'orderFlow'

const result = await execution.result; // Promised<Order>
\`\`\`

## Cancellation

Use AbortController to cancel executions:

\`\`\`typescript
const execution = scope.exec({ flow, input });

setTimeout(() => execution.abort.abort(), 5000);

await execution.result; // Throws if cancelled
\`\`\`

Flows cooperate via ctx.signal:

\`\`\`typescript
const flow = flow((ctx, input) => {
  ctx.throwIfAborted(); // Throws if cancelled

  const data = await fetch(url, { signal: ctx.signal });
  return data;
});
\`\`\`

## Timeout

Set timeout at scope or context level:

\`\`\`typescript
scope.exec({
  flow,
  input,
  timeout: 30000 // 30 second timeout
});

ctx.exec({
  flow: childFlow,
  input: data,
  timeout: 5000 // 5 second timeout
});
\`\`\`

## Status Tracking

Subscribe to status changes:

\`\`\`typescript
execution.onStatusChange((status, exec) => {
  console.log(\`Status changed to: \${status}\`);

  if (status === 'completed') {
    console.log('Execution finished');
  }
});
\`\`\`

Status values: 'pending', 'running', 'completed', 'failed', 'cancelled'
```

**Step 2: Update flows guide**

Modify `docs/guides/flows.md` to show new ctx.exec API:

Replace examples using `ctx.run()` with `ctx.exec()` config pattern.

**Step 3: Commit**

```bash
git add docs/guides/execution-tracking.md docs/guides/flows.md
git commit -m "docs: add execution tracking guide and update flows"
```

---

## Task 9: Update Skill References

**Files:**
- Modify: `.claude/skills/pumped-design/references/flow-api.md`

**Step 1: Update flow API reference**

Modify `.claude/skills/pumped-design/references/flow-api.md`:

Update ctx.exec examples to show config pattern:

```markdown
## ctx.exec()

Execute flows or functions with full control:

### Flow execution
\`\`\`typescript
ctx.exec({
  flow: childFlow,
  input: { id: '123' },
  key: 'fetch-data',
  timeout: 5000,
  tags: [tenantId('tenant-1')]
})
\`\`\`

### Function execution
\`\`\`typescript
ctx.exec({
  fn: (a: number, b: number) => a + b,
  params: [5, 10],
  key: 'add-numbers'
})
\`\`\`
```

**Step 2: Commit**

```bash
git add .claude/skills/pumped-design/references/flow-api.md
git commit -m "docs(skill): update flow API reference for ctx.exec"
```

---

## Task 10: Add Integration Tests

**Files:**
- Create: `packages/next/tests/execution-tracking.test.ts`

**Step 1: Write comprehensive integration tests**

Create `packages/next/tests/execution-tracking.test.ts`:

```typescript
import { describe, test, expect, vi } from 'vitest';
import { createScope, flow } from '../src';

describe('Execution Tracking', () => {
  test('FlowExecution has unique ID', async () => {
    const testFlow = flow((ctx, input: number) => input * 2);
    const scope = createScope();

    const exec1 = scope.exec({ flow: testFlow, input: 5 });
    const exec2 = scope.exec({ flow: testFlow, input: 10 });

    expect(exec1.id).not.toBe(exec2.id);
    expect(exec1.id).toBeTruthy();
    expect(exec2.id).toBeTruthy();
  });

  test('status changes through lifecycle', async () => {
    const testFlow = flow(async (ctx, input: number) => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return input * 2;
    });

    const scope = createScope();
    const execution = scope.exec({ flow: testFlow, input: 5 });

    const statuses: string[] = [];
    execution.onStatusChange((status) => {
      statuses.push(status);
    });

    expect(execution.status).toBe('pending');

    const result = await execution.result;

    expect(result).toBe(10);
    expect(execution.status).toBe('completed');
    expect(statuses).toContain('running');
    expect(statuses).toContain('completed');
  });

  test('abort cancels execution', async () => {
    const testFlow = flow(async (ctx) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return 42;
    });

    const scope = createScope();
    const execution = scope.exec({ flow: testFlow, input: undefined });

    setTimeout(() => execution.abort.abort(), 50);

    await expect(execution.result).rejects.toThrow();
    expect(execution.status).toBe('cancelled');
  });

  test('timeout aborts execution', async () => {
    const testFlow = flow(async (ctx) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return 42;
    });

    const scope = createScope();
    const execution = scope.exec({
      flow: testFlow,
      input: undefined,
      timeout: 100
    });

    await expect(execution.result).rejects.toThrow(/timeout/i);
    expect(execution.status).toBe('cancelled');
  });

  test('ctx.exec with config executes flow', async () => {
    const childFlow = flow((ctx, input: number) => input + 10);
    const parentFlow = flow(async (ctx, input: number) => {
      const result = await ctx.exec({
        flow: childFlow,
        input: input * 2,
        key: 'child'
      });
      return result;
    });

    const scope = createScope();
    const execution = scope.exec({ flow: parentFlow, input: 5 });
    const result = await execution.result;

    expect(result).toBe(20);
  });

  test('ctx.exec with function and params', async () => {
    const parentFlow = flow(async (ctx, input: number) => {
      const sum = await ctx.exec({
        fn: (a: number, b: number) => a + b,
        params: [input, 100],
        key: 'add'
      });
      return sum;
    });

    const scope = createScope();
    const execution = scope.exec({ flow: parentFlow, input: 50 });
    const result = await execution.result;

    expect(result).toBe(150);
  });

  test('ctx.throwIfAborted throws when aborted', async () => {
    const testFlow = flow(async (ctx) => {
      await new Promise(resolve => setTimeout(resolve, 50));
      ctx.throwIfAborted();
      return 42;
    });

    const scope = createScope();
    const execution = scope.exec({ flow: testFlow, input: undefined });

    setTimeout(() => execution.abort.abort(), 25);

    await expect(execution.result).rejects.toThrow('cancelled');
  });

  test('onStatusChange callback receives execution', async () => {
    const testFlow = flow((ctx, input: number) => input * 2);
    const scope = createScope();
    const execution = scope.exec({ flow: testFlow, input: 5 });

    let capturedExecution: any;
    execution.onStatusChange((status, exec) => {
      capturedExecution = exec;
    });

    await execution.result;

    expect(capturedExecution).toBe(execution);
  });

  test('execution registry auto-cleanup', async () => {
    const testFlow = flow((ctx, input: number) => input * 2);
    const scope = createScope() as any;

    expect(scope.executions.size).toBe(0);

    const execution = scope.exec({ flow: testFlow, input: 5 });
    expect(scope.executions.size).toBe(1);

    await execution.result;

    // Should auto-cleanup after completion
    expect(scope.executions.size).toBe(0);
  });
});
```

**Step 2: Run tests**

Run: `pnpm -F @pumped-fn/core-next test execution-tracking`
Expected: All tests PASS

**Step 3: Verify full test suite**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/next/tests/execution-tracking.test.ts
git commit -m "test: add comprehensive execution tracking tests"
```

---

## Task 11: Final Verification

**Step 1: Run all typechecks**

```bash
pnpm -F @pumped-fn/core-next typecheck
pnpm -F @pumped-fn/core-next typecheck:full
pnpm -F @pumped-fn/examples typecheck
```

Expected: No errors

**Step 2: Run all tests**

```bash
pnpm -F @pumped-fn/core-next test
```

Expected: All tests PASS

**Step 3: Build package**

```bash
pnpm -F @pumped-fn/core-next build
```

Expected: Build succeeds

**Step 4: Final commit**

```bash
git add .
git commit -m "feat: complete flow execution tracking implementation"
```

---

## Migration Guide

For users upgrading to this version:

### scope.exec() changes

```typescript
// Before
const result = await scope.exec(flow, input);

// After (recommended)
const execution = scope.exec({ flow, input });
const result = await execution.result;

// Access metadata
console.log(execution.id, execution.status);
execution.abort.abort(); // Cancel
```

### ctx.run() deprecated

```typescript
// Before
const result = await ctx.run('key', () => doWork());
const sum = await ctx.run('add', (a, b) => a + b, 5, 10);

// After
const result = await ctx.exec({
  fn: () => doWork(),
  key: 'key'
});

const sum = await ctx.exec({
  fn: (a, b) => a + b,
  params: [5, 10],
  key: 'add'
});
```

### details option removed

```typescript
// Before
const details = await scope.exec(flow, input, { details: true });
console.log(details.ctx);

// After
const execution = scope.exec({ flow, input });
const result = await execution.result;
console.log(execution.ctx); // Always available
```

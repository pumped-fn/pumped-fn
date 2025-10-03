# Flow API Refactoring Plan

## Goal

Refactor Flow API to eliminate Result types (OK/KO) in favor of Promise-based error handling, matching standard JavaScript patterns.

## Key Changes

### 1. Remove Result Types

**Delete:**
- `Flow.OK<S>`
- `Flow.KO<E>`
- `Flow.OutputLike<S, E>`
- `isOk()` / `isKo()` type guards
- `ctx.ok()` / `ctx.ko()` methods

**Replace with:**
- Direct returns for success
- Throw errors for failures
- FlowError class for structured errors

### 2. Update Type System

**Handler signatures:**
```typescript
// Before: flow<I, S, E>
export interface NoDependencyHandler<I, S, E> {
  (ctx: Context<I, S, E>): OutputLike<S, E> | Promise<OutputLike<S, E>>;
}

// After: flow<I, S>
export interface NoDependencyHandler<I, S> {
  (ctx: Context<I, S>, input: I): S | Promise<S>;
}
```

**Context type:**
```typescript
// Before
export type Context<I, S, E> = Accessor.DataStore & R<S, E> & C & {
  input: I;
};

// After
export type Context<I, S> = Accessor.DataStore & C & {
  input: I;
};
```

**Definition:**
```typescript
// Before
export type Definition<I, S, E> = {
  name: string;
  input: StandardSchemaV1<I>;
  success: StandardSchemaV1<S>;
  error: StandardSchemaV1<E>;
};

// After
export type Definition<I, S> = {
  name: string;
  input: StandardSchemaV1<I>;
  success: StandardSchemaV1<S>;
};
```

### 3. Flow Factory Overloads

The `flow()` function must support multiple call signatures:

**1. Handler only (nameless):**
```typescript
flow<I, S>((ctx, input: I) => S)
```

**2. Handler only with void input:**
```typescript
flow<void, S>(() => S)
```

**3. Dependencies + handler:**
```typescript
flow<I, S>(deps, (resolvedDeps, ctx, input: I) => S)
```

**4. Definition only:**
```typescript
flow({ name, input, success })
```

**5. Definition + handler:**
```typescript
flow<I, S>({ name }, (ctx, input: I) => S)
```

**6. Dependencies + definition + handler:**
```typescript
flow(deps, { name, input, success }, (resolvedDeps, ctx, input) => S)
```

### 4. Context Methods

**Keep:**
- `ctx.run(key, fn)` - journaling operations
- `ctx.exec(flow, input)` - execute sub-flows (non-journaled)
- `ctx.exec(key, flow, input)` - execute sub-flows (journaled)
- `ctx.parallel(promises)` - parallel execution of FlowPromises (throws on failure)
- `ctx.get/set` - data storage

**Add:**
- `ctx.parallelSettled(promises)` - parallel execution with partial failures

**Remove:**
- `ctx.ok(data)` → return data
- `ctx.ko(error)` → throw error
- `ctx.output(success, value)` → return or throw

### 5. FlowPromise Updates

**Remove:**
- `unwrap()` → just await
- `unwrapOr(default)` → `.catch(() => default)`
- `match({ ok, ko })` → `.then(ok).catch(ko)`

**Add:**
```typescript
map<U>(fn: (value: T) => U | Promise<U>): FlowPromise<U>
switch<U>(fn: (value: T) => FlowPromise<U>): FlowPromise<U>
mapError(fn: (error: unknown) => unknown): FlowPromise<T>
switchError(fn: (error: unknown) => FlowPromise<T>): FlowPromise<T>
```

**Keep:**
- `then/catch/finally` - standard Promise methods
- `toPromise()` - get underlying Promise
- `getPod()` - access pod
- Static: `all/race/allSettled`

### 6. Error Handling

**FlowError class:**
```typescript
export class FlowError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly data?: unknown,
    options?: { cause?: unknown }
  ) {
    super(message);
    this.name = "FlowError";
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}
```

**FlowValidationError class:**
```typescript
export class FlowValidationError extends FlowError {
  constructor(
    message: string,
    public readonly issues: StandardSchemaV1.Issue[],
    options?: { cause?: unknown }
  ) {
    super(message, "VALIDATION_ERROR", { issues }, options);
    this.name = "FlowValidationError";
  }
}
```

## Implementation Checklist

### Phase 1: Type System (src/types.ts)

- [ ] Remove `Flow.OK<S>`, `Flow.KO<E>`, `Flow.OutputLike<S, E>`
- [ ] Update `NoDependencyHandler<I, S, E>` → `<I, S>`
- [ ] Update `DependentHandler<D, I, S, E>` → `<D, I, S>`
- [ ] Update `Definition<I, S, E>` → `<I, S>`
- [ ] Remove `R<S, E>` type
- [ ] Update `Context<I, S, E>` → `<I, S>`
- [ ] Update `InferInput/InferOutput` types
- [ ] Rename `ParallelExecutionResult` → `ParallelResult`
- [ ] Add `ParallelSettledResult` type
- [ ] Add `FlowError` and `FlowValidationError` classes

### Phase 2: Flow Implementation (src/flow.ts)

- [ ] Remove `ok()` and `ko()` factory functions
- [ ] Update `FlowDefinition` class generic parameters
- [ ] Remove `ctx.ok()`, `ctx.ko()`, `ctx.output()` methods
- [ ] Update `ctx.exec()` method
- [ ] Update `parallel()` to throw on failures
- [ ] Add `parallelSettled()` method
- [ ] Update `flow()` factory function overloads
- [ ] Update `flow.execute()` error handling
- [ ] Handle void input flows properly

### Phase 3: FlowPromise (src/flow-promise.ts or delete if exists)

- [ ] Remove `unwrap()` method
- [ ] Remove `unwrapOr()` method
- [ ] Remove `match()` method
- [ ] Add `map()` method
- [ ] Add `switch()` method
- [ ] Add `mapError()` method
- [ ] Add `switchError()` method
- [ ] Keep `then/catch/finally`
- [ ] Keep static methods

### Phase 4: Tests

- [ ] Update all flow definitions: remove error generic
- [ ] Replace `ctx.ok()` → return value
- [ ] Replace `ctx.ko()` → throw error
- [ ] Replace `assertOk(result)` → direct assertions
- [ ] Replace `assertKo(result)` → `expect().rejects`
- [ ] Update parallel execution tests
- [ ] Remove `isOk()`/`isKo()` checks
- [ ] Add FlowPromise operation tests

### Phase 5: Verification

- [ ] Run typecheck on src
- [ ] Run typecheck on tests
- [ ] All tests pass
- [ ] No `any` types introduced
- [ ] No `unknown` without guards

## Migration Examples

### Handler Return

**Before:**
```typescript
const impl = flow<Input, Success, Error>({
  name: "test",
  handler: async (ctx, input) => {
    return ctx.ok({ data: "value" });
  }
});
```

**After:**
```typescript
const impl = flow<Input, Success>({
  name: "test",
  handler: async (ctx, input) => {
    return { data: "value" };
  }
});
```

### Error Handling

**Before:**
```typescript
handler: async (ctx, input) => {
  try {
    const result = await operation();
    return ctx.ok({ result });
  } catch (error) {
    return ctx.ko({ code: "FAILED", message: error.message });
  }
}
```

**After:**
```typescript
handler: async (ctx, input) => {
  const result = await operation();
  return { result };
}
```

### Sub-flow Execution

**Before:**
```typescript
const subResult = await ctx.call(subFlow, input);
if (subResult.isKo()) {
  return ctx.ko(subResult.data);
}
return ctx.ok({ value: subResult.data.value });
```

**After:**
```typescript
const subResult = await ctx.exec(subFlow, input);
return { value: subResult.value };
```

### Parallel Execution

**Before:**
```typescript
const result = await ctx.parallel([
  [flow1, input1],
  [flow2, input2]
]);

if (result.type === "all-ok") {
  const [r1, r2] = result.results;
  return ctx.ok({ sum: r1.data.value + r2.data.value });
}
return ctx.ko({ code: "FAILED" });
```

**After (all must succeed):**
```typescript
const p1 = ctx.exec(flow1, input1);
const p2 = ctx.exec(flow2, input2);
const result = await ctx.parallel([p1, p2]);

const [r1, r2] = result.results;
return { sum: r1.value + r2.value };
```

**After (handle failures):**
```typescript
const p1 = ctx.exec(flow1, input1);
const p2 = ctx.exec(flow2, input2);
const result = await ctx.parallelSettled([p1, p2]);

const succeeded = result.results.filter(r => r.status === 'fulfilled');
if (succeeded.length !== result.results.length) {
  throw new FlowError("Some flows failed", "PARTIAL_FAILURE");
}
return { values: succeeded.map(r => r.value) };
```

### Result Consumption

**Before:**
```typescript
const result = await flow.execute(myFlow, input);
if (result.isOk()) {
  console.log(result.data);
} else {
  console.error(result.data);
}
```

**After:**
```typescript
try {
  const result = await flow.execute(myFlow, input);
  console.log(result);
} catch (error) {
  console.error(error);
}
```

### FlowPromise

**Before:**
```typescript
const value = await promise.unwrap();
const value = await promise.unwrapOr(defaultValue);
const result = await promise.match({
  ok: (data) => processSuccess(data),
  ko: (error) => processError(error)
});
```

**After:**
```typescript
const value = await promise;
const value = await promise.catch(() => defaultValue);
const result = await promise
  .then(data => processSuccess(data))
  .catch(error => processError(error));
```

## Breaking Changes Summary

| Component | Before | After |
|-----------|--------|-------|
| Flow definition | `flow<I, S, E>` | `flow<I, S>` |
| Handler return | `OutputLike<S, E>` | `S` or throw |
| Context type | `Context<I, S, E>` | `Context<I, S>` |
| Flow output | `OK<S> \| KO<E>` | `S` or rejected Promise |
| Parallel result | `ParallelExecutionResult` | `ParallelResult` |
| Sub-flow method | `ctx.call` (maybe) | `ctx.exec` |
| Success return | `ctx.ok(data)` | return `data` |
| Error return | `ctx.ko(error)` | throw error |
| Type guards | `result.isOk()` | try/catch |
| Data access | `result.data` | `result` |

## Implementation Order

1. **Types** (src/types.ts) - 2-3 hours
2. **Flow core** (src/flow.ts) - 3-4 hours
3. **FlowPromise** (src/flow-promise.ts) - 1-2 hours
4. **Tests** - 3-4 hours
5. **Verification** - 1 hour

**Total: 10-14 hours**

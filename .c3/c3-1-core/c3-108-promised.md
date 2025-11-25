---
id: c3-108
c3-version: 3
title: Promised Class
summary: >
  Enhanced Promise with execution context and utility methods.
---

# Promised Class

## Overview {#c3-108-overview}
<!-- Enhanced Promise -->

Promised is an enhanced Promise that:

- **Carries execution context** - Access to ExecutionData after completion
- **Provides transformation methods** - `map()`, `mapError()`
- **Includes static helpers** - `all()`, `race()`, `allSettled()`, `try()`
- **Supports settled result partitioning** - `partition()`

Promised implements `PromiseLike<T>` so it works anywhere a Promise is expected.

## Instance Methods {#c3-108-methods}

### Transformation

| Method | Signature | Description |
|--------|-----------|-------------|
| `map(fn)` | `(T => U) => Promised<U>` | Transform success value |
| `mapError(fn)` | `(err => err) => Promised<T>` | Transform error (rethrow) |

**Example:**
```typescript
const result = flow.execute(myFlow, input)
  .map(user => user.name)
  .mapError(err => new AppError('User fetch failed', { cause: err }))
```

### Promise Interface

| Method | Description |
|--------|-------------|
| `then(onFulfilled, onRejected)` | Standard then, returns Promised |
| `catch(onRejected)` | Standard catch, returns Promised |
| `finally(onFinally)` | Standard finally, returns Promised |
| `toPromise()` | Extract underlying Promise |

### Execution Context

| Method | Description |
|--------|-------------|
| `ctx()` | Get ExecutionData (may be undefined) |
| `inDetails()` | Get full ExecutionDetails with success/error + context |

**inDetails() returns:**
```typescript
type ExecutionDetails<T> =
  | { success: true, result: T, ctx: ExecutionData }
  | { success: false, error: unknown, ctx: ExecutionData }
```

## Static Methods {#c3-108-static}

### Concurrency Helpers

| Method | Description |
|--------|-------------|
| `Promised.all(values)` | Wait for all, fail on any rejection |
| `Promised.race(values)` | First to settle wins |
| `Promised.allSettled(values)` | Collect all results (fulfilled/rejected) |
| `Promised.try(fn)` | Wrap sync/async function safely |

**Example:**
```typescript
const results = await Promised.allSettled([
  flow.execute(flowA, inputA),
  flow.execute(flowB, inputB),
  flow.execute(flowC, inputC)
])
```

### Settled Result Operations

For `Promised<PromiseSettledResult[]>` or parallel results:

| Method | Returns | Description |
|--------|---------|-------------|
| `partition()` | `Promised<{ fulfilled, rejected }>` | Split into fulfilled values and rejection reasons |

**Example:**
```typescript
const results = await Promised.allSettled([
  fetchUser(1),
  fetchUser(2),
  fetchUser(3)
]).partition()

console.log(`${results.fulfilled.length} succeeded, ${results.rejected.length} failed`)
```

**Note:** Previous methods like `fulfilled()`, `rejected()`, `firstFulfilled()`, `findFulfilled()`, `mapFulfilled()`, and `assertAllFulfilled()` were removed in favor of the simpler `partition()` approach.

## Usage Patterns {#c3-108-patterns}

### Basic Flow Execution

```typescript
const result = await flow.execute(createUser, { email: 'a@b.com' })
```

### With Error Handling

```typescript
const user = await flow.execute(getUser, { id })
  .catch(err => {
    if (err instanceof NotFoundError) {
      return null
    }
    throw err
  })
```

### Getting Execution Details

```typescript
const details = await flow.execute(processOrder, order).inDetails()

if (details.success) {
  console.log('Order processed:', details.result.id)
  console.log('Execution time:', details.ctx.details.completedAt - details.ctx.details.startedAt)
} else {
  console.error('Failed:', details.error)
  logContext(details.ctx)
}
```

### Parallel with Partition

```typescript
const { fulfilled: users, rejected: errors } = await ctx.parallelSettled([
  ctx.exec(getUser, { id: 1 }),
  ctx.exec(getUser, { id: 2 }),
  ctx.exec(getUser, { id: 3 })
]).partition()

if (errors.length > 0) {
  logger.warn(`${errors.length} user fetches failed`)
}
```

## Creation {#c3-108-creation}

```typescript
// From promise
const p = Promised.create(somePromise)

// With execution data
const p = Promised.create(promise, executionDataPromise)

// From sync/async function
const p = Promised.try(() => mightThrow())
const p = Promised.try(async () => await asyncOp())
```

## Source Files {#c3-108-source}

| File | Contents |
|------|----------|
| `primitives.ts` | Promised class implementation |
| `types.ts` | MaybePromised type |

## Testing {#c3-108-testing}

Primary tests: `index.test.ts` - "Promised" describe block

Key test scenarios:
- Instance methods (map, mapError, then, catch, finally)
- Static methods (all, race, allSettled, try)
- partition() for settled results
- inDetails() for execution context
- Context propagation via ctx()

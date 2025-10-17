# Flows

Flows handle short-span operations within long-running scopes. While scopes manage persistent resources (databases, connections), flows process individual requests, jobs, or transactions.

## Core Concepts

**Scope vs Flow:**
- **Scope**: Long-running container for shared resources
- **Flow**: Short-lived execution with isolated context
- **Pattern**: One scope, many flows

Each flow has its own context that provides data isolation between concurrent executions. When flows spawn sub-flows, the context forks to maintain isolation.

## Basic Flow

A flow transforms input to output:

<<< @/code/flow-patterns.ts#flow-basic{ts}

**Execution:**
- Define flow with transformation logic
- Execute via `scope.exec(flow, input)`
- Returns transformed output

## Flow with Dependencies

Inject scope-level dependencies into flows:

<<< @/code/flow-patterns.ts#flow-with-deps{ts}

**Dependency Injection:**
- Dependencies resolved from scope
- Same instance shared across flows
- Flows remain isolated via context

## Flow Context Operations

Use context for journaling and sub-flow execution:

<<< @/code/flow-patterns.ts#flow-context{ts}

**Context Methods:**
- `ctx.run(key, fn)`: Journaled operation, replays on retry
- `ctx.exec(flow, input)`: Execute sub-flow with forked context
- `ctx.get/set(accessor)`: Access flow-scoped data

## Context Isolation

```ts
const requestIdAccessor = accessor("requestId", custom<string>())

const logRequest = flow(async (ctx) => {
  const id = ctx.get(requestIdAccessor)
  console.log(`Processing: ${id}`)
})

// Concurrent executions don't interfere
await scope.exec(logRequest, undefined, {
  initialContext: [[requestIdAccessor, "req-1"]]
})

await scope.exec(logRequest, undefined, {
  initialContext: [[requestIdAccessor, "req-2"]]
})
```

## Journaling and Replay

`ctx.run()` journals operations for deterministic replay:

```ts
const fetchData = flow(async (ctx) => {
  const data = await ctx.run("fetch", () => api.call())
  const processed = await ctx.run("process", () => transform(data))
  return processed
})

// On failure/retry, journaled steps replay from cache
// Only failed step re-executes
```

## When to Use Flows

- **Request Handling**: HTTP requests, API calls
- **Job Processing**: Queue workers, batch operations
- **Transactions**: Database transactions with rollback
- **Stateful Operations**: Multi-step processes with checkpoints

Flows provide isolation, journaling, and composability for short-lived operations within persistent scopes.

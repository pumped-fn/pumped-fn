---
id: c3-203
c3-version: 3
title: Flow & ExecutionContext
summary: >
  Short-lived request/response execution pattern with input handling,
  context lifecycle, and dependency resolution.
---

# Flow & ExecutionContext

## Overview {#c3-203-overview}
<!-- Request handling pattern -->

A Flow represents a short-lived execution that:
- Receives input from the caller
- Has access to resolved dependencies
- Runs within an ExecutionContext
- Supports nested flow execution

Flows are the primary pattern for handling requests, commands, or any operation with input.

## Concepts {#c3-203-concepts}

### Flow Interface

```typescript
interface Flow<TOutput, TInput = unknown> {
  readonly [flowSymbol]: true
  readonly name?: string
  readonly parse?: (raw: unknown) => MaybePromise<TInput>
  readonly factory: FlowFactory<TOutput, TInput, D>
  readonly deps?: Record<string, Dependency>
  readonly tags?: Tagged<unknown>[]
}
```

### ExecutionContext

Created by `scope.createContext()`, used for flow execution:

```typescript
interface ExecutionContext {
  readonly input: unknown              // Current flow input
  readonly scope: Scope                // Parent scope
  exec(options): Promise<T>            // Execute flow or function
  onClose(fn: () => MaybePromise<void>): void  // Register cleanup
  close(): Promise<void>               // Run cleanups
}
```

## Creating Flows {#c3-203-creating}

### Simple Flow

```typescript
const greetFlow = flow({
  factory: (ctx) => {
    const name = ctx.input as string
    return `Hello, ${name}!`
  }
})
```

### Flow with Dependencies

```typescript
const handleRequestFlow = flow({
  deps: { db: dbAtom, logger: loggerAtom },
  factory: async (ctx, { db, logger }) => {
    const request = ctx.input as Request
    logger.info('Handling request', request.id)

    const result = await db.query(request.query)
    return result
  }
})
```

### Flow with Tag Dependencies

```typescript
const processOrderFlow = flow({
  deps: {
    userId: tags.required(userIdTag),
    traceId: tags.optional(traceIdTag)
  },
  factory: async (ctx, { userId, traceId }) => {
    const order = ctx.input as Order
    console.log(`Processing order for user ${userId}, trace: ${traceId}`)
    return processOrder(order, userId)
  }
})
```

### Flow with Attached Tags

```typescript
const adminFlow = flow({
  tags: [roleTag('admin')],
  factory: (ctx) => {
    return performAdminAction(ctx.input)
  }
})
```

### Flow with Parse

Flows can include a parse function for input validation:

```typescript
const createUser = flow({
  name: 'createUser',
  parse: (raw) => {
    const obj = raw as Record<string, unknown>
    if (typeof obj.name !== 'string') throw new Error('name required')
    if (typeof obj.email !== 'string') throw new Error('email required')
    return { name: obj.name, email: obj.email }
  },
  factory: (ctx) => {
    // ctx.input is typed as { name: string; email: string }
    return db.users.create(ctx.input)
  }
})
```

**Parse behavior:**
- Runs before factory in `ctx.exec()`
- Can be sync or async
- Throws `ParseError` with `phase: 'flow-input'` on failure
- `ctx.input` type is inferred from parse return type
- Error label priority: exec name > flow name > 'anonymous'

### Flow Naming

Flows can have optional names for debugging:

```typescript
const myFlow = flow({
  name: 'myFlow',
  factory: (ctx) => { ... }
})

// Or override at execution
await ctx.exec({
  flow: myFlow,
  input: data,
  name: 'specificExecution'
})
```

## Executing Flows {#c3-203-executing}

### Basic Execution

```typescript
const scope = await createScope()
const ctx = scope.createContext()

const result = await ctx.exec({
  flow: greetFlow,
  input: 'World'
})

await ctx.close()
```

### Execution with Tags

```typescript
const result = await ctx.exec({
  flow: processOrderFlow,
  input: order,
  tags: [userIdTag('user-123'), traceIdTag('trace-456')]
})
```

### Tag Merge Order

When resolving tag dependencies, tags are merged in this order (later wins):
1. Flow's attached tags (`flow.tags`)
2. Scope's tags (`createScope({ tags: [...] })`)
3. Context's tags (`createContext({ tags: [...] })`)
4. Execution tags (`exec({ tags: [...] })`)

## ExecutionContext Lifecycle {#c3-203-lifecycle}

### Creating Context

```typescript
const ctx = scope.createContext()

// Or with tags
const ctx = scope.createContext({
  tags: [requestIdTag('req-123')]
})
```

### Registering Cleanup

```typescript
await ctx.exec({
  flow: flow({
    factory: (ctx) => {
      const resource = acquireResource()
      ctx.onClose(() => resource.release())
      return resource
    }
  }),
  input: null
})
```

### Closing Context

```typescript
await ctx.close()
// All registered cleanups run in LIFO order
```

### Context Reuse

A single context can execute multiple flows:

```typescript
const ctx = scope.createContext()

await ctx.exec({ flow: authFlow, input: credentials })
await ctx.exec({ flow: loadDataFlow, input: query })
await ctx.exec({ flow: saveResultFlow, input: data })

await ctx.close()
```

### Closed Context Error

```typescript
const ctx = scope.createContext()
await ctx.close()

await ctx.exec({ flow: someFlow, input: null })
// Throws: "ExecutionContext is closed"
```

## Nested Execution {#c3-203-nested}

### Executing Flows from Flows

```typescript
const parentFlow = flow({
  factory: async (ctx) => {
    const childResult = await ctx.exec({
      flow: childFlow,
      input: ctx.input
    })
    return processResult(childResult)
  }
})
```

### Executing Functions

```typescript
const myFlow = flow({
  factory: async (ctx) => {
    const result = await ctx.exec({
      fn: async (a: number, b: number) => a + b,
      params: [1, 2]
    })
    return result // 3
  }
})
```

### Extension Wrapping

Both flow and function execution are wrapped by extensions:

```typescript
const tracingExtension: Extension = {
  name: 'tracing',
  wrapExec: async (next, target, ctx) => {
    console.log('Executing:', isFlow(target) ? 'flow' : 'function')
    const result = await next()
    console.log('Result:', result)
    return result
  }
}
```

## Type Safety {#c3-203-types}

### Input Type

The `ctx.input` is typed as `unknown`. Use type assertion or validation:

```typescript
const typedFlow = flow({
  factory: (ctx) => {
    const input = ctx.input as { name: string; age: number }
    return `${input.name} is ${input.age} years old`
  }
})
```

### FlowFactory Type

```typescript
type FlowFactory<TOutput, TInput, D> =
  keyof D extends never
    ? (ctx: ExecutionContext) => MaybePromise<TOutput>
    : (ctx: ExecutionContext, deps: InferDeps<D>) => MaybePromise<TOutput>
```

## Type Guard {#c3-203-guards}

### isFlow

```typescript
import { isFlow } from '@pumped-fn/lite'

function processTarget(target: unknown) {
  if (isFlow(target)) {
    // target is Flow<unknown, unknown>
    console.log('Is a flow')
  }
}
```

## Common Patterns {#c3-203-patterns}

### Request Handler

```typescript
const handleHttpRequest = flow({
  deps: { db: dbAtom, auth: authAtom },
  factory: async (ctx, { db, auth }) => {
    const req = ctx.input as HttpRequest

    const user = await auth.verify(req.headers.authorization)
    const data = await db.query(req.body.query)

    return { status: 200, data }
  }
})
```

### Command Pattern

```typescript
const executeCommand = flow({
  deps: { commandBus: commandBusAtom },
  factory: async (ctx, { commandBus }) => {
    const command = ctx.input as Command
    return commandBus.execute(command)
  }
})
```

### Middleware Chain

```typescript
const scope = await createScope({
  extensions: [authExtension, loggingExtension, errorHandlingExtension]
})

// Extensions wrap all flow executions
const ctx = scope.createContext()
await ctx.exec({ flow: protectedFlow, input: request })
```

## Source Files {#c3-203-source}

| File | Contents |
|------|----------|
| `src/flow.ts` | `flow()`, `isFlow()` |
| `src/scope.ts` | `ExecutionContextImpl` |
| `src/types.ts` | `Flow`, `ExecutionContext`, `ExecFlowOptions`, `ExecFnOptions` |
| `src/symbols.ts` | `flowSymbol` |

## Testing {#c3-203-testing}

Key test scenarios in `tests/flow.test.ts`:
- Flow creation with/without dependencies
- Type inference for dependencies

Key test scenarios in `tests/scope.test.ts`:
- Context creation and execution
- Nested execution
- Tag merging
- Extension wrapping
- Context cleanup

## Related {#c3-203-related}

- [c3-201](./c3-201-scope.md) - Scope and context creation
- [c3-204](./c3-204-tag.md) - Tag dependencies in flows
- [c3-2](./README.md#c3-2-extension) - Extension wrapping

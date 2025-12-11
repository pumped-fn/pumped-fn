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
  readonly input: unknown                        // Current execution's input
  readonly scope: Scope                          // Parent scope
  readonly parent: ExecutionContext | undefined  // Parent context (undefined for root)
  readonly data: Map<symbol, unknown>            // Per-execution storage for extensions
  exec(options): Promise<T>                      // Execute flow or function (creates child)
  onClose(fn: () => MaybePromise<void>): void    // Register cleanup
  close(): Promise<void>                         // Run cleanups
}
```

**Key properties:**
- `parent`: References the calling context. Root contexts (from `createContext()`) have `undefined`.
- `data`: Lazy-initialized Map for extension private storage. Use symbols as keys for encapsulation.
- `exec()`: Creates a child context with `parent` set to current context, auto-closes after execution.

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

### Raw Input Execution

When the caller has unknown/untyped data and the flow has a `parse` function:

```typescript
const createUser = flow({
  parse: (raw) => userSchema.parse(raw),
  factory: (ctx) => db.create(ctx.input)
})

// Typed execution - caller provides correct type
await ctx.exec({ flow: createUser, input: { name: 'Alice', email: 'a@b.com' } })

// Raw execution - flow's parse validates unknown data
const body: unknown = JSON.parse(request.body)
await ctx.exec({ flow: createUser, rawInput: body })
```

`input` and `rawInput` are mutually exclusive - TypeScript prevents using both.

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

Cleanups registered via `onClose()` run on **child context auto-close**, not root close:

```typescript
const resourceFlow = flow({
  factory: (ctx) => {
    // ctx is a CHILD context created by exec()
    const resource = acquireResource()

    // Cleanup runs when THIS exec() completes
    ctx.onClose(() => resource.release())

    return resource
  }
})

await rootCtx.exec({ flow: resourceFlow })
// resource.release() called HERE (child auto-closes)
```

**Note:** If you need cleanup on root close instead of exec completion, traverse to root via `ctx.parent` chain (see "Hierarchical Execution" section).

### Closing Context

```typescript
await ctx.close()
// All registered cleanups run in LIFO order
```

### Context Reuse

A single **root** context can execute multiple flows. Each exec creates a **child** context:

```typescript
const rootCtx = scope.createContext()

// Each exec creates a child with isolated input and data
await rootCtx.exec({ flow: authFlow, input: credentials })
// childA.input = credentials, childA auto-closes after authFlow returns

await rootCtx.exec({ flow: loadDataFlow, input: query })
// childB.input = query, childB auto-closes after loadDataFlow returns

await rootCtx.exec({ flow: saveResultFlow, input: data })
// childC.input = data, childC auto-closes after saveResultFlow returns

await rootCtx.close()
// Only root cleanups run (children already closed)
```

**Key insight:** Root context's `input` remains `undefined`. Children get their own `input` from exec options.

### Closed Context Error

```typescript
const ctx = scope.createContext()
await ctx.close()

await ctx.exec({ flow: someFlow, input: null })
// Throws: "ExecutionContext is closed"
```

## Nested Execution {#c3-203-nested}

### Executing Flows from Flows

Each nested `ctx.exec()` creates a **grandchild** context:

```typescript
const parentFlow = flow({
  factory: async (ctx) => {
    // ctx is child of root
    console.log(ctx.parent !== undefined) // true (parent is root)

    const childResult = await ctx.exec({
      flow: childFlow,
      input: ctx.input
    })
    // grandchild created (parent = ctx), auto-closed after childFlow returns

    return processResult(childResult)
  }
})

const rootCtx = scope.createContext()
await rootCtx.exec({ flow: parentFlow })
// Creates child (parentFlow's ctx), which creates grandchild (childFlow's ctx)
```

**Context tree:**
```
rootCtx (parent: undefined)
└─> childCtx (parent: rootCtx) - parentFlow's ctx
    └─> grandchildCtx (parent: childCtx) - childFlow's ctx
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

## Hierarchical Execution {#c3-203-hierarchical}

### Child Context Per Exec

Each `ctx.exec()` call creates a **child context** with:
- `parent` reference to the calling context
- Own `data` Map (isolated from siblings)
- Own `input` (no mutation of parent)
- Auto-closes when execution completes

```typescript
const rootCtx = scope.createContext()
// rootCtx.parent === undefined
// rootCtx.input === undefined

await rootCtx.exec({ flow: myFlow, input: 'data' })
// Inside myFlow factory:
//   childCtx.parent === rootCtx
//   childCtx.input === 'data'
//   childCtx.data === new Map()
// After exec returns: childCtx is closed
```

### Parent Chain Navigation

```typescript
const parentFlow = flow({
  factory: async (ctx) => {
    console.log('Parent context')

    await ctx.exec({
      flow: flow({
        factory: async (childCtx) => {
          console.log('Child context')
          console.log(childCtx.parent === ctx) // true

          await childCtx.exec({
            flow: flow({
              factory: (grandchildCtx) => {
                console.log('Grandchild context')
                console.log(grandchildCtx.parent === childCtx) // true
                console.log(grandchildCtx.parent?.parent === ctx) // true
              }
            })
          })
        }
      })
    })
  }
})
```

### Isolated Data Maps

Each execution has its own data map, preventing concurrent access races:

```typescript
// Concurrent siblings have isolated data
await Promise.all([
  ctx.exec({ flow: flowA }),  // childA.data (separate Map)
  ctx.exec({ flow: flowB })   // childB.data (separate Map)
])

// No race conditions - each child has independent storage
```

### Hierarchical Data Lookup with seek()

While each context has isolated data (`get()`/`getTag()` only read local), you can traverse the parent chain using `seek()`:

```typescript
const requestIdTag = tag<string>({ label: "requestId" })

const middleware = flow({
  factory: async (ctx) => {
    ctx.data.setTag(requestIdTag, generateRequestId())
    return ctx.exec({ flow: handler })
  }
})

const handler = flow({
  factory: (ctx) => {
    // seekTag() finds value from parent middleware context
    const reqId = ctx.data.seekTag(requestIdTag)
    logger.info(`Request: ${reqId}`)
  }
})
```

**Behavior comparison:**

| Method | Scope | Use Case |
|--------|-------|----------|
| `getTag(tag)` | Local only | Per-exec isolated data |
| `seekTag(tag)` | Local → parent → ... → root | Cross-cutting concerns |
| `setTag(tag, v)` | Local only | Always writes to current context |

**Note:** `seekTag()` does NOT use tag defaults - it's a pure lookup. Returns `undefined` if not found in any context.

### Auto-Close Lifecycle

Child contexts automatically close when `exec()` completes:

```typescript
const myFlow = flow({
  factory: async (ctx) => {
    // ctx is a CHILD context (not root)
    ctx.onClose(() => console.log('Child cleanup'))

    return 'result'
  }
})

await rootCtx.exec({ flow: myFlow })
// Logs "Child cleanup" HERE (after factory returns, before exec() returns)

await rootCtx.close()
// No additional cleanup - child already closed
```

**Critical:** Cleanups registered via `ctx.onClose()` run when the **child context** auto-closes (after factory returns), not when root context manually closes.

### Deferred Execution Pattern

Captured child context is closed after exec returns. For deferred work, create a dedicated context:

```typescript
const myFlow = flow({
  factory: async (ctx) => {
    // WRONG: setTimeout with captured ctx
    // setTimeout(() => ctx.exec({ flow: later }), 100)
    // ^ Throws "ExecutionContext is closed"

    // CORRECT: Create dedicated context
    const scope = ctx.scope
    setTimeout(async () => {
      const deferredCtx = scope.createContext()
      try {
        await deferredCtx.exec({ flow: later })
      } finally {
        await deferredCtx.close()
      }
    }, 100)

    return 'immediate result'
  }
})
```

### Extension Usage: Tracing with Parent Chain

Extensions receive child context and can access parent data:

```typescript
const SPAN_KEY = Symbol('tracing.span')

const tracingExtension: Extension = {
  name: 'tracing',
  wrapExec: async (next, target, ctx) => {
    // Read parent span from parent's data
    const parentSpan = ctx.parent?.data.get(SPAN_KEY) as Span | undefined

    const span = tracer.startSpan({
      name: isFlow(target) ? (target.name ?? 'anonymous') : 'fn',
      parent: parentSpan  // Automatic parent-child relationship!
    })

    // Store in THIS context's data
    ctx.data.set(SPAN_KEY, span)

    try {
      return await next()
    } finally {
      span.end()
    }
  }
}
```

### Breaking Changes from ADR-016

#### 1. onClose() Timing

**Before:** Cleanup ran on manual `ctx.close()`.

**After:** Cleanup runs when exec completes (child auto-close).

```typescript
// BEFORE: Shared context, cleanup on manual close
const ctx = scope.createContext()
await ctx.exec({
  flow: flow({
    factory: (ctx) => {
      ctx.onClose(() => console.log('cleanup'))
    }
  })
})
// Cleanup NOT run yet
await ctx.close()  // Cleanup runs HERE

// AFTER: Child context, cleanup on exec completion
await ctx.exec({
  flow: flow({
    factory: (ctx) => {  // ctx is CHILD
      ctx.onClose(() => console.log('cleanup'))
    }
  })
})
// Cleanup runs HERE (child auto-closed)
await ctx.close()  // Nothing additional runs
```

**Migration:** If cleanup must run on root close, traverse to root:

```typescript
const myFlow = flow({
  factory: (ctx) => {
    // Find root context
    let root = ctx
    while (root.parent) root = root.parent

    // Register on root, not child
    root.onClose(() => console.log('cleanup on root'))
  }
})
```

#### 2. ctx.input Isolation

**Before:** `ctx.input` mutated on each exec (footgun).

**After:** Each child has immutable `input`.

```typescript
// BEFORE: Mutation footgun
await ctx.exec({ flow: f1, input: 'a' })  // ctx.input = 'a'
await ctx.exec({ flow: f2, input: 'b' })  // ctx.input = 'b' (overwrites!)

// AFTER: Isolated per child
await ctx.exec({ flow: f1, input: 'a' })  // childA.input = 'a'
await ctx.exec({ flow: f2, input: 'b' })  // childB.input = 'b'
// ctx.input unchanged (undefined for root)
```

#### 3. Closed Context After Exec

**Before:** Same context reused across execs.

**After:** Child context closed after exec returns.

```typescript
const myFlow = flow({
  factory: async (ctx) => {
    setTimeout(() => {
      // BEFORE: Would work
      // AFTER: Throws "ExecutionContext is closed"
      ctx.exec({ flow: later })
    }, 100)
  }
})
```

**Migration:** Use dedicated context pattern (see "Deferred Execution Pattern" above).

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

### ExecFlowOptions

```typescript
type ExecFlowOptions<Output, Input> = {
  flow: Flow<Output, Input>
  name?: string
  tags?: Tagged<unknown>[]
} & (
  | { input: Input; rawInput?: never }   // Typed execution
  | { rawInput: unknown; input?: never } // Raw execution
)
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

Key test scenarios in `tests/hierarchical-context.test.ts` (15 tests):
- Root context has undefined parent
- Child context has parent reference
- Grandchild has correct parent chain
- Each execution has isolated data Map
- Concurrent siblings don't share data
- Child context auto-closes after exec
- onClose callbacks run on child auto-close
- Captured child context throws after close
- Extensions receive child context with parent access
- Tracing pattern with parent span propagation

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

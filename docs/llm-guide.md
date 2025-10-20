# Pumped-FN Core: LLM Usage Guide

Complete guide for using @pumped-fn/core-next with dependency injection patterns.

## Quick Start

```bash
pnpm add @pumped-fn/core-next
```

```typescript
import { provide, derive, createScope, meta, preset } from "@pumped-fn/core-next"
```

**Basic usage:**

```typescript
const config = provide(() => ({ port: 3000 }))

const server = derive([config], ([cfg]) => ({
  start: () => { /* start server on cfg.port */ }
}))

const scope = createScope()
await scope.resolve(server).then(s => s.start())
```

## Critical Anti-Patterns

These patterns cause runtime errors or incorrect behavior. NEVER use them.

```typescript
// ❌ NEVER use ctx.get() or scope.resolve() in executors
const bad = derive([logger], ([log], ctl) => {
  const db = ctl.scope.resolve(database) // WRONG: breaks graph
  return { query: () => {} }
})

// ✅ CORRECT: Explicit dependencies in array
const good = derive([logger, database], ([log, db]) => {
  return { query: () => db.execute() }
})

// ❌ NEVER escape provide/derive with conditional logic
const bad = provide((ctl) => {
  if (someCondition) return valueA
  return valueB // WRONG: logic outside graph
})

// ✅ CORRECT: Use .lazy for conditional resolution
const valueA = provide(() => "A")
const valueB = provide(() => "B")
const conditional = derive([valueA.lazy, valueB.lazy], ([a, b]) => {
  return someCondition ? a.resolve() : b.resolve()
})

// ❌ NEVER use classes
const bad = provide(() => new DatabaseService()) // WRONG

// ✅ CORRECT: Use object closures
const good = provide(() => {
  const db = new Database()
  return { query: (sql) => db.exec(sql) }
})

// ❌ NEVER import with extensions
import { provide } from "@pumped-fn/core-next.ts" // WRONG

// ✅ CORRECT: No extension
import { provide } from "@pumped-fn/core-next"
```

## Core Principles

1. **No classes** - use object closures with captured state
2. **Explicit dependencies** - declare all dependencies in arrays
3. **Zero comments** - code should be self-explanatory
4. **Type inference** - pumped-fn provides type safety
5. **Array syntax** - always `derive([deps], ([deps]) => factory)`
6. **Never ctx.get()** - dependencies must be explicit in executors
7. **Return objects** - with method closures, not class instances
8. **Use meta()** - with standard schema for configuration validation
9. **Single instance** - closures maintain state naturally

## Designing Dependency Graphs

Quick heuristics for composing executors into clean dependency graphs.

### When to Create an Executor?

**Create separate executor when:**
- Has state or lifecycle (connections, caches, timers)
- Single clear responsibility
- Needs independent testing
- Reused across multiple dependents

**Keep as closure/function when:**
- Pure utility function
- No state
- Only used in one place

```typescript
// ❌ Unnecessary executor for pure utility
const formatDate = provide(() => ({
  format: (d: Date) => d.toISOString()
}))

// ✅ Just a function
const formatDate = (d: Date) => d.toISOString()

// ✅ Executor for stateful service
const cache = provide(() => {
  const store = new Map()
  return { get: (k) => store.get(k), set: (k, v) => store.set(k, v) }
})
```

### When to Split vs Merge?

**Split when:**
- Multiple reasons to change (violates single responsibility)
- Different test concerns (auth logic vs logging)
- Can be used independently

**Merge when:**
- Always used together AND single responsibility
- No independent test value
- Artificially split (just wrapping)

```typescript
// ❌ Mixed concerns
const userService = derive([db, emailClient], ([db, email]) => ({
  create: (user) => db.insert(user),
  sendWelcome: (user) => email.send(user.email, "Welcome"),
  formatName: (user) => `${user.first} ${user.last}` // pure utility
}))

// ✅ Split by responsibility
const userRepo = derive([db], ([db]) => ({
  create: (user) => db.insert(user),
  find: (id) => db.query(id)
}))

const notifier = derive([emailClient], ([email]) => ({
  sendWelcome: (user) => email.send(user.email, "Welcome")
}))

const formatUserName = (user) => `${user.first} ${user.last}` // just a function
```

### Graph Depth: Keep Shallow

**Prefer flat, wide dependencies over deep chains.**

```typescript
// ❌ Deep chain (slow, hard to test, fragile)
const a = provide(() => ({ value: 1 }))
const b = derive([a], ([a]) => ({ value: a.value + 1 }))
const c = derive([b], ([b]) => ({ value: b.value + 1 }))
const d = derive([c], ([c]) => ({ value: c.value + 1 }))

// ✅ Flat dependencies (parallel resolution, easy to test)
const a = provide(() => ({ value: 1 }))
const b = provide(() => ({ value: 2 }))
const c = provide(() => ({ value: 3 }))
const d = derive([a, b, c], ([a, b, c]) => ({
  value: a.value + b.value + c.value
}))
```

**Target depth: 3-4 layers max**
1. Configuration / Primitives (`config`, `logger`)
2. Infrastructure (`database`, `cache`, `httpClient`)
3. Domain Services (`userService`, `orderService`)
4. Features / Handlers (`createUserFlow`, `checkoutFlow`)

### Dependency Organization Rules

**Rule 1: Acyclic - No circular dependencies**

```typescript
// ❌ Circular dependency
const a = derive([b], ([b]) => ({ use: () => b.value }))
const b = derive([a], ([a]) => ({ value: a.use() })) // WRONG

// ✅ Extract common dependency
const shared = provide(() => ({ value: 1 }))
const a = derive([shared], ([s]) => ({ use: () => s.value }))
const b = derive([shared], ([s]) => ({ value: s.value }))
```

**Rule 2: Depend on abstractions, not implementations**

```typescript
// ❌ Tight coupling to implementation
const userService = derive([postgresDB], ([pg]) => ({
  create: (user) => pg.query("INSERT...")
}))

// ✅ Depend on interface
const db = provide(() => new PostgresDB()) // or MySQLDB, or MockDB
const userService = derive([db], ([db]) => ({
  create: (user) => db.insert("users", user)
}))
```

**Rule 3: Make dependencies explicit**

```typescript
// ❌ Hidden dependency via closure
const config = { apiKey: "secret" }
const apiClient = provide(() => ({
  fetch: () => fetch(config.apiKey) // hidden dependency
}))

// ✅ Explicit dependency
const config = provide(() => ({ apiKey: "secret" }))
const apiClient = derive([config], ([cfg]) => ({
  fetch: () => fetch(cfg.apiKey)
}))
```

### Quick Checklist

Before finalizing your graph:

- [ ] Each executor has single responsibility
- [ ] Dependencies are explicit in arrays
- [ ] Graph is acyclic (no circular deps)
- [ ] Depth is 3-4 layers max
- [ ] Pure utilities are functions, not executors
- [ ] Can test each executor independently
- [ ] Configuration via `meta()`, not hardcoded

## Core Pattern 1: Simple Provider (No Dependencies)

```typescript
export const httpChecker = provide(
  () => ({
    check: async (url: string) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
      return response.ok
    }
  }),
  name("httpChecker")
)

const scope = createScope()
const checker = await scope.resolve(httpChecker)
await checker.check("https://example.com")
```

## Core Pattern 2: Derived with Dependencies

```typescript
const logger = provide(() => ({
  info: (msg: string) => { /* log to service */ }
}), name("logger"))

const database = derive(
  [logger],
  ([log]) => {
    const db = new Database()
    return {
      query: (sql: string) => {
        log.info(`Query: ${sql}`)
        return db.exec(sql)
      }
    }
  },
  name("database")
)

// Multiple dependencies
const healthCheck = derive(
  [database, logger],
  ([db, log]) => ({
    check: async () => {
      const result = await db.query("SELECT 1")
      log.info("Health check passed")
      return result
    }
  }),
  name("healthCheck")
)

const scope = createScope()
const check = await scope.resolve(healthCheck)
await check.check()
```

## Core Pattern 3: Configuration with meta()

```typescript
import { z } from "zod"

const logConfig = {
  level: meta("log-level", z.enum(["debug", "info", "error"]))
}

const dbConfig = {
  path: meta("db-path", z.string())
}

const logger = provide((ctl) => {
  const level = logConfig.level.find(ctl.scope) || "info"
  return { info: (msg) => { /* format by level */ } }
}, name("logger"))

const database = derive([logger], ([log], ctl) => {
  const path = dbConfig.path.find(ctl.scope) || "./db.sqlite"
  const db = new Database(path)
  return { query: (sql) => db.exec(sql) }
}, name("database"))

const scope = createScope({
  tags: [
    logConfig.level("debug"),
    dbConfig.path("/data/prod.db")
  ]
})

const db = await scope.resolve(database)
```

## Core Pattern 4: Testing with preset()

```typescript
const emailService = provide(() => ({
  send: async (to: string, body: string) => { /* real send */ }
}), name("emailService"))

const userSignup = derive([emailService], ([email]) => ({
  signup: async (user: User) => {
    await saveUser(user)
    await email.send(user.email, "Welcome!")
  }
}), name("userSignup"))

// Test with mock
const mockEmail = { send: vi.fn() }
const testScope = createScope({
  presets: [preset(emailService, mockEmail)]
})

const signup = await testScope.resolve(userSignup)
await signup.signup({ email: "test@example.com" })
expect(mockEmail.send).toHaveBeenCalledWith("test@example.com", "Welcome!")
```

## Core Pattern 5: Lifecycle with ctl.cleanup()

```typescript
const pool = provide((ctl) => {
  const p = new Pool({ max: 10 })
  ctl.cleanup(async () => {
    await p.drain()
    await p.clear()
  })
  return { getConnection: () => p.connect() }
}, name("pool"))

const database = derive([logger], ([log], ctl) => {
  const db = new Database()
  ctl.cleanup(() => db.close())
  return { query: (sql) => db.exec(sql) }
}, name("database"))

const scope = createScope()
const db = await scope.resolve(database)
await scope.dispose() // triggers all cleanup functions
```

## Using Promised for Better Async Control

```typescript
import { Promised } from "@pumped-fn/core-next"

// Preferred: Use Promised.create() static method
const result = await Promised.create(fetchData())
  .map(data => transformData(data))
  .mapError(err => new CustomError(err))

// Or use Promised.try() for sync/async functions
const result2 = await Promised.try(async () => {
  return await fetchData()
})
  .map(data => transformData(data))
  .mapError(err => new CustomError(err))

// Scope methods return Promised
scope.resolve(executor)
  .map(value => value.transform())
  .mapError(err => handleError(err))
```

**Promised API:** Read dist/index.d.ts for complete method list

**Promised Settled Utilities (Advanced):**
```typescript
// Work with parallel results
const results = await scope.exec(flow({
  handler: async (ctx) => {
    const promises = items.map(item => ctx.run(`process-${item.id}`, () => process(item)))
    return ctx.parallelSettled(promises)
  }
}), undefined)

// Extract only successful results
const successful = await results.fulfilled()

// Partition into fulfilled/rejected
const { fulfilled, rejected } = await results.partition()

// Assert all succeeded or throw
const allValues = await results.assertAllFulfilled()
```

## API Verification Protocol

**BEFORE using unfamiliar APIs, read the .d.ts file:**

```bash
# Location
packages/next/dist/index.d.ts
```

**Find exact signatures by namespace:**

- `Core.*`
  - `Core.Executor<T>`, `Core.Scope`, `Core.Accessor<T>`
  - `Core.Controller`, `Core.Preset<T>`

- `Flow.*`
  - `Flow.Context`, `Flow.Handler<S, I>`, `Flow.Definition<S, I>`, `Flow.Flow<I, O>`
  - Flow execution, parallel operations

- `Extension.*`
  - `Extension.Extension`, `Extension.Operation`
  - Lifecycle hooks: `init`, `wrap`, `dispose`, `onError`

- `Multi.*`
  - `Multi.MultiExecutor<T, K>`, `Multi.Option<K>`

- `Accessor.*`
  - `Accessor.Accessor<T>`, `Accessor.DataStore`
  - Used in flow context operations

- `Promised`
  - Extended promise: `map`, `switch`, `mapError`, `partition`, etc.
  - Settled utilities: `fulfilled`, `rejected`, `firstFulfilled`, `assertAllFulfilled`

**Example lookup:**

```typescript
// Unsure about scope.exec() signature?
// Read dist/index.d.ts and search for "exec"

exec<S, I = undefined>(
  flow: Core.Executor<Flow.Handler<S, I>>,
  input?: I,
  options?: {
    extensions?: Extension.Extension[];
    initialContext?: Array<[Accessor.Accessor<any>, any]>;
    tags?: Tag.Tagged[];
  }
): Promised<S>;
```

## Decision Tree: When to Read Advanced Sections

```
Need conditional resolution? → Read "Advanced: Accessors"
Need per-key instances? → Read "Advanced: Multi-Executors"
Need short-lived operations? → Read "Advanced: Flows"
Need cross-cutting concerns? → Read "Advanced: Extensions"
Working with parallel results? → Read "Promised Settled Utilities" (above)
Unsure about API signature? → Read dist/index.d.ts
```

---

# Advanced: Accessors (.lazy/.reactive/.static)

**When to use:**
- `.lazy` - Resolve dependency on demand, not eagerly
- `.reactive` - Re-execute when dependency changes
- `.static` - Get accessor instead of resolved value

## Pattern: Lazy Resolution

```typescript
const database = provide(() => new Database())
const cache = provide(() => new Cache())

// Only resolve database if cache miss
const service = derive([database.lazy, cache], ([dbAccessor, c]) => ({
  get: async (key: string) => {
    const cached = c.get(key)
    if (cached) return cached

    // Resolve database only when needed
    const db = await dbAccessor.resolve()
    return db.query(key)
  }
}))
```

## Pattern: Reactive Updates

```typescript
const config = provide(() => ({ theme: "light", lang: "en" }))

// Re-executes when config changes
const ui = derive([config.reactive], ([cfg]) => ({
  render: () => applyTheme(cfg.theme, cfg.lang)
}))

const scope = createScope()
const renderer = await scope.resolve(ui)

// Trigger re-execution
await scope.update(config, (current) => ({ ...current, theme: "dark" }))
```

## Pattern: Static Accessor

```typescript
const counter = provide(() => ({ count: 0 }))

const service = derive([counter.static], ([counterAccessor]) => ({
  increment: async () => {
    const current = counterAccessor.get()
    await counterAccessor.set({ count: current.count + 1 })
  },
  subscribe: (callback) => {
    return counterAccessor.subscribe(callback)
  }
}))
```

## Accessor API

```typescript
interface Accessor<T> {
  lookup(): ResolveState<T> | undefined
  get(): T
  resolve(force?: boolean): Promised<T>
  release(soft?: boolean): Promised<void>
  update(updateFn: T | ((current: T) => T)): Promised<void>
  set(value: T): Promised<void>
  subscribe(callback: (value: T) => void): Cleanup
}
```

**Full reference:** dist/index.d.ts:201-209

---

# Advanced: Multi-Executors

**When to use:** Per-key instances (per-user sessions, per-tenant databases, connection pools)

## Pattern: Multi Provide

```typescript
import { multi } from "@pumped-fn/core-next"
import { z } from "zod"

const sessionStore = multi.provide(
  { keySchema: z.string() },
  (userId: string, ctl) => {
    const data = new Map()
    ctl.cleanup(() => data.clear())

    return {
      set: (k: string, v: unknown) => data.set(k, v),
      get: (k: string) => data.get(k)
    }
  },
  name("sessionStore")
)

const scope = createScope()

// Each key gets isolated instance
const userA = await scope.resolve(sessionStore("user-a"))
const userB = await scope.resolve(sessionStore("user-b"))

userA.set("cart", [1, 2, 3]) // isolated from userB
```

## Pattern: Multi Derive with Dependencies

```typescript
const logger = provide(() => ({ info: (msg) => {} }))

const tenantDB = multi.derive(
  {
    keySchema: z.string(),
    dependencies: [logger]
  },
  ([log], tenantId: string, ctl) => {
    const db = new Database(`/data/${tenantId}.db`)
    ctl.cleanup(() => db.close())

    return {
      query: (sql: string) => {
        log.info(`[${tenantId}] ${sql}`)
        return db.exec(sql)
      }
    }
  },
  name("tenantDB")
)

const db1 = await scope.resolve(tenantDB("tenant-1"))
const db2 = await scope.resolve(tenantDB("tenant-2"))
```

## Pattern: Key Transform

```typescript
const userCache = multi.provide(
  {
    keySchema: z.object({ id: z.string(), region: z.string() }),
    keyTransform: (key) => `${key.region}:${key.id}` // normalize key
  },
  (key) => new Map()
)

// Same transformed key = same instance
const cache1 = await scope.resolve(userCache({ id: "123", region: "us" }))
const cache2 = await scope.resolve(userCache({ id: "123", region: "us" }))
// cache1 === cache2
```

## Multi API

```typescript
type MultiExecutor<T, K> =
  Core.Executor<(k: K) => Core.Accessor<T>> &
  ((key: K) => Core.Executor<T>) &
  {
    release: (scope: Core.Scope) => Promised<void>
    id: Tag.Tag<unknown>
  }

// Release all instances
await sessionStore.release(scope)
```

**Full reference:** dist/index.d.ts:443-457, 592-596

---

# Advanced: Flows

**When to use:**
- **Flows** - Short-lived operations (request handling, workflows)
- **Flow Context** - Request-scoped data storage and sub-flow execution
- **Flow Execution** - Execute flows directly on scope with isolated context

## Pattern: Basic Flow

```typescript
import { flow, accessor } from "@pumped-fn/core-next"
import { z } from "zod"

const handleUser = flow({
  name: "handleUser",
  input: z.object({ userId: z.string() }),
  output: z.object({ success: z.boolean() }),
  handler: async (ctx, input) => {
    // Flow logic
    return { success: true }
  }
})

const scope = createScope()
const result = await scope.exec(handleUser, { userId: "123" })
```

## Pattern: Flow with Dependencies

```typescript
const database = provide(() => ({ query: (sql) => {} }))
const logger = provide(() => ({ info: (msg) => {} }))

const processOrder = flow({
  name: "processOrder",
  input: z.object({ orderId: z.string() }),
  output: z.boolean(),
  dependencies: [database, logger],
  handler: async ([db, log], ctx, input) => {
    log.info(`Processing order ${input.orderId}`)
    await db.query(`UPDATE orders SET status = 'processing'`)
    return true
  }
})
```

## Pattern: Flow Context (Request-Scoped Data)

```typescript
const requestId = accessor("requestId", z.string())
const userId = accessor("userId", z.string())

const authFlow = flow({
  name: "auth",
  handler: (ctx, input) => {
    const reqId = ctx.get(requestId)
    const user = authenticate(input.token)
    ctx.set(userId, user.id)
    return user
  }
})

const mainFlow = flow({
  name: "main",
  handler: async (ctx, input) => {
    const user = await ctx.exec(authFlow, input)
    const uid = ctx.get(userId) // available from authFlow
    return processUser(uid)
  }
})

await scope.exec(mainFlow, { token: "abc" }, {
  initialContext: [[requestId, "req-123"]]
})
```

## Pattern: Parallel Execution in Flows

```typescript
const processItems = flow({
  name: "processItems",
  handler: async (ctx, input) => {
    const promises = input.items.map(item =>
      ctx.run(`process-${item.id}`, () => processItem(item))
    )

    const result = await ctx.parallel(promises)
    return result.results
  }
})
```

## Pattern: Sub-flows

```typescript
const validateUser = flow({
  name: "validate",
  handler: (ctx, input) => ({ valid: true })
})

const saveUser = flow({
  name: "save",
  handler: (ctx, input) => ({ saved: true })
})

const createUser = flow({
  name: "createUser",
  handler: async (ctx, input) => {
    const validation = await ctx.exec(validateUser, input)
    if (!validation.valid) throw new Error("Invalid")

    return ctx.exec(saveUser, input)
  }
})
```

## Pattern: Flow Execution Options

```typescript
const database = provide(() => new Database())
const requestId = accessor("requestId", z.string())
const userId = accessor("userId", z.string())

const scope = createScope()

// Execute flow with initialContext and meta
const processFlow = flow({
  name: "processData",
  handler: async (ctx, input) => {
    const db = await ctx.scope.resolve(database)
    const reqId = ctx.get(requestId)
    const user = ctx.get(userId)
    return processData(db, reqId, user, input)
  }
})

const result = await scope.exec(processFlow, { id: "123" }, {
  initialContext: [
    [requestId, "req-456"],
    [userId, "user-789"]
  ],
  tags: [customMeta("value")]
})
// Flow cleanup is automatic
```

## Flow Context API

```typescript
interface Flow.Context {
  readonly scope: Core.Scope
  readonly tags: Tag.Tagged[] | undefined

  get<T>(accessor: Accessor.Accessor<T>): T
  find<T>(accessor: Accessor.Accessor<T>): T | undefined
  set<T>(accessor: Accessor.Accessor<T>, value: T): void

  run<T>(key: string, fn: () => Promised<T> | T): Promised<T>
  exec<F>(flow: F, input: InferInput<F>): Promised<InferOutput<F>>

  parallel<T>(promises: T[]): Promised<ParallelResult<T>>
  parallelSettled<T>(promises: T[]): Promised<ParallelSettledResult<T>>
}
```

**Key properties:**
- `scope` - Access parent scope for resolving executors
- `metas` - Flow-specific metadata passed via exec options

**Full reference:** dist/index.d.ts (search for "Flow.Context")

---

# Advanced: Extensions

**When to use:** Cross-cutting concerns (logging, tracing, transactions, metrics, error handling)

## Pattern: Basic Extension

```typescript
import { extension } from "@pumped-fn/core-next"

const logger = extension({
  name: "logger",

  init: async (scope) => {
    // Initialize when scope created
  },

  wrap: async (ctx, next, operation) => {
    // Intercept all operations
    const start = Date.now()
    const result = await next()
    const duration = Date.now() - start

    if (operation.kind === "execute") {
      // log flow execution
    }

    return result
  },

  dispose: async (scope) => {
    // Cleanup when scope disposed
  }
})

const scope = createScope({ extensions: [logger] })
```

## Pattern: Monitor Execution

```typescript
const perfTracker = extension({
  name: "perf",
  wrap: async (ctx, next, op) => {
    const start = performance.now()
    try {
      return await next()
    } finally {
      const duration = performance.now() - start
      if (duration > 1000 && op.kind === "execute") {
        // log slow operations
      }
    }
  }
})
```

## Pattern: Error Handling

```typescript
const errorHandler = extension({
  name: "errorHandler",

  onError: (error, scope) => {
    // Handle scope-level errors
    reportError(error)
  },

  wrap: async (ctx, next, op) => {
    try {
      return await next()
    } catch (error) {
      // Transform or log errors
      throw enhanceError(error, op)
    }
  }
})
```

## Pattern: Transaction Management

```typescript
const transactionKey = accessor("transaction", z.any())

const transaction = extension({
  name: "transaction",

  wrap: async (ctx, next, op) => {
    if (op.kind === "execute") {
      // Initialize transaction for flow execution
      const db = await op.definition.scope?.resolve(database)
      if (db) {
        const tx = await db.beginTransaction()
        ctx.set(transactionKey, tx)

        try {
          const result = await next()
          await tx.commit()
          return result
        } catch (error) {
          await tx.rollback()
          throw error
        }
      }
    }
    return next()
  }
})
```

## Pattern: Distributed Tracing

```typescript
const tracing = extension({
  name: "tracing",
  wrap: async (ctx, next, op) => {
    if (op.kind !== "execute") return next()

    const span = tracer.startSpan(op.flowName || "unknown", {
      attributes: {
        depth: op.depth,
        isParallel: op.isParallel
      }
    })

    try {
      return await next()
    } finally {
      span.end()
    }
  }
})
```

## Extension API

```typescript
interface Extension {
  name: string

  // Scope lifecycle
  init?(scope: Core.Scope): void | Promise<void> | Promised<void>
  dispose?(scope: Core.Scope): void | Promise<void> | Promised<void>

  // Intercept operations
  wrap?<T>(
    context: Accessor.DataStore,
    next: () => Promised<T>,
    operation: Operation
  ): Promise<T> | Promised<T>

  // Error handling
  onError?(error: ExecutorResolutionError, scope: Core.Scope): void
}

type Operation =
  | { kind: "resolve"; executor: Executor; scope: Scope; operation: "resolve" | "update" }
  | { kind: "execute"; flow: UFlow; definition: Definition; input: unknown; ... }
  | { kind: "journal"; key: string; flowName: string; ... }
  | { kind: "subflow"; flow: UFlow; ... }
  | { kind: "parallel"; mode: "parallel" | "parallelSettled"; ... }
```

**Lifecycle hooks:**
- `init` - Called once when scope is created
- `dispose` - Called once when scope is disposed
- `wrap` - Called for every operation (resolve, execute, etc.)
- `onError` - Called when errors occur in scope

**Extension API accepts both Promise and Promised types for ergonomics**

**Wrapping order:** Last registered extension wraps all previous ones

**Full reference:** dist/index.d.ts (search for "Extension.Extension")

---

# Integration Pattern: Keep Thin

External integrations (HTTP frameworks, ORMs) should stay thin. Extract to plain TypeScript objects.

## Anti-Pattern: Framework-Coupled

```typescript
// ❌ WRONG: Tied to Hono framework
const userController = derive([db], ([database]) => ({
  create: async (c: Context) => { // Hono Context
    const body = await c.req.json()
    return c.json(await database.createUser(body))
  }
}))
```

## Correct Pattern: Framework-Agnostic

```typescript
// ✅ CORRECT: Pure business logic
const userService = derive([db], ([database]) => ({
  create: async (input: CreateUserInput) => {
    return database.createUser(input)
  }
}), name("userService"))

// Hono integration (thin layer)
import { Hono } from "hono"

const app = new Hono()
const scope = createScope()

app.post('/users', async (c) => {
  const service = await scope.resolve(userService)
  const input = createUserSchema.parse(await c.req.json())
  const user = await service.create(input)
  return c.json(user)
})
```

**Benefits:**
- Testable without framework
- Portable across frameworks
- Clear separation of concerns

---

# Common Patterns Summary

## Scope Lifecycle

```typescript
// Create scope
const scope = createScope({
  tags: [config.value("production")],
  presets: [preset(mockService, testImpl)],
  extensions: [logger, tracing]
})

// Resolve executors
const service = await scope.resolve(myService)

// Update reactive values
await scope.update(config, newValue)

// Cleanup
await scope.dispose()
```

## Testing Pattern

```typescript
describe("userService", () => {
  it("should create user", async () => {
    const mockDB = { createUser: vi.fn().mockResolvedValue({ id: "1" }) }

    const testScope = createScope({
      presets: [preset(database, mockDB)]
    })

    const service = await testScope.resolve(userService)
    const result = await service.create({ name: "Test" })

    expect(result.id).toBe("1")
    expect(mockDB.createUser).toHaveBeenCalled()

    await testScope.dispose()
  })
})
```

## Error Handling

```typescript
import { ExecutorResolutionError } from "@pumped-fn/core-next"

scope.onError(database, (error, executor, scope) => {
  // Handle database-specific errors
})

scope.onError((error, executor, scope) => {
  // Global error handler
  if (error instanceof ExecutorResolutionError) {
    // error.context, error.code, error.category
  }
})
```

---

# API Quick Reference

**Core exports:**
```typescript
import {
  // Executors
  provide, derive, preset, isExecutor,

  // Scope
  createScope,

  // Meta
  meta, getValue, findValue, findValues,

  // Flow
  flow, flowMeta, accessor,

  // Extension
  extension,

  // Utilities
  Promised, resolves, name,

  // Namespaces
  multi, standardSchema, errors,

  // Types
  type Core, type Meta, type Extension, type Flow, type Accessor
} from "@pumped-fn/core-next"
```

**For complete API signatures, always reference:**
```
packages/next/dist/index.d.ts
```

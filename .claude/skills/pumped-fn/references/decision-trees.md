## Core API Decision Trees

**Purpose:** Fast API selection via decision trees. For each coding decision, follow the tree to reach the correct API.

**Usage:** Read question → Follow path based on answer → Apply API pattern shown.

---

### Decision Tree 1: Component Type Selection

```
What are you building?
├─ External system integration (database, API, cache)?
│  └─ YES → RESOURCE (provide/derive)
│     Example: dbPool, redisCache, stripeClient
│
├─ Business logic with side effects/observability?
│  └─ YES → FLOW (flow())
│     Example: createUser, processPayment, sendEmail
│
├─ Pure transformation/utility?
│  └─ YES → FUNCTION (plain TypeScript function)
│     Example: validateEmail, formatCurrency, parseDate
│
└─ System behavior modification (logging, metrics, auth)?
   └─ YES → EXTENSION (wrap() with hooks)
      Example: logger, tracer, metrics collector
```

**Examples:**

```typescript
// RESOURCE - External system
const dbPool = provide(() => createPool({ host: 'localhost' }))

// FLOW - Business logic
const createUser = flow(
  { db: dbPool },
  ({ db }) => async (ctx, input: { email: string }) => {
    const id = await ctx.run('generate-id', () => randomUUID())
    const user = await ctx.run('insert-user', () =>
      db.query('INSERT INTO users ...', [id, input.email])
    )
    return { success: true as const, user }
  }
)

// FUNCTION - Pure utility
const validateEmail = (email: string): boolean => /^.+@.+\..+$/.test(email)

// EXTENSION - System behavior
const logger = wrap({
  execute: ({ flow, input }) => console.log(`Flow: ${flow.name}`, input)
})
```

---

### Decision Tree 2: provide() vs derive()

```
Does this resource need dependencies?
├─ NO (standalone, reads env vars, creates connection)
│  └─ Use provide()
│     - Direct factory function
│     - No dependency parameter
│     Example: config, database connection pool
│
└─ YES (needs other resources/config)
   └─ Use derive()
      - First parameter: dependencies object
      - Second parameter: factory with destructured deps
      Example: repository (needs db), service (needs repo + config)
```

**Examples:**

```typescript
// provide() - No dependencies
const config = provide(() => ({
  port: parseInt(process.env.PORT || '3000'),
  env: process.env.NODE_ENV || 'development'
}))

const dbPool = provide(() => createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres'
}))

// derive() - Single dependency
const userRepo = derive(dbPool, (db) => ({
  findById: (id: string) => db.query('SELECT * FROM users WHERE id = $1', [id]),
  create: (data: UserData) => db.query('INSERT INTO users ...', [data])
}))

// derive() - Multiple dependencies
const userService = derive(
  { db: dbPool, config },
  ({ db, config }) => ({
    getUser: (id: string) => db.query('...'),
    logAccess: () => console.log(`Env: ${config.env}`)
  })
)
```

**Key insight:** provide() = self-contained, derive() = depends on others.

---

### Decision Tree 3: flow() vs function

```
Does this code need:
- Side effects (DB writes, API calls, file I/O)?
- Observability (logging, tracing, metrics)?
- Journaling (ctx.run/exec tracking)?

├─ YES → Use flow()
│  - Wraps async operation with context
│  - Provides ctx.run() and ctx.exec() for journaling
│  - Observable via extensions
│  - Can depend on resources
│  Example: createUser, sendEmail, processPayment
│
└─ NO (pure transformation, no side effects) → Use plain function
   - Standard TypeScript function
   - Synchronous or async
   - Easy to unit test (no dependencies)
   Example: validateEmail, formatCurrency, calculateTax
```

**Examples:**

```typescript
// flow() - Side effects + observability
const createUser = flow(
  { db: dbPool, emailService },
  ({ db, emailService }) => async (ctx, input: { email: string, name: string }) => {
    // Journaled operations
    const validation = await ctx.run('validate', () =>
      validateEmail(input.email)
    )
    if (!validation) return { success: false as const, error: 'INVALID_EMAIL' }

    const user = await ctx.run('insert', () =>
      db.query('INSERT INTO users ...', [input.email, input.name])
    )

    await ctx.exec(sendWelcomeEmail, { to: input.email })

    return { success: true as const, user }
  }
)

// Plain function - Pure logic
const validateEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

const formatCurrency = (amount: number, currency = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(amount)
}
```

**When unsure:** If you want to see it in logs/traces → flow(). Otherwise → function.

---

### Decision Tree 4: When to Use .reactive Modifier

```
Will this dependency change over time AND do consumers need to react?

├─ NO (static config, one-time setup, immutable resource)
│  └─ NO modifier (default: lazy)
│     Example: dbPool, config, apiClient
│
└─ YES (real-time data, live subscriptions, dynamic state)
   └─ Use .reactive modifier
      - Consumers re-execute when value changes
      - For streams, observables, live queries
      Example: currentUser (auth state), liveOrders (WebSocket), featureFlags
```

**Examples:**

```typescript
// Default (lazy) - Static resources
const config = provide(() => ({
  apiUrl: 'https://api.example.com',
  timeout: 5000
}))

const dbPool = provide(() => createPool({ ... }))

// .reactive - Changes over time
import { reactive } from '@pumped-fn/core-next'

const currentUser = provide(
  () => authStream.subscribe(),
  reactive()
)

const liveOrders = derive(
  { ws: websocket },
  ({ ws }) => ws.subscribe<Order>('/orders'),
  reactive()
)

// Consumer automatically re-executes when currentUser changes
const userDashboard = derive(currentUser, (user) => ({
  greeting: `Hello, ${user.name}`,
  permissions: user.roles
}))
```

**Key insight:** .reactive = "this changes, consumers should know". Default = "set once, stays same".

---

### Decision Tree 5: Scope Lifecycle Strategy

```
What type of application?

├─ HTTP Server (Express, Fastify, Hono)
│  └─ ONE scope for entire app lifetime
│     - Create scope at startup
│     - Attach to app context
│     - Dispose on shutdown
│     Example: const scope = createScope(); app.listen(...)
│
├─ CLI Application
│  └─ ONE scope PER COMMAND execution
│     - Create scope when command starts
│     - Dispose in finally block
│     Example: yargs.command('users', async () => { const scope = createScope(); try { ... } finally { await scope.dispose() } })
│
├─ Scheduled Jobs (cron)
│  └─ ONE scope for job runner lifetime
│     - Create scope at startup
│     - Reuse across job executions
│     - Dispose on shutdown
│
├─ Serverless (Lambda, edge functions)
│  └─ ONE scope PER INVOCATION
│     - Create scope in handler
│     - Dispose after response
│     Example: export const handler = async (event) => { const scope = createScope(); try { ... } finally { await scope.dispose() } }
│
└─ React SPA / Meta-framework
   └─ ONE scope for app lifetime
      - Create scope at root
      - Provide via React Context
      - Dispose on unmount (rare)
      Example: const scope = useMemo(() => createScope(), [])
```

**Examples:**

```typescript
// HTTP Server - One scope
import express from 'express'
const app = express()
const scope = createScope()

app.get('/users/:id', async (req, res) => {
  const userService = await scope.resolve(getUserById)
  const result = await userService(req.params.id)
  res.json(result)
})

process.on('SIGTERM', async () => {
  await scope.dispose()
  process.exit(0)
})

// CLI - Scope per command
import { Command } from 'commander'
const program = new Command()

program
  .command('sync')
  .action(async () => {
    const scope = createScope()
    try {
      const sync = await scope.resolve(syncData)
      await sync()
    } finally {
      await scope.dispose()
    }
  })

// Lambda - Scope per invocation
export const handler = async (event: APIGatewayEvent) => {
  const scope = createScope()
  try {
    const process = await scope.resolve(processEvent)
    return await process(event)
  } finally {
    await scope.dispose()
  }
}

// React - One scope via context
import { ScopeProvider } from '@pumped-fn/react'

function App() {
  const scope = useMemo(() => createScope(), [])

  return (
    <ScopeProvider value={scope}>
      <Routes />
    </ScopeProvider>
  )
}
```

**Key insight:** Scope = unit of resource lifecycle. Match scope lifetime to your execution model.

### Graceful Disposal

**Purpose:** Allow active operations to complete before cleanup during scope disposal.

**Two-Phase Disposal:**

1. **Disposing Phase** - Reject new operations, allow active operations to complete
2. **Disposed Phase** - Run cleanup callbacks, clear all resources

**API:**

```typescript
await scope.dispose({ gracePeriod: 5000 })
```

- Default grace period: 5000ms (if no option provided)
- Set to 0 for immediate disposal
- Custom grace periods for different environments

**Behavior:**

- **Pending operations** (not yet started): Canceled immediately, throw `ScopeDisposingError`
- **Active operations** (already executing): Get full grace period to complete
- **After disposal**: All operations throw "Scope is disposed"

**Examples:**

```typescript
const scope = createScope()

await scope.dispose()

const scope = createScope()

await scope.dispose({ gracePeriod: 10000 })

const scope = createScope()

await scope.dispose({ gracePeriod: 0 })

const scope = createScope()
const server = await scope.resolve(httpServer)

process.on('SIGTERM', async () => {
  server.close()
  await scope.dispose({ gracePeriod: 30000 })
  process.exit(0)
})
```

**Error Handling:**

```typescript
import { ScopeDisposingError } from '@pumped-fn/core-next'

try {
  await scope.resolve(executor)
} catch (error) {
  if (error instanceof ScopeDisposingError) {
    console.log('Operation canceled due to disposal')
  }
}
```

**Testing:**

Use short grace periods (0ms) in tests for fast cleanup verification:

```typescript
test('cleanup runs', async () => {
  const scope = createScope()
  const cleanup = vi.fn()

  const executor = provide(() => ({ value: 'test' }), {
    cleanup: async () => cleanup()
  })

  await scope.resolve(executor)
  await scope.dispose({ gracePeriod: 0 })

  expect(cleanup).toHaveBeenCalled()
})
```

---

### Decision Tree 6: Tags vs Direct Values

```
Is this value:
- Runtime configuration (env-dependent)?
- Injected from outside (CLI args, request context)?
- Varies between deployments/environments?

├─ YES → Use tags
│  - Define tag with tag(custom<T>())
│  - Configure at scope creation
│  - Type-safe dependency injection
│  Example: API keys, feature flags, request IDs
│
└─ NO (hardcoded constant, compile-time value) → Use direct values
   - Literal values in code
   - No runtime variation
   Example: validation regex, default limits, constants
```

**Examples:**

```typescript
import { tag, custom, createScope } from '@pumped-fn/core-next'

// TAGS - Runtime configuration
const apiKey = tag(custom<string>(), { label: 'stripe.apiKey' })
const dbHost = tag(custom<string>(), { label: 'database.host' })
const requestId = tag(custom<string>(), { label: 'request.id' })

const stripeClient = derive(apiKey, (key) =>
  createStripeClient({ apiKey: key })
)

// Configure at runtime
const scope = createScope({
  tags: [
    apiKey(process.env.STRIPE_KEY!),
    dbHost(process.env.DB_HOST || 'localhost'),
    requestId(req.headers['x-request-id'])
  ]
})

// DIRECT VALUES - Constants
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const maxRetries = 3
const defaultTimeout = 5000

const validateEmail = (email: string) => emailRegex.test(email)
const retryPolicy = { maxRetries, timeout: defaultTimeout }
```

**Key insight:** Tags = "inject from outside". Direct values = "known at code time".

**Common tag use cases:**
- Environment variables (DB_HOST, API_KEY)
- Request context (user ID, correlation ID, tenant ID)
- Feature flags
- Deployment-specific config (region, cluster)

---

### Decision Tree 7: ctx.run() vs ctx.exec()

```
Inside a flow, are you:

├─ Calling another FLOW (orchestration, sub-flow)?
│  └─ Use ctx.exec()
│     - Executes sub-flow with full journaling
│     - Propagates extensions
│     - Shows in traces as nested flow
│     Example: await ctx.exec(sendEmail, { to: user.email })
│
└─ Performing a DIRECT OPERATION (async call, business logic)?
   └─ Use ctx.run()
      - Journals single operation with key
      - Wraps async work
      - Shows in traces as operation step
      Example: await ctx.run('fetch-user', () => db.query(...))
```

**Examples:**

```typescript
// ctx.run() - Direct operations
const createOrder = flow(
  { db: dbPool },
  ({ db }) => async (ctx, input: { userId: string, items: Item[] }) => {
    const orderId = await ctx.run('generate-id', () => randomUUID())

    const total = await ctx.run('calculate-total', () =>
      input.items.reduce((sum, item) => sum + item.price, 0)
    )

    const order = await ctx.run('insert-order', () =>
      db.query('INSERT INTO orders ...', [orderId, input.userId, total])
    )

    return { success: true as const, order }
  }
)

// ctx.exec() - Sub-flows
const sendWelcomeEmail = flow(
  { emailService },
  ({ emailService }) => async (ctx, input: { to: string }) => {
    await ctx.run('send', () => emailService.send({ to: input.to, subject: 'Welcome!' }))
    return { success: true as const }
  }
)

const registerUser = flow(
  { db: dbPool },
  ({ db }) => async (ctx, input: { email: string, name: string }) => {
    const user = await ctx.run('insert-user', () =>
      db.query('INSERT INTO users ...', [input.email, input.name])
    )

    // Orchestrate sub-flow
    await ctx.exec(sendWelcomeEmail, { to: input.email })

    return { success: true as const, user }
  }
)
```

**Trace output comparison:**

```
// ctx.run() logs:
flow: registerUser > op: insert-user (12ms)

// ctx.exec() logs:
flow: registerUser > flow: sendWelcomeEmail > op: send (45ms)
```

**Key insight:** ctx.exec() = flow calls flow. ctx.run() = flow does work.

---

### Decision Tree 8: Testing Strategy Selection

```
What are you testing?

├─ RESOURCE (database, API, cache)
│  ├─ Integration test (recommended for critical paths)
│  │  └─ Use real resource (test DB, localhost API)
│  │     Example: Real PostgreSQL in Docker for DB tests
│  │
│  └─ Unit test (faster, isolation)
│     └─ Use preset() to mock
│        Example: preset(dbPool, mockDb)
│
├─ FLOW (business logic)
│  └─ ALWAYS use preset() for dependencies
│     - Mock resources at boundary
│     - Verify discriminated union outputs
│     - Check journaling (operation keys)
│     Example: preset(dbPool, mockDb), preset(emailService, mockEmail)
│
├─ UTILITY FUNCTION (pure logic)
│  └─ Direct unit test (no mocking)
│     - Call function directly
│     - Assert output
│     Example: expect(validateEmail('test@example.com')).toBe(true)
│
└─ EXTENSION (logging, metrics)
   └─ Verify hook calls
      - Attach extension to test scope
      - Execute flow
      - Assert extension received events
      Example: Check logger.execute called with flow name
```

**Examples:**

```typescript
import { preset, createScope } from '@pumped-fn/core-next'
import { describe, test, expect, vi } from 'vitest'

// RESOURCE - Integration test
test('dbPool connects to real database', async () => {
  const scope = createScope({
    tags: [dbHost('localhost:5432')]
  })
  const db = await scope.resolve(dbPool)
  const result = await db.query('SELECT 1')
  expect(result).toBeDefined()
  await scope.dispose()
})

// RESOURCE - Unit test with preset()
test('userRepo queries database', async () => {
  const mockDb = { query: vi.fn(() => Promise.resolve([{ id: '123' }])) }

  const scope = createScope({
    presets: [preset(dbPool, mockDb)]
  })

  const repo = await scope.resolve(userRepo)
  const user = await repo.findById('123')

  expect(mockDb.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', ['123'])
  expect(user.id).toBe('123')
  await scope.dispose()
})

// FLOW - Always preset()
test('createUser inserts and sends email', async () => {
  const mockDb = { query: vi.fn(() => Promise.resolve({ id: '123', email: 'test@example.com' })) }
  const mockEmail = { send: vi.fn(() => Promise.resolve({ success: true })) }

  const scope = createScope({
    presets: [
      preset(dbPool, mockDb),
      preset(emailService, mockEmail)
    ]
  })

  const create = await scope.resolve(createUser)
  const ctx = scope.createFlowContext(createUser)
  const result = await create(ctx, { email: 'test@example.com', name: 'Test' })

  expect(result.success).toBe(true)
  expect(mockDb.query).toHaveBeenCalled()
  expect(mockEmail.send).toHaveBeenCalledWith({ to: 'test@example.com', subject: 'Welcome!' })
  await scope.dispose()
})

// UTILITY - Direct test
test('validateEmail accepts valid emails', () => {
  expect(validateEmail('test@example.com')).toBe(true)
  expect(validateEmail('invalid')).toBe(false)
  expect(validateEmail('')).toBe(false)
})

// EXTENSION - Hook verification
test('logger extension logs flow execution', async () => {
  const logs: any[] = []
  const logger = wrap({
    execute: (event) => logs.push(event)
  })

  const scope = createScope({
    extensions: [logger]
  })

  const testFlow = flow({ db: dbPool }, ({ db }) => async (ctx) => ({ success: true as const }))
  const exec = await scope.resolve(testFlow)
  const ctx = scope.createFlowContext(testFlow)
  await exec(ctx)

  expect(logs).toHaveLength(1)
  expect(logs[0].flow).toBe(testFlow)
  await scope.dispose()
})
```

**Key insight:** Resources = preset() or integration. Flows = always preset(). Functions = direct. Extensions = verify hooks.

---

### Decision Tree 9: Promised Utilities Selection

```
What's your error handling requirement?

├─ All operations must succeed (fail-fast)
│  └─ Use Promised.all()
│     - Returns array of results
│     - Throws on first error
│     - Parallel execution
│     Example: await Promised.all([fetchUser, fetchPosts, fetchComments])
│
├─ Partial failures acceptable (collect results + errors)
│  └─ Use Promised.allSettled()
│     - Returns PromiseSettledResult[]
│     - Never throws
│     - Inspect .status for 'fulfilled' | 'rejected'
│     Example: const results = await Promised.allSettled([...])
│              const succeeded = results.filter(r => r.status === 'fulfilled')
│
└─ Single operation, need discriminated union error
   └─ Use Promised.try()
      - Wraps promise in { success, data } | { success, error }
      - Type-safe error handling
      - No throw/catch needed
      Example: const result = await Promised.try(() => riskyOperation())
               if (!result.success) return result.error
```

**Examples:**

```typescript
import { Promised, createScope } from '@pumped-fn/core-next'

// Promised.all() - All must succeed
const loadDashboard = flow(
  { userRepo, postRepo, commentRepo },
  ({ userRepo, postRepo, commentRepo }) => async (ctx, userId: string) => {
    const [user, posts, comments] = await Promised.all([
      userRepo.findById(userId),
      postRepo.findByUser(userId),
      commentRepo.findByUser(userId)
    ])

    return { success: true as const, dashboard: { user, posts, comments } }
  }
)

// Promised.allSettled() - Partial failures OK
const syncExternalSystems = flow(
  { stripe, sendgrid, slack },
  ({ stripe, sendgrid, slack }) => async (ctx, data: SyncData) => {
    const results = await Promised.allSettled([
      stripe.syncCustomer(data.customerId),
      sendgrid.syncContact(data.email),
      slack.notifyChannel(data.message)
    ])

    const succeeded = results.filter(r => r.status === 'fulfilled')
    const failed = results.filter(r => r.status === 'rejected')

    return {
      success: true as const,
      synced: succeeded.length,
      failed: failed.length,
      errors: failed.map(f => f.reason)
    }
  }
)

// Promised.try() - Discriminated union error
const fetchUserSafely = flow(
  { api: externalApi },
  ({ api }) => async (ctx, userId: string) => {
    const result = await Promised.try(() =>
      api.fetchUser(userId)
    )

    if (!result.success) {
      return { success: false as const, error: 'USER_NOT_FOUND' }
    }

    return { success: true as const, user: result.data }
  }
)
```

**Comparison:**

```typescript
// Promised.all() - throws on any error
try {
  const [a, b, c] = await Promised.all([p1, p2, p3])
} catch (error) {
  // First error thrown, others might be pending
}

// Promised.allSettled() - never throws
const results = await Promised.allSettled([p1, p2, p3])
const succeeded = results.filter(r => r.status === 'fulfilled').map(r => r.value)
const failed = results.filter(r => r.status === 'rejected').map(r => r.reason)

// Promised.try() - discriminated union
const result = await Promised.try(() => riskyOp())
if (result.success) {
  console.log(result.data)
} else {
  console.error(result.error)
}
```

**Key insight:**
- All must succeed → Promised.all()
- Collect partial results → Promised.allSettled()
- Single op, type-safe error → Promised.try()

---


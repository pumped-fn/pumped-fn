# Complete Documentation Rewrite Implementation Plan

> **For Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task.

**Goal:** Rewrite pumped-fn documentation to match IMPLEMENTATION_SUMMARY.md vision - clean structure, working examples with twoslash, no legacy content.

**Architecture:** Clean slate approach - delete all old docs, create new guides/patterns/reference structure with working TypeScript examples verified by twoslash and tsc.

**Tech Stack:** VitePress, TypeScript, @shikijs/vitepress-twoslash, @pumped-fn/core-next

---

## Task 1: Cleanup - Remove Stale Documentation

**Files:**
- Delete: `docs/concepts/` (entire directory)
- Delete: `docs/decisions/` (entire directory)
- Delete: `docs/migration-guides/` (entire directory)
- Delete: `docs/plans/2025-01-17-docs-structure-context7.md`
- Delete: `docs/plans/2025-10-16-remove-pod-concept.md`
- Delete: `docs/plans/2025-10-20-complete-meta-to-tag-migration.md`
- Delete: `docs/plans/2025-10-20-unify-accessor-meta-into-tag.md`
- Delete: `docs/api.md`
- Delete: `docs/flow.md`
- Delete: `docs/accessor.md`
- Delete: `docs/meta.md`
- Delete: `docs/utilities.md`
- Delete: `docs/extension-api-guide.md`
- Delete: `docs/validation.md`
- Delete: `docs/helpers.md`
- Delete: `docs/quick-start.md`
- Delete: `docs/how-does-it-work.md`
- Delete: `docs/graph-vs-traditional.md`
- Delete: `docs/llm-guide.md`
- Delete: `docs/testings.md`
- Delete: `docs/code/` (entire directory)
- Delete: `docs/test-analysis/` (entire directory if exists)
- Delete: `docs/authoring.md` (if exists)

**Step 1: Delete old directories**

```bash
rm -rf docs/concepts docs/decisions docs/migration-guides docs/code docs/test-analysis
```

**Step 2: Delete old plan files**

```bash
rm -f docs/plans/2025-01-17-docs-structure-context7.md \
      docs/plans/2025-10-16-remove-pod-concept.md \
      docs/plans/2025-10-20-complete-meta-to-tag-migration.md \
      docs/plans/2025-10-20-unify-accessor-meta-into-tag.md
```

**Step 3: Delete old API and guide files**

```bash
rm -f docs/api.md docs/flow.md docs/accessor.md docs/meta.md \
      docs/utilities.md docs/extension-api-guide.md docs/validation.md \
      docs/helpers.md docs/quick-start.md docs/how-does-it-work.md \
      docs/graph-vs-traditional.md docs/llm-guide.md docs/testings.md \
      docs/authoring.md
```

**Step 4: Verify cleanup**

```bash
ls -la docs/
```

Expected: Only `guides/`, `patterns/`, `reference/`, `.vitepress/`, `README.md`, `IMPLEMENTATION_SUMMARY.md` remain

**Step 5: Commit cleanup**

```bash
git add -A docs/
git commit -m "docs: remove all legacy documentation files"
```

---

## Task 2: Create Example - Scope Lifecycle

**Files:**
- Create: `examples/http-server/scope-lifecycle.ts`

**Step 1: Create scope lifecycle example**

```typescript
import { provide, derive, createScope } from '@pumped-fn/core-next'
import { appConfig, type AppConfig, type DB } from './shared/tags'

const config = provide((controller) => appConfig.get(controller.scope))

const dbConnection = derive(config, (cfg) => ({
  pool: `connected to ${cfg.dbHost}`,
  query: async (sql: string) => ({ rows: [] }),
  close: async () => console.log('DB connection closed')
}))

const userService = derive({ db: dbConnection }, ({ db }) => ({
  getUser: async (id: string) => {
    const result = await db.query(`SELECT * FROM users WHERE id = '${id}'`)
    return result.rows[0]
  }
}))

async function main() {
  const scope = createScope({
    tags: [
      appConfig({
        port: 3000,
        env: 'production',
        dbHost: 'db.example.com'
      })
    ]
  })

  const service = await scope.resolve(userService)
  const user = await service.getUser('123')
  console.log('User:', user)

  await scope.dispose()
}
```

**Step 2: Verify typecheck**

```bash
pnpm --filter @pumped-fn/examples typecheck
```

Expected: No errors

**Step 3: Commit**

```bash
git add examples/http-server/scope-lifecycle.ts
git commit -m "docs: add scope lifecycle example"
```

---

## Task 3: Create Example - Flow Composition

**Files:**
- Create: `examples/http-server/flow-composition.ts`

**Step 1: Create flow composition example**

```typescript
import { flow, createScope } from '@pumped-fn/core-next'
import { requestId, userId, appConfig } from './shared/tags'

const validateUser = flow((ctx, id: string) => {
  if (!id || id.length < 3) {
    throw new Error('Invalid user ID')
  }
  ctx.set(userId, id)
  return id
})

const fetchUserData = flow((ctx, id: string) => {
  const validatedId = ctx.get(userId)
  return {
    id: validatedId,
    name: 'John Doe',
    email: 'john@example.com'
  }
})

const handleRequest = flow((ctx, req: { userId: string }) => {
  const reqId = `req-${Date.now()}`
  ctx.set(requestId, reqId)

  const id = await ctx.exec(validateUser, req.userId)
  const userData = await ctx.exec(fetchUserData, id)

  return {
    requestId: reqId,
    user: userData
  }
})

async function main() {
  const scope = createScope({
    tags: [
      appConfig({
        port: 3000,
        env: 'development',
        dbHost: 'localhost'
      })
    ]
  })

  const result = await flow.execute(handleRequest, { userId: 'user123' }, {
    scope
  })

  console.log('Result:', result)
  await scope.dispose()
}
```

**Step 2: Verify typecheck**

```bash
pnpm --filter @pumped-fn/examples typecheck
```

Expected: No errors

**Step 3: Commit**

```bash
git add examples/http-server/flow-composition.ts
git commit -m "docs: add flow composition example"
```

---

## Task 4: Create Example - Reactive Updates

**Files:**
- Create: `examples/http-server/reactive-updates.ts`

**Step 1: Create reactive updates example**

```typescript
import { provide, derive, createScope } from '@pumped-fn/core-next'
import { appConfig } from './shared/tags'

const config = provide((controller) => appConfig.get(controller.scope))

const cachedData = derive(config, (cfg) => ({
  environment: cfg.env,
  timestamp: Date.now()
}))

const reactiveConsumer = derive.reactive(cachedData, (data) => {
  console.log('Config changed:', data)
  return data
})

async function main() {
  const scope = createScope({
    tags: [
      appConfig({
        port: 3000,
        env: 'development',
        dbHost: 'localhost'
      })
    ]
  })

  const consumer = await scope.resolve(reactiveConsumer)
  console.log('Initial:', consumer)

  scope.update(appConfig({
    port: 3000,
    env: 'production',
    dbHost: 'prod.db.example.com'
  }))

  await new Promise(resolve => setTimeout(resolve, 100))
  await scope.dispose()
}
```

**Step 2: Verify typecheck**

```bash
pnpm --filter @pumped-fn/examples typecheck
```

Expected: No errors

**Step 3: Commit**

```bash
git add examples/http-server/reactive-updates.ts
git commit -m "docs: add reactive updates example"
```

---

## Task 5: Create Example - Extension Logging

**Files:**
- Create: `examples/http-server/extension-logging.ts`

**Step 1: Create extension logging example**

```typescript
import { extension, flow, createScope } from '@pumped-fn/core-next'
import { requestId } from './shared/tags'

const loggingExtension = extension({
  name: 'logging',
  wrap: async (ctx, next, operation) => {
    const reqId = requestId.find(ctx) || 'no-id'
    console.log(`[${reqId}] Starting ${operation.kind}`)

    const startTime = Date.now()
    try {
      const result = await next()
      const duration = Date.now() - startTime
      console.log(`[${reqId}] Finished ${operation.kind} in ${duration}ms`)
      return result
    } catch (error) {
      const duration = Date.now() - startTime
      console.log(`[${reqId}] Failed ${operation.kind} after ${duration}ms`)
      throw error
    }
  }
})

const businessLogic = flow((ctx, input: { value: number }) => {
  return { result: input.value * 2 }
})

async function main() {
  const scope = createScope({
    extensions: [loggingExtension]
  })

  const result = await flow.execute(businessLogic, { value: 42 }, {
    scope,
    tags: [requestId('req-001')]
  })

  console.log('Result:', result)
  await scope.dispose()
}
```

**Step 2: Verify typecheck**

```bash
pnpm --filter @pumped-fn/examples typecheck
```

Expected: No errors

**Step 3: Commit**

```bash
git add examples/http-server/extension-logging.ts
git commit -m "docs: add extension logging example"
```

---

## Task 6: Create Example - Error Handling

**Files:**
- Create: `examples/http-server/error-handling.ts`

**Step 1: Create error handling example**

```typescript
import { flow, createScope } from '@pumped-fn/core-next'

const riskyOperation = flow(async (ctx, shouldFail: boolean) => {
  if (shouldFail) {
    throw new Error('Operation failed')
  }
  return { success: true }
})

const handleWithRecovery = flow((ctx, input: boolean) => {
  try {
    const result = await ctx.exec(riskyOperation, input)
    return { status: 'ok', data: result }
  } catch (error) {
    console.error('Caught error:', error)
    return { status: 'error', message: error.message }
  }
})

const withCleanup = flow((ctx, input: boolean) => {
  const resource = { allocated: true }

  try {
    const result = await ctx.exec(riskyOperation, input)
    return result
  } finally {
    console.log('Cleaning up resource')
    resource.allocated = false
  }
})

async function main() {
  const scope = createScope()

  const recovered = await flow.execute(handleWithRecovery, true, { scope })
  console.log('Recovered:', recovered)

  try {
    await flow.execute(withCleanup, true, { scope })
  } catch (error) {
    console.log('Error caught in main:', error.message)
  }

  await scope.dispose()
}
```

**Step 2: Verify typecheck**

```bash
pnpm --filter @pumped-fn/examples typecheck
```

Expected: No errors

**Step 3: Commit**

```bash
git add examples/http-server/error-handling.ts
git commit -m "docs: add error handling example"
```

---

## Task 7: Create Example - Middleware Chain

**Files:**
- Create: `examples/http-server/middleware-chain.ts`

**Step 1: Create middleware chain example**

```typescript
import { extension, flow, createScope } from '@pumped-fn/core-next'
import { requestId, userId } from './shared/tags'

const authMiddleware = extension({
  name: 'auth',
  wrap: async (ctx, next, operation) => {
    const id = userId.find(ctx)
    if (!id) {
      throw new Error('Unauthorized')
    }
    return next()
  }
})

const timingMiddleware = extension({
  name: 'timing',
  wrap: async (ctx, next, operation) => {
    const start = Date.now()
    const result = await next()
    console.log(`${operation.kind} took ${Date.now() - start}ms`)
    return result
  }
})

const handler = flow((ctx, req: { action: string }) => {
  const user = ctx.get(userId)
  return {
    user,
    action: req.action,
    timestamp: Date.now()
  }
})

async function main() {
  const scope = createScope({
    extensions: [authMiddleware, timingMiddleware]
  })

  const result = await flow.execute(handler, { action: 'getData' }, {
    scope,
    tags: [
      requestId('req-123'),
      userId('user-456')
    ]
  })

  console.log('Result:', result)
  await scope.dispose()
}
```

**Step 2: Verify typecheck**

```bash
pnpm --filter @pumped-fn/examples typecheck
```

Expected: No errors

**Step 3: Commit**

```bash
git add examples/http-server/middleware-chain.ts
git commit -m "docs: add middleware chain example"
```

---

## Task 8: Create Example - Database Transaction

**Files:**
- Create: `examples/http-server/database-transaction.ts`

**Step 1: Create database transaction example**

```typescript
import { extension, flow, createScope, tag, custom } from '@pumped-fn/core-next'

const transaction = tag(custom<{
  commit: () => Promise<void>
  rollback: () => Promise<void>
}>(), { label: 'db.transaction' })

const transactionExtension = extension({
  name: 'transaction',
  wrap: async (ctx, next, operation) => {
    if (operation.kind !== 'flow') {
      return next()
    }

    const txn = {
      commit: async () => console.log('Transaction committed'),
      rollback: async () => console.log('Transaction rolled back')
    }

    ctx.set(transaction, txn)

    try {
      const result = await next()
      await txn.commit()
      return result
    } catch (error) {
      await txn.rollback()
      throw error
    }
  }
})

const createUser = flow(async (ctx, data: { name: string, email: string }) => {
  const txn = ctx.get(transaction)
  console.log('Creating user in transaction:', data)
  return { id: '123', ...data }
})

const updateProfile = flow((ctx, userId: string, data: { bio: string }) => {
  const txn = ctx.get(transaction)
  console.log('Updating profile in transaction:', userId, data)
  return { userId, ...data }
})

const registerUser = flow(async (ctx, input: { name: string, email: string, bio: string }) => {
  const user = await ctx.exec(createUser, {
    name: input.name,
    email: input.email
  })

  const profile = await ctx.exec(updateProfile, user.id, {
    bio: input.bio
  })

  return { user, profile }
})

async function main() {
  const scope = createScope({
    extensions: [transactionExtension]
  })

  const result = await flow.execute(registerUser, {
    name: 'John',
    email: 'john@example.com',
    bio: 'Software developer'
  }, { scope })

  console.log('Result:', result)
  await scope.dispose()
}
```

**Step 2: Verify typecheck**

```bash
pnpm --filter @pumped-fn/examples typecheck
```

Expected: No errors

**Step 3: Commit**

```bash
git add examples/http-server/database-transaction.ts
git commit -m "docs: add database transaction example"
```

---

## Task 9: Create Example - Testing Setup

**Files:**
- Create: `examples/http-server/testing-setup.ts`

**Step 1: Create testing setup example**

```typescript
import { provide, derive, createScope, preset } from '@pumped-fn/core-next'
import { appConfig, type DB } from './shared/tags'

const config = provide((controller) => appConfig.get(controller.scope))

const db = derive(config, (cfg) => ({
  query: async (sql: string) => {
    console.log('Real DB query:', sql)
    return { rows: [] }
  },
  close: async () => console.log('DB closed')
}))

const userService = derive({ db }, ({ db }) => ({
  getUser: async (id: string) => {
    const result = await db.query(`SELECT * FROM users WHERE id = '${id}'`)
    return result.rows[0]
  }
}))

const mockDb: DB = {
  query: async (sql: string) => {
    console.log('Mock DB query:', sql)
    return {
      rows: [{ id: '123', name: 'Test User' }]
    }
  },
  close: async () => console.log('Mock DB closed')
}

async function productionUsage() {
  const scope = createScope({
    tags: [
      appConfig({
        port: 3000,
        env: 'production',
        dbHost: 'db.example.com'
      })
    ]
  })

  const service = await scope.resolve(userService)
  const user = await service.getUser('123')
  console.log('Production user:', user)
  await scope.dispose()
}

async function testUsage() {
  const scope = createScope({
    tags: [
      appConfig({
        port: 3000,
        env: 'test',
        dbHost: 'localhost'
      })
    ],
    presets: [preset(db, mockDb)]
  })

  const service = await scope.resolve(userService)
  const user = await service.getUser('123')
  console.log('Test user:', user)
  await scope.dispose()
}

async function main() {
  console.log('--- Production ---')
  await productionUsage()

  console.log('\n--- Testing ---')
  await testUsage()
}
```

**Step 2: Verify typecheck**

```bash
pnpm --filter @pumped-fn/examples typecheck
```

Expected: No errors

**Step 3: Commit**

```bash
git add examples/http-server/testing-setup.ts
git commit -m "docs: add testing setup example"
```

---

## Task 10: Create Guide - Scope Lifecycle

**Files:**
- Create: `docs/guides/03-scope-lifecycle.md`

**Step 1: Create scope lifecycle guide**

```markdown
---
title: Scope Lifecycle
description: Managing long-running resources with scopes
keywords: [scope, lifecycle, resources, dispose]
---

# Scope Lifecycle

Scopes manage long-running resources like database connections, HTTP servers, and configuration. They resolve executors once and cache values for the scope's lifetime.

## Core Pattern

```ts twoslash
import { provide, derive, createScope } from '@pumped-fn/core-next'

const config = provide(() => ({ dbHost: 'localhost' }))

const db = derive(config, (cfg) => ({
  pool: `connected to ${cfg.dbHost}`,
  close: async () => console.log('DB closed')
}))

const scope = createScope()
const database = await scope.resolve(db)

await scope.dispose()
```

## Scope Creation

Create scopes with initial tags:

```ts twoslash
import { createScope, tag, custom } from '@pumped-fn/core-next'

const appConfig = tag(custom<{ port: number }>(), { label: 'app.config' })

const scope = createScope({
  tags: [
    appConfig({ port: 3000 })
  ]
})
```

## Resource Resolution

Executors resolve once per scope:

```ts twoslash
import { provide, derive, createScope } from '@pumped-fn/core-next'

const db = provide(() => ({ id: Math.random() }))
const service = derive(db, (database) => ({ database }))

const scope = createScope()

const s1 = await scope.resolve(service)
const s2 = await scope.resolve(service)

console.log(s1 === s2) // true - same instance
```

## Cleanup

Always dispose scopes to release resources:

```ts twoslash
import { createScope } from '@pumped-fn/core-next'

const scope = createScope()

try {
  // Use scope
} finally {
  await scope.dispose()
}
```

## Complete Example

<<< @/../examples/http-server/scope-lifecycle.ts

## Key Points

- Scopes cache executor results
- Use for long-running resources
- Always call `dispose()` when done
- Tags provide configuration at scope creation

## See Also

- [Executors and Dependencies](./01-executors-and-dependencies.md)
- [Tags: The Type System](./02-tags-the-type-system.md)
- [Testing Strategies](../patterns/testing-strategies.md)
```

**Step 2: Verify docs build**

```bash
pnpm docs:build
```

Expected: Build succeeds, no errors

**Step 3: Commit**

```bash
git add docs/guides/03-scope-lifecycle.md
git commit -m "docs: add scope lifecycle guide"
```

---

## Task 11: Create Guide - Flow Basics

**Files:**
- Create: `docs/guides/05-flow-basics.md`

**Step 1: Create flow basics guide**

```markdown
---
title: Flow Basics
description: Short-lived operations with flow context
keywords: [flow, context, execution]
---

# Flow Basics

Flows handle short-lived operations like HTTP requests, background jobs, or individual transactions. Each flow gets isolated context for tags and nested execution.

## Core Pattern

```ts twoslash
import { flow } from '@pumped-fn/core-next'

const handler = flow((ctx, input: { value: number }) => {
  return { result: input.value * 2 }
})

const result = await flow.execute(handler, { value: 21 })
```

## Flow with Dependencies

Flows can depend on executors:

```ts twoslash
import { flow, provide, derive } from '@pumped-fn/core-next'

const config = provide(() => ({ multiplier: 3 }))
const calculator = derive(config, (cfg) => ({
  multiply: (n: number) => n * cfg.multiplier
}))

const handler = flow({ calculator }, (deps, ctx, input: number) => {
  return deps.calculator.multiply(input)
})
```

## Flow Context

Context provides tag access and subflow execution:

```ts twoslash
import { flow, tag, custom } from '@pumped-fn/core-next'

const userId = tag(custom<string>(), { label: 'user.id' })

const handler = flow((ctx, input: string) => {
  ctx.set(userId, input)
  const id = ctx.get(userId)

  return { userId: id }
})
```

## Type Inference

Flow types infer from implementation:

```ts twoslash
import { flow } from '@pumped-fn/core-next'

const handler = flow((ctx, input: { name: string }) => {
  return { greeting: `Hello, ${input.name}` }
})
```

The return type is automatically `{ greeting: string }`.

## Execution Options

```ts twoslash
import { flow, createScope, tag, custom } from '@pumped-fn/core-next'

const requestId = tag(custom<string>(), { label: 'request.id' })
const handler = flow((ctx, input: number) => input * 2)

const scope = createScope()

const result = await flow.execute(handler, 42, {
  scope,
  tags: [requestId('req-123')]
})

await scope.dispose()
```

## Complete Example

<<< @/../examples/http-server/basic-handler.ts

## Key Points

- Flows handle short-lived operations
- Context isolates data per execution
- Dependencies pull from scope
- Full type inference on inputs/outputs

## See Also

- [Flow Composition](./06-flow-composition.md)
- [Tags: The Type System](./02-tags-the-type-system.md)
- [Promised API](./07-promised-api.md)
```

**Step 2: Verify docs build**

```bash
pnpm docs:build
```

Expected: Build succeeds

**Step 3: Commit**

```bash
git add docs/guides/05-flow-basics.md
git commit -m "docs: add flow basics guide"
```

---

## Task 12: Create Guide - Flow Composition

**Files:**
- Create: `docs/guides/06-flow-composition.md`

**Step 1: Create flow composition guide**

```markdown
---
title: Flow Composition
description: Composing flows with ctx.exec and parallel execution
keywords: [flow, composition, ctx.exec, parallel]
---

# Flow Composition

Flows compose via `ctx.exec()` for sequential execution and `ctx.parallel()` for concurrent operations. Each subflow inherits parent context.

## Sequential Execution

```ts twoslash
import { flow } from '@pumped-fn/core-next'

const step1 = flow((ctx, input: number) => input * 2)
const step2 = flow((ctx, input: number) => input + 10)

const combined = flow((ctx, input: number) => {
  const result1 = await ctx.exec(step1, input)
  const result2 = await ctx.exec(step2, result1)
  return result2
})
```

## Context Inheritance

Subflows inherit parent context tags:

```ts twoslash
import { flow, tag, custom } from '@pumped-fn/core-next'

const userId = tag(custom<string>(), { label: 'user.id' })

const subFlow = flow((ctx, _input: void) => {
  return ctx.get(userId)
})

const parent = flow((ctx, id: string) => {
  ctx.set(userId, id)
  return ctx.exec(subFlow, undefined)
})
```

## Parallel Execution

```ts twoslash
import { flow } from '@pumped-fn/core-next'

const fetchUser = flow((ctx, id: string) => ({ id, name: 'User' }))
const fetchPosts = flow((ctx, userId: string) => [{ id: '1', title: 'Post' }])

const handler = flow(async (ctx, userId: string) => {
  const results = await ctx.parallel([
    ctx.exec(fetchUser, userId),
    ctx.exec(fetchPosts, userId)
  ])

  const [user, posts] = results
  return { user, posts }
})
```

## Error Handling in Composition

```ts twoslash
import { flow } from '@pumped-fn/core-next'

const riskyStep = flow((ctx, shouldFail: boolean) => {
  if (shouldFail) throw new Error('Failed')
  return 'success'
})

const handler = flow(async (ctx, input: boolean) => {
  try {
    const result = await ctx.exec(riskyStep, input)
    return { status: 'ok', result }
  } catch (error) {
    return { status: 'error', message: (error as Error).message }
  }
})
```

## Complete Example

<<< @/../examples/http-server/flow-composition.ts

## Key Points

- `ctx.exec()` runs subflows sequentially
- `ctx.parallel()` runs operations concurrently
- Subflows inherit parent context
- Error handling with try/catch

## See Also

- [Flow Basics](./05-flow-basics.md)
- [Error Handling](./10-error-handling.md)
- [Promised API](./07-promised-api.md)
```

**Step 2: Verify docs build**

```bash
pnpm docs:build
```

Expected: Build succeeds

**Step 3: Commit**

```bash
git add docs/guides/06-flow-composition.md
git commit -m "docs: add flow composition guide"
```

---

## Task 13: Create Guide - Promised API

**Files:**
- Create: `docs/guides/07-promised-api.md`

**Step 1: Create promised API guide**

```markdown
---
title: Promised API
description: Lazy composition with map, switch, and error handling
keywords: [promised, map, switch, lazy]
---

# Promised API

`Promised<T>` provides lazy composition over async values. Transform, chain, and handle errors without awaiting until necessary.

## Core Methods

### map() - Transform Values

```ts twoslash
import { provide, createScope } from '@pumped-fn/core-next'

const value = provide(() => 42)

const scope = createScope()
const promised = scope.resolve(value)

const doubled = promised.map(n => n * 2)
const result = await doubled
```

### switch() - Chain Promised

```ts twoslash
import { provide, derive, createScope } from '@pumped-fn/core-next'

const config = provide(() => ({ env: 'prod' }))
const db = derive(config, (cfg) => ({ host: cfg.env }))

const scope = createScope()

const promised = scope.resolve(config)
  .switch(cfg => scope.resolve(db))

const result = await promised
```

### catch() - Error Handling

```ts twoslash
import { provide, createScope } from '@pumped-fn/core-next'

const risky = provide(() => {
  throw new Error('Failed')
})

const scope = createScope()

const safe = scope.resolve(risky)
  .catch(error => ({ fallback: true }))

const result = await safe
```

## Static Methods

### Promised.all()

```ts twoslash
import { Promised, provide, createScope } from '@pumped-fn/core-next'

const a = provide(() => 1)
const b = provide(() => 2)

const scope = createScope()

const combined = Promised.all([
  scope.resolve(a),
  scope.resolve(b)
])

const [first, second] = await combined
```

### Promised.allSettled()

```ts twoslash
import { Promised, provide, createScope } from '@pumped-fn/core-next'

const success = provide(() => 42)
const failure = provide(() => { throw new Error('Failed') })

const scope = createScope()

const results = await Promised.allSettled([
  scope.resolve(success),
  scope.resolve(failure)
])

const fulfilled = results.fulfilled()
const rejected = results.rejected()
const [good, bad] = results.partition()
```

## Lazy Composition

Promised chains don't execute until awaited:

```ts twoslash
import { provide, createScope } from '@pumped-fn/core-next'

const value = provide(() => {
  console.log('Executing')
  return 42
})

const scope = createScope()

const promised = scope.resolve(value)
  .map(n => n * 2)
  .map(n => n + 10)

console.log('Not executed yet')

const result = await promised
```

## Complete Example

<<< @/../examples/http-server/promised-comprehensive.ts

## Key Points

- `.map()` transforms values
- `.switch()` chains Promised instances
- `.catch()` handles errors
- Static methods for parallel composition
- Execution deferred until await

## See Also

- [Executors and Dependencies](./01-executors-and-dependencies.md)
- [Flow Basics](./05-flow-basics.md)
- [Error Handling](./10-error-handling.md)
```

**Step 2: Verify docs build**

```bash
pnpm docs:build
```

Expected: Build succeeds

**Step 3: Commit**

```bash
git add docs/guides/07-promised-api.md
git commit -m "docs: add promised API guide"
```

---

## Task 14: Create Guide - Reactive Patterns

**Files:**
- Create: `docs/guides/08-reactive-patterns.md`

**Step 1: Create reactive patterns guide**

```markdown
---
title: Reactive Patterns
description: Live updates with .reactive() executors
keywords: [reactive, updates, scope.update]
---

# Reactive Patterns

Reactive executors re-execute when upstream dependencies change via `scope.update()`. Use for caches, computed values, and live configuration.

## Core Pattern

```ts twoslash
import { provide, derive, createScope, tag, custom } from '@pumped-fn/core-next'

const config = tag(custom<{ env: string }>(), { label: 'config' })
const source = provide((controller) => config.get(controller.scope))

const reactive = derive.reactive(source, (cfg) => {
  console.log('Config changed:', cfg.env)
  return cfg
})

const scope = createScope({
  tags: [config({ env: 'dev' })]
})

await scope.resolve(reactive)

scope.update(config({ env: 'prod' }))
```

## Reactive vs Non-Reactive

Only `.reactive()` executors re-execute on updates:

```ts twoslash
import { provide, derive, createScope, tag, custom } from '@pumped-fn/core-next'

const data = tag(custom<number>(), { label: 'data' })
const source = provide((controller) => data.get(controller.scope))

const normal = derive(source, (n) => n * 2)
const reactive = derive.reactive(source, (n) => n * 2)

const scope = createScope({ tags: [data(10)] })

const n1 = await scope.resolve(normal)
const r1 = await scope.resolve(reactive)

scope.update(data(20))

const n2 = await scope.resolve(normal)
const r2 = await scope.resolve(reactive)
```

`normal` returns same cached value (20), `reactive` returns new value (40).

## Use Cases

### Configuration Reloading

```ts twoslash
import { provide, derive, createScope, tag, custom } from '@pumped-fn/core-next'

const appConfig = tag(custom<{ logLevel: string }>(), { label: 'config' })

const logger = derive.reactive(
  provide((controller) => appConfig.get(controller.scope)),
  (cfg) => ({
    log: (msg: string) => {
      if (cfg.logLevel === 'debug') {
        console.log(msg)
      }
    }
  })
)
```

### Cache Invalidation

```ts twoslash
import { provide, derive, createScope, tag, custom } from '@pumped-fn/core-next'

const cacheKey = tag(custom<string>(), { label: 'cache.key' })

const cache = derive.reactive(
  provide((controller) => cacheKey.get(controller.scope)),
  (key) => {
    console.log('Loading cache for:', key)
    return new Map()
  }
)
```

## Complete Example

<<< @/../examples/http-server/reactive-updates.ts

## Key Points

- Use `.reactive()` for live updates
- `scope.update()` triggers re-execution
- Only reactive executors re-execute
- Normal executors stay cached

## See Also

- [Executors and Dependencies](./01-executors-and-dependencies.md)
- [Scope Lifecycle](./03-scope-lifecycle.md)
- [Tags: The Type System](./02-tags-the-type-system.md)
```

**Step 2: Verify docs build**

```bash
pnpm docs:build
```

Expected: Build succeeds

**Step 3: Commit**

```bash
git add docs/guides/08-reactive-patterns.md
git commit -m "docs: add reactive patterns guide"
```

---

## Task 15: Create Guide - Extensions

**Files:**
- Create: `docs/guides/09-extensions.md`

**Step 1: Create extensions guide**

```markdown
---
title: Extensions
description: Cross-cutting concerns with extension wrapping
keywords: [extensions, middleware, wrapping]
---

# Extensions

Extensions provide cross-cutting concerns like logging, timing, transactions, and authentication. They wrap operations without modifying business logic.

## Core Pattern

```ts twoslash
import { extension, flow, createScope } from '@pumped-fn/core-next'

const logger = extension({
  name: 'logging',
  wrap: async (ctx, next, operation) => {
    console.log(`Starting ${operation.kind}`)
    const result = await next()
    console.log(`Finished ${operation.kind}`)
    return result
  }
})

const scope = createScope({
  extensions: [logger]
})
```

## Extension Composition

Extensions run in order, outer to inner:

```ts twoslash
import { extension, createScope } from '@pumped-fn/core-next'

const auth = extension({
  name: 'auth',
  wrap: async (ctx, next, operation) => {
    console.log('Auth check')
    return next()
  }
})

const timing = extension({
  name: 'timing',
  wrap: async (ctx, next, operation) => {
    const start = Date.now()
    const result = await next()
    console.log(`Took ${Date.now() - start}ms`)
    return result
  }
})

const scope = createScope({
  extensions: [auth, timing]
})
```

Execution order: `auth → timing → operation → timing → auth`

## Context Access

Extensions access flow context:

```ts twoslash
import { extension, tag, custom } from '@pumped-fn/core-next'

const requestId = tag(custom<string>(), { label: 'request.id' })

const logger = extension({
  name: 'logging',
  wrap: async (ctx, next, operation) => {
    const reqId = requestId.find(ctx) || 'no-id'
    console.log(`[${reqId}] ${operation.kind}`)
    return next()
  }
})
```

## Error Handling

Extensions can catch and transform errors:

```ts twoslash
import { extension } from '@pumped-fn/core-next'

const errorHandler = extension({
  name: 'error-handler',
  wrap: async (ctx, next, operation) => {
    try {
      return await next()
    } catch (error) {
      console.error(`Error in ${operation.kind}:`, error)
      throw error
    }
  }
})
```

## Operation Filtering

Extensions can filter by operation type:

```ts twoslash
import { extension } from '@pumped-fn/core-next'

const flowOnly = extension({
  name: 'flow-only',
  wrap: async (ctx, next, operation) => {
    if (operation.kind !== 'flow') {
      return next()
    }

    console.log('Flow-specific logic')
    return next()
  }
})
```

## Complete Example

<<< @/../examples/http-server/extension-logging.ts

## Middleware Example

<<< @/../examples/http-server/middleware-chain.ts

## Key Points

- Extensions wrap all operations
- Run in order: outer → inner → operation
- Access context for tags
- Filter by operation.kind
- Handle errors centrally

## See Also

- [Flow Basics](./05-flow-basics.md)
- [Error Handling](./10-error-handling.md)
- [Middleware Composition](../patterns/middleware-composition.md)
```

**Step 2: Verify docs build**

```bash
pnpm docs:build
```

Expected: Build succeeds

**Step 3: Commit**

```bash
git add docs/guides/09-extensions.md
git commit -m "docs: add extensions guide"
```

---

## Task 16: Create Guide - Error Handling

**Files:**
- Create: `docs/guides/10-error-handling.md`

**Step 1: Create error handling guide**

```markdown
---
title: Error Handling
description: Error boundaries, recovery strategies, and cleanup
keywords: [errors, try-catch, cleanup, recovery]
---

# Error Handling

Handle errors at appropriate boundaries: flow try/catch for local recovery, extensions for cross-cutting concerns, finally blocks for cleanup.

## Flow-Level Recovery

```ts twoslash
import { flow } from '@pumped-fn/core-next'

const handler = flow((ctx, input: { shouldFail: boolean }) => {
  try {
    if (input.shouldFail) {
      throw new Error('Operation failed')
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})
```

## Cleanup with Finally

```ts twoslash
import { flow } from '@pumped-fn/core-next'

const handler = flow((ctx, input: string) => {
  const resource = acquireResource()

  try {
    return processData(input, resource)
  } finally {
    resource.release()
  }
})

function acquireResource() {
  return { release: () => console.log('Released') }
}

function processData(input: string, resource: any) {
  return { data: input }
}
```

## Extension Error Boundaries

```ts twoslash
import { extension } from '@pumped-fn/core-next'

const errorBoundary = extension({
  name: 'error-boundary',
  wrap: async (ctx, next, operation) => {
    try {
      return await next()
    } catch (error) {
      console.error('Caught error:', error)

      return {
        error: (error as Error).message,
        operation: operation.kind,
        timestamp: Date.now()
      }
    }
  }
})
```

## Subflow Error Propagation

Errors propagate from subflows to parent:

```ts twoslash
import { flow } from '@pumped-fn/core-next'

const subFlow = flow((ctx, shouldFail: boolean) => {
  if (shouldFail) {
    throw new Error('Subflow failed')
  }
  return 'success'
})

const parent = flow(async (ctx, input: boolean) => {
  try {
    const result = await ctx.exec(subFlow, input)
    return { status: 'ok', result }
  } catch (error) {
    return { status: 'error', message: (error as Error).message }
  }
})
```

## Scope Disposal Errors

Always dispose scopes, even on error:

```ts twoslash
import { createScope } from '@pumped-fn/core-next'

async function main() {
  const scope = createScope()

  try {
    // Use scope
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await scope.dispose()
  }
}
```

## Error Type Safety

Define error types for better handling:

```ts twoslash
import { flow } from '@pumped-fn/core-next'

class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

const handler = flow((ctx, input: { value: number }) => {
  if (input.value < 0) {
    throw new ValidationError('Value must be positive')
  }

  return { result: input.value * 2 }
})

const wrapper = flow(async (ctx, input: { value: number }) => {
  try {
    return await ctx.exec(handler, input)
  } catch (error) {
    if (error instanceof ValidationError) {
      return { error: 'validation', message: error.message }
    }
    throw error
  }
})
```

## Complete Example

<<< @/../examples/http-server/error-handling.ts

## Key Points

- Use try/catch in flows for local recovery
- Extensions provide error boundaries
- Finally blocks guarantee cleanup
- Errors propagate through subflows
- Always dispose scopes in finally

## See Also

- [Flow Composition](./06-flow-composition.md)
- [Extensions](./09-extensions.md)
- [Scope Lifecycle](./03-scope-lifecycle.md)
```

**Step 2: Verify docs build**

```bash
pnpm docs:build
```

Expected: Build succeeds

**Step 3: Commit**

```bash
git add docs/guides/10-error-handling.md
git commit -m "docs: add error handling guide"
```

---

## Task 17: Create Reference - Common Mistakes

**Files:**
- Create: `docs/reference/common-mistakes.md`

**Step 1: Create common mistakes reference**

```markdown
---
title: Common Mistakes
description: Anti-patterns and their fixes
keywords: [mistakes, anti-patterns, best-practices]
---

# Common Mistakes

Common anti-patterns and how to fix them.

## Using `any` or Type Assertions

**❌ Don't:**
```typescript
const value = tag.get(ctx) as UserData
const result: any = await scope.resolve(executor)
```

**✅ Do:**
```typescript
const userTag = tag(custom<UserData>(), { label: 'user' })
const value = userTag.get(ctx)

const result = await scope.resolve(executor)
```

Use tags for type safety. Let inference work.

## Manual Type Annotations

**❌ Don't:**
```typescript
derive({ db, config }, ({ db, config }): Service => ({
  method: (): Promise<User> => db.query('...')
}))
```

**✅ Do:**
```typescript
derive({ db, config }, ({ db, config }) => ({
  method: () => db.query('...')
}))
```

Return types infer from implementation. Only annotate when truly needed.

## Ignoring Scope Disposal

**❌ Don't:**
```typescript
const scope = createScope()
const result = await scope.resolve(executor)
// scope never disposed
```

**✅ Do:**
```typescript
const scope = createScope()
try {
  const result = await scope.resolve(executor)
} finally {
  await scope.dispose()
}
```

Always dispose scopes to prevent resource leaks.

## Mixing Scope and Flow Concerns

**❌ Don't:**
```typescript
const requestHandler = provide(() => {
  // This runs once per scope, not per request!
  return { requestId: generateId() }
})
```

**✅ Do:**
```typescript
const requestHandler = flow((ctx, req) => {
  const requestId = generateId()
  ctx.set(requestIdTag, requestId)
  return processRequest(req)
})
```

Scopes are long-lived. Flows are short-lived. Use the right tool.

## Not Using preset() for Testing

**❌ Don't:**
```typescript
const db = derive(config, (cfg) =>
  process.env.NODE_ENV === 'test'
    ? mockDb
    : realDb(cfg)
)
```

**✅ Do:**
```typescript
const db = derive(config, (cfg) => realDb(cfg))

// In tests
const scope = createScope({
  presets: [preset(db, mockDb)]
})
```

Keep production logic clean. Use presets for test overrides.

## Circular Dependencies

**❌ Don't:**
```typescript
const a = derive(b, (bVal) => ({ bVal }))
const b = derive(a, (aVal) => ({ aVal }))
```

**✅ Do:**
```typescript
const shared = provide(() => ({ data: 'shared' }))
const a = derive(shared, (s) => ({ ...s, a: true }))
const b = derive(shared, (s) => ({ ...s, b: true }))
```

Break circular deps with common upstream executor.

## Forgetting .reactive()

**❌ Don't:**
```typescript
const cache = derive(config, (cfg) => buildCache(cfg))

scope.update(newConfig)
// cache still has old value!
```

**✅ Do:**
```typescript
const cache = derive.reactive(config, (cfg) => buildCache(cfg))

scope.update(newConfig)
// cache rebuilds with new config
```

Use `.reactive()` when you need live updates.

## Parallel Execution Without ctx.parallel()

**❌ Don't:**
```typescript
flow((ctx, input) => {
  // These run sequentially!
  const a = await ctx.exec(flowA, input)
  const b = await ctx.exec(flowB, input)
  return [a, b]
})
```

**✅ Do:**
```typescript
flow((ctx, input) => {
  return ctx.parallel([
    ctx.exec(flowA, input),
    ctx.exec(flowB, input)
  ])
})
```

Use `ctx.parallel()` for concurrent execution.

## Tag Without Label

**❌ Don't:**
```typescript
const userId = tag(custom<string>())
// Debugging nightmare - no label!
```

**✅ Do:**
```typescript
const userId = tag(custom<string>(), { label: 'user.id' })
// Clear debugging and better errors
```

Always provide labels for tags.

## See Also

- [Error Solutions](./error-solutions.md)
- [Type Verification](./type-verification.md)
- [API Cheatsheet](./api-cheatsheet.md)
```

**Step 2: Verify docs build**

```bash
pnpm docs:build
```

Expected: Build succeeds

**Step 3: Commit**

```bash
git add docs/reference/common-mistakes.md
git commit -m "docs: add common mistakes reference"
```

---

## Task 18: Create Reference - Error Solutions

**Files:**
- Create: `docs/reference/error-solutions.md`

**Step 1: Create error solutions reference**

```markdown
---
title: Error Solutions
description: TypeScript error mappings and solutions
keywords: [errors, typescript, solutions]
---

# Error Solutions

Common TypeScript errors and how to fix them.

## Type 'unknown' is not assignable to type 'T'

**Error:**
```
Type 'unknown' is not assignable to type 'UserData'
```

**Cause:** Tag not found in container, `.get()` returns `unknown`.

**Solution:**
```typescript
// Ensure tag is set before .get()
const scope = createScope({
  tags: [userDataTag({ id: '123' })]
})

// Or use .find() for optional access
const data = userDataTag.find(ctx)
if (!data) {
  throw new Error('User data not found')
}
```

## Cannot find name 'ctx'

**Error:**
```
Cannot find name 'ctx'
```

**Cause:** Using scope context in executor factory.

**Solution:**
```typescript
// ❌ Wrong - ctx doesn't exist in executors
const executor = provide((controller) => appConfig.get(controller.scope))

// ✅ Right - get tag from scope, not ctx
const executor = derive.tag(appConfig, (cfg) => cfg)

// Or use scope.get() directly
const cfg = appConfig.get(scope)
```

## Argument of type 'X' is not assignable to parameter of type 'Y'

**Error:**
```
Argument of type '{ port: number }' is not assignable to parameter of type 'AppConfig'
```

**Cause:** Tag value type mismatch.

**Solution:**
```typescript
// Check tag definition
const appConfig = tag(custom<AppConfig>(), { label: 'app.config' })

// Ensure value matches type
appConfig({
  port: 3000,
  env: 'development', // Don't forget required fields
  dbHost: 'localhost'
})
```

## Property 'X' does not exist on type 'never'

**Error:**
```
Property 'query' does not exist on type 'never'
```

**Cause:** Type inference failure in destructured dependencies.

**Solution:**
```typescript
// ❌ Inference lost
derive({ db, config }, (deps) => {
  return deps.db.query // Error!
})

// ✅ Destructure parameter
derive({ db, config }, ({ db, config }) => {
  return db.query // Works!
})
```

## Circular dependency detected

**Error:**
```
Circular dependency detected: A → B → A
```

**Cause:** Executor A depends on B, B depends on A.

**Solution:**
```typescript
// Break cycle with shared upstream
const shared = provide(() => ({ data: 'shared' }))
const a = derive(shared, (s) => ({ ...s, fromA: true }))
const b = derive(shared, (s) => ({ ...s, fromB: true }))
```

## Type instantiation is excessively deep

**Error:**
```
Type instantiation is excessively deep and possibly infinite
```

**Cause:** Deep executor nesting or complex type inference.

**Solution:**
```typescript
// Add explicit type at problematic boundary
type ServiceType = {
  method: () => Promise<Result>
}

const service = derive({ db, config }, ({ db, config }): ServiceType => ({
  method: () => db.query('...')
}))
```

## Promise returned is not awaited

**Error:**
```
Promise<T> returned but expected T
```

**Cause:** Missing `await` in async operations.

**Solution:**
```typescript
// ❌ Missing await
flow((ctx, input) => {
  const result = ctx.exec(subFlow, input) // Promise<T>
  return result
})

// ✅ Await subflow
flow((ctx, input) => {
  const result = await ctx.exec(subFlow, input) // T
  return result
})
```

## Object is possibly 'undefined'

**Error:**
```
Object is possibly 'undefined'
```

**Cause:** Using `.find()` without null check.

**Solution:**
```typescript
// ❌ No null check
const value = tag.find(ctx)
return value.property // Error!

// ✅ Check before use
const value = tag.find(ctx)
if (!value) {
  throw new Error('Tag not found')
}
return value.property

// Or use .get() which throws
const value = tag.get(ctx)
return value.property
```

## Type 'Promised<T>' is not awaitable

**Error:**
```
Type 'Promised<User>' is not awaitable
```

**Cause:** Trying to use Promised without awaiting.

**Solution:**
```typescript
// ❌ Can't use Promised directly
const promised = scope.resolve(userService)
promised.getUser('123') // Error!

// ✅ Await to get value
const service = await scope.resolve(userService)
service.getUser('123') // Works!

// Or chain with .map()
const user = await scope.resolve(userService)
  .map(s => s.getUser('123'))
```

## See Also

- [Common Mistakes](./common-mistakes.md)
- [Type Verification](./type-verification.md)
- [API Cheatsheet](./api-cheatsheet.md)
```

**Step 2: Verify docs build**

```bash
pnpm docs:build
```

Expected: Build succeeds

**Step 3: Commit**

```bash
git add docs/reference/error-solutions.md
git commit -m "docs: add error solutions reference"
```

---

## Task 19: Create Pattern - HTTP Server Setup

**Files:**
- Create: `docs/patterns/http-server-setup.md`

**Step 1: Create HTTP server setup pattern**

```markdown
---
title: HTTP Server Setup
description: Complete server lifecycle with graceful shutdown
keywords: [http, server, lifecycle, graceful-shutdown]
---

# HTTP Server Setup

Build HTTP servers with proper lifecycle management: initialization, request handling, and graceful shutdown.

## Architecture

- **Scope** holds server, DB connection, config
- **Flow** handles individual requests
- **Extensions** add logging, error tracking
- **Graceful shutdown** via scope.dispose()

## Complete Example

```ts twoslash
import { provide, derive, createScope, flow, tag, custom } from '@pumped-fn/core-next'
import type { Server } from 'http'

const port = tag(custom<number>(), { label: 'server.port', default: 3000 })
const dbHost = tag(custom<string>(), { label: 'db.host', default: 'localhost' })

const config = provide(() => ({
  port: port.get(ctx),
  dbHost: dbHost.get(ctx)
}))

const db = derive(config, (cfg) => ({
  connect: async () => console.log(`Connected to ${cfg.dbHost}`),
  query: async (sql: string) => ({ rows: [] }),
  close: async () => console.log('DB closed')
}))

const server = derive({ config, db }, async ({ config, db }) => {
  await db.connect()

  const srv: Server = createHttpServer((req, res) => {
    // Request handling via flow
    res.end('OK')
  })

  await new Promise<void>(resolve => {
    srv.listen(config.port, resolve)
  })

  console.log(`Server listening on ${config.port}`)

  return {
    server: srv,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        srv.close(err => err ? reject(err) : resolve())
      })
      await db.close()
      console.log('Server closed')
    }
  }
})

async function main() {
  const scope = createScope({
    tags: [
      port(3000),
      dbHost('db.example.com')
    ]
  })

  const srv = await scope.resolve(server)

  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down')
    await scope.dispose()
    process.exit(0)
  })
}

function createHttpServer(handler: any): Server {
  return null as any
}
```

## Request Handler Pattern

```ts twoslash
import { flow, tag, custom } from '@pumped-fn/core-next'

const requestId = tag(custom<string>(), { label: 'request.id' })

type Request = { url: string, method: string }
type Response = { status: number, body: any }

const handleRequest = flow((ctx, req: Request): Response => {
  const id = `req-${Date.now()}`
  ctx.set(requestId, id)

  if (req.url === '/health') {
    return { status: 200, body: { status: 'ok' } }
  }

  return { status: 404, body: { error: 'Not found' } }
})
```

## Graceful Shutdown

```typescript
async function gracefulShutdown(scope: Scope) {
  console.log('Shutting down...')

  // Stop accepting new requests
  const srv = await scope.resolve(server)

  // Wait for in-flight requests (use extension to track)
  await waitForInFlightRequests()

  // Dispose scope (closes server, DB)
  await scope.dispose()

  console.log('Shutdown complete')
}

function waitForInFlightRequests() {
  return Promise.resolve()
}
```

## Production Checklist

- ✅ Graceful shutdown on SIGTERM
- ✅ Health check endpoint
- ✅ Request logging extension
- ✅ Error tracking extension
- ✅ Database connection pooling
- ✅ Request timeout handling
- ✅ Scope disposal in process handlers

## See Also

- [Scope Lifecycle](../guides/03-scope-lifecycle.md)
- [Extensions](../guides/09-extensions.md)
- [Middleware Composition](./middleware-composition.md)
```

**Step 2: Verify docs build**

```bash
pnpm docs:build
```

Expected: Build succeeds

**Step 3: Commit**

```bash
git add docs/patterns/http-server-setup.md
git commit -m "docs: add HTTP server setup pattern"
```

---

## Task 20: Create Pattern - Database Transactions

**Files:**
- Create: `docs/patterns/database-transactions.md`

**Step 1: Create database transactions pattern**

```markdown
---
title: Database Transactions
description: Transaction per flow with automatic rollback
keywords: [database, transactions, rollback, commit]
---

# Database Transactions

Implement transaction-per-flow pattern: start transaction on flow entry, commit on success, rollback on error.

## Architecture

- **Extension** manages transaction lifecycle
- **Tag** provides transaction to flows
- **Automatic rollback** on errors
- **Commit** on successful completion

## Transaction Extension

```ts twoslash
import { extension, tag, custom } from '@pumped-fn/core-next'

type Transaction = {
  commit: () => Promise<void>
  rollback: () => Promise<void>
  query: (sql: string) => Promise<any>
}

const transaction = tag(custom<Transaction>(), { label: 'db.transaction' })

const transactionExtension = extension({
  name: 'transaction',
  wrap: async (ctx, next, operation) => {
    if (operation.kind !== 'flow') {
      return next()
    }

    const txn: Transaction = {
      commit: async () => console.log('COMMIT'),
      rollback: async () => console.log('ROLLBACK'),
      query: async (sql: string) => {
        console.log('Query in txn:', sql)
        return { rows: [] }
      }
    }

    ctx.set(transaction, txn)

    try {
      const result = await next()
      await txn.commit()
      return result
    } catch (error) {
      await txn.rollback()
      throw error
    }
  }
})
```

## Using Transactions

```ts twoslash
import { flow, tag, custom } from '@pumped-fn/core-next'

type Transaction = {
  query: (sql: string) => Promise<any>
}

const transaction = tag(custom<Transaction>(), { label: 'db.transaction' })

const createUser = flow(async (ctx, data: { name: string, email: string }) => {
  const txn = ctx.get(transaction)

  const result = await txn.query(
    `INSERT INTO users (name, email) VALUES ('${data.name}', '${data.email}')`
  )

  return { id: result.insertId, ...data }
})

const createProfile = flow(async (ctx, userId: string, bio: string) => {
  const txn = ctx.get(transaction)

  await txn.query(
    `INSERT INTO profiles (user_id, bio) VALUES ('${userId}', '${bio}')`
  )

  return { userId, bio }
})

const registerUser = flow(async (ctx, input: {
  name: string
  email: string
  bio: string
}) => {
  const user = await ctx.exec(createUser, {
    name: input.name,
    email: input.email
  })

  const profile = await ctx.exec(createProfile, user.id, input.bio)

  return { user, profile }
})
```

## Subflow Transactions

All subflows share parent transaction:

```ts twoslash
import { flow, tag, custom } from '@pumped-fn/core-next'

type Transaction = { query: (sql: string) => Promise<any> }
const transaction = tag(custom<Transaction>(), { label: 'db.transaction' })

const parentFlow = flow(async (ctx, input: any) => {
  const txn = ctx.get(transaction)

  await ctx.exec(childFlow1, input)
  await ctx.exec(childFlow2, input)

  // All operations in same transaction
  // Commit happens after parentFlow completes
})

const childFlow1 = flow(async (ctx, input: any) => {
  const txn = ctx.get(transaction)
  return txn.query('...')
})

const childFlow2 = flow(async (ctx, input: any) => {
  const txn = ctx.get(transaction)
  return txn.query('...')
})
```

## Error Rollback

```ts twoslash
import { flow, tag, custom } from '@pumped-fn/core-next'

type Transaction = { query: (sql: string) => Promise<any> }
const transaction = tag(custom<Transaction>(), { label: 'db.transaction' })

const riskyOperation = flow(async (ctx, shouldFail: boolean) => {
  const txn = ctx.get(transaction)

  await txn.query('INSERT INTO logs ...')

  if (shouldFail) {
    throw new Error('Operation failed')
  }

  await txn.query('INSERT INTO results ...')
})
```

If error is thrown, extension automatically rolls back both queries.

## Complete Example

<<< @/../examples/http-server/database-transaction.ts

## Production Checklist

- ✅ Transaction timeout handling
- ✅ Deadlock detection and retry
- ✅ Connection pool management
- ✅ Transaction isolation level configuration
- ✅ Nested transaction support (savepoints)
- ✅ Read-only transaction optimization

## See Also

- [Extensions](../guides/09-extensions.md)
- [Flow Composition](../guides/06-flow-composition.md)
- [Error Handling](../guides/10-error-handling.md)
```

**Step 2: Verify docs build**

```bash
pnpm docs:build
```

Expected: Build succeeds

**Step 3: Commit**

```bash
git add docs/patterns/database-transactions.md
git commit -m "docs: add database transactions pattern"
```

---

## Task 21: Update Pattern - Testing Strategies

**Files:**
- Modify: `docs/patterns/testing-strategies.md`

**Step 1: Rewrite testing strategies to match new style**

```markdown
---
title: Testing Strategies
description: Scope isolation and preset() for mocking
keywords: [testing, mocking, preset, isolation]
---

# Testing Strategies

Test with `preset()` to override executors, scope isolation for test independence, and type-safe mocks.

## Core Pattern

```ts twoslash
import { provide, derive, createScope, preset } from '@pumped-fn/core-next'

const db = provide(() => ({
  query: async (sql: string) => ({ rows: [] })
}))

const userService = derive({ db }, ({ db }) => ({
  getUser: async (id: string) => {
    const result = await db.query(`SELECT * FROM users WHERE id = '${id}'`)
    return result.rows[0]
  }
}))

const mockDb = {
  query: async (sql: string) => ({
    rows: [{ id: '123', name: 'Test User' }]
  })
}

async function testUserService() {
  const scope = createScope({
    presets: [preset(db, mockDb)]
  })

  const service = await scope.resolve(userService)
  const user = await service.getUser('123')

  console.assert(user.name === 'Test User')
  await scope.dispose()
}
```

## Scope Isolation

Each test gets independent scope:

```ts twoslash
import { createScope, preset, provide } from '@pumped-fn/core-next'

const config = provide(() => ({ env: 'prod' }))

async function test1() {
  const scope = createScope({
    presets: [preset(config, { env: 'test1' })]
  })

  // Independent from test2
  await scope.dispose()
}

async function test2() {
  const scope = createScope({
    presets: [preset(config, { env: 'test2' })]
  })

  // Independent from test1
  await scope.dispose()
}
```

## Type-Safe Mocks

Mocks must match executor types:

```typescript
import { provide } from '@pumped-fn/core-next'

type DB = {
  query: (sql: string) => Promise<{ rows: any[] }>
}

const db = provide(() => ({
  query: async (sql: string) => ({ rows: [] })
}))

const mockDb: DB = {
  query: async (sql: string) => ({
    rows: [{ mocked: true }]
  })
}
```

TypeScript enforces mock compatibility.

## Flow Testing

Test flows with isolated scope and tags:

```ts twoslash
import { flow, createScope, tag, custom } from '@pumped-fn/core-next'

const userId = tag(custom<string>(), { label: 'user.id' })

const handler = flow((ctx, input: string) => {
  ctx.set(userId, input)
  return { userId: ctx.get(userId) }
})

async function testHandler() {
  const scope = createScope()

  const result = await flow.execute(handler, 'user-123', { scope })

  console.assert(result.userId === 'user-123')
  await scope.dispose()
}
```

## Extension Testing

Test extensions in isolation:

```ts twoslash
import { extension, flow, createScope } from '@pumped-fn/core-next'

const calls: string[] = []

const testExtension = extension({
  name: 'test',
  wrap: async (ctx, next, operation) => {
    calls.push(operation.kind)
    return next()
  }
})

const testFlow = flow((ctx, input: number) => input * 2)

async function runTest() {
  const scope = createScope({
    extensions: [testExtension]
  })

  await flow.execute(testFlow, 21, { scope })

  console.assert(calls.includes('flow'))
  await scope.dispose()
}
```

## Complete Example

<<< @/../examples/http-server/testing-setup.ts

## Testing Checklist

- ✅ Scope per test for isolation
- ✅ Use preset() for mocks
- ✅ Type-safe mock implementations
- ✅ Dispose scopes in cleanup
- ✅ Test extensions separately
- ✅ Test flows with execute()

## See Also

- [Scope Lifecycle](../guides/03-scope-lifecycle.md)
- [Flow Basics](../guides/05-flow-basics.md)
- [Extensions](../guides/09-extensions.md)
```

**Step 2: Verify docs build**

```bash
pnpm docs:build
```

Expected: Build succeeds

**Step 3: Commit**

```bash
git add docs/patterns/testing-strategies.md
git commit -m "docs: rewrite testing strategies pattern"
```

---

## Task 22: Create Pattern - Middleware Composition

**Files:**
- Create: `docs/patterns/middleware-composition.md`

**Step 1: Create middleware composition pattern**

```markdown
---
title: Middleware Composition
description: Composing extensions for request/response pipelines
keywords: [middleware, extensions, composition, pipeline]
---

# Middleware Composition

Build request/response pipelines with composed extensions: authentication, logging, error handling, and business logic.

## Architecture

Extensions run in order: outer → inner → operation → inner → outer

```
[Auth] → [Logging] → [Error Handler] → [Business Logic]
```

## Complete Pipeline

```ts twoslash
import { extension, flow, createScope, tag, custom } from '@pumped-fn/core-next'

const userId = tag(custom<string>(), { label: 'user.id' })
const requestId = tag(custom<string>(), { label: 'request.id' })

const authMiddleware = extension({
  name: 'auth',
  wrap: async (ctx, next, operation) => {
    const id = userId.find(ctx)

    if (!id) {
      throw new Error('Unauthorized: Missing user ID')
    }

    console.log(`Auth: User ${id}`)
    return next()
  }
})

const loggingMiddleware = extension({
  name: 'logging',
  wrap: async (ctx, next, operation) => {
    const reqId = requestId.find(ctx) || 'no-id'
    console.log(`[${reqId}] Start ${operation.kind}`)

    const start = Date.now()
    const result = await next()

    console.log(`[${reqId}] End ${operation.kind} (${Date.now() - start}ms)`)
    return result
  }
})

const errorMiddleware = extension({
  name: 'error-handler',
  wrap: async (ctx, next, operation) => {
    try {
      return await next()
    } catch (error) {
      const reqId = requestId.find(ctx) || 'no-id'
      console.error(`[${reqId}] Error:`, error.message)

      return {
        error: (error as Error).message,
        requestId: reqId,
        timestamp: Date.now()
      }
    }
  }
})

const scope = createScope({
  extensions: [
    authMiddleware,
    loggingMiddleware,
    errorMiddleware
  ]
})
```

## Execution Order

```typescript
// Request enters
→ authMiddleware start
  → loggingMiddleware start
    → errorMiddleware start
      → business logic
    ← errorMiddleware end
  ← loggingMiddleware end
← authMiddleware end
// Response exits
```

## Conditional Middleware

Filter by operation kind:

```ts twoslash
import { extension } from '@pumped-fn/core-next'

const flowOnlyMiddleware = extension({
  name: 'flow-only',
  wrap: async (ctx, next, operation) => {
    if (operation.kind !== 'flow') {
      return next()
    }

    console.log('Flow-specific middleware')
    return next()
  }
})
```

## Request/Response Transform

```ts twoslash
import { extension, tag, custom } from '@pumped-fn/core-next'

const responseHeaders = tag(custom<Record<string, string>>(), {
  label: 'response.headers',
  default: {}
})

const headersMiddleware = extension({
  name: 'headers',
  wrap: async (ctx, next, operation) => {
    const headers = responseHeaders.get(ctx)
    headers['X-Request-ID'] = `req-${Date.now()}`
    headers['X-Powered-By'] = 'pumped-fn'

    const result = await next()

    return {
      ...result,
      headers
    }
  }
})
```

## Rate Limiting

```ts twoslash
import { extension, tag, custom } from '@pumped-fn/core-next'

const userId = tag(custom<string>(), { label: 'user.id' })

const rateLimits = new Map<string, number[]>()

const rateLimitMiddleware = extension({
  name: 'rate-limit',
  wrap: async (ctx, next, operation) => {
    const id = userId.find(ctx)
    if (!id) return next()

    const now = Date.now()
    const timestamps = rateLimits.get(id) || []
    const recentRequests = timestamps.filter(t => now - t < 60000)

    if (recentRequests.length >= 100) {
      throw new Error('Rate limit exceeded')
    }

    recentRequests.push(now)
    rateLimits.set(id, recentRequests)

    return next()
  }
})
```

## Complete Example

<<< @/../examples/http-server/middleware-chain.ts

## Production Middleware Stack

```typescript
const productionExtensions = [
  requestIdMiddleware,    // Generate request ID
  loggingMiddleware,      // Log requests
  authMiddleware,         // Authenticate
  rateLimitMiddleware,    // Rate limiting
  validationMiddleware,   // Input validation
  metricsMiddleware,      // Collect metrics
  errorMiddleware         // Error handling (outermost)
]
```

## Checklist

- ✅ Order extensions outer → inner
- ✅ Error handler as outermost extension
- ✅ Auth before business logic
- ✅ Logging early in pipeline
- ✅ Conditional execution by operation.kind
- ✅ Transform request/response as needed

## See Also

- [Extensions](../guides/09-extensions.md)
- [Error Handling](../guides/10-error-handling.md)
- [HTTP Server Setup](./http-server-setup.md)
```

**Step 2: Verify docs build**

```bash
pnpm docs:build
```

Expected: Build succeeds

**Step 3: Commit**

```bash
git add docs/patterns/middleware-composition.md
git commit -m "docs: add middleware composition pattern"
```

---

## Task 23: Update Sidebar Configuration

**Files:**
- Modify: `docs/.vitepress/config.ts`

**Step 1: Update sidebar to new structure**

Find the sidebar configuration around line 47 and replace with:

```typescript
sidebar: [
  {
    text: "Getting Started",
    items: [
      { text: "Introduction", link: "/" },
    ],
  },
  {
    text: "Guides",
    items: [
      { text: "Executors and Dependencies", link: "/guides/01-executors-and-dependencies" },
      { text: "Tags: The Type System", link: "/guides/02-tags-the-type-system" },
      { text: "Scope Lifecycle", link: "/guides/03-scope-lifecycle" },
      { text: "Type Inference Patterns", link: "/guides/04-type-inference-patterns" },
      { text: "Flow Basics", link: "/guides/05-flow-basics" },
      { text: "Flow Composition", link: "/guides/06-flow-composition" },
      { text: "Promised API", link: "/guides/07-promised-api" },
      { text: "Reactive Patterns", link: "/guides/08-reactive-patterns" },
      { text: "Extensions", link: "/guides/09-extensions" },
      { text: "Error Handling", link: "/guides/10-error-handling" },
    ],
  },
  {
    text: "Patterns",
    items: [
      { text: "HTTP Server Setup", link: "/patterns/http-server-setup" },
      { text: "Database Transactions", link: "/patterns/database-transactions" },
      { text: "Testing Strategies", link: "/patterns/testing-strategies" },
      { text: "Middleware Composition", link: "/patterns/middleware-composition" },
    ],
  },
  {
    text: "Reference",
    items: [
      { text: "API Cheatsheet", link: "/reference/api-cheatsheet" },
      { text: "Type Verification", link: "/reference/type-verification" },
      { text: "Common Mistakes", link: "/reference/common-mistakes" },
      { text: "Error Solutions", link: "/reference/error-solutions" },
    ],
  },
],
```

**Step 2: Verify config syntax**

```bash
pnpm docs:build
```

Expected: Build succeeds with new sidebar

**Step 3: Commit**

```bash
git add docs/.vitepress/config.ts
git commit -m "docs: update sidebar to new structure"
```

---

## Task 24: Update README.md

**Files:**
- Modify: `docs/README.md`

**Step 1: Update README to reflect new structure**

Replace entire content with:

```markdown
# Documentation

Graph-based dependency injection with complete type inference.

## Getting Started

1. **[Executors and Dependencies](./guides/01-executors-and-dependencies.md)** - Create executors with `provide()` and `derive()`
2. **[Tags: The Type System](./guides/02-tags-the-type-system.md)** - Type-safe runtime data access
3. **[Scope Lifecycle](./guides/03-scope-lifecycle.md)** - Manage long-running resources
4. **[Type Inference Patterns](./guides/04-type-inference-patterns.md)** - Zero-annotation TypeScript

## Core Guides

- [Executors and Dependencies](./guides/01-executors-and-dependencies.md)
- [Tags: The Type System](./guides/02-tags-the-type-system.md)
- [Scope Lifecycle](./guides/03-scope-lifecycle.md)
- [Type Inference Patterns](./guides/04-type-inference-patterns.md)
- [Flow Basics](./guides/05-flow-basics.md)
- [Flow Composition](./guides/06-flow-composition.md)
- [Promised API](./guides/07-promised-api.md)
- [Reactive Patterns](./guides/08-reactive-patterns.md)
- [Extensions](./guides/09-extensions.md)
- [Error Handling](./guides/10-error-handling.md)

## Patterns

- [HTTP Server Setup](./patterns/http-server-setup.md)
- [Database Transactions](./patterns/database-transactions.md)
- [Testing Strategies](./patterns/testing-strategies.md)
- [Middleware Composition](./patterns/middleware-composition.md)

## Reference

- [API Cheatsheet](./reference/api-cheatsheet.md)
- [Type Verification](./reference/type-verification.md)
- [Common Mistakes](./reference/common-mistakes.md)
- [Error Solutions](./reference/error-solutions.md)

## Philosophy

**Tags provide type safety. Inference provides ergonomics.**

- All typed runtime data flows through tags
- 99% type inference - zero annotations
- Verified with `tsc --noEmit` on all examples

## Examples

Working examples in `examples/http-server/`:
- Basic handlers with executors
- Tag-based type safety
- Type inference patterns
- Promised API usage
- Flow composition
- Reactive updates
- Extensions and middleware
- Error handling
- Database transactions
- Testing with mocks

## Quick Example

```typescript
import { provide, derive, createScope, tag, custom } from '@pumped-fn/core-next'

const appConfig = tag(custom<{ port: number }>(), { label: 'app.config' })

const config = provide((controller) => appConfig.get(controller.scope))
const db = derive(config, (cfg) => createConnection(cfg))
const userService = derive({ db, config }, ({ db, config }) => ({
  getUser: (id: string) => db.query('...')
}))

const scope = createScope({
  tags: [appConfig({ port: 3000 })]
})

const service = await scope.resolve(userService)
const user = await service.getUser('123')
await scope.dispose()
```

## Verification

All documentation examples are verified:

```bash
pnpm --filter @pumped-fn/examples typecheck
pnpm docs:build
```

Zero TypeScript errors, no type assertions, complete inference.
```

**Step 2: Commit**

```bash
git add docs/README.md
git commit -m "docs: update README to new structure"
```

---

## Task 25: Verify All Examples Typecheck

**Files:**
- Check: All `examples/http-server/*.ts` files

**Step 1: Run typecheck on examples**

```bash
pnpm --filter @pumped-fn/examples typecheck
```

Expected: No TypeScript errors

**Step 2: If errors, fix each file**

For each error:
1. Read the file
2. Fix type issues
3. Re-run typecheck
4. Commit fix

**Step 3: Verify success**

```bash
pnpm --filter @pumped-fn/examples typecheck
```

Expected: "No errors found"

---

## Task 26: Verify Docs Build

**Files:**
- Check: VitePress build process

**Step 1: Run docs build**

```bash
pnpm docs:build
```

Expected: Build succeeds with no errors

**Step 2: If build fails, check error output**

Common issues:
- Broken links (fix in markdown)
- Twoslash errors (fix code blocks)
- Missing files (create or remove references)

**Step 3: Fix issues and rebuild**

For each error:
1. Read error message
2. Fix the issue
3. Re-run build
4. Commit fix

**Step 4: Final verification**

```bash
pnpm docs:build
```

Expected: "✓ built in XXXms"

**Step 5: Commit success**

```bash
git add -A
git commit -m "docs: verify all examples and build complete"
```

---

## Task 27: Delete Implementation Summary

**Files:**
- Delete: `docs/IMPLEMENTATION_SUMMARY.md`

**Step 1: Remove implementation summary**

```bash
rm docs/IMPLEMENTATION_SUMMARY.md
```

**Step 2: Commit**

```bash
git add docs/IMPLEMENTATION_SUMMARY.md
git commit -m "docs: remove implementation summary (work complete)"
```

---

## Success Criteria

- ✅ All old docs deleted
- ✅ 10 guides complete (01-10)
- ✅ 4 pattern docs complete
- ✅ 4 reference docs complete
- ✅ 8+ examples created
- ✅ Sidebar updated
- ✅ All examples typecheck
- ✅ docs:build succeeds
- ✅ No broken links
- ✅ Twoslash rendering works

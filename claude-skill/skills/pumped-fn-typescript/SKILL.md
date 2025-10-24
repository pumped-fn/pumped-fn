---
name: Pumped-fn TypeScript
description: Auto-activating guidance for @pumped-fn/core-next ensuring type-safe, pattern-consistent code
when_to_use: when brainstorming architecture for applications needing observable operations, dependency management, testable flows, composition of reusable components, or framework integration (OR when package.json contains @pumped-fn/core-next)
version: 3.2.0
---

# Pumped-fn TypeScript Skill

## ACTIVATION CHECK (READ THIS FIRST)

<EXTREMELY_IMPORTANT>
**Before any brainstorming, architecture discussion, or implementation:**

Check if `@pumped-fn/core-next` exists in package.json dependencies.

**If YES (which it does in this project):**
- ALL architecture discussions MUST use pumped-fn patterns
- ALL designs MUST include: Resources, Flows, Scope, Tags
- ALL implementations MUST follow this skill's guidance

**Red flags you forgot to use this skill:**
- Designing CLI/server/cron without mentioning Resources, Flows, or Scope
- Using plain functions instead of flow() for business logic
- Direct dependency injection without executors
- Configuration via global imports instead of tags
- No mention of testability via preset()

**If you see these red flags → STOP. Read this skill and redesign using pumped-fn patterns.**
</EXTREMELY_IMPORTANT>

## Overview

Build observable, inspectable applications with four core elements:

1. **Resources** - Integration details (DB pools, API clients, external services)
2. **Flows** - Business logic operations (deterministic, journaled, max 3-level depth)
3. **Interaction Points** - Entry points (HTTP routes, CLI commands, cron jobs)
4. **Utilities** - Pure transformations (stateless, effect-free, unit testable)

Supporting: **Tags** (configuration/data boundaries) + **Extensions** (cross-cutting observation)

**Core principle:** Operations that matter operationally should flow through the library's tracking system for visibility.

**Auto-activates when:** package.json contains `@pumped-fn/core-next` in dependencies

## Critical Anti-Patterns (READ THIS FIRST)

These mistakes compromise portability, testability, and reliability. Check for these patterns BEFORE writing code.

### ❌ ANTI-PATTERN 1: Multiple Scopes (Resource Duplication)

**Symptom**: Creating scope inside handlers, middleware, loops
**Impact**: Singleton resources duplicated → memory leaks, connection exhaustion, faults
**Detection**: Look for `createScope()` inside request handlers, middleware, or loops

**Why critical:** Scope holds singletons (DB pools, connections). Multiple scopes = multiple singletons = resource waste.

**Corrections by environment:**

**Self-controlled servers (Express, Hono, Fastify):**

```typescript
// ❌ WRONG: New scope every request
app.post('/users', async (req, res) => {
  const scope = createScope() // Creates new DB pool each request!
  const result = await flow.execute(createUser, req.body, { scope })
  res.json(result)
})

// ✅ CORRECT: Server as resource, one scope per app
const server = provide((controller) => {
  const scope = createScope({
    tags: [dbConfig({ host: 'localhost', port: 5432, database: 'app' })]
  })

  const app = express()
  app.set('scope', scope)

  app.post('/users', async (req, res) => {
    const scope = req.app.get('scope')
    const result = await flow.execute(createUser, req.body, { scope })
    res.json(result)
  })

  controller.cleanup(async () => {
    await scope.dispose()
  })

  return app
})

// Usage
const app = await mainScope.resolve(server)
app.listen(3000)
```

**Meta-frameworks (TanStack Start, Next.js, SvelteKit):**

```typescript
// ❌ WRONG: New scope per request
createMiddleware().server(async ({ next }) => {
  const scope = createScope() // Memory leak!
  return next({ context: { scope } })
})

// ✅ CORRECT: One scope at module init, inject via middleware
const appScope = createScope({
  tags: [dbConfig({ host: 'localhost', port: 5432, database: 'app' })]
})

createMiddleware().server(async ({ next }) => {
  return next({ context: { scope: appScope } })
})

// Handler gets scope from context
export const Route = createFileRoute('/users')({
  loader: async ({ context }) => {
    return flow.execute(getUsers, {}, { scope: context.scope })
  }
})
```

**CLI applications:**

```typescript
// ❌ WRONG: Global scope export (breaks test isolation)
export const scope = createScope({
  tags: [dbConfig({...})]
})

program.command('sync').action(async () => {
  await flow.execute(syncData, {}, { scope })
})

// ✅ CORRECT: Singleton via closure
function createCLI() {
  const scope = createScope({
    tags: [dbConfig({ host: 'localhost', port: 5432, database: 'app' })]
  })

  const program = new Command()

  program.command('sync').action(async () => {
    await flow.execute(syncData, {}, { scope })
  })

  program.command('cleanup').action(async () => {
    await flow.execute(cleanupData, {}, { scope })
  })

  return {
    program,
    dispose: () => scope.dispose()
  }
}

// main.ts
const cli = createCLI()
await cli.program.parseAsync()
await cli.dispose()

// test.ts - easy to test with different scope
const testCli = createCLI() // Can inject test config via tags
```

**Key rule:** One app, one scope. Exceptions: Lambda (per invocation), CLI (per command execution).

---

### ❌ ANTI-PATTERN 2: Built-ins in Resources (Breaks Portability)

**Symptom**: Using `process.env`, `process.argv`, `__dirname`, `__filename`, `import.meta.env` inside `provide()` or `derive()` bodies
**Impact**: Code tied to specific runtime/bundler → fails in Deno/Bun/browser/edge → untestable (mocking globals)
**Detection**: Search for built-in references inside executor factory functions

**Why critical:** Built-ins are runtime-specific. Code becomes non-portable and requires global mocking in tests.

```typescript
// ❌ WRONG: Node.js-specific built-ins
export const database = provide((controller) => {
  const db = new Database({
    host: process.env.DB_HOST,        // Won't work in Deno/browser/edge
    file: __dirname + '/data.db'      // Won't work in Deno/browser/edge
  })
  return db
})

export const config = provide((controller) => {
  const args = process.argv.slice(2)  // Node.js only
  return parseArgs(args)
})

// ❌ WRONG: Bundler-specific built-ins
export const apiClient = provide((controller) => {
  const url = import.meta.env.VITE_API_URL  // Vite only
  return createClient(url)
})

// ✅ CORRECT: Parse built-ins at entry point, pass via tags

// config.ts - Define tag schemas
export const dbConfig = tag(custom<{
  host: string
  port: number
  database: string
}>(), { label: 'config.database' })

export const dataDir = tag(custom<string>(), { label: 'config.dataDir' })

export const apiUrl = tag(custom<string>(), { label: 'config.apiUrl' })

// resources.ts - Use tags, not built-ins
export const database = provide((controller) => {
  const config = dbConfig.get(controller.scope)
  const dir = dataDir.get(controller.scope)

  const db = new Database({
    host: config.host,
    port: config.port,
    database: config.database,
    file: `${dir}/data.db`
  })

  controller.cleanup(async () => {
    await db.close()
  })

  return db
})

export const apiClient = provide((controller) => {
  const url = apiUrl.get(controller.scope)
  return createClient(url)
})

// main.ts (Node.js entry point) - Built-ins HERE only
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const scope = createScope({
  tags: [
    dbConfig({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'app'
    }),
    dataDir(__dirname),
    apiUrl(process.env.API_URL || 'http://localhost:3000')
  ]
})

// main.ts (Deno entry point) - Different built-ins, same resources
const scope = createScope({
  tags: [
    dbConfig({
      host: Deno.env.get('DB_HOST') || 'localhost',
      port: Number(Deno.env.get('DB_PORT')) || 5432,
      database: Deno.env.get('DB_NAME') || 'app'
    }),
    dataDir(new URL('.', import.meta.url).pathname),
    apiUrl(Deno.env.get('API_URL') || 'http://localhost:3000')
  ]
})

// test.ts (Testing) - No globals needed
const testScope = createScope({
  tags: [
    dbConfig({ host: 'test-db', port: 5432, database: 'test' }),
    dataDir('/tmp/test-data'),
    apiUrl('http://mock-api:3000')
  ]
})

const db = await testScope.resolve(database) // Works without mocking process.env!
```

**Symptom check**: If you're mocking `process.env`, `__dirname`, or `import.meta.env` in tests, you're doing it wrong.

**Key rule:** Built-ins stay at entry points (main.ts). Resources use tags for configuration.

---

### ❌ ANTI-PATTERN 3: Premature Escape (Passing Resolved Values)

**Symptom**: Calling `scope.resolve()` early, passing resolved values to functions/constructors
**Impact**: Components can't be tested independently → no way to inject mocks via preset()
**Detection**: Look for resolved values passed around instead of executors

**Why critical:** Once resolved, you lose ability to swap implementations. Tests can't inject mocks.

```typescript
// ❌ WRONG: Too early escape

// main.ts
const scope = createScope({
  tags: [dbConfig({...})]
})

const db = await scope.resolve(database)           // Escape too early
const userRepo = await scope.resolve(userRepository)

const app = express()
app.set('db', db)                                  // Pass resolved value
app.set('userRepo', userRepo)

app.post('/users', async (req, res) => {
  const repo = req.app.get('userRepo')             // Can't swap in tests
  const user = await repo.create(req.body)
  res.json(user)
})

// test.ts - Testing is now HARD
test('create user', async () => {
  // Can't inject test scope - already resolved to real DB!
  // Have to mock at a different layer or use real DB
  const response = await request(app)
    .post('/users')
    .send({ email: 'test@example.com' })
})

// ✅ CORRECT: Keep resolve close to usage point

// main.ts
const scope = createScope({
  tags: [dbConfig({...})]
})

const app = express()
app.set('scope', scope)                            // Pass scope, not resolved

app.post('/users', async (req, res) => {
  const scope = req.app.get('scope')
  const result = await flow.execute(createUser, req.body, { scope })
  res.json(result)
})

// flows.ts
const createUser = flow({
  userRepo: userRepository                         // Declare dependency
}, async (deps, ctx, input) => {
  const validated = await ctx.run('validate-input', () => {
    if (!validateEmail(input.email)) {
      return { ok: false as const, reason: 'invalid_email' }
    }
    return { ok: true as const, data: input }
  })

  if (!validated.ok) {
    return validated
  }

  const user = await ctx.run('save-user', async () => {
    return deps.userRepo.create(validated.data)    // Resolved automatically
  })

  return { ok: true, user }
})

// test.ts - Testing is EASY
test('create user', async () => {
  const mockUserRepo = derive({}, () => ({
    create: async (data: any) => ({ id: '123', ...data })
  }))

  const testScope = createScope({
    initialValues: [
      preset(userRepository, mockUserRepo)         // Inject test implementation
    ]
  })

  const result = await flow.execute(createUser,
    { email: 'test@example.com', name: 'Test User' },
    { scope: testScope }
  )

  expect(result.ok).toBe(true)
  expect(result.user.id).toBe('123')
})

// ✅ CORRECT: Explicit resolve only when framework requires it

// Example: Background job needs direct DB access
const scope = createScope({
  tags: [dbConfig({...})]
})

const db = await scope.resolve(database)           // Resolve close to usage

setInterval(async () => {
  await db.query('DELETE FROM sessions WHERE expired < NOW()')
}, 60000)

// Still testable!
test('cleanup job', async () => {
  const mockDb = provide(() => ({
    query: async (sql: string) => ({ rowCount: 5 })
  }))

  const testScope = createScope({
    initialValues: [preset(database, mockDb)]
  })

  const db = await testScope.resolve(database)
  const result = await db.query('DELETE FROM sessions WHERE expired < NOW()')
  expect(result.rowCount).toBe(5)
})
```

**Key principle**: Resolve and escape should stay close together. Most components work with executors. Only escape at interaction boundaries (framework integration, direct access needs).

**Preferred pattern**: Use flows with declared dependencies. Let the library resolve automatically.

---

## Architecture Decision Guide

### When to Apply Pumped-fn Patterns

**If you're already using pumped-fn or planning to:**
Apply these patterns to operations that benefit from observability and testability. Not everything needs to flow through the library.

✅ **Apply pumped-fn patterns to:**
- Operations needing observability (want logging/tracing/metrics without manual instrumentation)
- Business logic that should be testable independent of framework
- Resources with lifecycle (DB pools, API clients, connections needing cleanup)
- Shared dependencies across flows (auth flow + order flow both use same DB)
- Operations you want inspectable (debugging, audit trails, replay)

⚡ **Keep as regular functions:**
- Simple transformations (formatDate, normalizeEmail, calculateTotal)
- Direct passthrough (CRUD with no business rules)
- One-off scripts with no shared resources
- Prototype code where observability overhead isn't justified yet

### Application Type → Pumped-fn Structure

**HTTP Server (Express, Fastify, Hono):**
```
Scope (singleton, app lifetime)
  ↓
Resources (DB pool, Redis, API clients)
  ↓
Flows (business logic: login, createOrder, processPayment)
  ↓
Interaction Points (route handlers)
```

**CLI Application:**
```
Scope (per command execution)
  ↓
Resources (config files, API clients)
  ↓
Flows (business operations)
  ↓
Interaction Points (command handlers)
```

**Cron/Scheduled Jobs:**
```
Scope (singleton, app lifetime)
  ↓
Resources (DB, external services)
  ↓
Flows (batch operations, sync tasks)
  ↓
Interaction Points (job scheduler)
```

**Event Processor (Queue consumer, Kafka, etc):**
```
Scope (singleton, consumer lifetime)
  ↓
Resources (queue connection, DB)
  ↓
Flows (event handling logic)
  ↓
Interaction Points (event handlers)
```

## Scope Lifecycle Patterns

**Rule: One app, one scope.** Create at startup, dispose at termination.

### HTTP Server (Express, Fastify, Hono)

```typescript
const scope = createScope({
  tags: [
    dbConfig({ host: 'localhost', port: 5432, database: 'app' }),
    redisConfig({ url: 'redis://localhost:6379' })
  ]
})

const app = express()
app.set('scope', scope)

app.post('/users', async (req, res) => {
  const result = await flow.execute(createUser, {
    email: req.body.email,
    name: req.body.name
  }, { scope })

  res.json(result)
})

const server = app.listen(3000)

process.on('SIGTERM', async () => {
  await server.close()
  await scope.dispose()
  process.exit(0)
})

process.on('SIGINT', async () => {
  await server.close()
  await scope.dispose()
  process.exit(0)
})
```

### Cron/Scheduled Jobs

```typescript
import cron from 'node-cron'

const scope = createScope({
  tags: [dbConfig({ /* ... */ })]
})

cron.schedule('*/5 * * * *', async () => {
  await flow.execute(syncData, {}, { scope })
})

cron.schedule('0 * * * *', async () => {
  await flow.execute(cleanupOldData, {}, { scope })
})

process.on('SIGTERM', async () => {
  await scope.dispose()
  process.exit(0)
})
```

### Event Processor (Queues, Kafka, WebSockets)

```typescript
import { Kafka } from 'kafkajs'

const scope = createScope({
  tags: [
    dbConfig({ /* ... */ }),
    kafkaConfig({ /* ... */ })
  ]
})

const kafka = new Kafka({ /* ... */ })
const consumer = kafka.consumer({ groupId: 'app' })

await consumer.connect()
await consumer.subscribe({ topic: 'orders' })

await consumer.run({
  eachMessage: async ({ message }) => {
    await flow.execute(processOrder,
      JSON.parse(message.value.toString()),
      { scope }
    )
  }
})

process.on('SIGTERM', async () => {
  await consumer.disconnect()
  await scope.dispose()
  process.exit(0)
})
```

### CLI Application

**Exception:** CLI commands are separate app invocations - one scope per command.

```typescript
import { Command } from 'commander'

const program = new Command()

program
  .command('create-user')
  .argument('<email>')
  .argument('<name>')
  .action(async (email, name) => {
    const scope = createScope({
      tags: [dbConfig({ /* ... */ })]
    })

    try {
      const result = await flow.execute(createUser, { email, name }, { scope })
      console.log(result.ok ? 'Success' : `Failed: ${result.reason}`)
    } finally {
      await scope.dispose()
    }
  })

program.parse()
```

### Serverless/Lambda

**Exception:** Lambda manages app lifecycle - create scope per invocation, dispose in finally.

```typescript
export const handler = async (event) => {
  const scope = createScope({
    tags: [dbConfig({ /* ... */ })]
  })

  return scope.exec(handleRequest, event).finally(async () => {
    await scope.dispose()
  })
}
```

**Why:** Lambda can freeze containers between invocations. Creating scope per invocation ensures clean state. `finally` guarantees disposal even on errors or timeout.

## Decision Tree

```
What am I building?
        ↓
    ┌───────┴───────┐
    ↓               ↓
Integration     Business logic?
details?        (validate, transform,
(DB, API,        orchestrate)
gateway)             ↓
    ↓             FLOW
RESOURCE       (flow w/ deps)
(executor)           ↓
    ↓         Always use journal keys:
Testing:      ctx.exec('name', flow, input)
Mock via      ctx.run('name', () => op)
preset()             ↓
              Testing: Mock resources,
                      verify journal
                      ↓
              Pure transformation?
                      ↓
                  UTILITY
                 (function)
                      ↓
              Testing: Unit test I/O
```

## Implementation Reference

### Quick API Reference

#### Tags (Schema-Flexible)

```typescript
import { tag, custom } from '@pumped-fn/core-next'
import { z } from 'zod' // or valibot, or any Standard Schema validator

// With Zod (runtime validation)
export const dbConfig = tag(z.object({
  host: z.string(),
  port: z.number(),
  database: z.string()
}), {
  label: 'db.config',
  default: { host: 'localhost', port: 5432, database: 'app' }
})

// With custom (no validation)
export const userId = tag(custom<string>(), { label: 'flow.userId' })
```

#### Resources (Executors)

```typescript
import { provide, derive } from '@pumped-fn/core-next'

// Resource with lifecycle
const dbPool = provide((controller) => {
  const config = dbConfig.get(controller.scope)
  const pool = new Pool(config)

  controller.cleanup(async () => {
    await pool.end()
  })

  return {
    query: async (sql: string, params: any[]) => {
      return pool.query(sql, params)
    }
  }
})

// Resource with dependencies
const userRepository = derive({ db: dbPool }, ({ db }) => ({
  findById: async (id: string) => {
    return db.query('SELECT * FROM users WHERE id = $1', [id])
  },
  create: async (userData: User) => {
    return db.query('INSERT INTO users ...', [userData])
  }
}))
```

#### Flows (Business Logic)

```typescript
import { flow } from '@pumped-fn/core-next'

// Flow with dependencies
const createUser = flow({
  userRepo: userRepository
}, async (deps, ctx, input: { email: string, name: string }) => {
  // Always use journal keys for visibility
  const validated = await ctx.run('validate-input', () => {
    if (!validateEmail(input.email)) {
      return { ok: false as const, reason: 'invalid_email' }
    }
    return { ok: true as const, data: input }
  })

  if (!validated.ok) {
    return validated
  }

  const user = await ctx.run('save-user', async () => {
    return deps.userRepo.create(validated.data)
  })

  return { ok: true, user }
})

// Sub-flow composition (always with journal keys)
const registerUser = flow({
  userRepo: userRepository
}, async (deps, ctx, input: RegisterInput) => {
  const user = await ctx.exec('create-user', createUser, {
    email: input.email,
    name: input.name
  })

  if (!user.ok) {
    return user
  }

  const profile = await ctx.exec('create-profile', createProfile, {
    userId: user.user.id,
    bio: input.bio
  })

  return { ok: true, user: user.user, profile }
})
```

#### Scope & Execution

```typescript
import { createScope } from '@pumped-fn/core-next'

const scope = createScope({
  tags: [
    dbConfig({ host: 'localhost', port: 5432, database: 'app' })
  ]
})

// Resolve resources
const userRepo = await scope.resolve(userRepository)

// Execute flows
const result = await flow.execute(registerUser, input, { scope })

// Cleanup
await scope.dispose()
```

#### Promised Utilities

```typescript
import { Promised } from '@pumped-fn/core-next'

// Parallel resolution
const [repo1, repo2] = await Promised.all([
  scope.resolve(userRepository),
  scope.resolve(postRepository)
])

// Error handling with partition
const results = await Promised.allSettled([
  scope.resolve(service1),
  scope.resolve(service2)
])

// partition() returns { fulfilled: T[], rejected: Error[] }
// IMPORTANT: Destructure immediately to access values
const { fulfilled, rejected } = await results.partition()

console.log(`Success: ${fulfilled.length}, Failed: ${rejected.length}`)

// Access successful values
fulfilled.forEach(value => console.log(value))

// Handle errors
rejected.forEach(error => console.error(error))

// Main wrapper
Promised.try(main).catch((error) => {
  console.error(error)
  process.exit(1)
})
```

### 1. Resources (Integration Layer)

**What:** Technical details of external systems (business-logic-free)

**Examples:** Database connection pool, HTTP client for OAuth, Redis client, S3 bucket

**Key characteristics:**
- Configuration via tags (`controller.scope`)
- Lifecycle management (`controller.cleanup`)
- Generic operations (no business rules)
- Integration-focused

```typescript
// ✅ GOOD: Resource - How to communicate with OAuth provider
const googleOAuth = provide((controller) => {
  const config = oauthConfig.get(controller.scope)
  const client = new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret
  })

  controller.cleanup(async () => {
    await client.disconnect()
  })

  return {
    exchangeCode: async (code: string) => client.getToken(code),
    refreshToken: async (token: string) => client.refresh(token),
    validateToken: async (token: string) => client.verifyIdToken({ idToken: token })
  }
})

// ✅ GOOD: Repository as Resource (common pattern)
// Why: Repositories are integration layer (DB operations), not business logic
const userRepository = derive({ db: dbPool }, ({ db }) => ({
  // Generic CRUD - no business rules
  findById: async (id: string) => {
    const result = await db.query('SELECT * FROM users WHERE id = $1', [id])
    return result.rows[0]
  },

  findByEmail: async (email: string) => {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email])
    return result.rows[0]
  },

  create: async (user: User) => {
    const result = await db.query(
      'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING *',
      [user.email, user.name]
    )
    return result.rows[0]
  },

  update: async (id: string, user: Partial<User>) => {
    const result = await db.query(
      'UPDATE users SET name = $1 WHERE id = $2 RETURNING *',
      [user.name, id]
    )
    return result.rows[0]
  }
}))

// Business logic goes in FLOWS, not repositories
const registerUser = flow({
  userRepo: userRepository
}, async (deps, ctx, input) => {
  // Business rule: Check if email already exists
  const existing = await ctx.run('check-existing', async () => {
    return deps.userRepo.findByEmail(input.email)
  })

  if (existing) {
    return { ok: false, reason: 'email_exists' as const }
  }

  // Business rule: Validate email domain
  if (!input.email.endsWith('@company.com')) {
    return { ok: false, reason: 'invalid_domain' as const }
  }

  // Create user (repository just executes, no logic)
  const user = await ctx.run('create-user', async () => {
    return deps.userRepo.create(input)
  })

  return { ok: true, user }
})
```

**Testing:**
```typescript
const mockOAuth = provide(() => ({
  exchangeCode: async (code: string) => ({ access_token: 'mock' }),
  refreshToken: async (token: string) => ({ access_token: 'refreshed' }),
  validateToken: async (token: string) => ({ email: 'test@example.com' })
}))

const testScope = createScope({
  initialValues: [preset(googleOAuth, mockOAuth)]
})
```

### 2. Flows (Business Logic Layer)

**What:** Business operations orchestrating resources, deterministic outcomes

**Rules:**
- ALL outputs embedded (happy + edge cases, discriminated unions)
- Journaled via ctx.exec / ctx.run (ALWAYS with keys)
- Max 3 levels deep (see depth counting below)
- Self-documenting

**Flow Depth Counting:**
Flow depth = nested `ctx.exec()` calls. `ctx.run()` operations don't count toward depth.

```typescript
// ✅ GOOD: 2 levels of flow nesting
const orchestrator = flow({}, async (deps, ctx, input) => {
  await ctx.run('operation-1', () => work())  // ctx.run doesn't add depth
  await ctx.exec('sub-flow', level2Flow, data)  // Level 2
})

const level2Flow = flow({}, async (deps, ctx, input) => {
  await ctx.run('operation-2', () => work())  // ctx.run doesn't count
  await ctx.run('operation-3', () => work())  // Still level 2
})

// ✅ GOOD: 3 levels (maximum allowed)
const orchestrator = flow({}, async (deps, ctx, input) => {
  await ctx.exec('level-2', level2Flow, data)  // Level 2
})

const level2Flow = flow({}, async (deps, ctx, input) => {
  await ctx.exec('level-3', level3Flow, data)  // Level 3
})

const level3Flow = flow({}, async (deps, ctx, input) => {
  await ctx.run('final-operation', () => work())  // Operations don't add depth
})

// ❌ BAD: 4 levels (too deep)
orchestrator → ctx.exec(level2) → ctx.exec(level3) → ctx.exec(level4)  // Exceeds limit
```

```typescript
// ✅ GOOD: Flow with business logic
const authorizeWithGoogle = flow({
  oauth: googleOAuth,
  userRepo: userRepository
}, async (deps, ctx, input: { code: string }) => {
  ctx.set(authAttemptId, generateId())

  // Step 1: Exchange code (journaled with key)
  const tokenResult = await ctx.run('exchange-code', async () => {
    try {
      return { ok: true as const, token: await deps.oauth.exchangeCode(input.code) }
    } catch (error) {
      return { ok: false as const, reason: 'invalid_code' as const, error }
    }
  })

  if (!tokenResult.ok) {
    return { success: false, reason: tokenResult.reason }
  }

  // Step 2: Validate token (sub-flow with journal key)
  const validation = await ctx.exec('validate-token', validateGoogleToken, tokenResult.token)

  if (!validation.ok) {
    return { success: false, reason: validation.reason }
  }

  // Business rule: Only @company.com emails
  if (!validation.email.endsWith('@company.com')) {
    return { success: false, reason: 'unauthorized_domain' as const }
  }

  // Step 3: Ensure user exists (sub-flow with journal key)
  const user = await ctx.exec('ensure-user', ensureUserExists, {
    email: validation.email,
    name: validation.name
  })

  return {
    success: true,
    user,
    authAttemptId: ctx.get(authAttemptId)
  }
})
```

**Testing:**
```typescript
const testScope = createScope({
  initialValues: [
    preset(googleOAuth, mockOAuth),
    preset(userRepository, mockUserRepo)
  ]
})

const result = await flow.execute(authorizeWithGoogle,
  { code: 'test-code' },
  { scope: testScope, details: true }
)

// Verify journal
expect(result.ctx.context.get(flowMeta.journal)).toContain('exchange-code')

// Verify business logic
expect(result.result.success).toBe(true)
```

### 3. Interaction Points (Integration Points)

**What:** Entry points where external world meets flows

**Rule:** Keep flows framework-agnostic—don't pass framework objects into flows

```typescript
// ❌ BAD: Flow coupled to Express
const handleLogin = flow({
  oauth: googleOAuth
}, async (deps, ctx, req: express.Request) => {
  const code = req.body.code // Tightly coupled
})

// ✅ GOOD: Flow has clean interface
const handleLogin = flow({
  oauth: googleOAuth
}, async (deps, ctx, input: { code: string }) => {
  // Framework-agnostic business logic
})

// Interaction Point: Express route
app.post('/auth/google', async (req, res) => {
  const scope = req.app.get('scope')

  const result = await flow.execute(handleLogin, {
    code: req.body.code
  }, { scope })

  if (result.success) {
    res.json({ token: result.token })
  } else {
    res.status(400).json({ error: result.reason })
  }
})

// Interaction Point: CLI command
program
  .command('auth <code>')
  .action(async (code) => {
    const scope = createScope({ tags: [...] })

    const result = await flow.execute(handleLogin, { code }, { scope })

    console.log(result.success ? 'Success' : `Failed: ${result.reason}`)

    await scope.dispose()
  })
```

### 4. Utilities (Pure Functions)

**What:** Stateless transformations (no side effects, no dependencies)

```typescript
// ✅ Utilities: Pure, stateless
const normalizeEmail = (email: string): string => {
  return email.toLowerCase().trim()
}

const validateEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

const calculateTax = (amount: number, rate: number): number => {
  return amount * rate
}

// Used in flows without tracking overhead
const processPayment = flow({
  gateway: paymentGateway
}, async (deps, ctx, input) => {
  const normalizedEmail = normalizeEmail(input.email) // Direct call
  const tax = calculateTax(input.amount, 0.1)        // Direct call
  const total = input.amount + tax

  // Business operation tracked
  return await ctx.exec('charge-payment', chargePayment, { total, email: normalizedEmail })
})
```

**Testing:**
```typescript
expect(normalizeEmail('  Test@Example.COM  ')).toBe('test@example.com')
expect(calculateTax(100, 0.1)).toBe(10)
```

### 5. ctx.exec & ctx.run - Always Use Journal Keys

**Why:** Makes operations visible to extensions (logging, tracing, metrics)

```typescript
const processOrder = flow({
  inventory: inventoryService,
  payment: paymentService
}, async (deps, ctx, order) => {

  // ✅ ALWAYS use journal keys - makes visible to extensions
  const stock = await ctx.run('check-inventory', async () => {
    return deps.inventory.checkStock(order.items)
  })

  // ✅ Works with sync or async operations
  const pricing = await ctx.run('calculate-pricing', () => {
    const base = calculateTotal(order.items)
    const tax = calculateTax(base, order.region)
    return { base, tax, total: base + tax }
  })

  // ✅ Sub-flows always with journal keys
  const charged = await ctx.exec('charge-payment', chargePayment, pricing.total)

  // Direct call: Only for trivial operations
  const formatted = formatCurrency(pricing.total)

  return { ok: true, total: pricing.total }
})
```

**Benefits:**
- Extensions see all operations
- Logging, tracing, metrics work automatically
- Debugging shows execution path
- Journal enables replay

**When to use ctx.run:**
```
✓ Resource method calls (API, DB, external services)
✓ Important utility operations (validation, pricing)
✓ Any operation you want visible in logs/traces/metrics
✓ Operations that might fail or have latency

✗ Only skip for trivial formatting/property access
```

### 6. Extensions (Cross-Cutting Observation)

```typescript
const loggingExtension: Extension = {
  wrap: (scope, next, operation) => {
    if (operation.kind === 'execute') {
      console.log(`[FLOW START] ${operation.flowName}`)
      return next().finally(() => {
        console.log(`[FLOW END] ${operation.flowName}`)
      })
    }

    if (operation.kind === 'journal') {
      console.log(`  [STEP] ${operation.key}`)
    }

    return next()
  }
}

await flow.execute(processOrder, input, {
  scope,
  extensions: [loggingExtension]
})

/* Output:
[FLOW START] processOrder
  [STEP] check-inventory
  [STEP] calculate-pricing
  [STEP] charge-payment
[FLOW END] processOrder
*/
```

## Testing Strategy Matrix

| Element | How to Test | Example |
|---------|-------------|---------|
| **Resource** | Integration test (real) OR Mock via preset() | ```typescript<br>// Real DB<br>const scope = createScope({ tags: [dbConfig({...})] })<br>const db = await scope.resolve(dbPool)<br><br>// Mock<br>const testScope = createScope({<br>  initialValues: [preset(dbPool, mockDb)]<br>})<br>``` |
| **Flow** | Mock resources via preset(), verify journal | ```typescript<br>const testScope = createScope({<br>  initialValues: [preset(googleOAuth, mockOAuth)]<br>})<br>const result = await flow.execute(auth, input, { scope: testScope })<br>``` |
| **Utility** | Unit test (pure functions) | ```typescript<br>expect(normalizeEmail(' Test@Example.COM ')).toBe('test@example.com')<br>``` |

**You have flexibility:**
- Test flows WITH real database (integration test)
- Test flows WITHOUT real database (unit test via mocks)
- Mix both approaches based on what you're testing

## Design Validation: When It's NOT a Flow

Keep it simple—focus on violations:

```
❌ Pure computation (no side effects)
   → Should be utility, not flow
   Example: calculateTotal, formatDate, validateEmail

❌ No business logic (just technical wiring)
   → Should be resource, not flow
   Example: Database connection pool, HTTP client setup

❌ Long-lived resource (not per-operation)
   → Should be resource (executor), not flow
   Example: Redis client, S3 bucket connection

✅ Has side effects + needs tracking → Flow
✅ Business logic with multiple outcomes → Flow
✅ Orchestrates resources/sub-flows → Flow
```

## Three-Tier Pattern Enforcement

### Tier 1: Critical (Block/require fixes)

**Type Safety**
- ❌ No `any` types
- ❌ No `unknown` without proper type guards
- ❌ No unsafe type casting (see acceptable patterns below)
- ✅ Use derive() for type propagation
- ✅ Leverage factory function destructuring

**Acceptable Type Assertions:**
```typescript
// ✅ GOOD: Library type narrowing
const client = createClient({...}) as RedisClientType  // Library-specific type

// ✅ GOOD: Error narrowing in catch blocks
try {
  await operation()
} catch (error) {
  // TypeScript makes error: unknown
  const err = error as Error  // Safe - Error is base type
  console.error(err.message)
}

// ✅ GOOD: Type guard instead of assertion (preferred)
function isUser(data: unknown): data is User {
  return typeof data === 'object' && data !== null && 'id' in data
}

if (isUser(data)) {
  // data is now User type
}

// ❌ BAD: Casting to bypass type checking
const user = data as User  // Dangerous if data isn't actually User
```

**Tag System**
- ✅ Define tags with schema validators (Zod, Valibot) or custom<T>()
- ✅ Type-safe tag references
- ❌ String-based tag references

**Lifecycle Separation**
- ✅ Long-running resources (DB, servers) in scope
- ✅ Short-span operations (requests, transactions) in flows
- ❌ Request-specific data in scope
- ❌ Connection pools in flows

**Flow Composition**
- ✅ Always use journal keys: `ctx.exec('key', flow, input)`
- ✅ Always use journal keys: `ctx.run('key', () => operation)`
- ❌ Unnamed operations (harder to debug)
- ✅ Max 3 levels deep
- ✅ Discriminated union outputs

### Tier 2: Important (Strong warnings)

**Flow Patterns**
- Context inheritance via ctx.exec
- Proper error handling (discriminated unions)
- Sub-flow composition for visibility

**Resource Patterns**
- Configuration via tags (`controller.scope`)
- Cleanup via `controller.cleanup()`
- Business-logic-free operations

**Testing Patterns**
- Mock via preset()
- Verify flow logic with mocked resources
- Integration tests with real resources when needed

### Tier 3: Best Practices (Educational)

**Code Organization**
- Clear separation: Resources → Flows → Interaction Points
- Utilities for pure functions
- Extensions for cross-cutting concerns

**Observability**
- Journal important operations
- Use extensions for logging/tracing
- Meaningful journal keys

## Key Behaviors

- **Non-intrusive**: Only activate when package.json has @pumped-fn/core-next
- **Example-driven**: Reference examples directory
- **Observability-focused**: Guide toward inspectable operations
- **Testing-friendly**: Emphasize preset() and mock strategies
- **Pragmatic**: Balance tracking overhead with visibility needs

## Remember

- Use journal keys for all ctx.exec and ctx.run calls
- Resources are integration details, flows are business logic
- Keep flows framework-agnostic
- Mock resources via preset() for testing
- Extensions make operations observable without code changes
- Max 3 levels of flow depth
- Discriminated unions for all flow outcomes

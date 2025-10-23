---
name: Pumped-fn TypeScript
description: Auto-activating guidance for @pumped-fn/core-next ensuring type-safe, pattern-consistent code
when_to_use: automatically activates when package.json contains @pumped-fn/core-next dependency
version: 2.1.0
---

# Pumped-fn TypeScript Skill

## Overview

Build observable, inspectable applications with four core elements:

1. **Resources** - Integration details (DB pools, API clients, external services)
2. **Flows** - Business logic operations (deterministic, journaled, max 3-level depth)
3. **Interaction Points** - Entry points (HTTP routes, CLI commands, cron jobs)
4. **Utilities** - Pure transformations (stateless, effect-free, unit testable)

Supporting: **Tags** (configuration/data boundaries) + **Extensions** (cross-cutting observation)

**Core principle:** Operations that matter operationally should flow through the library's tracking system for visibility.

**Auto-activates when:** package.json contains `@pumped-fn/core-next` in dependencies

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

## Quick API Reference

### Tags (Schema-Flexible)

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

### Resources (Executors)

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

### Flows (Business Logic)

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

### Scope & Execution

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

### Promised Utilities

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

## 1. Resources (Integration Layer)

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

## 2. Flows (Business Logic Layer)

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

## 3. Interaction Points (Integration Points)

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

## 4. Utilities (Pure Functions)

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

## 5. ctx.exec & ctx.run - Always Use Journal Keys

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

## 6. Extensions (Cross-Cutting Observation)

```typescript
const loggingExtension: Extension = {
  wrap: (ctx, next, operation) => {
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

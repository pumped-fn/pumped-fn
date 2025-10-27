## Architecture Generation Templates

**Purpose:** Copy-paste templates for scaffolding pumped-fn applications. Each template enforces patterns, includes complete examples, and embeds coding style hooks.

---

### Template 1: Resource Layer (External Systems)

**Pattern:** Integration with external systems via `provide()` or `derive()`

**When to use:**
- Database connections
- HTTP API clients
- Cache/Redis connections
- File storage clients
- Message queue connections

**Code template:**

```typescript
import { provide, derive, tag, custom } from '@pumped-fn/core-next'
import { Pool } from 'pg'

// Tags for configuration
export const dbConfig = tag(custom<{
  host: string
  port: number
  database: string
  user: string
  password: string
}>(), { label: 'config.database' })

// Root resource - Database pool
export const dbPool = provide((controller) => {
  const config = dbConfig.get(controller.scope)

  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
  })

  controller.cleanup(async () => {
    await pool.end()
  })

  return {
    query: async <T>(sql: string, params: any[]): Promise<T[]> => {
      const result = await pool.query(sql, params)
      return result.rows
    },
    transaction: async <T>(callback: (client: any) => Promise<T>): Promise<T> => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await callback(client)
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    }
  }
})

// Derived resource - HTTP API client
export const apiUrl = tag(custom<string>(), { label: 'config.apiUrl' })
export const apiKey = tag(custom<string>(), { label: 'config.apiKey' })

export const externalApi = derive(
  { apiUrl, apiKey },
  ({ apiUrl, apiKey }) => ({
    get: async <T>(path: string): Promise<T> => {
      const response = await fetch(`${apiUrl}${path}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
      if (!response.ok) throw new Error(`API error: ${response.status}`)
      return response.json()
    },
    post: async <T>(path: string, body: any): Promise<T> => {
      const response = await fetch(`${apiUrl}${path}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })
      if (!response.ok) throw new Error(`API error: ${response.status}`)
      return response.json()
    }
  })
)
```

**Coding style hooks:**
- ✅ Configuration via tags (no process.env, no import.meta.env)
- ✅ Cleanup registered via controller.cleanup()
- ✅ Generic operations only (no business logic)
- ✅ Proper TypeScript types (no any/unknown)
- ❌ No business rules in resources
- ❌ No direct built-in access (process.env, __dirname)

---

### Template 2: Repository Layer (Data Access)

**Pattern:** Domain-specific data access via `derive()` with database dependency

**When to use:**
- CRUD operations for entities
- Query abstractions
- Data mapping/hydration

**Code template:**

```typescript
import { derive } from '@pumped-fn/core-next'
import { dbPool } from './resources'

export namespace UserRepo {
  export type User = {
    id: string
    email: string
    name: string
    createdAt: Date
  }

  export type CreateInput = {
    email: string
    name: string
  }

  export type UpdateInput = Partial<Omit<User, 'id' | 'createdAt'>>
}

export const userRepository = derive({ db: dbPool }, ({ db }) => ({
  findById: async (id: string): Promise<UserRepo.User | null> => {
    const rows = await db.query<UserRepo.User>(
      'SELECT id, email, name, created_at as "createdAt" FROM users WHERE id = $1',
      [id]
    )
    return rows[0] || null
  },

  findByEmail: async (email: string): Promise<UserRepo.User | null> => {
    const rows = await db.query<UserRepo.User>(
      'SELECT id, email, name, created_at as "createdAt" FROM users WHERE email = $1',
      [email]
    )
    return rows[0] || null
  },

  create: async (input: UserRepo.CreateInput): Promise<UserRepo.User> => {
    const rows = await db.query<UserRepo.User>(
      'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id, email, name, created_at as "createdAt"',
      [input.email, input.name]
    )
    return rows[0]
  },

  update: async (id: string, input: UserRepo.UpdateInput): Promise<UserRepo.User | null> => {
    const fields: string[] = []
    const values: any[] = []
    let paramCount = 1

    if (input.email !== undefined) {
      fields.push(`email = $${paramCount++}`)
      values.push(input.email)
    }
    if (input.name !== undefined) {
      fields.push(`name = $${paramCount++}`)
      values.push(input.name)
    }

    if (fields.length === 0) return null

    values.push(id)
    const rows = await db.query<UserRepo.User>(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING id, email, name, created_at as "createdAt"`,
      values
    )
    return rows[0] || null
  },

  delete: async (id: string): Promise<boolean> => {
    const rows = await db.query<{ id: string }>(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [id]
    )
    return rows.length > 0
  }
}))
```

**Coding style hooks:**
- ✅ Group types in namespace
- ✅ Generic CRUD operations (no business logic)
- ✅ Return null for not-found (not throw)
- ✅ Type-safe query results
- ❌ No validation logic (put in flows)
- ❌ No business rules (put in flows)

---

### Template 3: Flow Layer (Business Logic)

**Pattern:** Business operations via `flow()` with dependencies and journaling

**When to use:**
- Multi-step business processes
- Operations needing validation
- Orchestration of resources/sub-flows

**Code template:**

```typescript
import { flow } from '@pumped-fn/core-next'
import { userRepository, type UserRepo } from './repositories'

export namespace CreateUser {
  export type Input = {
    email: string
    name: string
  }

  export type Success = {
    success: true
    user: UserRepo.User
  }

  export type Error =
    | { success: false; reason: 'INVALID_EMAIL' }
    | { success: false; reason: 'EMAIL_EXISTS' }
    | { success: false; reason: 'NAME_TOO_SHORT' }

  export type Result = Success | Error
}

export const createUser = flow(
  { userRepo: userRepository },
  ({ userRepo }) => async (ctx, input: CreateUser.Input): Promise<CreateUser.Result> => {
    const validation = await ctx.run('validate-input', () => {
      if (!input.email.includes('@')) {
        return { ok: false as const, reason: 'INVALID_EMAIL' as const }
      }
      if (input.name.length < 2) {
        return { ok: false as const, reason: 'NAME_TOO_SHORT' as const }
      }
      return { ok: true as const }
    })

    if (!validation.ok) {
      return { success: false, reason: validation.reason }
    }

    const existing = await ctx.run('check-existing', async () => {
      return userRepo.findByEmail(input.email)
    })

    if (existing !== null) {
      return { success: false, reason: 'EMAIL_EXISTS' }
    }

    const user = await ctx.run('create-user', async () => {
      return userRepo.create({
        email: input.email,
        name: input.name
      })
    })

    return { success: true, user }
  }
)

export namespace RegisterUser {
  export type Input = {
    email: string
    name: string
    sendWelcomeEmail: boolean
  }

  export type Success = {
    success: true
    user: UserRepo.User
    emailSent: boolean
  }

  export type Error = CreateUser.Error | { success: false; reason: 'EMAIL_SEND_FAILED' }

  export type Result = Success | Error
}

export const registerUser = flow(
  { userRepo: userRepository },
  ({ userRepo }) => async (ctx, input: RegisterUser.Input): Promise<RegisterUser.Result> => {
    const userResult = await ctx.exec(createUser, {
      email: input.email,
      name: input.name
    })

    if (!userResult.success) {
      return userResult
    }

    let emailSent = false
    if (input.sendWelcomeEmail) {
      const emailResult = await ctx.run('send-welcome-email', async () => {
        return { success: true as const }
      })

      if (!emailResult.success) {
        return { success: false, reason: 'EMAIL_SEND_FAILED' }
      }
      emailSent = true
    }

    return {
      success: true,
      user: userResult.user,
      emailSent
    }
  }
)
```

**Coding style hooks:**
- ✅ Always use discriminated unions (success: true/false)
- ✅ Always use journal keys (ctx.run, ctx.exec)
- ✅ Group types in namespace
- ✅ Max 3 levels of ctx.exec() nesting
- ✅ Validation in ctx.run() operations
- ❌ No direct resource calls (always via deps)
- ❌ No framework objects in flow input

---

### Template 4: Interaction Points (HTTP Routes)

**Pattern:** Framework integration that transforms requests to flow inputs

**When to use:**
- HTTP endpoints
- CLI commands
- Cron job handlers
- WebSocket/SSE handlers

**Code template:**

```typescript
import express from 'express'
import { createScope, type Scope } from '@pumped-fn/core-next'
import { createUser, registerUser } from './flows'
import { dbConfig } from './resources'

export function createApp() {
  const scope = createScope({
    tags: [
      dbConfig({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'app',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres'
      })
    ]
  })

  const app = express()
  app.use(express.json())

  app.set('scope', scope)

  app.post('/users', async (req, res) => {
    const scope = req.app.get('scope') as Scope

    const result = await scope.exec(createUser, {
      email: req.body.email,
      name: req.body.name
    })

    if (!result.success) {
      const statusMap = {
        INVALID_EMAIL: 400,
        EMAIL_EXISTS: 409,
        NAME_TOO_SHORT: 400
      }
      return res.status(statusMap[result.reason]).json({
        error: result.reason
      })
    }

    res.status(201).json(result.user)
  })

  app.post('/auth/register', async (req, res) => {
    const scope = req.app.get('scope') as Scope

    const result = await scope.exec(registerUser, {
      email: req.body.email,
      name: req.body.name,
      sendWelcomeEmail: req.body.sendWelcomeEmail ?? true
    })

    if (!result.success) {
      const statusMap = {
        INVALID_EMAIL: 400,
        EMAIL_EXISTS: 409,
        NAME_TOO_SHORT: 400,
        EMAIL_SEND_FAILED: 500
      }
      return res.status(statusMap[result.reason]).json({
        error: result.reason
      })
    }

    res.status(201).json({
      user: result.user,
      emailSent: result.emailSent
    })
  })

  return { app, scope }
}
```

**Coding style hooks:**
- ✅ Transform request to flow input (extract only needed fields)
- ✅ Map flow discriminated unions to HTTP status codes
- ✅ Pass scope, not resolved resources
- ✅ Use scope.exec() at boundary
- ❌ No business logic in routes
- ❌ No direct resource.resolve() calls
- ❌ Don't pass req/res to flows

---

### Template 5: Main Entry Point (Application Bootstrap)

**Pattern:** Scope creation, server startup, graceful shutdown

**When to use:**
- Application entry point (main.ts, index.ts)
- Server initialization
- Process lifecycle management

**Code template:**

```typescript
import { createApp } from './app'

async function main() {
  const { app, scope } = createApp()

  const server = app.listen(3000, () => {
    console.log('Server listening on port 3000')
  })

  const shutdown = async () => {
    console.log('Shutting down gracefully...')

    await new Promise<void>((resolve) => {
      server.close(() => {
        console.log('HTTP server closed')
        resolve()
      })
    })

    await scope.dispose()
    console.log('Resources disposed')

    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  process.on('uncaughtException', async (error) => {
    console.error('Uncaught exception:', error)
    await shutdown()
  })

  process.on('unhandledRejection', async (reason) => {
    console.error('Unhandled rejection:', reason)
    await shutdown()
  })
}

main().catch((error) => {
  console.error('Failed to start:', error)
  process.exit(1)
})
```

**CLI variant:**

```typescript
import { Command } from 'commander'
import { createScope } from '@pumped-fn/core-next'
import { dbConfig } from './resources'
import { createUser } from './flows'

const program = new Command()

program
  .name('app')
  .description('Application CLI')

program
  .command('create-user')
  .argument('<email>', 'User email')
  .argument('<name>', 'User name')
  .action(async (email, name) => {
    const scope = createScope({
      tags: [
        dbConfig({
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432'),
          database: process.env.DB_NAME || 'app',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres'
        })
      ]
    })

    try {
      const result = await scope.exec(createUser, { email, name })

      if (!result.success) {
        console.error(`Error: ${result.reason}`)
        process.exit(1)
      }

      console.log('User created:', result.user)
    } finally {
      await scope.dispose()
    }
  })

program.parse()
```

**Coding style hooks:**
- ✅ One scope per app (HTTP) or per command (CLI)
- ✅ Graceful shutdown (server close, scope.dispose)
- ✅ Built-ins at entry point only
- ✅ Error handling for uncaught exceptions
- ❌ No global scope exports
- ❌ No unhandled promise rejections

---

### Template 6: Test Fixtures (preset() Pattern)

**Pattern:** Mock dependencies via preset() for isolated testing

**When to use:**
- Unit testing flows
- Mocking external systems
- Test isolation

**Code template:**

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { createScope, preset, type Scope } from '@pumped-fn/core-next'
import { userRepository, type UserRepo } from './repositories'
import { createUser, registerUser } from './flows'

describe('createUser flow', () => {
  let scope: Scope

  beforeEach(() => {
    const mockUserRepo = {
      findById: async (id: string): Promise<UserRepo.User | null> => null,
      findByEmail: async (email: string): Promise<UserRepo.User | null> => null,
      create: async (input: UserRepo.CreateInput): Promise<UserRepo.User> => ({
        id: 'test-id-123',
        email: input.email,
        name: input.name,
        createdAt: new Date('2025-01-01')
      }),
      update: async (id: string, input: UserRepo.UpdateInput) => null,
      delete: async (id: string) => false
    }

    scope = createScope({
      presets: [preset(userRepository, mockUserRepo)]
    })
  })

  afterEach(async () => {
    await scope.dispose()
  })

  test('creates user with valid input', async () => {
    const result = await scope.exec(createUser, {
      email: 'test@example.com',
      name: 'Test User'
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.user.email).toBe('test@example.com')
      expect(result.user.name).toBe('Test User')
      expect(result.user.id).toBe('test-id-123')
    }
  })

  test('rejects invalid email', async () => {
    const result = await scope.exec(createUser, {
      email: 'invalid-email',
      name: 'Test User'
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.reason).toBe('INVALID_EMAIL')
    }
  })

  test('rejects short name', async () => {
    const result = await scope.exec(createUser, {
      email: 'test@example.com',
      name: 'T'
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.reason).toBe('NAME_TOO_SHORT')
    }
  })

  test('rejects duplicate email', async () => {
    const mockUserRepoWithExisting = {
      findById: async (id: string) => null,
      findByEmail: async (email: string): Promise<UserRepo.User | null> => ({
        id: 'existing-id',
        email,
        name: 'Existing User',
        createdAt: new Date()
      }),
      create: async (input: UserRepo.CreateInput) => ({
        id: 'new-id',
        ...input,
        createdAt: new Date()
      }),
      update: async (id: string, input: UserRepo.UpdateInput) => null,
      delete: async (id: string) => false
    }

    const scopeWithExisting = createScope({
      presets: [preset(userRepository, mockUserRepoWithExisting)]
    })

    const result = await scopeWithExisting.exec(createUser, {
      email: 'existing@example.com',
      name: 'Test User'
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.reason).toBe('EMAIL_EXISTS')
    }

    await scopeWithExisting.dispose()
  })
})

describe('registerUser flow', () => {
  let scope: Scope

  beforeEach(() => {
    const mockUserRepo = {
      findById: async (id: string) => null,
      findByEmail: async (email: string) => null,
      create: async (input: UserRepo.CreateInput): Promise<UserRepo.User> => ({
        id: 'test-id-456',
        email: input.email,
        name: input.name,
        createdAt: new Date('2025-01-01')
      }),
      update: async (id: string, input: UserRepo.UpdateInput) => null,
      delete: async (id: string) => false
    }

    scope = createScope({
      presets: [preset(userRepository, mockUserRepo)]
    })
  })

  afterEach(async () => {
    await scope.dispose()
  })

  test('registers user and sends email', async () => {
    const result = await scope.exec(registerUser, {
      email: 'newuser@example.com',
      name: 'New User',
      sendWelcomeEmail: true
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.user.email).toBe('newuser@example.com')
      expect(result.emailSent).toBe(true)
    }
  })

  test('registers user without sending email', async () => {
    const result = await scope.exec(registerUser, {
      email: 'newuser@example.com',
      name: 'New User',
      sendWelcomeEmail: false
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.emailSent).toBe(false)
    }
  })
})
```

**Coding style hooks:**
- ✅ Use preset() for all dependencies
- ✅ Create fresh scope per test (or per suite)
- ✅ Dispose scope in afterEach/afterAll
- ✅ Test discriminated union branches
- ✅ Type-safe mocks (match repository interface)
- ❌ No global mocks
- ❌ No mocking implementation details

---

### Template 7: Extensions (Observability)

**Pattern:** Cross-cutting concerns via extension wrap() hooks

**When to use:**
- Logging/tracing
- Metrics collection
- Performance monitoring
- Error tracking

**Code template:**

```typescript
import { wrap, type Extension } from '@pumped-fn/core-next'

export const loggingExtension: Extension = wrap({
  execute: ({ flow, input }) => {
    const startTime = Date.now()
    console.log(`[FLOW START] ${flow.name}`, { input })

    return {
      after: ({ result }) => {
        const duration = Date.now() - startTime
        console.log(`[FLOW END] ${flow.name}`, { duration, result })
      },
      error: ({ error }) => {
        const duration = Date.now() - startTime
        console.error(`[FLOW ERROR] ${flow.name}`, { duration, error })
      }
    }
  },

  journal: ({ key, operation }) => {
    console.log(`  [STEP] ${key}`)
  }
})

export const metricsExtension: Extension = wrap({
  execute: ({ flow }) => {
    const startTime = Date.now()
    const metricName = `flow.${flow.name}.duration`

    return {
      after: () => {
        const duration = Date.now() - startTime
        console.log(`METRIC: ${metricName} = ${duration}ms`)
      },
      error: ({ error }) => {
        const duration = Date.now() - startTime
        console.log(`METRIC: ${metricName} = ${duration}ms (error)`)
        console.log(`METRIC: flow.${flow.name}.errors = 1`)
      }
    }
  }
})

export const tracingExtension: Extension = wrap({
  execute: ({ flow, input }) => {
    const traceId = Math.random().toString(36).slice(2)
    const spanId = Math.random().toString(36).slice(2)

    console.log(`[TRACE] trace_id=${traceId} span_id=${spanId} flow=${flow.name} phase=start`)

    return {
      after: ({ result }) => {
        console.log(`[TRACE] trace_id=${traceId} span_id=${spanId} flow=${flow.name} phase=end`)
      },
      error: ({ error }) => {
        console.log(`[TRACE] trace_id=${traceId} span_id=${spanId} flow=${flow.name} phase=error error=${error}`)
      }
    }
  },

  journal: ({ key, operation }) => {
    console.log(`[TRACE] operation=${key}`)
  }
})

export const errorTrackingExtension: Extension = wrap({
  execute: ({ flow }) => {
    return {
      error: ({ error }) => {
        console.error(`[ERROR TRACKING] Flow: ${flow.name}`, {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString()
        })
      }
    }
  }
})
```

**Usage:**

```typescript
import { createScope } from '@pumped-fn/core-next'
import { loggingExtension, metricsExtension } from './extensions'

const scope = createScope({
  extensions: [loggingExtension, metricsExtension]
})

const result = await scope.exec(createUser, {
  email: 'test@example.com',
  name: 'Test User'
})

```

**Coding style hooks:**
- ✅ Use wrap() for extension creation
- ✅ Hook into execute/journal lifecycle
- ✅ Return cleanup in after/error hooks
- ✅ Keep extensions side-effect only (don't modify behavior)
- ❌ Don't mutate input/result in extensions
- ❌ Don't throw errors in extensions

---


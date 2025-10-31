---
name: testing-integration
tags: testing, integration, e2e, real, database, http, lifecycle, cleanup
description: End-to-end integration testing with real resources (test database, real HTTP calls). Test complete application lifecycle including resource initialization and cleanup. When to use integration vs unit tests. Test scope disposal and graceful shutdown.
---

# Testing Integration (End-to-End)

## When to Use This Pattern

**Integration testing means:**
- Testing with real resources (test database, real file system)
- Testing complete application lifecycle
- Testing resource cleanup and disposal
- Testing actual HTTP endpoints
- Testing framework integration (Hono, Next.js)

**Use integration tests when:**
- Unit tests with mocks aren't sufficient
- Testing external system integration (database, APIs)
- Verifying resource lifecycle (init, cleanup)
- Testing production-like scenarios
- Catching integration bugs (network, timing, concurrency)

---

## Integration vs Unit Tests: When to Use Each

### Use Unit Tests (with preset()) When:

- ✅ Testing business logic in isolation
- ✅ Fast execution needed (CI/CD)
- ✅ No external dependencies required
- ✅ Testing edge cases and boundary conditions
- ✅ Deterministic, repeatable results

### Use Integration Tests (real resources) When:

- ✅ Testing database queries/transactions
- ✅ Testing real HTTP clients/servers
- ✅ Testing file system operations
- ✅ Testing resource lifecycle (cleanup)
- ✅ Finding integration bugs (network failures, timeouts)
- ✅ Testing framework integration (Hono routes, Next.js actions)

**Golden rule:** Start with unit tests, add integration tests for critical paths

---

## Pattern: Testing with Real Database

Use test database for integration tests:

```typescript
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createScope, provide, derive, tag, custom, Core } from '@pumped-fn/core-next'
import { Pool } from 'pg'

// Configuration for test database
export const dbConfig = tag(custom<{
  host: string
  port: number
  database: string
  user: string
  password: string
}>(), { label: 'config.database' })

// Real database pool
export const dbPool = provide((controller) => {
  const config = dbConfig.get(controller.scope)

  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    max: 10
  })

  controller.cleanup(async () => {
    await pool.end()
  })

  return {
    query: async <T>(sql: string, params: unknown[]): Promise<T[]> => {
      const result = await pool.query(sql, params)
      return result.rows
    }
  }
})

// User repository
export type User = {
  id: string
  email: string
  name: string
  createdAt: Date
}

export const userRepository = derive(
  { db: dbPool },
  ({ db }) => ({
    create: async (input: { email: string; name: string }): Promise<User> => {
      const rows = await db.query<User>(
        'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id, email, name, created_at as "createdAt"',
        [input.email, input.name]
      )
      return rows[0]
    },
    findByEmail: async (email: string): Promise<User | null> => {
      const rows = await db.query<User>(
        'SELECT id, email, name, created_at as "createdAt" FROM users WHERE email = $1',
        [email]
      )
      return rows[0] || null
    },
    deleteAll: async (): Promise<void> => {
      await db.query('DELETE FROM users', [])
    }
  })
)

describe('userRepository integration tests', () => {
  let scope: Core.Scope
  let repo: Awaited<ReturnType<typeof userRepository['factory']>>

  beforeAll(async () => {
    // Create scope with REAL database config
    scope = createScope({
      tags: [
        dbConfig({
          host: 'localhost',
          port: 5432,
          database: 'test_db',  // Separate test database
          user: 'test_user',
          password: 'test_password'
        })
      ]
    })

    repo = await scope.resolve(userRepository)

    // Setup: Create schema
    const db = await scope.resolve(dbPool)
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `, [])
  })

  afterAll(async () => {
    // Teardown: Drop schema and dispose scope
    const db = await scope.resolve(dbPool)
    await db.query('DROP TABLE IF EXISTS users', [])
    await scope.dispose()
  })

  beforeEach(async () => {
    // Clean data before each test
    await repo.deleteAll()
  })

  test('creates user in real database', async () => {
    const user = await repo.create({
      email: 'test@example.com',
      name: 'Test User'
    })

    expect(user.id).toBeDefined()
    expect(user.email).toBe('test@example.com')
    expect(user.name).toBe('Test User')
    expect(user.createdAt).toBeInstanceOf(Date)
  })

  test('findByEmail returns null when user does not exist', async () => {
    const user = await repo.findByEmail('nonexistent@example.com')

    expect(user).toBeNull()
  })

  test('findByEmail returns user after creation', async () => {
    await repo.create({
      email: 'alice@example.com',
      name: 'Alice'
    })

    const found = await repo.findByEmail('alice@example.com')

    expect(found).not.toBeNull()
    expect(found?.email).toBe('alice@example.com')
    expect(found?.name).toBe('Alice')
  })

  test('enforces unique email constraint', async () => {
    await repo.create({
      email: 'duplicate@example.com',
      name: 'User 1'
    })

    await expect(
      repo.create({
        email: 'duplicate@example.com',
        name: 'User 2'
      })
    ).rejects.toThrow()
  })
})
```

**Key principles:**
- Use separate test database (never production)
- Setup schema in beforeAll
- Clean data in beforeEach (deterministic tests)
- Drop schema in afterAll
- Dispose scope in afterAll
- Test real constraints (unique, foreign keys)

---

## Pattern: Testing Resource Lifecycle

Test resource initialization and cleanup:

```typescript
import { describe, test, expect } from 'vitest'
import { createScope, provide } from '@pumped-fn/core-next'

describe('resource lifecycle integration', () => {
  test('resource cleanup called on scope.dispose()', async () => {
    let cleanupCalled = false
    let connectionClosed = false

    const mockDbPool = provide((controller) => {
      const connection = { status: 'open' }

      controller.cleanup(async () => {
        cleanupCalled = true
        connection.status = 'closed'
        connectionClosed = true
      })

      return {
        query: async (sql: string) => [],
        getStatus: () => connection.status
      }
    })

    const scope = createScope()
    const pool = await scope.resolve(mockDbPool)

    expect(pool.getStatus()).toBe('open')
    expect(cleanupCalled).toBe(false)

    await scope.dispose()

    expect(cleanupCalled).toBe(true)
    expect(connectionClosed).toBe(true)
  })

  test('cleanup called in reverse order of initialization', async () => {
    const cleanupOrder: string[] = []

    const resourceA = provide((controller) => {
      controller.cleanup(async () => {
        cleanupOrder.push('A')
      })
      return { name: 'A' }
    })

    const resourceB = provide((controller) => {
      controller.cleanup(async () => {
        cleanupOrder.push('B')
      })
      return { name: 'B' }
    })

    const resourceC = provide((controller) => {
      controller.cleanup(async () => {
        cleanupOrder.push('C')
      })
      return { name: 'C' }
    })

    const scope = createScope()

    // Initialize in order: A, B, C
    await scope.resolve(resourceA)
    await scope.resolve(resourceB)
    await scope.resolve(resourceC)

    await scope.dispose()

    // Cleanup in reverse order: C, B, A
    expect(cleanupOrder).toEqual(['C', 'B', 'A'])
  })

  test('dispose handles cleanup errors gracefully', async () => {
    const cleanupCalls: string[] = []

    const failingResource = provide((controller) => {
      controller.cleanup(async () => {
        cleanupCalls.push('failing')
        throw new Error('Cleanup failed')
      })
      return {}
    })

    const successResource = provide((controller) => {
      controller.cleanup(async () => {
        cleanupCalls.push('success')
      })
      return {}
    })

    const scope = createScope()
    await scope.resolve(failingResource)
    await scope.resolve(successResource)

    // Should not throw, continues cleanup even if one fails
    await expect(scope.dispose()).resolves.not.toThrow()

    // Both cleanups attempted
    expect(cleanupCalls).toContain('failing')
    expect(cleanupCalls).toContain('success')
  })
})
```

**Key principles:**
- Test cleanup is called
- Test cleanup order (reverse initialization)
- Test error handling in cleanup
- Verify resources released (connections, files)

---

## Pattern: Testing HTTP Integration with Hono

Test real HTTP server:

```typescript
import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { Hono } from 'hono'
import { createScope, flow, Core } from '@pumped-fn/core-next'

// Flow to test
export namespace GetUser {
  export type Input = { userId: string }
  export type Success = { success: true; user: { id: string; name: string } }
  export type NotFound = { success: false; reason: 'USER_NOT_FOUND' }
  export type Result = Success | NotFound
}

export const getUser = flow(
  async (_ctx, input: GetUser.Input): Promise<GetUser.Result> => {
    if (input.userId === 'user-123') {
      return { success: true, user: { id: 'user-123', name: 'Alice' } }
    }
    return { success: false, reason: 'USER_NOT_FOUND' }
  }
)

// Hono app
export function createApp(scope: Core.Scope) {
  const app = new Hono()

  app.get('/users/:id', async (c) => {
    const userId = c.req.param('id')

    const result = await scope.exec(getUser, { userId })

    if (!result.success) {
      return c.json({ error: result.reason }, 404)
    }

    return c.json(result.user)
  })

  return app
}

describe('Hono integration tests', () => {
  let scope: Core.Scope
  let app: Hono
  let baseUrl: string
  let server: ReturnType<typeof Bun.serve>

  beforeAll(async () => {
    scope = createScope()
    app = createApp(scope)

    // Start real HTTP server
    server = Bun.serve({
      port: 0,  // Random available port
      fetch: app.fetch
    })

    baseUrl = `http://localhost:${server.port}`
  })

  afterAll(async () => {
    server.stop()
    await scope.dispose()
  })

  test('GET /users/:id returns user when found', async () => {
    const response = await fetch(`${baseUrl}/users/user-123`)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual({ id: 'user-123', name: 'Alice' })
  })

  test('GET /users/:id returns 404 when not found', async () => {
    const response = await fetch(`${baseUrl}/users/unknown`)
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data).toEqual({ error: 'USER_NOT_FOUND' })
  })
})
```

**Key principles:**
- Start real HTTP server in beforeAll
- Use random port (avoid conflicts)
- Stop server in afterAll
- Test actual HTTP requests/responses
- Test status codes and response bodies

---

## Pattern: Testing File System Operations

Test real file operations:

```typescript
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createScope, provide, derive } from '@pumped-fn/core-next'
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Real file system executor
export const fsOps = provide(() => ({
  read: readFile,
  write: writeFile,
  delete: rm,
  createDir: mkdir
}))

// File repository
export const fileRepository = derive(
  { fs: fsOps },
  ({ fs }) => ({
    save: async (path: string, content: string): Promise<void> => {
      await fs.write(path, content, 'utf-8')
    },
    load: async (path: string): Promise<string> => {
      return fs.read(path, 'utf-8')
    },
    remove: async (path: string): Promise<void> => {
      await fs.delete(path)
    }
  })
)

describe('fileRepository integration tests', () => {
  let scope: Core.Scope
  let repo: Awaited<ReturnType<typeof fileRepository['factory']>>
  let testDir: string

  beforeAll(async () => {
    scope = createScope()
    repo = await scope.resolve(fileRepository)

    // Create temp directory for tests
    testDir = join(tmpdir(), `pumped-test-${Date.now()}`)
    const fs = await scope.resolve(fsOps)
    await fs.createDir(testDir, { recursive: true })
  })

  afterAll(async () => {
    // Cleanup temp directory
    const fs = await scope.resolve(fsOps)
    await fs.delete(testDir, { recursive: true, force: true })
    await scope.dispose()
  })

  test('saves and loads file content', async () => {
    const filePath = join(testDir, 'test.txt')
    const content = 'Hello, World!'

    await repo.save(filePath, content)
    const loaded = await repo.load(filePath)

    expect(loaded).toBe(content)
  })

  test('removes file successfully', async () => {
    const filePath = join(testDir, 'to-delete.txt')

    await repo.save(filePath, 'content')
    await repo.remove(filePath)

    await expect(repo.load(filePath)).rejects.toThrow()
  })

  test('throws when loading non-existent file', async () => {
    const filePath = join(testDir, 'nonexistent.txt')

    await expect(repo.load(filePath)).rejects.toThrow()
  })
})
```

**Key principles:**
- Use temp directory (tmpdir())
- Create test directory in beforeAll
- Clean up directory in afterAll
- Test real file operations (not mocked)
- Test error cases (missing files)

---

## Pattern: Testing Concurrent Operations

Test real concurrency issues:

```typescript
import { describe, test, expect } from 'vitest'
import { createScope, flow } from '@pumped-fn/core-next'

describe('concurrent operations integration', () => {
  test('ctx.parallel() executes flows concurrently', async () => {
    const timestamps: number[] = []

    const delayedFlow = flow(async (_ctx, delay: number) => {
      const start = Date.now()
      timestamps.push(start)
      await new Promise(resolve => setTimeout(resolve, delay))
      return Date.now() - start
    })

    const parentFlow = flow(async (ctx, _input: void) => {
      const promise1 = ctx.exec(delayedFlow, 100)
      const promise2 = ctx.exec(delayedFlow, 100)
      const promise3 = ctx.exec(delayedFlow, 100)

      const result = await ctx.parallel([promise1, promise2, promise3])

      return result.results
    })

    const scope = createScope()
    const durations = await scope.exec(parentFlow, undefined)

    // All flows started roughly at same time (concurrent)
    const maxTimeDiff = Math.max(...timestamps) - Math.min(...timestamps)
    expect(maxTimeDiff).toBeLessThan(50)  // Started within 50ms

    // All flows took ~100ms
    durations.forEach(duration => {
      expect(duration).toBeGreaterThanOrEqual(90)
      expect(duration).toBeLessThan(150)
    })

    await scope.dispose()
  })

  test('sequential execution takes longer than parallel', async () => {
    const sequentialFlow = flow(async (ctx, _input: void) => {
      const start = Date.now()

      const result1 = await ctx.exec(
        flow(async () => {
          await new Promise(resolve => setTimeout(resolve, 50))
          return 1
        }),
        undefined
      )

      const result2 = await ctx.exec(
        flow(async () => {
          await new Promise(resolve => setTimeout(resolve, 50))
          return 2
        }),
        undefined
      )

      return Date.now() - start
    })

    const parallelFlow = flow(async (ctx, _input: void) => {
      const start = Date.now()

      const promise1 = ctx.exec(
        flow(async () => {
          await new Promise(resolve => setTimeout(resolve, 50))
          return 1
        }),
        undefined
      )

      const promise2 = ctx.exec(
        flow(async () => {
          await new Promise(resolve => setTimeout(resolve, 50))
          return 2
        }),
        undefined
      )

      await ctx.parallel([promise1, promise2])

      return Date.now() - start
    })

    const scope = createScope()

    const sequentialTime = await scope.exec(sequentialFlow, undefined)
    const parallelTime = await scope.exec(parallelFlow, undefined)

    // Sequential takes ~100ms, parallel takes ~50ms
    expect(sequentialTime).toBeGreaterThanOrEqual(90)
    expect(parallelTime).toBeLessThan(sequentialTime)

    await scope.dispose()
  })
})
```

**Key principles:**
- Test actual timing (not mocked delays)
- Verify concurrent execution happens
- Compare sequential vs parallel performance
- Use real setTimeout/Promise delays

---

## When to Use Integration vs Unit Tests

| Scenario | Unit Test (preset) | Integration Test (real) |
|----------|-------------------|------------------------|
| Business logic validation | ✅ Preferred | ❌ Overkill |
| Database queries | ⚠️ Simple cases | ✅ Preferred |
| HTTP endpoints | ❌ Not possible | ✅ Required |
| File system ops | ⚠️ Simple cases | ✅ Preferred |
| Resource cleanup | ❌ Can't verify | ✅ Required |
| Error handling | ✅ Preferred | ⚠️ Supplement |
| Edge cases | ✅ Preferred | ❌ Overkill |
| Concurrency | ❌ Can't verify | ✅ Required |

**Strategy:**
1. Start with unit tests (fast, deterministic)
2. Add integration tests for:
   - Database interactions
   - HTTP/API integration
   - File system operations
   - Resource lifecycle
   - Concurrency/timing issues
3. Use integration tests sparingly (slower, setup overhead)

---

## Troubleshooting

### Problem: Integration tests fail in CI but pass locally

**Cause:** Different environment (ports, paths, database config)

**Solution:**
```typescript
// ✅ Use environment variables for config
const testDbConfig = {
  host: process.env.TEST_DB_HOST || 'localhost',
  port: parseInt(process.env.TEST_DB_PORT || '5432'),
  database: process.env.TEST_DB_NAME || 'test_db'
}

// ✅ Use random ports for HTTP servers
server = Bun.serve({
  port: 0,  // Random available port
  fetch: app.fetch
})
```

### Problem: Tests interfere with each other

**Cause:** Shared database state or concurrent writes

**Solution:**
```typescript
// ✅ Clean database before each test
beforeEach(async () => {
  await repo.deleteAll()
})

// ✅ Use unique test data per test
test('test 1', async () => {
  await repo.create({ email: 'test1@example.com', name: 'Test 1' })
})

test('test 2', async () => {
  await repo.create({ email: 'test2@example.com', name: 'Test 2' })
})
```

### Problem: Resource cleanup not happening

**Cause:** Forgot to call scope.dispose() or error in cleanup

**Solution:**
```typescript
// ✅ Always dispose scope in afterAll
afterAll(async () => {
  await scope.dispose()
})

// ✅ Use try/finally for critical cleanup
afterAll(async () => {
  try {
    await scope.dispose()
  } finally {
    // Additional cleanup (delete temp files, etc.)
  }
})
```

### Problem: Integration tests too slow

**Cause:** Too many integration tests or inefficient setup

**Solution:**
- Use unit tests for edge cases (faster)
- Share scope across tests (setup once in beforeAll)
- Run integration tests in parallel (Vitest pool)
- Use faster test database (in-memory SQLite)

```typescript
// ✅ Share scope for faster tests
let scope: Core.Scope

beforeAll(async () => {
  scope = createScope({ /* config */ })
})

afterAll(async () => {
  await scope.dispose()
})

beforeEach(async () => {
  // Only clean data, don't recreate scope
  await cleanDatabase()
})
```

---

## Summary

**Integration testing:**
- Use real resources (test DB, real FS)
- Test resource lifecycle (cleanup)
- Test actual HTTP requests
- Test concurrency and timing
- Setup in beforeAll, cleanup in afterAll
- Use unit tests for edge cases
- Integration tests for critical paths

**Related sub-skills:**
- `testing-utilities.md` - Unit testing pure functions
- `testing-flows.md` - Integration testing flows with preset()
- `resource-basic.md` - Resource lifecycle patterns
- `integration-hono.md` - Hono HTTP integration

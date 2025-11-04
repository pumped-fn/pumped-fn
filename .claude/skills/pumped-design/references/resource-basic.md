---
name: resource-basic
tags: resource, add, config, lifecycle, provide, cleanup, external
description: Standalone resources for external systems (database, HTTP clients, cache) using provide(). Includes configuration via tags, lifecycle management with controller.cleanup(), and proper resource disposal patterns.
---

# Resource: Basic Patterns

## When to Use

Use basic resources (`provide()`) when:

- Integrating external systems (database pools, HTTP clients, cache connections)
- Managing stateful connections with lifecycle (open/close, connect/dispose)
- Wrapping third-party libraries with cleanup requirements
- Creating resources that don't depend on other resources

**Don't use for:**
- Resources depending on other resources (use `derive()` instead)
- Business logic (belongs in flows)
- Data access operations (belongs in repositories via `derive()`)

---

## Code Template


See: `dbPool` in skill-examples/resources-basic.ts

```typescript
import { provide, tag, custom } from '@pumped-fn/core-next'
import { Pool } from 'pg'

// Configuration via tags
export const dbConfig = tag(custom<{
  host: string
  port: number
  database: string
}>(), { label: 'config.database' })

// Basic resource with lifecycle
export const dbPool = provide((controller) => {
  const config = dbConfig.extractFrom(controller.scope)

  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    max: 20
  })

  // Register cleanup
  controller.cleanup(async () => {
    await pool.end()
  })

  // Return resource interface
  return {
    query: async <T>(sql: string, params: any[]): Promise<T[]> => {
      const result = await pool.query(sql, params)
      return result.rows
    }
  }
})
```

---

## Real Examples from Pumped-fn Tests

### Example 1: Simple Resource (packages/next/tests/core.test.ts)


See: `basicSimpleExecutor` in skill-examples/resources-basic.ts

```typescript
const baseExecutor = provide(() => {
  executionOrder.push("base")
  return 1
})
```

### Example 2: Async Resource with Lifecycle (packages/next/tests/core.test.ts)


See: `basicDbConnection` in skill-examples/resources-basic.ts

```typescript
const dbConnection = provide(() => {
  dbConnectionCount++
  return { connected: true, id: dbConnectionCount }
})
```

### Example 3: Resource with Configuration (packages/next/tests/core.test.ts)


See: `basicConfigWithFlow` in skill-examples/resources-basic.ts

```typescript
const config = provide(() => ({ multiplier: 3 }))

const multiplyFlow = flow(config, (deps, _ctx, input: number) => {
  return input * deps.multiplier
})
```

### Example 4: Resource with Cleanup (from templates.md)


See: `dbPoolWithTransaction` in skill-examples/resources-basic.ts

```typescript
const dbPool = provide((controller) => {
  const pool = new Pool({ /* config */ })

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
```

---

## Configuration Pattern

**ALWAYS use tags for configuration, NEVER access process.env directly inside resources.**


See: `externalApiWithTags` in skill-examples/resources-basic.ts

```typescript
// ✅ Correct: Configuration via tags
export const apiUrl = tag(custom<string>(), { label: 'config.apiUrl' })
export const apiKey = tag(custom<string>(), { label: 'config.apiKey' })

export const externalApi = provide((controller) => {
  const url = apiUrl.extractFrom(controller.scope)
  const key = apiKey.extractFrom(controller.scope)

  return {
    get: async <T>(path: string): Promise<T> => {
      const response = await fetch(`${url}${path}`, {
        headers: { 'Authorization': `Bearer ${key}` }
      })
      if (!response.ok) throw new Error(`API error: ${response.status}`)
      return response.json()
    }
  }
})

// ❌ Wrong: Direct environment access
export const externalApi = provide(() => {
  const url = process.env.API_URL  // NEVER do this
  // ...
})
```

**Why tags?** Configuration is provided at scope creation, making resources testable with `preset()`.

---

## Lifecycle Management

Resources with cleanup must register via `controller.cleanup()`:


See: `dbPoolWithCleanup` in skill-examples/resources-basic.ts

```typescript
// ✅ Proper cleanup registration
export const dbPool = provide((controller) => {
  const pool = new Pool({ /* config */ })

  controller.cleanup(async () => {
    await pool.end()
  })

  return { query: async (sql, params) => { /* ... */ } }
})

// ❌ No cleanup - connection leak
export const dbPool = provide(() => {
  const pool = new Pool({ /* config */ })
  return { query: async (sql, params) => { /* ... */ } }
})
```

**When to register cleanup:**
- Database connections
- HTTP clients with connection pools
- File handles
- Cache connections
- WebSocket connections
- Timers/intervals

---

## Troubleshooting

### Problem: "Resource is resolved multiple times"

**Symptom:** Resource initialization runs multiple times per scope

**Cause:** Resource is not cached by scope

**Solution:** Resources are automatically cached by scope. If seeing multiple initializations, check if creating multiple scopes accidentally.

```typescript
// ❌ Wrong: Creating multiple scopes
const scope1 = createScope()
const scope2 = createScope()
await scope1.resolve(dbPool)  // Initializes dbPool
await scope2.resolve(dbPool)  // Initializes dbPool again

// ✅ Correct: Single scope
const scope = createScope()
await scope.resolve(dbPool)  // Initializes dbPool
await scope.resolve(dbPool)  // Uses cached instance
```

---

### Problem: "Cleanup not running on scope.dispose()"

**Symptom:** Resources not cleaned up, connections remain open

**Cause:** Cleanup not registered via `controller.cleanup()`

**Solution:**

```typescript
// ❌ Wrong: No cleanup registration
export const dbPool = provide(() => {
  const pool = new Pool({ /* config */ })
  return { query: async (sql, params) => { /* ... */ } }
})

// ✅ Correct: Register cleanup
export const dbPool = provide((controller) => {
  const pool = new Pool({ /* config */ })

  controller.cleanup(async () => {
    await pool.end()
  })

  return { query: async (sql, params) => { /* ... */ } }
})
```

---

### Problem: "Cannot access process.env in tests"

**Symptom:** Tests fail because environment variables not available

**Cause:** Accessing process.env directly inside resource

**Solution:** Use tags for configuration

```typescript
// ❌ Wrong: Direct environment access
export const apiClient = provide(() => {
  const apiKey = process.env.API_KEY
  return { get: (path) => fetch(path, { headers: { 'Authorization': apiKey }}) }
})

// ✅ Correct: Configuration via tags
export const apiKey = tag(custom<string>(), { label: 'config.apiKey' })

export const apiClient = provide((controller) => {
  const key = apiKey.extractFrom(controller.scope)
  return { get: (path) => fetch(path, { headers: { 'Authorization': key }}) }
})

// Test with preset
const scope = createScope({
  presets: [preset(apiKey, 'test-key-123')]
})
```

---

### Problem: "TypeScript error: Property 'controller' does not exist"

**Symptom:** TypeScript error when trying to access controller

**Cause:** Not using controller parameter correctly

**Solution:**

```typescript
// ❌ Wrong: No controller parameter
export const resource = provide(() => {
  controller.cleanup(() => {})  // Error: controller not in scope
})

// ✅ Correct: Accept controller parameter
export const resource = provide((controller) => {
  controller.cleanup(() => {})
  return {}
})
```

---

## Related Sub-skills

- **resource-derived.md** - Resources depending on other resources
- **resource-lazy.md** - Lazy/conditional resource loading
- **coding-standards.md** - Type safety, naming conventions
- **testing-utilities.md** - Testing resources with preset()
- **entrypoint-patterns.md** - Scope creation and configuration

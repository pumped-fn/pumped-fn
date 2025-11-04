---
name: resource-derived
tags: resource, add, dependencies, derive, repository, data-access
description: Derived resources that depend on other resources using derive(). Common for repositories, services, and data access layers that need database connections or other resources.
---

# Resource: Derived Patterns

## When to Use

Use derived resources (`derive()`) when:

- Creating repositories that depend on database connections
- Building services that need multiple resources
- Composing resources from other resources
- Creating data access layers
- Implementing domain-specific operations on top of generic resources

**Don't use for:**
- Standalone resources with no dependencies (use `provide()`)
- Business logic with validation/orchestration (use `flow()`)
- Resources that need lifecycle management (use `provide()` with controller)

---

## Code Template


See: `userRepository` in skill-examples/resources-derived.ts

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
}

// Derived resource depending on dbPool
export const userRepository = derive({ db: dbPool }, ({ db }) => ({
  findById: async (id: string): Promise<UserRepo.User | null> => {
    const rows = await db.query<UserRepo.User>(
      'SELECT id, email, name, created_at as "createdAt" FROM users WHERE id = $1',
      [id]
    )
    return rows[0] || null
  },

  create: async (input: UserRepo.CreateInput): Promise<UserRepo.User> => {
    const rows = await db.query<UserRepo.User>(
      'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id, email, name, created_at as "createdAt"',
      [input.email, input.name]
    )
    return rows[0]
  }
}))
```

---

## Real Examples from Pumped-fn Tests

### Example 1: Simple Derived Resource (packages/next/tests/core.test.ts)


See: `derivedSimpleDependency` in skill-examples/resources-derived.ts

```typescript
const baseExecutor = provide(() => {
  executionOrder.push("base")
  return 1
})

const dependentExecutor = derive(
  { base: baseExecutor },
  (deps: { base: number }) => {
    executionOrder.push("dependent")
    return deps.base + 1
  }
)
```

### Example 2: Mixed Sync/Async Dependencies (packages/next/tests/core.test.ts)


See: `derivedMixedDependencies` in skill-examples/resources-derived.ts

```typescript
const syncDependency = provide(() => 1)
const asyncDependency = provide(async () => {
  await new Promise((resolve) => setTimeout(resolve, 1))
  return 2
})

const combinedExecutor = derive(
  { sync: syncDependency, async: asyncDependency },
  (deps: { sync: number; async: number }) => deps.sync + deps.async
)

// Result: 3
```

### Example 3: Service with Database (packages/next/tests/core.test.ts)


See: `derivedServiceWithDb` in skill-examples/resources-derived.ts

```typescript
const dbConnection = provide(() => {
  dbConnectionCount++
  return { connected: true, id: dbConnectionCount }
})

const service = derive({ db: dbConnection }, ({ db }) => {
  serviceResolveCount++
  return { db, count: serviceResolveCount }
})
```

### Example 4: Multiple Named Dependencies (packages/next/tests/core.test.ts)


See: `derivedMultipleDependencies` in skill-examples/resources-derived.ts

```typescript
const dependencyA = provide(() => "a")
const dependencyB = provide(() => "b")
const dependencyC = provide(() => "c")

const executorWithDependencies = derive(
  { depA: dependencyA, depB: dependencyB, depC: dependencyC },
  (deps) => deps
)
```

### Example 5: Repository with Database Pool (from templates.md)


See: `userRepositoryFullCrud` in skill-examples/resources-derived.ts

```typescript
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

---

## Dependency Patterns

### Single Dependency


See: `derivedSingleDependencyPatterns` in skill-examples/resources-derived.ts

```typescript
// Object destructuring (recommended)
const derived = derive({ base }, ({ base }) => base * 2)

// Direct value (simpler for single deps)
const derived = derive(base, (val) => val * 2)
```

### Multiple Dependencies


See: `derivedMultipleServices` in skill-examples/resources-derived.ts

```typescript
// Always use object destructuring
const derived = derive(
  { db: dbPool, logger, cache },
  ({ db, logger, cache }) => ({
    get: async (key: string) => {
      logger.info('Getting key', { key })
      const cached = await cache.get(key)
      if (cached) return cached

      const result = await db.query('SELECT * FROM data WHERE key = $1', [key])
      await cache.set(key, result)
      return result
    }
  })
)
```

---

## Type Safety

### Explicit Types for Exports

```typescript
// ✅ Export clean interface
export type UserRepository = {
  findById: (id: string) => Promise<UserRepo.User | null>
  create: (input: UserRepo.CreateInput) => Promise<UserRepo.User>
}

export const userRepository = derive(
  { db: dbPool },
  ({ db }): UserRepository => ({
    findById: async (id) => { /* ... */ },
    create: async (input) => { /* ... */ }
  })
)

// ❌ Don't expose implementation types
export const userRepository = derive(
  { db: dbPool },
  ({ db }): { db: Pool, findById: ... } => {  // Exposes Pool
    // ...
  }
)
```

### Type Inference

```typescript
// ✅ Let TypeScript infer internal types
const derived = derive(
  { db: dbPool },
  ({ db }) => ({  // Types inferred from dbPool
    query: (sql: string) => db.query(sql, [])
  })
)

// ❌ Don't explicitly type internals
const derived = derive(
  { db: dbPool },
  ({ db }: { db: DatabasePool }) => {  // Redundant
    // ...
  }
)
```

---

## Troubleshooting

### Problem: "Derived resource not receiving dependencies"

**Symptom:** Dependencies are undefined or null in derived resource

**Cause:** Dependencies not resolved by scope before derived resource

**Solution:** Dependencies are automatically resolved. Check if dependencies are correctly defined:

```typescript
// ❌ Wrong: Typo in dependency name
const derived = derive({ db: dbPool }, ({ database }) => {
  // database is undefined, should be 'db'
})

// ✅ Correct: Consistent naming
const derived = derive({ db: dbPool }, ({ db }) => {
  // db is correctly resolved
})
```

---

### Problem: "Circular dependency detected"

**Symptom:** Error about circular dependencies during resolution

**Cause:** Resource A depends on B, B depends on A

**Solution:** Refactor to break the cycle:

```typescript
// ❌ Wrong: Circular dependency
const serviceA = derive({ b: serviceB }, ({ b }) => ({ callB: () => b.method() }))
const serviceB = derive({ a: serviceA }, ({ a }) => ({ callA: () => a.method() }))

// ✅ Correct: Extract shared dependency
const shared = provide(() => ({ data: {} }))
const serviceA = derive({ shared }, ({ shared }) => ({ useShared: () => shared.data }))
const serviceB = derive({ shared }, ({ shared }) => ({ useShared: () => shared.data }))
```

---

### Problem: "Derived resource resolved multiple times"

**Symptom:** Initialization code runs multiple times

**Cause:** Same as basic resources - multiple scopes

**Solution:**

```typescript
// ✅ Correct: Single scope resolves once
const scope = createScope()
const repo1 = await scope.resolve(userRepository)  // Initializes
const repo2 = await scope.resolve(userRepository)  // Uses cached
expect(repo1).toBe(repo2)  // Same instance
```

---

### Problem: "TypeScript error: Type 'X' is not assignable"

**Symptom:** Type mismatch between dependency and usage

**Cause:** Dependency types don't match what's expected

**Solution:** Check dependency types match:

```typescript
// ❌ Wrong: Type mismatch
const dbPool = provide(() => ({ query: (sql: string) => [] }))
const repo = derive({ db: dbPool }, ({ db }) => ({
  get: () => db.execute('SELECT')  // Error: 'execute' doesn't exist
}))

// ✅ Correct: Use correct method name
const repo = derive({ db: dbPool }, ({ db }) => ({
  get: () => db.query('SELECT')
}))
```

---

### Problem: "Derived resource has no cleanup"

**Symptom:** Need to cleanup derived resource but no controller available

**Cause:** `derive()` doesn't provide controller parameter

**Solution:** Put cleanup in base resource via `provide()`:

```typescript
// ❌ Wrong: Trying to cleanup in derived resource
const repo = derive({ db }, ({ db }) => {
  controller.cleanup(() => {})  // Error: controller not available
})

// ✅ Correct: Cleanup in base resource
const dbPool = provide((controller) => {
  const pool = new Pool()
  controller.cleanup(async () => await pool.end())
  return pool
})

const repo = derive({ db: dbPool }, ({ db }) => ({
  // No cleanup needed - db will cleanup itself
}))
```

---

## Related Sub-skills

- **resource-basic.md** - Basic resources with provide()
- **resource-lazy.md** - Lazy/conditional loading
- **coding-standards.md** - Type safety and naming
- **testing-utilities.md** - Testing with preset()
- **flow-subflows.md** - Using repositories in flows

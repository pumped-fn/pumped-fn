---
title: Executors and Dependencies
description: Creating executors with provide() and derive() for dependency injection
keywords: [executor, provide, derive, dependencies, graph resolution]
related:
  - guides/02-tags-the-type-system
  - guides/03-scope-lifecycle
  - guides/04-type-inference-patterns
---

# Executors and Dependencies

## What are Executors?

Executors are nodes in a dependency graph. Each executor:
- Holds a factory function that produces a value
- Declares dependencies on other executors
- Gets resolved by a scope when needed

**Think of executors as declarations, not values.** The scope actualizes them.

## Creating Executors

### provide() - No Dependencies

Use `provide()` for executors without dependencies:

<<< @/../examples/http-server/basic-handler.ts#provide-basic{ts}

The factory function runs when the executor is resolved:

```typescript
const scope = createScope()
const cfg = await scope.resolve(config)
// Factory runs here, returns { port: 3000, env: 'development', ... }
```

### derive() - With Dependencies

Use `derive()` when you need dependencies:

<<< @/../examples/http-server/basic-handler.ts#derive-single-dep{ts}

**Single dependency** - Direct parameter:

```typescript
derive(dependency, (dep) => {
  // dep is typed from dependency executor
})
```

**Multiple dependencies** - Destructure object:

<<< @/../examples/http-server/basic-handler.ts#derive-multi-deps{ts}

## Type Inference

Types flow automatically through destructuring:

```typescript
// Config executor infers: { port: number, env: string, dbHost: string }
const config = provide(() => ({
  port: 3000,
  env: 'development',
  dbHost: 'localhost'
}))

// cfg parameter infers from config executor
const db = derive(config, (cfg) => {
  cfg.port  // number - fully typed
  cfg.dbHost  // string - no annotations needed
})
```

See [Type Inference Patterns](./04-type-inference-patterns.md) for details.

## Dependency Resolution

The scope resolves dependencies automatically:

<<< @/../examples/http-server/basic-handler.ts#scope-resolution{ts}

Resolution order:
1. `config` executor runs (no dependencies)
2. `dbConnection` executor runs (depends on config)
3. `userService` executor runs (depends on db and config)

**Values are cached** - each executor runs once per scope.

## Executor Lifecycle

```typescript
const scope = createScope()

// First resolution - factory runs
const service1 = await scope.resolve(userService)

// Second resolution - returns cached value
const service2 = await scope.resolve(userService)

// service1 === service2 (same instance)

// Cleanup
await scope.dispose()
```

## Common Patterns

### Configuration

```typescript
const appConfig = provide(() => ({
  port: parseInt(process.env.PORT || '3000'),
  env: process.env.NODE_ENV || 'development',
  dbHost: process.env.DB_HOST || 'localhost'
}))
```

### Database Connection

```typescript
const db = derive({ config: appConfig }, ({ config }) => ({
  query: async (sql: string, params: any[]) => {
    // Implementation
  },
  close: async () => {
    // Cleanup
  }
}))
```

### Service Layer

```typescript
const userService = derive(
  { db: dbConnection, config: appConfig },
  ({ db, config }) => ({
    getUser: (id: string) => db.query('...'),
    createUser: (data: UserData) => db.query('...'),
    deleteUser: (id: string) => db.query('...')
  })
)
```

## Tags for Metadata

Attach tags to executors for type-safe metadata:

```typescript
import { tag, custom } from '@pumped-fn/core-next'

const serviceName = tag(custom<string>(), { label: 'service.name' })

const userService = provide(
  () => ({ getUser: (id) => ... }),
  serviceName('UserService')
)
```

See [Tags: The Type System](./02-tags-the-type-system.md) for details.

## Testing with preset()

Override executors in tests:

```typescript
import { preset } from '@pumped-fn/core-next'

test('userService fetches user', async () => {
  const mockDb = { query: vi.fn(() => [{ id: '123' }]) }

  const scope = createScope({
    presets: [preset(dbConnection, mockDb)]
  })

  const service = await scope.resolve(userService)
  const user = await service.getUser('123')

  expect(user.id).toBe('123')
  await scope.dispose()
})
```

## Verification

All examples type-check:

```bash
pnpm -F @pumped-fn/core-next typecheck:full
```

## Summary

**Executors = Dependency declarations**

- Use `provide()` for no dependencies
- Use `derive()` with dependencies
- Destructure for type inference
- Scope resolves the graph
- Values cached per scope

## See Also
- [Scope Lifecycle](./03-scope-lifecycle.md) - Managing scopes
- [Tags: The Type System](./02-tags-the-type-system.md) - Type-safe metadata
- [Type Inference Patterns](./04-type-inference-patterns.md) - Zero-annotation typing

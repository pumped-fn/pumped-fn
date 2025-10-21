---
title: API Cheatsheet
description: Quick reference for all core APIs
keywords: [api, reference, cheatsheet]
---

# API Cheatsheet

## Executors

### provide()
```typescript
import { provide } from '@pumped-fn/core-next'

// No dependencies
const config = provide(() => ({
  port: 3000,
  env: 'development'
}))
```

### derive()
```typescript
import { derive } from '@pumped-fn/core-next'

// Single dependency
const db = derive(config, (cfg) => createConnection(cfg))

// Multiple dependencies (object)
const service = derive(
  { db, config },
  ({ db, config }) => ({
    method: () => {}
  })
)
```

### preset()
```typescript
import { preset } from '@pumped-fn/core-next'

// Override executor in tests
const scope = createScope({
  presets: [preset(dbExecutor, mockDb)]
})
```

## Scope

### createScope()
```typescript
import { createScope } from '@pumped-fn/core-next'

const scope = createScope()

// With tags
const scope = createScope({
  tags: [
    appConfig({ port: 3000 }),
    logger(console)
  ]
})

// With presets
const scope = createScope({
  presets: [preset(db, mockDb)]
})
```

### scope.resolve()
```typescript
// Resolve executor
const service = await scope.resolve(userService)

// Returns Promised<T>
const promised = scope.resolve(userService)
const service = await promised
```

### scope.dispose()
```typescript
// Cleanup all resources
await scope.dispose()
```

## Tags

### tag()
```typescript
import { tag, custom } from '@pumped-fn/core-next'

// Basic tag
const userId = tag(custom<string>(), { label: 'user.id' })

// With default
const retryCount = tag(custom<number>(), {
  label: 'retry.count',
  default: 3
})
```

### Tag access
```typescript
// .get() - throws if not found
const value = tag.get(container)  // T

// .find() - returns undefined
const value = tag.find(container)  // T | undefined

// .set() - type-safe
tag.set(container, value)  // value must match T
```

### Tag usage
```typescript
// In scope
const config = appConfig.get(scope)

// In flow context
const userId = userId.get(ctx)
ctx.set(userId, "123")

// In any container
const value = tag.find(store)
```

## Flow

### flow()
```typescript
import { flow } from '@pumped-fn/core-next'

// Basic flow
const handler = flow((ctx, input: Request) => {
  return { status: 200 }
})

// With dependencies
const handler = flow({ db, config }, (deps, ctx, input) => {
  return deps.db.query('...')
})
```

### flow.define()
```typescript
import { custom } from '@pumped-fn/core-next'

const handler = flow.define({
  name: 'handleRequest',
  input: custom<Request>(),
  output: custom<Response>()
}).handler((ctx, input) => {
  return { status: 200 }
})
```

### flow.execute()
```typescript
// Execute flow
const result = await flow.execute(handler, input)

// With options
const result = await flow.execute(handler, input, {
  scope: existingScope,
  extensions: [loggingExtension],
  tags: [requestId("req-123")]
})
```

### Flow Context

```typescript
flow((ctx, input) => {
  // Get/set tags
  const id = ctx.get(userId)
  ctx.set(requestId, "req-123")

  // Run with journaling
  const result = await ctx.run("step1", () => fetchData())

  // Execute subflow
  const data = await ctx.exec(subFlow, input)

  // Parallel execution
  const results = await ctx.parallel([
    promise1,
    promise2
  ])
})
```

## Promised

### Methods
```typescript
import { Promised } from '@pumped-fn/core-next'

// .map() - transform value
promised.map(value => value * 2)

// .switch() - chain Promised
promised.switch(value => otherPromised)

// .catch() - error handling
promised.catch(error => fallbackValue)
```

### Static methods
```typescript
// Parallel resolution
Promised.all([p1, p2, p3])

// With failure handling
Promised.allSettled([p1, p2, p3])
  .fulfilled()  // Get successful values
  .rejected()   // Get errors
  .partition()  // Get both
```

## Extension

### extension()
```typescript
import { extension } from '@pumped-fn/core-next'

const logger = extension({
  name: 'logging',
  wrap(ctx, next, operation) {
    console.log(`Starting ${operation.kind}`)
    const result = await next()
    console.log(`Finished ${operation.kind}`)
    return result
  }
})
```

## Type Inference Rules

```typescript
// Single dep → direct parameter
derive(db, (db) => {})

// Multiple deps → destructure object
derive({ db, config }, ({ db, config }) => {})

// Return type → inferred from implementation
const service = derive({ db }, ({ db }) => ({
  method: () => db.query('...')  // Return type inferred
}))
```

## Verification

```bash
# Check types
pnpm -F @pumped-fn/core-next typecheck:full

# Run tests
pnpm -F @pumped-fn/core-next test
```

## See Also

- [Type Verification](./type-verification.md)
- [Common Mistakes](./common-mistakes.md)
- [Error Solutions](./error-solutions.md)

---
title: Tags - The Type System
description: How tags provide compile-time type safety for runtime data access
keywords: [tag, type safety, typed accessor, context, metadata]
related:
  - guides/01-executors-and-dependencies
  - guides/03-scope-lifecycle
  - guides/05-flow-basics
---

# Tags: The Type System

## The Problem Tags Solve

Traditional runtime data access loses type safety:

```typescript
// ❌ No compile-time safety
const config = scope.get('appConfig')  // any
const port = config.port               // Runtime error if config is wrong shape

// ❌ Context access with type casting
ctx.get<AppConfig>('config')          // Lies to TypeScript, no validation
```

Tags restore compile-time type safety:

```typescript
// ✅ Tag carries type information
const appConfig = tag(custom<AppConfig>(), { label: 'app.config' })

const config = appConfig.get(scope)    // AppConfig - enforced by tag
const port = config.port               // ✓ Type-safe property access

ctx.get(appConfig)                     // AppConfig - no casting needed
ctx.set(appConfig, { port: 3000 })     // ✓ Value must match AppConfig
ctx.set(appConfig, "invalid")          // ✗ Compile error
```

## Creating Tags

Tags are typed accessors that work with any container:

<<< @/../examples/http-server/shared/tags.ts#L8-L30{ts}

### Basic Tag Creation

```typescript
import { tag, custom } from '@pumped-fn/core-next'

const userId = tag(custom<string>(), { label: 'user.id' })
const requestId = tag(custom<string>(), { label: 'request.id' })
```

### Tags With Defaults

```typescript
const logger = tag(custom<Console>(), {
  label: 'app.logger',
  default: console  // Fallback value
})

const retryCount = tag(custom<number>(), {
  label: 'retry.count',
  default: 3
})
```

## Using Tags: .get() vs .find()

**Rule:** Use `.get()` for required values, `.find()` for optional.

```typescript
// .get() throws if not found - use for required values
const config = appConfig.get(scope)  // AppConfig | throws

// .find() returns undefined - use for optional values
const userId = requestId.find(scope) // string | undefined

if (userId) {
  console.log(`User: ${userId}`)
}

// .find() with default returns default value
const retries = retryCount.find(scope)  // number (uses default: 3)
```

## Tags Work Everywhere

Tags provide type-safe access across all library concepts:

### In Scopes

```typescript
import { createScope } from '@pumped-fn/core-next'
import { appConfig, logger } from './shared/tags'

const scope = createScope({
  tags: [
    appConfig({
      port: 8080,
      env: 'production',
      dbHost: 'prod-db.example.com'
    }),
    logger(console)
  ]
})

const config = appConfig.get(scope)  // AppConfig
const log = logger.get(scope)        // Console
```

### In Executors

```typescript
import { provide } from '@pumped-fn/core-next'
import { appConfig } from './shared/tags'

const dbConnection = provide(
  () => createConnection({ host: 'localhost' }),
  appConfig({ port: 5432, env: 'development', dbHost: 'localhost' })
)
```

### In Flow Context

```typescript
import { flow } from '@pumped-fn/core-next'
import { requestId, userId } from './shared/tags'

const handleRequest = flow((ctx, req) => {
  // Type-safe context access
  const reqId = ctx.get(requestId)     // string
  const user = ctx.find(userId)        // string | undefined

  // Type-safe context updates
  ctx.set(requestId, crypto.randomUUID())
  ctx.set(userId, req.headers.userId)

  return { reqId, user }
})
```

### In Extensions

```typescript
import { extension } from '@pumped-fn/core-next'
import { requestId } from './shared/tags'

const loggingExtension = extension({
  name: 'logging',
  wrap(ctx, next, operation) {
    const reqId = requestId.find(ctx)  // string | undefined
    console.log(`[${reqId}] Starting ${operation.kind}`)
    return next()
  }
})
```

## Why Tags Instead of Generics?

Tags provide:
1. **Runtime identity** - Same tag instance across modules
2. **Schema validation** - Runtime checks via StandardSchema
3. **Default values** - Fallback when not present
4. **Searchability** - Find all usages of a tag
5. **No casting** - Type flows from tag definition

Generic parameters lose all of these at runtime.

## Common Mistakes

### ❌ Don't use raw string keys

```typescript
// ❌ Wrong - no type safety
const value = ctx.get('userId')  // any
```

```typescript
// ✅ Right - type-safe
const userId = tag(custom<string>(), { label: 'user.id' })
const value = ctx.get(userId)  // string
```

### ❌ Don't create tags inline

```typescript
// ❌ Wrong - new tag instance each time
function handler(ctx) {
  const userId = tag(custom<string>(), { label: 'user.id' })
  return ctx.get(userId)  // Won't find value (different instance)
}
```

```typescript
// ✅ Right - define once, import everywhere
// shared/tags.ts
export const userId = tag(custom<string>(), { label: 'user.id' })

// handler.ts
import { userId } from './shared/tags'
function handler(ctx) {
  return ctx.get(userId)  // ✓ Finds value
}
```

### ❌ Don't skip schema definitions

```typescript
// ❌ Wrong - loses validation
const config = tag(custom<any>(), { label: 'config' })
```

```typescript
// ✅ Right - proper type and validation
type AppConfig = {
  port: number
  env: 'development' | 'production'
}
const config = tag(custom<AppConfig>(), { label: 'app.config' })
```

## Type Safety in Action

Tags enable zero-annotation type safety:

<<< @/../examples/http-server/tags-foundation.ts#solution-tags{ts}

Notice:
- No type annotations on `config`
- No casting with `as` or `<T>`
- Full type safety from tag definition
- Compile-time verification of property access

## Summary

**Tags = Compile-time type safety for runtime data access**

Every typed value in the library flows through tags:
- Scope configuration → tags
- Executor metadata → tags
- Flow context data → tags
- Extension state → tags

**Learn tags early, use them everywhere.**

## Verification

All examples type-check:

```bash
pnpm -F @pumped-fn/core-next typecheck:full
```

## See Also
- [Type Inference Patterns](./04-type-inference-patterns.md) - Complement tags with proper factory types
- [Flow Basics](./05-flow-basics.md) - Tag-based context in flows
- [Extensions](./09-extensions.md) - Tags in cross-cutting concerns

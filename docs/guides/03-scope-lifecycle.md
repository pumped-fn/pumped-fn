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

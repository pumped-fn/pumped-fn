---
title: Testing Strategies
description: Scope isolation and preset() for mocking
keywords: [testing, mocking, preset, isolation]
---

# Testing Strategies

Test with `preset()` to override executors, scope isolation for test independence, and type-safe mocks.

## Core Pattern

```ts twoslash
import { provide, derive, createScope, preset } from '@pumped-fn/core-next'

const db = provide(() => ({
  query: async (sql: string) => ({ rows: [] as any[] })
}))

const userService = derive({ db }, ({ db }) => ({
  getUser: async (id: string) => {
    const result = await db.query(`SELECT * FROM users WHERE id = '${id}'`)
    return result.rows[0]
  }
}))

const mockDb = {
  query: async (sql: string) => ({
    rows: [{ id: '123', name: 'Test User' }]
  })
}

async function testUserService() {
  const scope = createScope({
    initialValues: [preset(db, mockDb)]
  })

  const service = await scope.resolve(userService)
  const user = await service.getUser('123')

  console.assert(user.name === 'Test User')
  await scope.dispose()
}
```

## Scope Isolation

Each test gets independent scope:

```ts twoslash
import { createScope, preset, provide } from '@pumped-fn/core-next'

const config = provide(() => ({ env: 'prod' }))

async function test1() {
  const scope = createScope({
    initialValues: [preset(config, { env: 'test1' })]
  })

  // Independent from test2
  await scope.dispose()
}

async function test2() {
  const scope = createScope({
    initialValues: [preset(config, { env: 'test2' })]
  })

  // Independent from test1
  await scope.dispose()
}
```

## Type-Safe Mocks

Mocks must match executor types:

```typescript
import { provide } from '@pumped-fn/core-next'

type DB = {
  query: (sql: string) => Promise<{ rows: any[] }>
}

const db = provide(() => ({
  query: async (sql: string) => ({ rows: [] as any[] })
}))

const mockDb: DB = {
  query: async (sql: string) => ({
    rows: [{ mocked: true }]
  })
}
```

TypeScript enforces mock compatibility.

## Flow Testing

Test flows with isolated scope and tags:

```ts twoslash
import { flow, createScope, tag, custom } from '@pumped-fn/core-next'

const userId = tag(custom<string>(), { label: 'user.id' })

const handler = flow((ctx, input: string) => {
  ctx.set(userId, input)
  return { userId: ctx.get(userId) }
})

async function testHandler() {
  const scope = createScope()

  const result = await flow.execute(handler, 'user-123', { scope })

  console.assert(result.userId === 'user-123')
  await scope.dispose()
}
```

## Extension Testing

Test extensions in isolation:

```ts twoslash
import { extension, flow, createScope } from '@pumped-fn/core-next'

const calls: string[] = []

const testExtension = extension({
  name: 'test',
  wrap: async (ctx, next, operation) => {
    calls.push(operation.kind)
    return next()
  }
})

const testFlow = flow((ctx, input: number) => input * 2)

async function runTest() {
  const scope = createScope({
    extensions: [testExtension]
  })

  await flow.execute(testFlow, 21, { scope })

  console.assert(calls.includes('flow'))
  await scope.dispose()
}
```

## Complete Example

<<< @/../examples/http-server/testing-setup.ts

## Testing Checklist

- ✅ Scope per test for isolation
- ✅ Use preset() for mocks
- ✅ Type-safe mock implementations
- ✅ Dispose scopes in cleanup
- ✅ Test extensions separately
- ✅ Test flows with execute()

## See Also

- [Scope Lifecycle](../guides/03-scope-lifecycle.md)
- [Flow Basics](../guides/05-flow-basics.md)
- [Extensions](../guides/09-extensions.md)

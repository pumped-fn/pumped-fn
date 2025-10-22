---
title: Type Inference
description: Zero-annotation TypeScript patterns
keywords: [type inference, destructuring, TypeScript]
---

# Type Inference

All library code infers types completely. No return type annotations. No assertions. No casts.

## Destructure Multi-Dependency Parameters

Critical pattern for type inference to work:

```ts twoslash
import { derive, provide } from '@pumped-fn/core-next'

const db = provide(() => ({ query: (sql: string) => [] }))
const logger = provide(() => ({ log: (msg: string) => {} }))

const service = derive({ db, logger }, ({ db, logger }) => ({
  getUser: (id: string) => {
    logger.log(`Fetching user ${id}`)
    return db.query('SELECT * FROM users WHERE id = ?')
  }
}))
```

Without destructuring, inference fails:

```ts
// ❌ deps becomes any
const broken = derive({ db, logger }, (deps) => {
  deps.db
})

// ✅ destructure for inference
const works = derive({ db, logger }, ({ db, logger }) => {
  db
})
```

## Single Dependency - Direct Parameter

No destructuring needed:

```ts twoslash
import { derive, provide } from '@pumped-fn/core-next'

const db = provide(() => ({ query: (sql: string) => [] }))

const userService = derive(db, (database) => ({
  getUser: (id: string) => database.query('SELECT * FROM users WHERE id = ?')
}))
```

## Let Return Types Infer

Don't annotate return types. Let implementation dictate type:

```ts twoslash
import { derive, provide } from '@pumped-fn/core-next'

const db = provide(() => ({ query: (sql: string) => [] }))

const service = derive(db, (db) => ({
  getUser: (id: string) => db.query('SELECT * FROM users WHERE id = ?'),
  createUser: (name: string) => db.query('INSERT INTO users (name) VALUES (?)')
}))
```

For complex logic, extract functions:

```ts twoslash
import { derive, provide } from '@pumped-fn/core-next'

const db = provide(() => ({
  query: (sql: string) => [],
  transaction: async (fn: () => Promise<void>) => {}
}))

const orderService = derive(db, (db) => {
  const createOrder = async (userId: string, items: string[]) => {
    await db.transaction(async () => {
      await db.query('INSERT INTO orders (user_id) VALUES (?)')
      for (const item of items) {
        await db.query('INSERT INTO order_items (item) VALUES (?)')
      }
    })
    return { orderId: '123', userId }
  }

  const getOrder = (id: string) => db.query('SELECT * FROM orders WHERE id = ?')

  return { createOrder, getOrder }
})
```

## External APIs May Need Type Hints

Sometimes third-party libraries need explicit types:

```ts twoslash
import { derive, provide } from '@pumped-fn/core-next'

type Connection = { query: (sql: string) => Promise<unknown[]> }
const createConnection = (cfg: { host: string }): Connection => ({ query: async () => [] })

const config = provide(() => ({ host: 'localhost' }))

const dbConnection = derive(config, (cfg) => {
  const conn: Connection = createConnection(cfg)
  return conn
})
```

Exception, not the rule. Most code won't need this.

## Quick Reference

**Multi-dependency:**
```ts
derive({ a, b }, ({ a, b }) => ...)  // ✅ destructure
derive({ a, b }, (deps) => ...)       // ❌ loses types
```

**Single dependency:**
```ts
derive(dep, (d) => ...)  // ✅ direct parameter
```

**No annotations:**
```ts
// ❌ Don't annotate
const bad = derive(db, (db): ServiceType => ...)
const bad2 = derive(db, (db) => ... as ServiceType)

// ✅ Let inference work
const good = derive(db, (db) => ...)
```

## See Also

- [Executors and Dependencies](./01-executors-and-dependencies.md) - Basic patterns
- [Tags](./02-tags-the-type-system.md) - Type-safe runtime access

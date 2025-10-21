---
title: Database Transactions
description: Transaction per flow with automatic rollback
keywords: [database, transactions, rollback, commit]
---

# Database Transactions

Implement transaction-per-flow pattern: start transaction on flow entry, commit on success, rollback on error.

## Architecture

- **Extension** manages transaction lifecycle
- **Tag** provides transaction to flows
- **Automatic rollback** on errors
- **Commit** on successful completion

## Transaction Extension

```ts twoslash
import { extension, tag, custom } from '@pumped-fn/core-next'

type Transaction = {
  commit: () => Promise<void>
  rollback: () => Promise<void>
  query: (sql: string) => Promise<any>
}

const transaction = tag(custom<Transaction>(), { label: 'db.transaction' })

const transactionExtension = extension({
  name: 'transaction',
  wrap: async (ctx, next, operation) => {
    if (operation.kind !== 'execute') {
      return next()
    }

    const txn: Transaction = {
      commit: async () => console.log('COMMIT'),
      rollback: async () => console.log('ROLLBACK'),
      query: async (sql: string) => {
        console.log('Query in txn:', sql)
        return { rows: [] }
      }
    }

    ctx.set(transaction, txn)

    try {
      const result = await next()
      await txn.commit()
      return result
    } catch (error) {
      await txn.rollback()
      throw error
    }
  }
})
```

## Using Transactions

```ts twoslash
import { flow, tag, custom } from '@pumped-fn/core-next'

type Transaction = {
  query: (sql: string) => Promise<any>
}

const transaction = tag(custom<Transaction>(), { label: 'db.transaction' })

const createUser = flow(async (ctx, data: { name: string, email: string }) => {
  const txn = ctx.get(transaction)

  const result = await txn.query(
    `INSERT INTO users (name, email) VALUES ('${data.name}', '${data.email}')`
  )

  return { id: result.insertId, ...data }
})

const createProfile = flow(async (ctx, input: { userId: string, bio: string }) => {
  const txn = ctx.get(transaction)

  await txn.query(
    `INSERT INTO profiles (user_id, bio) VALUES ('${input.userId}', '${input.bio}')`
  )

  return { userId: input.userId, bio: input.bio }
})

const registerUser = flow(async (ctx, input: {
  name: string
  email: string
  bio: string
}) => {
  const user = await ctx.exec(createUser, {
    name: input.name,
    email: input.email
  })

  const profile = await ctx.exec(createProfile, {
    userId: user.id,
    bio: input.bio
  })

  return { user, profile }
})
```

## Subflow Transactions

All subflows share parent transaction:

```ts twoslash
import { flow, tag, custom } from '@pumped-fn/core-next'

type Transaction = { query: (sql: string) => Promise<any> }
const transaction = tag(custom<Transaction>(), { label: 'db.transaction' })

const parentFlow = flow(async (ctx, input: any) => {
  const txn = ctx.get(transaction)

  await ctx.exec(childFlow1, input)
  await ctx.exec(childFlow2, input)

  // All operations in same transaction
  // Commit happens after parentFlow completes
})

const childFlow1 = flow(async (ctx, input: any) => {
  const txn = ctx.get(transaction)
  return txn.query('...')
})

const childFlow2 = flow(async (ctx, input: any) => {
  const txn = ctx.get(transaction)
  return txn.query('...')
})
```

## Error Rollback

```ts twoslash
import { flow, tag, custom } from '@pumped-fn/core-next'

type Transaction = { query: (sql: string) => Promise<any> }
const transaction = tag(custom<Transaction>(), { label: 'db.transaction' })

const riskyOperation = flow(async (ctx, shouldFail: boolean) => {
  const txn = ctx.get(transaction)

  await txn.query('INSERT INTO logs ...')

  if (shouldFail) {
    throw new Error('Operation failed')
  }

  await txn.query('INSERT INTO results ...')
})
```

If error is thrown, extension automatically rolls back both queries.

## Complete Example

<<< @/../examples/http-server/database-transaction.ts

## Production Checklist

- ✅ Transaction timeout handling
- ✅ Deadlock detection and retry
- ✅ Connection pool management
- ✅ Transaction isolation level configuration
- ✅ Nested transaction support (savepoints)
- ✅ Read-only transaction optimization

## See Also

- [Extensions](../guides/09-extensions.md)
- [Flow Composition](../guides/06-flow-composition.md)
- [Error Handling](../guides/10-error-handling.md)

/**
 * @file database-transaction.ts
 * Transaction management with extensions
 *
 * Demonstrates:
 * - Transaction-per-flow pattern
 * - Automatic commit/rollback
 * - Tag-based transaction access
 *
 * Verify: pnpm -F @pumped-fn/examples typecheck
 * Run: pnpm -F @pumped-fn/examples dev:database-transaction
 */

import { extension, flow, createScope, tag, custom, Promised } from '@pumped-fn/core-next'

const transaction = tag(custom<{
  commit: () => Promise<void>
  rollback: () => Promise<void>
}>(), { label: 'db.transaction' })

const transactionExtension = extension({
  name: 'transaction',
  wrap: async (ctx, next, operation) => {
    if (operation.kind !== 'execute') {
      return next()
    }

    const txn = {
      commit: async () => console.log('Transaction committed'),
      rollback: async () => console.log('Transaction rolled back')
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

const createUser = flow((ctx, data: { name: string, email: string }) => {
  const txn = ctx.get(transaction)
  console.log('Creating user in transaction:', data)
  return { id: '123', ...data }
})

const updateProfile = flow((ctx, input: { userId: string, bio: string }) => {
  const txn = ctx.get(transaction)
  console.log('Updating profile in transaction:', input.userId, input.bio)
  return { userId: input.userId, bio: input.bio }
})

const registerUser = flow(async (ctx, input: { name: string, email: string, bio: string }) => {
  const user = await ctx.exec(createUser, {
    name: input.name,
    email: input.email
  })

  const profile = await ctx.exec(updateProfile, {
    userId: user.id,
    bio: input.bio
  })

  return { user, profile }
})

async function main() {
  const scope = createScope({
    extensions: [transactionExtension]
  })

  const result = await flow.execute(registerUser, {
    name: 'John',
    email: 'john@example.com',
    bio: 'Software developer'
  }, { scope })

  console.log('Result:', result)
  await scope.dispose()
}

Promised.try(main).catch((error) => {
  console.error(error)
  process.exit(1)
})

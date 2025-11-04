/**
 * @file flow-composition.ts
 * Flow composition with ctx.exec
 *
 * Demonstrates:
 * - Sequential flow execution with ctx.exec
 * - Context inheritance between flows
 * - Type safety across flow boundaries
 *
 * Verify: pnpm -F @pumped-fn/examples typecheck
 * Run: pnpm -F @pumped-fn/examples dev:flow-composition
 */

import { flow, createScope, Promised } from '@pumped-fn/core-next'
import { requestId, userId, appConfig } from './shared/tags'

const validateUser = flow((ctx, id: string) => {
  if (!id || id.length < 3) {
    throw new Error('Invalid user ID')
  }
  ctx.set(userId, id)
  return id
})

const fetchUserData = flow((ctx, id: string) => {
  const validatedId = ctx.get(userId)
  return {
    id: validatedId,
    name: 'John Doe',
    email: 'john@example.com'
  }
})

const handleRequest = flow(async (ctx, req: { userId: string }) => {
  const reqId = `req-${Date.now()}`
  ctx.set(requestId, reqId)

  const id = await ctx.exec(validateUser, req.userId)
  const userData = await ctx.exec(fetchUserData, id)

  return {
    requestId: reqId,
    user: userData
  }
})

async function main() {
  const scope = createScope({
    tags: [
      appConfig({
        port: 3000,
        env: 'development',
        dbHost: 'localhost'
      })
    ]
  })

  const result = await flow.execute(handleRequest, { userId: 'user123' }, {
    scope
  })

  console.log('Result:', result)
  await scope.dispose()
}

Promised.try(main).catch((error) => {
  console.error(error)
  process.exit(1)
})

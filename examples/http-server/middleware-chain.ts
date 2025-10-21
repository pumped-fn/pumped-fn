/**
 * @file middleware-chain.ts
 * Middleware composition with extensions
 *
 * Demonstrates:
 * - Multiple extensions in a chain
 * - Auth and timing middleware
 * - Extension execution order
 *
 * Verify: pnpm -F @pumped-fn/examples typecheck
 * Run: pnpm -F @pumped-fn/examples dev:middleware-chain
 */

import { extension, flow, createScope, Promised } from '@pumped-fn/core-next'
import { requestId, userId } from './shared/tags'

const authMiddleware = extension({
  name: 'auth',
  wrap: async (ctx, next, operation) => {
    const id = userId.find(ctx)
    if (!id) {
      throw new Error('Unauthorized')
    }
    return next()
  }
})

const timingMiddleware = extension({
  name: 'timing',
  wrap: async (ctx, next, operation) => {
    const start = Date.now()
    const result = await next()
    console.log(`${operation.kind} took ${Date.now() - start}ms`)
    return result
  }
})

const handler = flow((ctx, req: { action: string }) => {
  const user = ctx.get(userId)
  return {
    user,
    action: req.action,
    timestamp: Date.now()
  }
})

async function main() {
  const scope = createScope({
    extensions: [authMiddleware, timingMiddleware]
  })

  const result = await flow.execute(handler, { action: 'getData' }, {
    scope,
    tags: [
      requestId('req-123'),
      userId('user-456')
    ]
  })

  console.log('Result:', result)
  await scope.dispose()
}

Promised.try(main).catch((error) => {
  console.error(error)
  process.exit(1)
})

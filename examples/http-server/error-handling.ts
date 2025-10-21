/**
 * @file error-handling.ts
 * Error handling patterns
 *
 * Demonstrates:
 * - Try/catch in flows
 * - Error recovery strategies
 * - Cleanup with finally
 *
 * Verify: pnpm -F @pumped-fn/examples typecheck
 * Run: pnpm -F @pumped-fn/examples dev:error-handling
 */

import { flow, createScope, Promised } from '@pumped-fn/core-next'

const riskyOperation = flow((ctx, shouldFail: boolean) => {
  if (shouldFail) {
    throw new Error('Operation failed')
  }
  return { success: true }
})

const handleWithRecovery = flow(async (ctx, input: boolean) => {
  try {
    const result = await ctx.exec(riskyOperation, input)
    return { status: 'ok', data: result }
  } catch (error) {
    console.error('Caught error:', error)
    return { status: 'error', message: (error as Error).message }
  }
})

const withCleanup = flow(async (ctx, input: boolean) => {
  const resource = { allocated: true }

  try {
    const result = await ctx.exec(riskyOperation, input)
    return result
  } finally {
    console.log('Cleaning up resource')
    resource.allocated = false
  }
})

async function main() {
  const scope = createScope()

  const recovered = await flow.execute(handleWithRecovery, true, { scope })
  console.log('Recovered:', recovered)

  try {
    await flow.execute(withCleanup, true, { scope })
  } catch (error) {
    console.log('Error caught in main:', (error as Error).message)
  }

  await scope.dispose()
}

Promised.try(main).catch((error) => {
  console.error(error)
  process.exit(1)
})

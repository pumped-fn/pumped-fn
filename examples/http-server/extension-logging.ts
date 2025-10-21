/**
 * @file extension-logging.ts
 * Extension for cross-cutting logging
 *
 * Demonstrates:
 * - Creating extensions with wrap()
 * - Accessing context in extensions
 * - Timing and logging operations
 *
 * Verify: pnpm -F @pumped-fn/examples typecheck
 * Run: pnpm -F @pumped-fn/examples dev:extension-logging
 */

import { extension, flow, createScope, Promised } from '@pumped-fn/core-next'
import { requestId } from './shared/tags'

const loggingExtension = extension({
  name: 'logging',
  wrap: async (ctx, next, operation) => {
    const reqId = requestId.find(ctx) || 'no-id'
    console.log(`[${reqId}] Starting ${operation.kind}`)

    const startTime = Date.now()
    try {
      const result = await next()
      const duration = Date.now() - startTime
      console.log(`[${reqId}] Finished ${operation.kind} in ${duration}ms`)
      return result
    } catch (error) {
      const duration = Date.now() - startTime
      console.log(`[${reqId}] Failed ${operation.kind} after ${duration}ms`)
      throw error
    }
  }
})

const businessLogic = flow((ctx, input: { value: number }) => {
  return { result: input.value * 2 }
})

async function main() {
  const scope = createScope({
    extensions: [loggingExtension]
  })

  const result = await flow.execute(businessLogic, { value: 42 }, {
    scope,
    tags: [requestId('req-001')]
  })

  console.log('Result:', result)
  await scope.dispose()
}

Promised.try(main).catch((error) => {
  console.error(error)
  process.exit(1)
})

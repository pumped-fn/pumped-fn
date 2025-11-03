/**
 * Testing Integration Examples
 *
 * Extracted from testing-integration.md
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { flow, createScope, provide, tag, custom, type Core } from '@pumped-fn/core-next'

// ============================================================================
// RESOURCE LIFECYCLE
// ============================================================================

/**
 * Database Configuration Tag
 *
 * Tag for test database configuration.
 *
 * Referenced in: testing-integration.md
 * Section: Pattern: Testing with Real Database
 */
export const dbConfig = tag(custom<{
  host: string
  port: number
  database: string
  user: string
  password: string
}>(), { label: 'config.database' })

/**
 * Integration Test Resource Lifecycle
 *
 * Test resource cleanup is called on scope.dispose().
 *
 * Referenced in: testing-integration.md
 * Section: Pattern: Testing Resource Lifecycle
 */
export const resourceLifecycleTests = () => {
  describe('resource lifecycle integration', () => {
    test('resource cleanup called on scope.dispose()', async () => {
      let cleanupCalled = false
      let connectionClosed = false

      const mockDbPool = provide((controller) => {
        const connection = { status: 'open' }

        controller.cleanup(async () => {
          cleanupCalled = true
          connection.status = 'closed'
          connectionClosed = true
        })

        return {
          query: async (sql: string) => [],
          getStatus: () => connection.status
        }
      })

      const scope = createScope()
      const pool = await scope.resolve(mockDbPool)

      expect(pool.getStatus()).toBe('open')
      expect(cleanupCalled).toBe(false)

      await scope.dispose()

      expect(cleanupCalled).toBe(true)
      expect(connectionClosed).toBe(true)
    })

    test('cleanup called in reverse order of initialization', async () => {
      const cleanupOrder: string[] = []

      const resourceA = provide((controller) => {
        controller.cleanup(async () => {
          cleanupOrder.push('A')
        })
        return { name: 'A' }
      })

      const resourceB = provide((controller) => {
        controller.cleanup(async () => {
          cleanupOrder.push('B')
        })
        return { name: 'B' }
      })

      const resourceC = provide((controller) => {
        controller.cleanup(async () => {
          cleanupOrder.push('C')
        })
        return { name: 'C' }
      })

      const scope = createScope()

      await scope.resolve(resourceA)
      await scope.resolve(resourceB)
      await scope.resolve(resourceC)

      await scope.dispose()

      expect(cleanupOrder).toEqual(['C', 'B', 'A'])
    })

    test('dispose handles cleanup errors gracefully', async () => {
      const cleanupCalls: string[] = []

      const failingResource = provide((controller) => {
        controller.cleanup(async () => {
          cleanupCalls.push('failing')
          throw new Error('Cleanup failed')
        })
        return {}
      })

      const successResource = provide((controller) => {
        controller.cleanup(async () => {
          cleanupCalls.push('success')
        })
        return {}
      })

      const scope = createScope()
      await scope.resolve(failingResource)
      await scope.resolve(successResource)

      await expect(scope.dispose()).resolves.not.toThrow()

      expect(cleanupCalls).toContain('failing')
      expect(cleanupCalls).toContain('success')
    })
  })
}

// ============================================================================
// CONCURRENT OPERATIONS
// ============================================================================

/**
 * Concurrent Operations Tests
 *
 * Test real concurrency with timing verification.
 *
 * Referenced in: testing-integration.md
 * Section: Pattern: Testing Concurrent Operations
 */
export const concurrentOperationsTests = () => {
  describe('concurrent operations integration', () => {
    test('ctx.parallel() executes flows concurrently', async () => {
      const timestamps: number[] = []

      const delayedFlow = flow(async (_ctx, delay: number) => {
        const start = Date.now()
        timestamps.push(start)
        await new Promise(resolve => setTimeout(resolve, delay))
        return Date.now() - start
      })

      const parentFlow = flow(async (ctx, _input: void) => {
        const promise1 = ctx.exec(delayedFlow, 100)
        const promise2 = ctx.exec(delayedFlow, 100)
        const promise3 = ctx.exec(delayedFlow, 100)

        const result = await ctx.parallel([promise1, promise2, promise3])

        return result.results
      })

      const scope = createScope()
      const durations = await scope.exec(parentFlow, undefined)

      const maxTimeDiff = Math.max(...timestamps) - Math.min(...timestamps)
      expect(maxTimeDiff).toBeLessThan(50)

      durations.forEach(duration => {
        expect(duration).toBeGreaterThanOrEqual(90)
        expect(duration).toBeLessThan(150)
      })

      await scope.dispose()
    })

    test('sequential execution takes longer than parallel', async () => {
      const sequentialFlow = flow(async (ctx, _input: void) => {
        const start = Date.now()

        const result1 = await ctx.exec(
          flow(async () => {
            await new Promise(resolve => setTimeout(resolve, 50))
            return 1
          }),
          undefined
        )

        const result2 = await ctx.exec(
          flow(async () => {
            await new Promise(resolve => setTimeout(resolve, 50))
            return 2
          }),
          undefined
        )

        return Date.now() - start
      })

      const parallelFlow = flow(async (ctx, _input: void) => {
        const start = Date.now()

        const promise1 = ctx.exec(
          flow(async () => {
            await new Promise(resolve => setTimeout(resolve, 50))
            return 1
          }),
          undefined
        )

        const promise2 = ctx.exec(
          flow(async () => {
            await new Promise(resolve => setTimeout(resolve, 50))
            return 2
          }),
          undefined
        )

        await ctx.parallel([promise1, promise2])

        return Date.now() - start
      })

      const scope = createScope()

      const sequentialTime = await scope.exec(sequentialFlow, undefined)
      const parallelTime = await scope.exec(parallelFlow, undefined)

      expect(sequentialTime).toBeGreaterThanOrEqual(90)
      expect(parallelTime).toBeLessThan(sequentialTime)

      await scope.dispose()
    })
  })
}

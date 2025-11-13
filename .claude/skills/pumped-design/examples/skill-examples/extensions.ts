/**
 * Extension Examples
 *
 * Section 1: Extension basics extracted from extension-basics.md
 * Section 2: Advanced patterns from existing extension examples
 */

import { extension, tag, custom, type Extension, type Core } from '@pumped-fn/core-next'
import { Promised } from '@pumped-fn/core-next'

// ============================================================================
// SECTION 1: EXTENSION BASICS
// ============================================================================

/**
 * Basic Logging Extension
 *
 * Demonstrates basic wrap() pattern with execute and journal hooks.
 *
 * Referenced in: extension-basics.md
 * Section: Code Template
 */
export const loggingExtension = extension({
  name: 'logging',
  wrap: (scope, next, operation) => {
    if (operation.kind === 'execution' && operation.target.type === 'flow') {
      const startTime = Date.now()
      const flowName = operation.target.definition.name
      console.log(`[FLOW START] ${flowName}`, { input: operation.input })

      return next()
        .then((result) => {
          const duration = Date.now() - startTime
          console.log(`[FLOW END] ${flowName}`, { duration, result })
          return result
        })
        .catch((error) => {
          const duration = Date.now() - startTime
          console.error(`[FLOW ERROR] ${flowName}`, { duration, error })
          throw error
        })
    }

    return next()
  }
})


/**
 * Parallel Tracker Extension
 *
 * Demonstrates intercepting ctx.parallel() and ctx.parallelSettled().
 *
 * Referenced in: extension-basics.md
 * Section: Parallel Hook
 */
export const parallelTrackerExtension = extension({
  name: 'parallel-tracker',
  wrap: (scope, next, operation) => {
    if (operation.kind === 'execution' && operation.target.type === 'parallel') {
      const mode = operation.target.mode
      const count = operation.target.count
      console.log(`[PARALLEL] mode=${mode} count=${count}`)

      return next()
        .then((result) => {
          console.log(`[PARALLEL COMPLETE] ${count} promises resolved`)
          return result
        })
    }

    return next()
  }
})

/**
 * Comprehensive Operation Tracker
 *
 * Tracks all operation types with full metadata including inputs.
 * Demonstrates complete operation interception pattern.
 *
 * Referenced in: extension-basics.md
 * Section: Example 2 - Input Capture, Example 3 - Comprehensive Tracker
 */
export const comprehensiveTrackerExtension = () => {
  type OperationRecord = {
    kind: string
    flowName?: string
    input?: unknown
    output?: unknown
    error?: unknown
    parallelMode?: string
    promiseCount?: number
  }

  const capturedOperations: OperationRecord[] = []

  return {
    extension: extension({
      name: "tracker",
      wrap: (_scope, next, operation) => {
        const record: OperationRecord = { kind: operation.kind }

        if (operation.kind === "execution") {
          if (operation.target.type === "flow") {
            record.flowName = operation.target.definition.name
            record.input = operation.input
          } else if (operation.target.type === "parallel") {
            record.parallelMode = operation.target.mode
            record.promiseCount = operation.target.count
          }
        }

        return next()
          .then((result) => {
            record.output = result
            capturedOperations.push(record)
            return result
          })
          .catch((error) => {
            record.error = error
            capturedOperations.push(record)
            throw error
          })
      },
    }),
    capturedOperations
  }
}

/**
 * Tracing Extension
 *
 * Distributed tracing with trace and span IDs.
 *
 * Referenced in: extension-basics.md
 * Section: Cross-Cutting Concerns - Tracing
 */
export const tracingExtension = extension({
  name: 'tracing',
  wrap: (scope, next, operation) => {
    if (operation.kind === 'execution' && operation.target.type === 'flow') {
      const traceId = Math.random().toString(36).slice(2)
      const spanId = Math.random().toString(36).slice(2)
      const flowName = operation.target.definition.name

      console.log(`[TRACE] trace_id=${traceId} span_id=${spanId} flow=${flowName} phase=start`)

      return next()
        .then((result) => {
          console.log(`[TRACE] trace_id=${traceId} span_id=${spanId} flow=${flowName} phase=end`)
          return result
        })
        .catch((error) => {
          console.log(`[TRACE] trace_id=${traceId} span_id=${spanId} flow=${flowName} phase=error error=${error}`)
          throw error
        })
    }

    return next()
  }
})

/**
 * Error Tracking Extension
 *
 * Structured error logging for external error tracking services.
 *
 * Referenced in: extension-basics.md
 * Section: Cross-Cutting Concerns - Error Tracking
 */
export const errorTrackingExtension = extension({
  name: 'error-tracking',
  wrap: (scope, next, operation) => {
    if (operation.kind === 'execution' && operation.target.type === 'flow') {
      const flowName = operation.target.definition.name
      return next()
        .catch((error) => {
          console.error(`[ERROR TRACKING] Flow: ${flowName}`, {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            timestamp: new Date().toISOString()
          })
          throw error
        })
    }

    return next()
  }
})

// ============================================================================
// SECTION 2: ADVANCED PATTERNS
// ============================================================================

/**
 * Request Correlation Tracker Extension
 *
 * Tracks requests across flows using correlation IDs with proper lifecycle.
 * Demonstrates: WeakMap state management, error handling, graceful degradation.
 *
 * Referenced in: extension-authoring.md
 * Section: Part 2 - Build Your First Stateful Extension
 */

type CorrelationStore = {
  activeRequests: Map<string, { startTime: number; flowName: string }>
  disposed: boolean
}

const correlationStateMap = new WeakMap<Core.Scope, CorrelationStore>()

export const correlationExtension = extension({
  name: 'correlation-tracker',

  init: (scope) => {
    const store: CorrelationStore = {
      activeRequests: new Map(),
      disposed: false
    }
    correlationStateMap.set(scope, store)
  },

  wrap: <T>(scope: Core.Scope, next: () => Promised<T>, operation: Extension.Operation): Promise<T> | Promised<T> => {
    const store = correlationStateMap.get(scope)

    if (!store || store.disposed) {
      console.warn('[correlation] Store unavailable, skipping tracking')
      return next()
    }

    if (operation.kind === 'execution' && operation.target.type === 'flow') {
      const correlationId = `corr-${crypto.randomUUID()}`

      store.activeRequests.set(correlationId, {
        startTime: Date.now(),
        flowName: operation.target.definition.name
      })

      return next()
        .then((result) => {
          const request = store.activeRequests.get(correlationId)
          if (request) {
            const duration = Date.now() - request.startTime
            console.log(`[correlation] ${correlationId} completed in ${duration}ms`)
            store.activeRequests.delete(correlationId)
          }
          return result
        })
        .catch((error) => {
          const request = store.activeRequests.get(correlationId)
          if (request) {
            console.error(`[correlation] ${correlationId} failed after ${Date.now() - request.startTime}ms`)
            store.activeRequests.delete(correlationId)
          }
          throw error
        })
    }

    return next()
  },

  dispose: async (scope) => {
    const store = correlationStateMap.get(scope)
    if (store) {
      if (store.activeRequests.size > 0) {
        console.warn(`[correlation] Disposing with ${store.activeRequests.size} active requests`)
      }
      store.activeRequests.clear()
      store.disposed = true
      correlationStateMap.delete(scope)
    }
  }
} satisfies Extension.Extension)

/**
 * Rate Limiter Extension
 *
 * Stateful extension implementing rate limiting per flow.
 * Demonstrates: Configuration pattern, request windowing, flow-level limits.
 *
 * Referenced in: extension-authoring.md
 * Section: Part 3 - Advanced Patterns / Stateful
 */

type RateLimitConfig = { maxRequests: number; windowMs: number }
type RateLimitStore = { requests: Map<string, number[]>; config: RateLimitConfig }

const rateLimitStateMap = new WeakMap<Core.Scope, RateLimitStore>()

export const rateLimiterExtension = (config: RateLimitConfig) => extension({
  name: 'rate-limiter',

  init: (scope) => {
    rateLimitStateMap.set(scope, {
      requests: new Map(),
      config
    })
  },

  wrap: (scope, next, operation) => {
    if (operation.kind !== 'execution' || operation.target.type !== 'flow') return next()

    const store = rateLimitStateMap.get(scope)
    if (!store) return next()

    const flowKey = operation.target.definition.name
    const now = Date.now()
    const requests = store.requests.get(flowKey) || []

    const validRequests = requests.filter(t => now - t < store.config.windowMs)

    if (validRequests.length >= store.config.maxRequests) {
      return Promise.reject(new Error(`Rate limit exceeded for ${flowKey}`))
    }

    validRequests.push(now)
    store.requests.set(flowKey, validRequests)

    return next()
  },

  dispose: (scope) => {
    const store = rateLimitStateMap.get(scope)
    if (store) {
      store.requests.clear()
      rateLimitStateMap.delete(scope)
    }
  }
} satisfies Extension.Extension)

/**
 * APM (Application Performance Monitoring) Integration Extension
 *
 * Integrates with external APM services for flow performance tracking.
 * Demonstrates: External service integration, transaction management, error resilience.
 *
 * Referenced in: extension-authoring.md
 * Section: Part 3 - Advanced Patterns / Integration
 */

type APMClient = { startTransaction: (name: string) => APMTransaction }
type APMTransaction = { end: () => void; setError: (error: unknown) => void }
type APMStore = { client: APMClient; activeTransactions: Map<string, APMTransaction> }

const apmStateMap = new WeakMap<Core.Scope, APMStore>()

export const apmExtension = (client: APMClient) => extension({
  name: 'apm',

  init: (scope) => {
    apmStateMap.set(scope, {
      client,
      activeTransactions: new Map()
    })
  },

  wrap: (scope, next, operation) => {
    if (operation.kind !== 'execution' || operation.target.type !== 'flow') return next()

    const store = apmStateMap.get(scope)
    if (!store) return next()

    const transactionId = `${operation.target.definition.name}-${Date.now()}`

    let transaction: APMTransaction | undefined
    try {
      transaction = store.client.startTransaction(operation.target.definition.name)
      store.activeTransactions.set(transactionId, transaction)
    } catch (error) {
      console.error('[apm] Failed to start transaction:', error)
      return next()
    }

    return next()
      .then((result) => {
        transaction?.end()
        store.activeTransactions.delete(transactionId)
        return result
      })
      .catch((error) => {
        transaction?.setError(error)
        transaction?.end()
        store.activeTransactions.delete(transactionId)
        throw error
      })
  },

  dispose: async (scope) => {
    const store = apmStateMap.get(scope)
    if (!store) return

    for (const [id, transaction] of store.activeTransactions) {
      try {
        transaction.end()
      } catch (error) {
        console.error(`[apm] Failed to end transaction ${id}:`, error)
      }
    }
    store.activeTransactions.clear()
    apmStateMap.delete(scope)
  }
} satisfies Extension.Extension)

/**
 * Multi-tenant Isolation Extension
 *
 * Enforces tenant isolation using context propagation through Tag.Store.
 * Demonstrates: Tag system usage, context access, validation patterns.
 *
 * Referenced in: extension-authoring.md
 * Section: Part 3 - Advanced Patterns / Context Propagation
 */

const tenantIdTag = tag(custom<string>(), { label: 'tenant-id' })

export const tenantIsolationExtension = extension({
  name: 'tenant-isolation',

  wrap: (scope, next, operation) => {
    if (operation.kind === 'execution') {
      const tenantId = operation.context.get(tenantIdTag.key) as string | undefined

      if (!tenantId) {
        return Promise.reject(new Error('Tenant ID required but not found'))
      }

      if (!/^tenant-[a-z0-9]+$/.test(tenantId)) {
        return Promise.reject(new Error(`Invalid tenant ID format: ${tenantId}`))
      }

      const flowName = operation.target.type === 'flow' ? operation.target.definition.name : 'execution'
      console.log(`[tenant] ${tenantId} executing ${flowName}`)
    }

    return next()
  }
} satisfies Extension.Extension)

/**
 * Request Correlation Tracker Extension
 *
 * Tracks requests across flows using correlation IDs with proper lifecycle.
 * Demonstrates: WeakMap state management, error handling, graceful degradation.
 *
 * Referenced in: .claude/skills/pumped-design/references/extension-authoring.md
 * Section: Part 2 - Build Your First Stateful Extension
 */

import { extension, type Extension, type Core, type MaybePromised } from '@pumped-fn/core-next'
import { Promised } from '@pumped-fn/core-next'

type CorrelationStore = {
  activeRequests: Map<string, { startTime: number; flowName: string }>
  disposed: boolean
}

// WeakMap for extension state (scope → state)
const stateMap = new WeakMap<Core.Scope, CorrelationStore>()

export const correlationExtension = extension({
  name: 'correlation-tracker',

  init: (scope) => {
    const store: CorrelationStore = {
      activeRequests: new Map(),
      disposed: false
    }
    stateMap.set(scope, store)
  },

  wrap: <T>(scope: Core.Scope, next: () => Promised<T>, operation: Extension.Operation): Promise<T> | Promised<T> => {
    const store = stateMap.get(scope)

    if (!store || store.disposed) {
      // Graceful degradation: extension state unavailable
      console.warn('[correlation] Store unavailable, skipping tracking')
      return next()
    }

    // Type-safe operation handling
    if (operation.kind === 'execute') {
      const correlationId = `corr-${Date.now()}-${Math.random().toString(36).slice(2)}`

      // Track request start
      store.activeRequests.set(correlationId, {
        startTime: Date.now(),
        flowName: operation.definition.name
      })

      return next()
        .then((result) => {
          // Track completion
          const request = store.activeRequests.get(correlationId)
          if (request) {
            const duration = Date.now() - request.startTime
            console.log(`[correlation] ${correlationId} completed in ${duration}ms`)
            store.activeRequests.delete(correlationId)
          }
          return result
        })
        .catch((error) => {
          // Error handling: log and cleanup
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
    const store = stateMap.get(scope)
    if (store) {
      // Cleanup: warn about incomplete requests
      if (store.activeRequests.size > 0) {
        console.warn(`[correlation] Disposing with ${store.activeRequests.size} active requests`)
      }
      store.activeRequests.clear()
      store.disposed = true
      stateMap.delete(scope)
    }
  }
} satisfies Extension.Extension)

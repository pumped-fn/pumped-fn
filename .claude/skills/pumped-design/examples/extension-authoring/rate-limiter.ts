/**
 * Rate Limiter Extension
 *
 * Stateful extension implementing rate limiting per flow.
 * Demonstrates: Configuration pattern, request windowing, flow-level limits.
 *
 * Referenced in: .claude/skills/pumped-design/references/extension-authoring.md
 * Section: Part 3 - Advanced Patterns / Stateful
 */

import { extension, type Extension, type Core } from '@pumped-fn/core-next'

type RateLimitConfig = { maxRequests: number; windowMs: number }
type RateLimitStore = { requests: Map<string, number[]>; config: RateLimitConfig }

const stateMap = new WeakMap<Core.Scope, RateLimitStore>()

export const rateLimiterExtension = (config: RateLimitConfig) => extension({
  name: 'rate-limiter',

  init: (scope) => {
    stateMap.set(scope, {
      requests: new Map(),
      config
    })
  },

  wrap: (scope, next, operation) => {
    if (operation.kind !== 'execute') return next()

    const store = stateMap.get(scope)
    if (!store) return next()

    const flowKey = operation.definition.name
    const now = Date.now()
    const requests = store.requests.get(flowKey) || []

    // Remove expired requests
    const validRequests = requests.filter(t => now - t < store.config.windowMs)

    if (validRequests.length >= store.config.maxRequests) {
      return Promise.reject(new Error(`Rate limit exceeded for ${flowKey}`))
    }

    validRequests.push(now)
    store.requests.set(flowKey, validRequests)

    return next()
  },

  dispose: (scope) => {
    const store = stateMap.get(scope)
    if (store) {
      store.requests.clear()
      stateMap.delete(scope)
    }
  }
} satisfies Extension.Extension)

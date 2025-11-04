/**
 * @file state.session-cache.ts
 * Session cache state - ephemeral in-memory storage
 *
 * Demonstrates:
 * - provide() for state initialization
 * - derive().static for controller access
 * - controller.cleanup() for disposal
 * - TTL-based expiration
 *
 * Verify: pnpm -F @pumped-fn/examples typecheck
 */

import { provide, derive } from '@pumped-fn/core-next'

export namespace SessionCache {
  export type Entry<T> = {
    value: T
    expiresAt: number
  }
}

export const sessionCache = provide((controller) => {
  const cache = new Map<string, SessionCache.Entry<unknown>>()

  controller.cleanup(() => {
    cache.clear()
  })

  return cache
})

export const sessionCacheCtl = derive(sessionCache.static, (cacheCtl) => {
  return {
    get: <T>(key: string): T | undefined => {
      const entry = cacheCtl.get().get(key) as SessionCache.Entry<T> | undefined
      if (!entry) return undefined

      if (Date.now() > entry.expiresAt) {
        cacheCtl.update(c => {
          c.delete(key)
          return c
        })
        return undefined
      }

      return entry.value
    },

    set: async <T>(key: string, value: T, ttlMs: number): Promise<void> => {
      await cacheCtl.update(c => {
        c.set(key, {
          value,
          expiresAt: Date.now() + ttlMs
        })
        return c
      })
    },

    delete: async (key: string): Promise<void> => {
      await cacheCtl.update(c => {
        c.delete(key)
        return c
      })
    },

    clear: async (): Promise<void> => {
      await cacheCtl.update(c => {
        c.clear()
        return c
      })
    }
  }
})

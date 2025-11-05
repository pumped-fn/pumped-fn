/**
 * @file state.session-cache.ts
 * Session cache state - ephemeral in-memory storage
 *
 * Demonstrates:
 * - provide() for state initialization
 * - derive().static for controller access
 * - controller.cleanup() for disposal
 * - TTL-based expiration
 * - Tag-based type-safe Map access
 *
 * Verify: pnpm -F @pumped-fn/examples typecheck
 */

import { provide, derive, tag, custom, type Tag } from '@pumped-fn/core-next'

export namespace SessionCache {
  export type Entry<T> = {
    value: T
    expiresAt: number
  }
}

export const sessionCache = provide((controller) => {
  const cache = new Map<symbol, SessionCache.Entry<unknown>>()

  controller.cleanup(() => {
    cache.clear()
  })

  return cache
})

export const sessionCacheCtl = derive(sessionCache.static, (cacheCtl) => {
  return {
    get: <T>(key: Tag.Tag<T, false>): T | undefined => {
      const cache = cacheCtl.get()
      const entry = cache.get(key.key)
      if (!entry) return undefined

      if (Date.now() > entry.expiresAt) {
        cacheCtl.update(c => {
          c.delete(key.key)
          return c
        })
        return undefined
      }

      return entry.value as T
    },

    set: async <T>(key: Tag.Tag<T, false>, value: T, ttlMs: number): Promise<void> => {
      await cacheCtl.update(c => {
        c.set(key.key, {
          value,
          expiresAt: Date.now() + ttlMs
        })
        return c
      })
    },

    delete: async <T>(key: Tag.Tag<T, false>): Promise<void> => {
      await cacheCtl.update(c => {
        c.delete(key.key)
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

export const cacheKey = <T>(label: string) => tag(custom<T>(), { label })

import { provide, derive, tag, custom, type Tag } from '@pumped-fn/core-next'

const sessionCache = provide((ctl) => {
  const map = new Map<symbol, { value: unknown; exp: number }>()
  ctl.cleanup(() => map.clear())
  return map
})

export const sessionCacheCtl = derive(sessionCache.static, (ctl) => ({
  get: <T>(key: Tag.Tag<T, false>) => {
    const e = ctl.get().get(key.key)
    if (!e || Date.now() > e.exp) return undefined
    return e.value as T
  },
  set: async <T>(key: Tag.Tag<T, false>, value: T, ttl: number) => {
    await ctl.update(m => m.set(key.key, { value, exp: Date.now() + ttl }))
  }
}))

export const cacheKey = <T>(label: string) => tag(custom<T>(), { label })

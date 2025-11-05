import { provide, derive, tag, custom, type Tag } from '@pumped-fn/core-next'

type Entry = { value: unknown; exp: number }

const sessionCache = provide((ctl) => {
  const entries = new Map<unknown, Entry>()
  const ttls = new Map<unknown, number>()
  ctl.cleanup(() => { entries.clear(); ttls.clear() })

  const store: Tag.Store = {
    get: (key) => {
      const e = entries.get(key)
      return (!e || Date.now() > e.exp) ? undefined : e.value
    },
    set: (key, value) => {
      const ttl = ttls.get(key) || 60000
      entries.set(key, { value, exp: Date.now() + ttl })
    }
  }

  return { store, setTTL: (key: unknown, ttl: number) => ttls.set(key, ttl) }
})

export const sessionCacheCtl = derive(sessionCache.static, (ctl) => ({
  get: <T>(key: Tag.Tag<T, false>) => key.readFrom(ctl.get().store),
  set: async <T>(key: Tag.Tag<T, false>, value: T, ttl: number) => {
    await ctl.update(c => { c.setTTL(key.key, ttl); c.store.set(key.key, value); return c })
  }
}))

export const cacheKey = <T>(label: string) => tag(custom<T>(), { label })

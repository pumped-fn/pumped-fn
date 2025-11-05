import { provide, derive, tag, custom, type Tag } from '@pumped-fn/core-next'

const sessionCache = provide((ctl) => {
  const map = new Map<unknown, unknown>()
  ctl.cleanup(() => map.clear())

  const store: Tag.Store = {
    get: (key) => map.get(key),
    set: (key, value) => map.set(key, value)
  }

  return store
})

export const sessionCacheCtl = derive(sessionCache.static, (ctl) => ({
  get: <T>(key: Tag.Tag<T, false>) => key.readFrom(ctl.get()),
  set: async <T>(key: Tag.Tag<T, false>, value: T) => {
    await ctl.update(store => { store.set(key.key, value); return store })
  }
}))

export const cacheKey = <T>(label: string) => tag(custom<T>(), { label })

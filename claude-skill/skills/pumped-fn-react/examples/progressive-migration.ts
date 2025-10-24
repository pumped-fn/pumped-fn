// Progressive Migration Example
// Shows how to evolve from localStorage → IndexedDB → Remote API

import { tag, custom, provide, derive } from '@pumped-fn/core-next'

// ===== Storage Interface =====
export type Storage = {
  get: <T>(key: string) => T | null | Promise<T | null>
  set: <T>(key: string, value: T) => void | Promise<void>
  list: <T>(prefix: string) => T[] | Promise<T[]>
  delete: (key: string) => void | Promise<void>
}

export const storageImpl = tag(custom<Storage>(), {
  label: 'storage.impl'
})

export const storage = provide((controller) =>
  storageImpl.get(controller.scope)
)

// ===== Domain Types =====
type User = {
  id: string
  name: string
  email: string
  roles: string[]
}

type Post = {
  id: string
  title: string
  content: string
  authorId: string
  createdAt: string
}

// ===== Feature State (UNCHANGED across migrations) =====
export const currentUser = provide((controller) => {
  const store = storage.get(controller.scope)
  const user = store.get<User>('user:current')
  if (!user) throw new Error('Not authenticated')
  return user
})

export const posts = provide((controller) => {
  const store = storage.get(controller.scope)
  return store.list<Post>('post:')
})

export const userPosts = derive(
  { posts: posts.reactive, user: currentUser.reactive },
  ({ posts, user }) => posts.filter(p => p.authorId === user.id)
)

export const postCount = derive(
  posts.reactive,
  (list) => list.length
)

// ===== PHASE 1: localStorage Implementation =====
export const localStorageImpl: Storage = {
  get: <T>(key: string): T | null => {
    const item = localStorage.getItem(key)
    return item ? JSON.parse(item) : null
  },

  set: <T>(key: string, value: T): void => {
    localStorage.setItem(key, JSON.stringify(value))
  },

  list: <T>(prefix: string): T[] => {
    const items: T[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(prefix)) {
        const item = localStorage.getItem(key)
        if (item) items.push(JSON.parse(item))
      }
    }
    return items
  },

  delete: (key: string): void => {
    localStorage.removeItem(key)
  }
}

// ===== PHASE 2: IndexedDB Implementation =====
const DB_NAME = 'app-storage'
const STORE_NAME = 'storage'

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
  })
}

export const indexedDBImpl: Storage = {
  get: async <T>(key: string): Promise<T | null> => {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(key)

      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => reject(request.error)
    })
  },

  set: async <T>(key: string, value: T): Promise<void> => {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const request = tx.objectStore(STORE_NAME).put(value, key)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  },

  list: async <T>(prefix: string): Promise<T[]> => {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const range = IDBKeyRange.bound(prefix, prefix + '\uffff')
      const request = store.getAll(range)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  },

  delete: async (key: string): Promise<void> => {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const request = tx.objectStore(STORE_NAME).delete(key)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
}

// ===== PHASE 3: Remote API Implementation =====
type APIClient = {
  get: <T>(path: string) => Promise<T>
  post: <T>(path: string, body: unknown) => Promise<T>
  delete: (path: string) => Promise<void>
}

export const remoteStorageImpl = (api: APIClient): Storage => ({
  get: async <T>(key: string): Promise<T | null> => {
    try {
      return await api.get<T>(`/storage/${encodeURIComponent(key)}`)
    } catch (error) {
      // 404 = key doesn't exist
      if ((error as any).status === 404) return null
      throw error
    }
  },

  set: async <T>(key: string, value: T): Promise<void> => {
    await api.post(`/storage/${encodeURIComponent(key)}`, value)
  },

  list: async <T>(prefix: string): Promise<T[]> => {
    return await api.get<T[]>(`/storage?prefix=${encodeURIComponent(prefix)}`)
  },

  delete: async (key: string): Promise<void> => {
    await api.delete(`/storage/${encodeURIComponent(key)}`)
  }
})

// ===== PHASE 4: Hybrid Implementation (Remote + Local Cache) =====
export const hybridStorageImpl = (api: APIClient): Storage => {
  const cache = new Map<string, any>()

  return {
    get: async <T>(key: string): Promise<T | null> => {
      // Check cache first
      if (cache.has(key)) {
        return cache.get(key)
      }

      // Fetch from remote
      try {
        const value = await api.get<T>(`/storage/${encodeURIComponent(key)}`)
        cache.set(key, value)
        return value
      } catch {
        return null
      }
    },

    set: async <T>(key: string, value: T): Promise<void> => {
      // Update cache immediately (optimistic)
      cache.set(key, value)

      // Sync to remote in background
      api.post(`/storage/${encodeURIComponent(key)}`, value).catch(error => {
        // Rollback cache on error
        cache.delete(key)
        console.error('Failed to sync to remote:', error)
      })
    },

    list: async <T>(prefix: string): Promise<T[]> => {
      return await api.get<T[]>(`/storage?prefix=${encodeURIComponent(prefix)}`)
    },

    delete: async (key: string): Promise<void> => {
      cache.delete(key)
      await api.delete(`/storage/${encodeURIComponent(key)}`)
    }
  }
}

// ===== Usage in App Initialization =====
import { createScope } from '@pumped-fn/core-next'
import { apiClient } from '../app/resources'

// PHASE 1: Prototype with localStorage
export const prototypeScope = createScope({
  tags: [storageImpl(localStorageImpl)]
})

// PHASE 2: Scale to IndexedDB
export const scaledScope = createScope({
  tags: [storageImpl(indexedDBImpl)]
})

// PHASE 3: Production with remote API
const api = { /* fetch-based API client */ } as APIClient
export const productionScope = createScope({
  tags: [storageImpl(remoteStorageImpl(api))]
})

// PHASE 4: Hybrid (cached remote)
export const hybridScope = createScope({
  tags: [storageImpl(hybridStorageImpl(api))]
})

// ===== Migration Helper =====
export async function migrateStorage(
  source: Storage,
  target: Storage,
  prefixes: string[]
): Promise<void> {
  for (const prefix of prefixes) {
    const items = await source.list(prefix)

    for (const item of items) {
      // Assume items have an 'id' field for keying
      const key = `${prefix}${(item as any).id}`
      await target.set(key, item)
    }
  }

  console.log(`Migrated ${prefixes.length} prefixes from source to target`)
}

// Usage: Migrate localStorage → IndexedDB
// await migrateStorage(localStorageImpl, indexedDBImpl, ['user:', 'post:'])

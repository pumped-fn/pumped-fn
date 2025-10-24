// Progressive Migration Example
// Shows localStorage → IndexedDB → API migration with zero business logic changes

import { provide, derive, tag, custom, createScope } from '@pumped-fn/core-next'

// ===== Step 1: Define Storage Interface =====

type Storage = {
  get: <T>(key: string) => T | null | Promise<T | null>
  set: <T>(key: string, value: T) => void | Promise<void>
  list: <T>(prefix: string) => T[] | Promise<T[]>
}

export const storageImpl = tag(custom<Storage>(), {
  label: 'storage.impl'
})

export const storage = provide((controller) =>
  storageImpl.get(controller.scope)
)

// ===== Step 2: Implementations =====

// Phase 1: localStorage (Prototype)
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
  }
}

// Phase 2: IndexedDB (Scale)
export const indexedDBImpl: Storage = {
  get: async <T>(key: string): Promise<T | null> => {
    // Simplified - real implementation needs proper IDB setup
    return null
  },
  set: async <T>(key: string, value: T): Promise<void> => {
    // Simplified
  },
  list: async <T>(prefix: string): Promise<T[]> => {
    // Simplified
    return []
  }
}

// Phase 3: Remote API (Production)
type APIClient = {
  get: <T>(path: string) => Promise<T>
  post: <T>(path: string, body: unknown) => Promise<T>
}

export const remoteStorageImpl = (api: APIClient): Storage => ({
  get: async <T>(key: string): Promise<T | null> => {
    try {
      return await api.get<T>(`/storage/${key}`)
    } catch {
      return null
    }
  },
  set: async <T>(key: string, value: T): Promise<void> => {
    await api.post(`/storage/${key}`, value)
  },
  list: async <T>(prefix: string): Promise<T[]> => {
    return await api.get<T[]>(`/storage?prefix=${prefix}`)
  }
})

// ===== Step 3: Business Logic (UNCHANGED across all phases) =====

type Note = {
  id: string
  text: string
  createdAt: string
}

// ⚠️ CRITICAL: Always await, even though localStorage is sync
export const notes = derive(storage, async (store) => {
  const result = await store.get<Note[]>('notes')
  return result ?? []
})

export const noteCount = derive(
  notes.reactive,
  (list) => list.length
)

export const addNote = derive(storage, (store) => {
  return async (text: string, scope: ReturnType<typeof createScope>) => {
    const existing = await store.get<Note[]>('notes') ?? []
    const newNote: Note = {
      id: crypto.randomUUID(),
      text,
      createdAt: new Date().toISOString()
    }
    await store.set('notes', [...existing, newNote])
    scope.update(notes, [...existing, newNote])
  }
})

// ===== Step 4: Scope Creation (ONLY line that changes) =====

// Prototype phase
export const prototypeScope = createScope({
  tags: [storageImpl(localStorageImpl)]
})

// Scale phase
export const scaledScope = createScope({
  tags: [storageImpl(indexedDBImpl)]
})

// Production phase (requires API client)
export function createProductionScope(api: APIClient) {
  return createScope({
    tags: [storageImpl(remoteStorageImpl(api))]
  })
}

// ===== Key Points =====

// 1. Business logic (notes, noteCount, addNote) NEVER changes
// 2. Only swap tag in scope creation
// 3. Always await, even for sync operations
// 4. Same interface across all implementations

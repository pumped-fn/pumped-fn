// Progressive Migration Example
// Shows localStorage → IndexedDB → API migration with zero business logic changes

import { provide, derive, tag, custom, createScope } from '@pumped-fn/core-next'

// ===== Step 1: Define Storage Interface =====

type Storage = {
  get: <T>(key: string) => Promise<T | null>
  set: <T>(key: string, value: T) => Promise<void>
  list: <T>(prefix: string) => Promise<T[]>
}

type StorageProfile = 'local' | 'indexeddb' | 'remote'

export const storageProfile = tag(custom<StorageProfile>(), {
  label: 'storage.profile',
  default: 'local' as StorageProfile
})

// ===== Step 2: Implementations =====

// Phase 1: localStorage (Prototype)
const localStorageImpl = provide<Storage>(() => ({
  get: async <T>(key: string): Promise<T | null> => {
    const item = localStorage.getItem(key)
    return item ? JSON.parse(item) : null
  },
  set: async <T>(key: string, value: T): Promise<void> => {
    localStorage.setItem(key, JSON.stringify(value))
  },
  list: async <T>(prefix: string): Promise<T[]> => {
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
}))

// Phase 2: IndexedDB (Scale)
const indexedDBImpl = provide<Storage>(() => ({
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
}))

// Phase 3: Remote API (Production)
type APIClient = {
  get: <T>(path: string) => Promise<T>
  post: <T>(path: string, body: unknown) => Promise<T>
}

const apiClient = tag(custom<APIClient>(), {
  label: 'api.client'
})

const remoteStorageImpl = provide<Storage>((controller) => {
  const client = apiClient.get(controller.scope)

  return {
    get: async <T>(key: string): Promise<T | null> => {
      try {
        return await client.get<T>(`/storage/${key}`)
      } catch {
        return null
      }
    },
    set: async <T>(key: string, value: T): Promise<void> => {
      await client.post(`/storage/${key}`, value)
    },
    list: async <T>(prefix: string): Promise<T[]> => {
      return await client.get<T[]>(`/storage?prefix=${prefix}`)
    }
  }
})

// ===== Step 2b: Profile-Based Selector using .lazy =====

export const storage = derive(
  {
    local: localStorageImpl.lazy,
    indexeddb: indexedDBImpl.lazy,
    remote: remoteStorageImpl.lazy
  },
  async (accessors, controller): Promise<Storage> => {
    const profile = storageProfile.get(controller.scope)
    return await accessors[profile].resolve()
  }
)

// ===== Step 3: Business Logic (UNCHANGED across all phases) =====

type Note = {
  id: string
  text: string
  createdAt: string
}

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
  tags: [storageProfile('local')]
})

// Scale phase
export const scaledScope = createScope({
  tags: [storageProfile('indexeddb')]
})

// Production phase (requires API client)
export function createProductionScope(api: APIClient) {
  return createScope({
    tags: [
      storageProfile('remote'),
      apiClient(api)
    ]
  })
}

// ===== Key Points =====

// 1. Business logic (notes, noteCount, addNote) NEVER changes
// 2. Use .lazy to get Accessors, only chosen implementation resolves
// 3. Profile tag determines which storage implementation is used
// 4. Zero waste - only the selected implementation runs
// 5. Same interface across all implementations

/**
 * Derived Resource Examples
 *
 * Extracted from resource-derived.md
 */

import { provide, derive } from '@pumped-fn/core-next'
import { dbPool } from './resources-basic'

/**
 * User Repository Types
 *
 * Type definitions for user repository pattern.
 *
 * Referenced in: resource-derived.md
 * Section: Code Template
 */
export namespace UserRepo {
  export type User = {
    id: string
    email: string
    name: string
    createdAt: Date
  }

  export type CreateInput = {
    email: string
    name: string
  }

  export type UpdateInput = {
    email?: string
    name?: string
  }
}

/**
 * User Repository
 *
 * Derived resource depending on dbPool.
 *
 * Referenced in: resource-derived.md
 * Section: Code Template
 */
export const userRepository = derive({ db: dbPool }, ({ db }) => ({
  findById: async (id: string): Promise<UserRepo.User | null> => {
    const rows = await db.query<UserRepo.User>(
      'SELECT id, email, name, created_at as "createdAt" FROM users WHERE id = $1',
      [id]
    )
    return rows[0] || null
  },

  create: async (input: UserRepo.CreateInput): Promise<UserRepo.User> => {
    const rows = await db.query<UserRepo.User>(
      'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id, email, name, created_at as "createdAt"',
      [input.email, input.name]
    )
    return rows[0]
  }
}))

/**
 * Simple Derived Resource
 *
 * Basic dependency pattern with single dependency.
 *
 * Referenced in: resource-derived.md
 * Section: Example 1
 */
export const derivedSimpleDependency = (() => {
  const executionOrder: string[] = []
  const baseExecutor = provide(() => {
    executionOrder.push("base")
    return 1
  })

  const dependentExecutor = derive(
    { base: baseExecutor },
    (deps: { base: number }) => {
      executionOrder.push("dependent")
      return deps.base + 1
    }
  )

  return { baseExecutor, dependentExecutor, executionOrder }
})()

/**
 * Mixed Sync/Async Dependencies
 *
 * Demonstrates combining sync and async dependencies.
 *
 * Referenced in: resource-derived.md
 * Section: Example 2
 */
export const derivedMixedDependencies = (() => {
  const syncDependency = provide(() => 1)
  const asyncDependency = provide(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1))
    return 2
  })

  const combinedExecutor = derive(
    { sync: syncDependency, async: asyncDependency },
    (deps: { sync: number; async: number }) => deps.sync + deps.async
  )

  return { syncDependency, asyncDependency, combinedExecutor }
})()

/**
 * Service with Database
 *
 * Service depending on database connection.
 *
 * Referenced in: resource-derived.md
 * Section: Example 3
 */
export const derivedServiceWithDb = (() => {
  let dbConnectionCount = 0
  let serviceResolveCount = 0

  const dbConnection = provide(() => {
    dbConnectionCount++
    return { connected: true, id: dbConnectionCount }
  })

  const service = derive({ db: dbConnection }, ({ db }) => {
    serviceResolveCount++
    return { db, count: serviceResolveCount }
  })

  return { dbConnection, service, getDbCount: () => dbConnectionCount, getServiceCount: () => serviceResolveCount }
})()

/**
 * Multiple Named Dependencies
 *
 * Resource with multiple explicit dependencies.
 *
 * Referenced in: resource-derived.md
 * Section: Example 4
 */
export const derivedMultipleDependencies = (() => {
  const dependencyA = provide(() => "a")
  const dependencyB = provide(() => "b")
  const dependencyC = provide(() => "c")

  const executorWithDependencies = derive(
    { depA: dependencyA, depB: dependencyB, depC: dependencyC },
    (deps) => deps
  )

  return { dependencyA, dependencyB, dependencyC, executorWithDependencies }
})()

/**
 * Full CRUD User Repository
 *
 * Complete repository with all CRUD operations.
 *
 * Referenced in: resource-derived.md
 * Section: Example 5
 */
export const userRepositoryFullCrud = derive({ db: dbPool }, ({ db }) => ({
  findById: async (id: string): Promise<UserRepo.User | null> => {
    const rows = await db.query<UserRepo.User>(
      'SELECT id, email, name, created_at as "createdAt" FROM users WHERE id = $1',
      [id]
    )
    return rows[0] || null
  },

  findByEmail: async (email: string): Promise<UserRepo.User | null> => {
    const rows = await db.query<UserRepo.User>(
      'SELECT id, email, name, created_at as "createdAt" FROM users WHERE email = $1',
      [email]
    )
    return rows[0] || null
  },

  create: async (input: UserRepo.CreateInput): Promise<UserRepo.User> => {
    const rows = await db.query<UserRepo.User>(
      'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id, email, name, created_at as "createdAt"',
      [input.email, input.name]
    )
    return rows[0]
  },

  update: async (id: string, input: UserRepo.UpdateInput): Promise<UserRepo.User | null> => {
    const fields: string[] = []
    const values: any[] = []
    let paramCount = 1

    if (input.email !== undefined) {
      fields.push(`email = $${paramCount++}`)
      values.push(input.email)
    }
    if (input.name !== undefined) {
      fields.push(`name = $${paramCount++}`)
      values.push(input.name)
    }

    if (fields.length === 0) return null

    values.push(id)
    const rows = await db.query<UserRepo.User>(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING id, email, name, created_at as "createdAt"`,
      values
    )
    return rows[0] || null
  },

  delete: async (id: string): Promise<boolean> => {
    const rows = await db.query<{ id: string }>(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [id]
    )
    return rows.length > 0
  }
}))

/**
 * Single Dependency Pattern
 *
 * Two approaches for single dependency.
 *
 * Referenced in: resource-derived.md
 * Section: Dependency Patterns - Single Dependency
 */
export const derivedSingleDependencyPatterns = (() => {
  const base = provide(() => 5)

  const derivedObject = derive({ base }, ({ base }) => base * 2)

  const derivedDirect = derive(base, (val) => val * 2)

  return { base, derivedObject, derivedDirect }
})()

/**
 * Multiple Dependencies with Services
 *
 * Complex derived resource with multiple services.
 *
 * Referenced in: resource-derived.md
 * Section: Dependency Patterns - Multiple Dependencies
 */
export const derivedMultipleServices = (() => {
  const logger = provide(() => ({
    info: (msg: string, meta?: any) => console.log(msg, meta)
  }))

  const cache = provide(() => ({
    get: async (key: string) => null,
    set: async (key: string, value: any) => {}
  }))

  const derived = derive(
    { db: dbPool, logger, cache },
    ({ db, logger, cache }) => ({
      get: async (key: string) => {
        logger.info('Getting key', { key })
        const cached = await cache.get(key)
        if (cached) return cached

        const result = await db.query('SELECT * FROM data WHERE key = $1', [key])
        await cache.set(key, result)
        return result
      }
    })
  )

  return { logger, cache, derived }
})()

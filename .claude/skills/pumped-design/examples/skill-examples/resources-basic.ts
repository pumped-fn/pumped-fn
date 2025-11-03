/**
 * Basic Resource Examples
 *
 * Extracted from resource-basic.md
 */

import { provide, tag, custom, flow } from '@pumped-fn/core-next'

type Pool = {
  query: (sql: string, params: any[]) => Promise<{ rows: any[] }>
  end: () => Promise<void>
  connect: () => Promise<{
    query: (sql: string, params?: any[]) => Promise<any>
    release: () => void
  }>
}

/**
 * Database Configuration Tag
 *
 * Configuration via tags pattern for database connection.
 *
 * Referenced in: resource-basic.md
 * Section: Code Template
 */
export const dbConfig = tag(custom<{
  host: string
  port: number
  database: string
}>(), { label: 'config.database' })

/**
 * Basic Database Pool Resource
 *
 * Demonstrates provide() with configuration via tags and lifecycle management.
 *
 * Referenced in: resource-basic.md
 * Section: Code Template
 */
export const dbPool = provide((controller) => {
  const config = dbConfig.extractFrom(controller.scope)

  const pool = {} as Pool

  controller.cleanup(() => pool.end())

  return {
    query: async <T>(sql: string, params: any[]): Promise<T[]> => {
      const result = await pool.query(sql, params)
      return result.rows
    }
  }
})

/**
 * Simple Base Executor
 *
 * Minimal resource with no dependencies.
 *
 * Referenced in: resource-basic.md
 * Section: Example 1
 */
export const basicSimpleExecutor = (() => {
  const executionOrder: string[] = []
  return {
    executor: provide(() => {
      executionOrder.push("base")
      return 1
    }),
    executionOrder
  }
})()

/**
 * Database Connection Resource
 *
 * Async resource with lifecycle tracking.
 *
 * Referenced in: resource-basic.md
 * Section: Example 2
 */
export const basicDbConnection = (() => {
  let dbConnectionCount = 0
  return {
    connection: provide(() => {
      dbConnectionCount++
      return { connected: true, id: dbConnectionCount }
    }),
    getCount: () => dbConnectionCount
  }
})()

/**
 * Configuration Resource with Flow
 *
 * Resource used by flow via dependencies.
 *
 * Referenced in: resource-basic.md
 * Section: Example 3
 */
export const basicConfigWithFlow = (() => {
  const config = provide(() => ({ multiplier: 3 }))

  const multiplyFlow = flow(config, (deps, _ctx, input: number) => {
    return input * deps.multiplier
  })

  return { config, multiplyFlow }
})()

/**
 * Database Pool with Transaction Support
 *
 * Resource with cleanup and transaction handling.
 *
 * Referenced in: resource-basic.md
 * Section: Example 4
 */
export const dbPoolWithTransaction = provide((controller) => {
  const pool = {} as Pool

  controller.cleanup(() => pool.end())

  return {
    query: async <T>(sql: string, params: any[]): Promise<T[]> => {
      const result = await pool.query(sql, params)
      return result.rows
    },
    transaction: async <T>(callback: (client: any) => Promise<T>): Promise<T> => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await callback(client)
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    }
  }
})

/**
 * External API Resource with Tags
 *
 * Demonstrates configuration via tags (correct pattern).
 *
 * Referenced in: resource-basic.md
 * Section: Configuration Pattern
 */
export const externalApiWithTags = (() => {
  const apiUrl = tag(custom<string>(), { label: 'config.apiUrl' })
  const apiKey = tag(custom<string>(), { label: 'config.apiKey' })

  const externalApi = provide((controller) => {
    const url = apiUrl.extractFrom(controller.scope)
    const key = apiKey.extractFrom(controller.scope)

    return {
      get: async <T>(path: string): Promise<T> => {
        const response = await fetch(`${url}${path}`, {
          headers: { 'Authorization': `Bearer ${key}` }
        })
        if (!response.ok) throw new Error(`API error: ${response.status}`)
        return response.json() as Promise<T>
      }
    }
  })

  return { apiUrl, apiKey, externalApi }
})()

/**
 * Database Pool with Cleanup
 *
 * Demonstrates proper cleanup registration.
 *
 * Referenced in: resource-basic.md
 * Section: Lifecycle Management
 */
export const dbPoolWithCleanup = provide((controller) => {
  const pool = {} as Pool

  controller.cleanup(() => pool.end())

  return { query: async (sql: string, params: any[]) => pool.query(sql, params) }
})

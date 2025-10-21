/**
 * @file basic-handler.ts
 * Basic executors with provide() and derive()
 *
 * Demonstrates:
 * - provide() for executors without dependencies
 * - derive() for executors with dependencies
 * - Type inference from destructuring
 *
 * Verify: pnpm -F @pumped-fn/examples typecheck
 * Run: pnpm -F @pumped-fn/examples dev:basic-handler
 */

import { provide, derive, createScope, Promised } from '@pumped-fn/core-next'
import type { AppConfig, DB } from './shared/tags'

// #region provide-basic
const config = provide(() => ({
  port: 3000,
  env: 'development' as const,
  dbHost: 'localhost'
}))
// #endregion provide-basic

// #region derive-single-dep
const dbConnection = derive(config, (cfg) => ({
  query: async (sql: string, params: any[]) => {
    console.log(`[${cfg.dbHost}] ${sql}`)
    return [{ id: '1', name: 'Test User' }]
  },
  close: async () => {
    console.log('Closing connection')
  }
}))
// #endregion derive-single-dep

// #region derive-multi-deps
const userService = derive(
  { db: dbConnection, config },
  ({ db, config }) => ({
    getUser: async (id: string) => {
      const results = await db.query(
        'SELECT * FROM users WHERE id = ?',
        [id]
      )
      return results[0]
    },
    listUsers: async () => {
      return db.query('SELECT * FROM users', [])
    }
  })
)
// #endregion derive-multi-deps

// #region scope-resolution
async function main() {
  const scope = createScope()

  const service = await scope.resolve(userService)
  const user = await service.getUser('123')

  console.log('User:', user)

  await scope.dispose()
}
// #endregion scope-resolution

Promised.try(main).catch((error) => {
  console.error(error)
  process.exit(1)
})

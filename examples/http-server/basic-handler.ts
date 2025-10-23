/**
 * @file basic-handler.ts
 * Basic executors with provide() and derive()
 *
 * Demonstrates:
 * - provide() for executors without dependencies
 * - derive() for executors with dependencies
 * - Type inference from destructuring
 * - ctx.run() for journaling resource operations
 *
 * Verify: pnpm -F @pumped-fn/examples typecheck
 * Run: pnpm -F @pumped-fn/examples dev:basic-handler
 */

import { provide, derive, createScope, flow, Promised } from '@pumped-fn/core-next'
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
  query: async (sql: string, params: unknown[]) => {
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

// #region flow-with-ctx-run
const getUserFlow = flow(
  { db: dbConnection },
  async (deps, ctx, userId: string) => {
    const results = await ctx.run('query-user-by-id', async () => {
      return deps.db.query('SELECT * FROM users WHERE id = ?', [userId])
    })

    if (results.length === 0) {
      return { ok: false as const, reason: 'user_not_found' as const }
    }

    return { ok: true as const, user: results[0] }
  }
)
// #endregion flow-with-ctx-run

// #region scope-resolution
async function main() {
  const scope = createScope()

  const service = await scope.resolve(userService)
  const user = await service.getUser('123')

  console.log('User:', user)

  const flowResult = await flow.execute(getUserFlow, '123', { scope })
  console.log('Flow result:', flowResult)

  await scope.dispose()
}
// #endregion scope-resolution

Promised.try(main).catch((error) => {
  console.error(error)
  process.exit(1)
})

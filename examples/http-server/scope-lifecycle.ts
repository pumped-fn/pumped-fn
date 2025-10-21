/**
 * @file scope-lifecycle.ts
 * Scope lifecycle and resource management
 *
 * Demonstrates:
 * - Creating scopes with tags
 * - Resolving executors from scope
 * - Resource cleanup with dispose()
 *
 * Verify: pnpm -F @pumped-fn/examples typecheck
 * Run: pnpm -F @pumped-fn/examples dev:scope-lifecycle
 */

import { provide, derive, createScope, Promised } from '@pumped-fn/core-next'
import { appConfig, type AppConfig, type DB } from './shared/tags'

const config = provide((controller) => appConfig.get(controller.scope))

const dbConnection = derive(config, (cfg) => ({
  pool: `connected to ${cfg.dbHost}`,
  query: async (sql: string, params: any[]) => ({ rows: [] }),
  close: async () => console.log('DB connection closed')
}))

const userService = derive({ db: dbConnection }, ({ db }) => ({
  getUser: async (id: string) => {
    const result = await db.query(`SELECT * FROM users WHERE id = ?`, [id])
    return result.rows[0]
  }
}))

async function main() {
  const scope = createScope({
    tags: [
      appConfig({
        port: 3000,
        env: 'production',
        dbHost: 'db.example.com'
      })
    ]
  })

  const service = await scope.resolve(userService)
  const user = await service.getUser('123')
  console.log('User:', user)

  await scope.dispose()
}

Promised.try(main).catch((error) => {
  console.error(error)
  process.exit(1)
})

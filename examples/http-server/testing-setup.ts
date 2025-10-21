/**
 * @file testing-setup.ts
 * Testing with preset() for mocking
 *
 * Demonstrates:
 * - Using preset() to override executors
 * - Scope isolation for tests
 * - Production vs test configurations
 *
 * Verify: pnpm -F @pumped-fn/examples typecheck
 * Run: pnpm -F @pumped-fn/examples dev:testing-setup
 */

import { provide, derive, createScope, preset, Promised } from '@pumped-fn/core-next'
import { appConfig, type DB } from './shared/tags'

const config = provide((controller) => appConfig.get(controller.scope))

const db = derive(config, (cfg) => ({
  query: async (sql: string, params: any[]) => {
    console.log('Real DB query:', sql)
    return { rows: [] }
  },
  close: async () => console.log('DB closed')
}))

const userService = derive({ db }, ({ db }) => ({
  getUser: async (id: string) => {
    const result = await db.query(`SELECT * FROM users WHERE id = ?`, [id])
    return result.rows[0]
  }
}))

const mockDb: DB = {
  query: async (sql: string, params: any[]) => {
    console.log('Mock DB query:', sql)
    return {
      rows: [{ id: '123', name: 'Test User' }]
    }
  },
  close: async () => console.log('Mock DB closed')
}

async function productionUsage() {
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
  console.log('Production user:', user)
  await scope.dispose()
}

async function testUsage() {
  const scope = createScope({
    tags: [
      appConfig({
        port: 3000,
        env: 'development',
        dbHost: 'localhost'
      })
    ],
    initialValues: [preset(db, mockDb)]
  })

  const service = await scope.resolve(userService)
  const user = await service.getUser('123')
  console.log('Test user:', user)
  await scope.dispose()
}

async function main() {
  console.log('--- Production ---')
  await productionUsage()

  console.log('\n--- Testing ---')
  await testUsage()
}

Promised.try(main).catch((error) => {
  console.error(error)
  process.exit(1)
})

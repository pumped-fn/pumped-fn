/**
 * @file type-inference.ts
 * Type inference patterns for executors
 *
 * Demonstrates:
 * - Destructuring for type inference
 * - Single vs multiple dependencies
 * - When types need explicit annotation
 * - Return type inference
 *
 * Verify: pnpm -F @pumped-fn/examples typecheck
 * Run: pnpm -F @pumped-fn/examples dev:type-inference
 */

import { provide, derive, createScope, Promised } from '@pumped-fn/core-next'

type DB = {
  query: (sql: string, params: any[]) => Promise<any[]>
}

type Config = {
  dbHost: string
  port: number
}

const dbExecutor = provide(() => ({
  query: async (sql: string, params: any[]) => {
    return [{ id: '1', name: 'Test' }]
  }
}))

const configExecutor = provide(() => ({
  dbHost: 'localhost',
  port: 3000
}))

// #region destructure-for-inference

// Single dependency - direct parameter
const singleDep = derive(dbExecutor, (db) => ({
  // db type inferred from dbExecutor
  findUser: (id: string) => db.query('SELECT * FROM users WHERE id = ?', [id])
}))

// Multiple dependencies - MUST destructure object
const multiDeps = derive(
  { db: dbExecutor, config: configExecutor },
  ({ db, config }) => ({
    // db and config types inferred from destructure
    connect: () => {
      console.log(`Connecting to ${config.dbHost}:${config.port}`)
      return db
    }
  })
)

// #endregion destructure-for-inference

// #region return-inference

// Return type inferred from implementation
const userService = derive({ db: dbExecutor }, ({ db }) => ({
  getUser: (id: string) => db.query('SELECT * FROM users WHERE id = ?', [id]),
  listUsers: () => db.query('SELECT * FROM users', []),
  deleteUser: (id: string) => db.query('DELETE FROM users WHERE id = ?', [id])
}))

// Type of userService inferred as:
// {
//   getUser: (id: string) => Promise<any[]>
//   listUsers: () => Promise<any[]>
//   deleteUser: (id: string) => Promise<any[]>
// }

// #endregion return-inference

// #region inference-with-complex-types

type UserService = {
  getUser: (id: string) => Promise<any[]>
  createUser: (name: string) => Promise<any[]>
}

// For complex types, structure code to enable inference
const complexService = derive({ db: dbExecutor }, ({ db }) => {
  const getUser = (id: string) => db.query('SELECT * FROM users WHERE id = ?', [id])
  const createUser = (name: string) => db.query('INSERT INTO users (name) VALUES (?)', [name])

  return { getUser, createUser }
})

// Type inferred correctly without explicit annotation

// #endregion inference-with-complex-types

// #region verify-inference
async function verifyInference() {
  const scope = createScope()

  // All types inferred, no explicit annotations needed
  const service = await scope.resolve(userService)
  const user = await service.getUser('123')

  console.log('User:', user)

  await scope.dispose()
}
// #endregion verify-inference

Promised.try(verifyInference).catch((error) => {
  console.error(error)
  process.exit(1)
})

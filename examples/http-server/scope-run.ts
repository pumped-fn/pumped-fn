/**
 * @file scope-run.ts
 * Entrypoint pattern with scope.run()
 *
 * Demonstrates:
 * - scope.run() for one-shot dependency resolution
 * - Reduced boilerplate at interaction points (HTTP/CLI/cron)
 * - Passing extra parameters via array
 * - Dependencies cached, callback ephemeral
 *
 * Verify: pnpm -F @pumped-fn/examples typecheck
 * Run: pnpm -F @pumped-fn/examples dev:scope-run
 */

import { provide, derive, createScope } from '@pumped-fn/core-next'

const dbConnection = provide(() => ({
  query: async (sql: string, params: unknown[]) => {
    console.log(`[DB Query] ${sql}`, params)
    return [{ id: '1', name: 'Alice', email: 'alice@example.com' }]
  }
}))

const userService = derive(dbConnection, (db) => ({
  getUser: async (id: string) => {
    const results = await db.query('SELECT * FROM users WHERE id = ?', [id])
    return results[0] as { id: string; name: string; email: string }
  },
  listUsers: async (page: number, limit: number) => {
    const offset = (page - 1) * limit
    const results = await db.query(
      'SELECT * FROM users LIMIT ? OFFSET ?',
      [limit, offset]
    )
    return results as { id: string; name: string; email: string }[]
  }
}))

const emailService = provide(() => ({
  send: async (to: string, subject: string, body: string) => {
    console.log(`[Email] To: ${to}, Subject: ${subject}`)
    console.log(`[Email] Body: ${body}`)
    return { sent: true, messageId: 'msg-123' }
  }
}))

async function main() {
  const scope = createScope()

  console.log('=== Example 1: Basic usage without params ===')
  const allUsers = await scope.run(
    { userService },
    ({ userService }) => userService.listUsers(1, 10)
  )
  console.log('All users:', allUsers)

  console.log('\n=== Example 2: With parameters ===')
  const user = await scope.run(
    { userService },
    ({ userService }, userId) => userService.getUser(userId),
    ['1']
  )
  console.log('User:', user)

  console.log('\n=== Example 3: Multiple dependencies ===')
  const result = await scope.run(
    { userService, emailService },
    ({ userService, emailService }, userId) => {
      return userService.getUser(userId).then((user) => {
        return emailService.send(
          user.email,
          'Welcome',
          `Hello ${user.name}!`
        )
      })
    },
    ['1']
  )
  console.log('Email result:', result)

  console.log('\n=== Example 4: Multiple parameters ===')
  const paginatedUsers = await scope.run(
    { userService },
    ({ userService }, page, limit) => userService.listUsers(page, limit),
    [2, 5]
  )
  console.log('Paginated users:', paginatedUsers)

  console.log('\n=== Example 5: Before/After comparison ===')

  console.log('Old pattern:')
  const service = await scope.resolve(userService)
  const oldResult = await service.getUser('1')
  console.log('Result:', oldResult)

  console.log('\nNew pattern:')
  const newResult = await scope.run(
    { userService },
    ({ userService }, userId) => userService.getUser(userId),
    ['1']
  )
  console.log('Result:', newResult)

  await scope.dispose()
}

main().catch(console.error)

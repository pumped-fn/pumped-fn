/**
 * @file promised-comprehensive.ts
 * Promised API patterns
 *
 * Demonstrates:
 * - .map() for transforming values
 * - .switch() for chaining Promised
 * - Promised.all() for parallel resolution
 * - .allSettled() with result handling
 * - .fulfilled(), .rejected(), .partition()
 *
 * Verify: pnpm -F @pumped-fn/examples typecheck
 * Run: pnpm -F @pumped-fn/examples dev:promised-comprehensive
 */

import { provide, derive, createScope, Promised } from '@pumped-fn/core-next'

type User = { id: string; name: string }
type Post = { id: string; title: string; userId: string }

const userDb = provide(() => ({
  getUser: async (id: string): Promise<User> => ({ id, name: `User ${id}` })
}))

const postDb = provide(() => ({
  getPosts: async (userId: string): Promise<Post[]> => [
    { id: '1', title: 'Post 1', userId }
  ]
}))

const commentDb = provide(() => ({
  getComments: async (postId: string) => [
    { id: '1', text: 'Comment 1', postId }
  ]
}))

// #region promised-map
const userService = derive({ db: userDb }, ({ db }) => ({
  getUser: (id: string) => db.getUser(id)
}))

async function mapExample() {
  const scope = createScope()

  const enrichedUser = scope
    .resolve(userService)
    .map(service => service.getUser('123'))
    .map(user => ({
      ...user,
      displayName: user.name.toUpperCase()
    }))

  const result = await enrichedUser
  console.log('Mapped user:', result)

  await scope.dispose()
}
// #endregion promised-map

// #region promised-switch
async function switchExample() {
  const scope = createScope()

  const userWithPosts = scope
    .resolve(userService)
    .switch(service =>
      Promised.create(service.getUser('123')).map(user =>
        scope.resolve(postDb).map(posts => ({
          user,
          posts: posts.getPosts(user.id)
        }))
      )
    )

  const result = await userWithPosts
  console.log('User with posts:', result)

  await scope.dispose()
}
// #endregion promised-switch

// #region promised-parallel
async function parallelExample() {
  const scope = createScope()

  const allData = Promised.all([
    scope.resolve(userService),
    scope.resolve(postDb),
    scope.resolve(commentDb)
  ])

  const [userSvc, postSvc, commentSvc] = await allData
  console.log('All services resolved:', {
    userSvc,
    postSvc,
    commentSvc
  })

  await scope.dispose()
}
// #endregion promised-parallel

// #region promised-settled
async function settledExample() {
  const scope = createScope()

  const failingService = provide(async () => {
    throw new Error('Service failed')
  })

  const results = Promised.allSettled([
    scope.resolve(userService),
    scope.resolve(failingService),
    scope.resolve(postDb)
  ] as const)

  const settled = await results
  const fulfilledServices = settled.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
  const rejectedServices = settled.filter((r): r is PromiseRejectedResult => r.status === 'rejected')

  console.log('Fulfilled services:', fulfilledServices.length)
  console.log('Failed services:', rejectedServices.length)
  console.log('Success/Failures:', fulfilledServices.length, rejectedServices.length)

  await scope.dispose()
}
// #endregion promised-settled

// #region promised-error-handling
async function errorHandlingExample() {
  const scope = createScope()

  const safeResult = scope
    .resolve(userService)
    .map(service => service.getUser('invalid'))
    .catch(error => {
      console.error('Error:', error)
      return null
    })

  const result = await safeResult
  console.log('Safe result:', result)

  await scope.dispose()
}
// #endregion promised-error-handling

Promised.try(() => Promise.all([
  mapExample(),
  switchExample(),
  parallelExample(),
  settledExample(),
  errorHandlingExample()
])).catch((error) => {
  console.error(error)
  process.exit(1)
})

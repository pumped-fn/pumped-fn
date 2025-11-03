/**
 * Flow Context Examples
 *
 * Extracted from flow-context.md
 * Contains examples of ctx.run(), ctx.parallel(), ctx.parallelSettled(),
 * context operations (ctx.set/get), and inDetails() patterns.
 */

import { flow, tag, custom, flowMeta } from '@pumped-fn/core-next'
import { FlowError } from '@pumped-fn/core-next'

/**
 * Process Data with ctx.run() Pattern
 *
 * Demonstrates ctx.run() for journaling validation, transformation, and external calls.
 * Shows discriminated union for early returns.
 *
 * Referenced in: flow-context.md
 * Section: ctx.run() - Journaled Operations > Pattern
 */
export const processData = flow(async (ctx, input: string) => {
  const validation = await ctx.run('validate', () => {
    if (!input || input.trim() === '') {
      return { ok: false as const, reason: 'EMPTY' as const }
    }
    return { ok: true as const }
  })

  if (!validation.ok) {
    return { success: false, reason: validation.reason }
  }

  const transformed = await ctx.run('transform', () => {
    return input.toUpperCase()
  })

  const saved = await ctx.run('save', async () => {
    return { id: 1, data: transformed }
  })

  return { success: true, result: saved }
})

/**
 * Load Data with Basic Journaling
 *
 * Simple journaling pattern from pumped-fn tests.
 *
 * Referenced in: flow-context.md
 * Section: Real Examples > Example 1: Basic Journaling
 */
const fetchData = () => Promise.resolve("data")

export const loadData = flow<{ url: string }, { data: string }>(
  async (ctx, _input) => {
    const data = await ctx.run("fetch", () => fetchData())
    return { data }
  }
)

/**
 * Deduplicated Operations
 *
 * Demonstrates ctx.run() deduplication by key - same key returns cached result.
 *
 * Referenced in: flow-context.md
 * Section: Real Examples > Example 2: Deduplication
 */
let executionCount = 0
const incrementCounter = () => ++executionCount

export const deduplicatedOps = flow<Record<string, never>, { value: number }>(
  async (ctx, _input) => {
    const firstCall = await ctx.run("op", () => incrementCounter())
    const secondCall = await ctx.run("op", () => incrementCounter())
    return { value: firstCall }
  }
)

/**
 * Multi-step Flow with Resources
 *
 * Shows ctx.run() journaling resource calls and enrichment logic.
 *
 * Referenced in: flow-context.md
 * Section: Real Examples > Example 3: Multi-step with Resources
 */
const fetchMock = async (url: string) => ({ data: `response from ${url}` })

export const fetchUserById = flow(async (ctx, userId: number) => {
  const response = await ctx.run("fetch-user", () =>
    fetchMock(`/users/${userId}`)
  )
  return { userId, username: `user${userId}`, raw: response.data }
})

export const fetchPostsByUserId = flow(async (ctx, userId: number) => {
  const response = await ctx.run("fetch-posts", () =>
    fetchMock(`/posts?userId=${userId}`)
  )
  return { posts: [{ id: 1, title: "Post 1" }], raw: response.data }
})

export const getUserWithPosts = flow(async (ctx, userId: number) => {
  const user = await ctx.exec(fetchUserById, userId)
  const posts = await ctx.exec(fetchPostsByUserId, userId)

  const enriched = await ctx.run("enrich", () => ({
    ...user,
    postCount: posts.posts.length
  }))

  return enriched
})

/**
 * Create User with Validation
 *
 * Discriminated union validation pattern with database operations.
 *
 * Referenced in: flow-context.md
 * Section: Real Examples > Example 4: Validation with Discriminated Unions
 */
const userRepository = {
  findByEmail: async (email: string) => null as any,
  create: async (data: { email: string; name: string }) => ({ id: 1, ...data })
}

export const createUser = flow(async (ctx, input: { email: string; name: string }) => {
  const validation = await ctx.run('validate-input', () => {
    if (!input.email.includes('@')) {
      return { ok: false as const, reason: 'INVALID_EMAIL' as const }
    }
    if (input.name.length < 2) {
      return { ok: false as const, reason: 'NAME_TOO_SHORT' as const }
    }
    return { ok: true as const }
  })

  if (!validation.ok) {
    return { success: false, reason: validation.reason }
  }

  const existing = await ctx.run('check-existing', async () => {
    return userRepository.findByEmail(input.email)
  })

  if (existing !== null) {
    return { success: false, reason: 'EMAIL_EXISTS' }
  }

  const user = await ctx.run('create-user', async () => {
    return userRepository.create({
      email: input.email,
      name: input.name
    })
  })

  return { success: true, user }
})

/**
 * Fetch User Data with ctx.parallel()
 *
 * Demonstrates concurrent execution of multiple flows using ctx.parallel().
 *
 * Referenced in: flow-context.md
 * Section: ctx.parallel() - Concurrent Execution > Pattern
 */
const fetchProfile = flow(async (_ctx, userId: string) => ({ name: `User ${userId}` }))
const fetchSettings = flow(async (_ctx, userId: string) => ({ theme: 'dark' }))
const fetchPreferences = flow(async (_ctx, userId: string) => ({ language: 'en' }))

export const fetchUserData = flow(async (ctx, userId: string) => {
  const profilePromise = ctx.exec(fetchProfile, userId)
  const settingsPromise = ctx.exec(fetchSettings, userId)
  const preferencesPromise = ctx.exec(fetchPreferences, userId)

  const parallel = await ctx.parallel([
    profilePromise,
    settingsPromise,
    preferencesPromise
  ])

  return {
    profile: parallel.results[0],
    settings: parallel.results[1],
    preferences: parallel.results[2]
  }
})

/**
 * Combine Results with ctx.parallel()
 *
 * Real example from pumped-fn tests showing concurrent async operations.
 *
 * Referenced in: flow-context.md
 * Section: Real Example: ctx.parallel()
 */
const doubleAsync = flow<{ x: number }, { r: number }>(async (_ctx, input) => {
  await new Promise((resolve) => setTimeout(resolve, 10))
  return { r: input.x * 2 }
})

const tripleAsync = flow<{ x: number }, { r: number }>(async (_ctx, input) => {
  await new Promise((resolve) => setTimeout(resolve, 10))
  return { r: input.x * 3 }
})

export const combineResults = flow<{ val: number }, { sum: number }>(
  async (ctx, input) => {
    const doublePromise = ctx.exec(doubleAsync, { x: input.val })
    const triplePromise = ctx.exec(tripleAsync, { x: input.val })

    const parallel = await ctx.parallel([doublePromise, triplePromise])

    const sum = parallel.results[0].r + parallel.results[1].r
    return { sum }
  }
)

/**
 * Fetch Multiple Resources with ctx.parallelSettled()
 *
 * Demonstrates handling partial failures with statistics tracking.
 *
 * Referenced in: flow-context.md
 * Section: ctx.parallelSettled() - Partial Failures > Pattern
 */
const fetchResource = flow(async (_ctx, id: string) => ({ id, data: 'resource data' }))

export const fetchMultipleResources = flow(async (ctx, resourceIds: string[]) => {
  const promises = resourceIds.map(id => ctx.exec(fetchResource, id))

  const settled = await ctx.parallelSettled(promises)

  const successful = settled.results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value)

  const failed = settled.results
    .filter(r => r.status === 'rejected')
    .map(r => r.reason)

  return { successful, failed }
})

/**
 * Gather Results with Mixed Success/Failure
 *
 * Real example showing ctx.parallelSettled() with statistics.
 *
 * Referenced in: flow-context.md
 * Section: Real Example: ctx.parallelSettled()
 */
const successFlow = flow<Record<string, never>, { ok: boolean }>(() => ({
  ok: true
}))

const failureFlow = flow(() => {
  throw new FlowError("Failed", "ERR")
})

export const gatherResults = flow<
  Record<string, never>,
  { succeeded: number; failed: number }
>(async (ctx, _input) => {
  const first = ctx.exec(successFlow, {})
  const second = ctx.exec(failureFlow, {})
  const third = ctx.exec(successFlow, {})

  const settled = await ctx.parallelSettled([first, second, third])

  return {
    succeeded: settled.stats.succeeded,
    failed: settled.stats.failed
  }
})

/**
 * Store Custom Value in Context
 *
 * Demonstrates ctx.set() and ctx.get() with custom tags.
 *
 * Referenced in: flow-context.md
 * Section: Reading and Writing Context > Pattern
 */
const processingKey = tag(custom<string>(), { label: 'customKey' })

export const storeCustomValue = flow(async (ctx, input: string) => {
  ctx.set(processingKey, `processed-${input}`)
  const value = ctx.get(processingKey)
  return input.toUpperCase()
})

/**
 * Multi-step Calculation with Journal
 *
 * Shows journal tracking all ctx.run() operations.
 *
 * Referenced in: flow-context.md
 * Section: Built-in Context Metadata > Example: Accessing Journal
 */
export const multiStepCalculation = flow(async (ctx, input: number) => {
  const doubled = await ctx.run("double", () => input * 2)
  const tripled = await ctx.run("triple", () => input * 3)
  const combined = await ctx.run("sum", () => doubled + tripled)
  return combined
})

/**
 * Calculate Both with inDetails()
 *
 * Demonstrates inDetails() returning result and context together.
 *
 * Referenced in: flow-context.md
 * Section: inDetails() - Result with Context > Pattern
 */
export const calculateBoth = flow(async (ctx, input: { x: number; y: number }) => {
  const sum = await ctx.run('sum', () => input.x + input.y)
  const product = await ctx.run('product', () => input.x * input.y)
  return { sum, product }
})

/**
 * Operation with Error
 *
 * Shows context preservation on error with inDetails().
 *
 * Referenced in: flow-context.md
 * Section: inDetails() > Example: Error with Context
 */
export const operationWithError = flow(async (ctx, input: number) => {
  await ctx.run("before-error", () => input * 2)
  throw new Error("test error")
})

/**
 * Double Value with Context Chaining
 *
 * Demonstrates inDetails() after .map() transformation.
 *
 * Referenced in: flow-context.md
 * Section: Promised Chaining with Context > Pattern
 */
export const doubleValue = flow(async (ctx, input: number) => {
  await ctx.run("increment", () => input + 1)
  return input * 2
})

/**
 * Increment Value with Details Option
 *
 * Shows execution options: details flag behavior.
 *
 * Referenced in: flow-context.md
 * Section: Execution Options: details Flag
 */
export const incrementValue = flow((_ctx, input: number) => input + 1)

export const processNested = flow(async (ctx, input: number) => {
  const incremented = await ctx.exec(incrementValue, input)
  return incremented * 2
})

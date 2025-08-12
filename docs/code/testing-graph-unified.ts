// #region snippet
import { test, expect } from 'vitest'
import { provide, derive, createScope, preset } from '@pumped-fn/core-next'

// Your application dependency graph
const env = provide(() => process.env.NODE_ENV || 'production')

const config = derive(env, (environment) => ({
  apiUrl: environment === 'production' 
    ? 'https://api.prod.com' 
    : 'https://api.test.com',
  cache: environment === 'production' ? 'redis' : 'memory',
  timeout: environment === 'production' ? 5000 : 100
}))

const httpClient = derive(config, (cfg) => ({
  get: async (path: string) => {
    const url = `${cfg.apiUrl}${path}`
    // In tests, this would use cfg.timeout of 100ms
    // In production, this would use 5000ms
    return fetch(url, { signal: AbortSignal.timeout(cfg.timeout) })
  }
}))

const cache = derive(config, (cfg) => ({
  type: cfg.cache,
  get: (key: string) => cfg.cache === 'redis' 
    ? `redis:${key}` 
    : `memory:${key}`
}))

const userRepository = derive([httpClient, cache], (client, cache) => ({
  async getUser(id: number) {
    const cacheKey = cache.get(`user:${id}`)
    // Would check cache first...
    return {
      source: cache.type,
      endpoint: `${client.get}/users/${id}`,
      cached: cacheKey
    }
  }
}))

// Test 1: Change the root, entire graph adapts
test('development environment setup', async () => {
  const scope = createScope(
    preset(env, 'development')
  )
  
  const repo = await scope.resolve(userRepository)
  const user = await repo.getUser(123)
  
  // Everything automatically configured for development
  expect(user.source).toBe('memory')
  expect(user.cached).toBe('memory:user:123')
  // API calls would go to test server with 100ms timeout
})

// Test 2: Production environment (isolated scope)
test.concurrent('production environment', async () => {
  const scope = createScope(
    preset(env, 'production')
  )
  
  const repo = await scope.resolve(userRepository)
  const user = await repo.getUser(456)
  
  // Completely different configuration, same code
  expect(user.source).toBe('redis')
  expect(user.cached).toBe('redis:user:456')
  // API calls would go to production with 5s timeout
})

// Test 3: Custom scenario - slow network simulation
test.concurrent('slow network scenario', async () => {
  const scope = createScope(
    // Override just the config, everything downstream updates
    preset(config, {
      apiUrl: 'https://api.slow.com',
      cache: 'memory',
      timeout: 30000 // 30 second timeout
    })
  )
  
  const client = await scope.resolve(httpClient)
  // Client automatically uses 30s timeout
  
  const repo = await scope.resolve(userRepository)
  // Repository uses slow client and memory cache
})

// Test 4: Failure scenario
test('api failure handling', async () => {
  const scope = createScope(
    // Mock just the HTTP client
    preset(httpClient, {
      get: async () => { throw new Error('Network error') }
    })
  )
  
  const repo = await scope.resolve(userRepository)
  // Test error handling with mocked failure
  await expect(repo.getUser(1)).rejects.toThrow('Network error')
})

// The key insight: One preset can change the entire behavior
// No need to mock fetch, cache, config separately
// The graph propagates changes automatically
// Each test has an isolated scope - run them all concurrently!
// #endregion snippet
/**
 * @file tags-foundation.ts
 * Tag system fundamentals
 *
 * Demonstrates:
 * - Tag creation with types
 * - Tag attachment to scopes
 * - Tag retrieval (get vs find)
 * - Type safety through tags
 *
 * Verify: pnpm -F @pumped-fn/examples typecheck
 * Run: pnpm -F @pumped-fn/examples dev:tags-foundation
 */

import { tag, custom, createScope, Promised } from '@pumped-fn/core-next'
import { appConfig, requestId, logger } from './shared/tags'

// #region problem-untyped
function withoutTags() {
  const scope = createScope() as any

  const config = scope.get('appConfig')
  // config is 'any' - no type safety
  // config.port could be wrong type at runtime
}
// #endregion problem-untyped

// #region solution-tags
function withTags() {
  const scope = createScope({
    tags: [
      appConfig({
        port: 8080,
        env: 'production',
        dbHost: 'prod-db.example.com'
      })
    ]
  })

  const config = appConfig.get(scope)
  // config is AppConfig - fully typed
  console.log(`Server port: ${config.port}`)
}
// #endregion solution-tags

// #region tag-creation
const customTag = tag(custom<{ value: number }>(), {
  label: 'custom.data'
})

const withDefault = tag(custom<number>(), {
  label: 'retry.count',
  default: 3
})
// #endregion tag-creation

// #region get-vs-find
function tagAccessPatterns() {
  const scope = createScope({
    tags: [
      appConfig({
        port: 3000,
        env: 'development',
        dbHost: 'localhost'
      })
    ]
  })

  // .get() throws if not found - use for required values
  const config = appConfig.get(scope)
  console.log('Config:', config.port)

  // .find() returns undefined - use for optional values
  const reqId = requestId.find(scope)
  if (reqId) {
    console.log('Request ID:', reqId)
  } else {
    console.log('No request ID set')
  }

  // .find() with default returns default value
  const retryCount = withDefault.find(scope)
  console.log('Retry count:', retryCount)
}
// #endregion get-vs-find

// #region tag-usage-everywhere
function tagsInDifferentContexts() {
  const scope = createScope({
    tags: [
      logger(console),
      appConfig({
        port: 3000,
        env: 'development',
        dbHost: 'localhost'
      })
    ]
  })

  // Tags work with scope
  const log = logger.get(scope)
  log.info('Using tag with scope')

  // Tags work with any container implementing get/set
  const store = new Map()
  requestId.set(store, 'req-123')
  const id = requestId.find(store)
  console.log('From Map:', id)
}
// #endregion tag-usage-everywhere

Promised.try(() => {
  withTags()
  tagAccessPatterns()
  tagsInDifferentContexts()
}).catch((error) => {
  console.error(error)
  process.exit(1)
})

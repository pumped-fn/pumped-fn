/**
 * @file tags-foundation.ts
 * Tag system fundamentals
 *
 * Demonstrates:
 * - Tag creation with types
 * - Tag attachment to scopes
 * - Tag retrieval (extractFrom vs readFrom)
 * - Type safety through tags
 *
 * Verify: pnpm -F @pumped-fn/examples typecheck
 * Run: pnpm -F @pumped-fn/examples dev:tags-foundation
 */

import { tag, custom, createScope, Promised } from '@pumped-fn/core-next'
import { appConfig, requestId, logger } from './shared/tags'

// #region problem-untyped
function withoutTags() {
  const scope = new Map<string, unknown>()
  scope.set('appConfig', { port: 8080, env: 'production', dbHost: 'db' })

  const config = scope.get('appConfig')
  // config is 'unknown' - no type safety
  // Would need runtime checks or unsafe casting
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

  const config = appConfig.extractFrom(scope)
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

// #region extractFrom-vs-readFrom
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

  // .extractFrom() throws if not found - use for required values
  const config = appConfig.extractFrom(scope)
  console.log('Config:', config.port)

  // .readFrom() returns undefined - use for optional values
  const reqId = requestId.readFrom(scope)
  if (reqId) {
    console.log('Request ID:', reqId)
  } else {
    console.log('No request ID set')
  }

  // .readFrom() with default returns default value
  const retryCount = withDefault.readFrom(scope)
  console.log('Retry count:', retryCount)
}
// #endregion extractFrom-vs-readFrom

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
  const log = logger.extractFrom(scope)
  log.info('Using tag with scope')

  // Tags work with any container implementing Store interface
  const store = new Map()
  requestId.writeToStore(store, 'req-123')
  const id = requestId.readFrom(store)
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

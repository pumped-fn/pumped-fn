import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { createScope } from '@pumped-fn/core-next'
import { sessionCacheCtl, cacheKey } from './state.session-cache'

const key = cacheKey<string>('test.key')

describe('sessionCache', () => {
  it('stores and retrieves', async () => {
    const scope = createScope()
    const cache = await scope.resolve(sessionCacheCtl)
    await cache.set(key, 'value', 60000)
    assert.equal(cache.get(key), 'value')
    await scope.dispose()
  })

  it('expires after TTL', async () => {
    const scope = createScope()
    const cache = await scope.resolve(sessionCacheCtl)
    await cache.set(key, 'value', 1)
    await new Promise(r => setTimeout(r, 10))
    assert.equal(cache.get(key), undefined)
    await scope.dispose()
  })
})

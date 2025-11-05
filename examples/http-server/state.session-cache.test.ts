import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { createScope } from '@pumped-fn/core-next'
import { sessionCacheCtl, cacheKey } from './state.session-cache'

const key = cacheKey<string>('test.key')

describe('sessionCache', () => {
  it('stores and retrieves', async () => {
    const scope = createScope()
    const cache = await scope.resolve(sessionCacheCtl)
    await cache.set(key, 'value')
    assert.equal(cache.get(key), 'value')
    await scope.dispose()
  })

  it('clears on dispose', async () => {
    const scope = createScope()
    const cache = await scope.resolve(sessionCacheCtl)
    await cache.set(key, 'value')
    await scope.dispose()
    const scope2 = createScope()
    const cache2 = await scope2.resolve(sessionCacheCtl)
    assert.equal(cache2.get(key), undefined)
    await scope2.dispose()
  })
})

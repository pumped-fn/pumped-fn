import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { createScope } from '@pumped-fn/core-next'
import { sessionCacheCtl, cacheKey } from './state.session-cache'

const key1 = cacheKey<string>('session.key1')
const key2 = cacheKey<string>('session.key2')

describe('sessionCache', () => {
  it('stores and retrieves values', async () => {
    const scope = createScope()
    const cache = await scope.resolve(sessionCacheCtl)

    await cache.set(key1, 'value1', 60000)
    const result = cache.get(key1)

    assert.equal(result, 'value1')
    await scope.dispose()
  })

  it('expires entries after TTL', async () => {
    const scope = createScope()
    const cache = await scope.resolve(sessionCacheCtl)

    await cache.set(key1, 'value1', 1)
    await new Promise(resolve => setTimeout(resolve, 10))
    const result = cache.get(key1)

    assert.equal(result, undefined)
    await scope.dispose()
  })

  it('deletes specific entries', async () => {
    const scope = createScope()
    const cache = await scope.resolve(sessionCacheCtl)

    await cache.set(key1, 'value1', 60000)
    await cache.delete(key1)

    assert.equal(cache.get(key1), undefined)
    await scope.dispose()
  })

  it('clears all entries', async () => {
    const scope = createScope()
    const cache = await scope.resolve(sessionCacheCtl)

    await cache.set(key1, 'value1', 60000)
    await cache.set(key2, 'value2', 60000)
    await cache.clear()

    assert.equal(cache.get(key1), undefined)
    assert.equal(cache.get(key2), undefined)
    await scope.dispose()
  })
})

import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { createScope, preset } from '@pumped-fn/core-next'
import { fetchUser } from './flow.authenticated-request'
import { apiClient } from './resource.api-client'

describe('fetchUser', () => {
  it('fetches user data', async () => {
    const scope = createScope({
      initialValues: [
        preset(apiClient, { fetch: async () => ({ id: '1', name: 'Alice' }) })
      ]
    })
    const r = await scope.exec({ flow: fetchUser, input: '1' })
    assert.equal(r.id, '1')
    assert.equal(r.name, 'Alice')
    await scope.dispose()
  })

  it('throws on auth failure', async () => {
    const scope = createScope()
    await assert.rejects(
      async () => await scope.exec({ flow: fetchUser, input: '1' }),
      { message: 'Not authenticated' }
    )
    await scope.dispose()
  })
})

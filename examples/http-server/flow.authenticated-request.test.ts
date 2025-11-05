import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { createScope, preset } from '@pumped-fn/core-next'
import { fetchUser } from './flow.authenticated-request'
import { oauthTokensCtl } from './state.oauth-tokens'
import { apiClient } from './resource.api-client'

describe('fetchUser', () => {
  it('not authenticated', async () => {
    const scope = createScope()
    const r = await scope.exec({ flow: fetchUser, input: { userId: '1' } })
    assert.equal(r.success, false)
    assert.equal(r.success ? null : r.reason, 'NOT_AUTHENTICATED')
    await scope.dispose()
  })

  it('token expired', async () => {
    const scope = createScope({
      initialValues: [preset(oauthTokensCtl, {
        get: () => ({ accessToken: 'tk', expiresAt: 0 }),
        set: () => {},
        isExpired: () => true
      })]
    })
    const r = await scope.exec({ flow: fetchUser, input: { userId: '1' } })
    assert.equal(r.success ? null : r.reason, 'TOKEN_EXPIRED')
    await scope.dispose()
  })

  it('success', async () => {
    const scope = createScope({
      initialValues: [
        preset(oauthTokensCtl, {
          get: () => ({ accessToken: 'tk', expiresAt: Date.now() + 9999 }),
          set: () => {},
          isExpired: () => false
        }),
        preset(apiClient, { fetch: async () => ({ success: true, data: { id: '1', name: 'A', email: 'a@b' } }) })
      ]
    })
    const r = await scope.exec({ flow: fetchUser, input: { userId: '1' } })
    assert.equal(r.success, true)
    assert.equal(r.success ? r.user.id : null, '1')
    await scope.dispose()
  })

  it('api error', async () => {
    const scope = createScope({
      initialValues: [
        preset(oauthTokensCtl, {
          get: () => ({ accessToken: 'tk', expiresAt: Date.now() + 9999 }),
          set: () => {},
          isExpired: () => false
        }),
        preset(apiClient, { fetch: async () => ({ success: false, error: 'err' }) })
      ]
    })
    const r = await scope.exec({ flow: fetchUser, input: { userId: '1' } })
    assert.equal(r.success ? null : r.reason, 'API_ERROR')
    await scope.dispose()
  })
})

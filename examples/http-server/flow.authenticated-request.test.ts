import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { createScope, preset } from '@pumped-fn/core-next'
import { fetchUser } from './flow.authenticated-request'
import { oauthTokensCtl } from './state.oauth-tokens'
import { apiClient } from './resource.api-client'

describe('fetchUser', () => {
  it('returns NOT_AUTHENTICATED when no token', async () => {
    const scope = createScope()
    const result = await scope.exec({ flow: fetchUser, input: { userId: '123' } })

    assert.equal(result.success, false)
    if (!result.success) {
      assert.equal(result.reason, 'NOT_AUTHENTICATED')
    }

    await scope.dispose()
  })

  it('returns TOKEN_EXPIRED when token expired', async () => {
    const scope = createScope({
      initialValues: [
        preset(oauthTokensCtl, {
          get: () => ({
            accessToken: 'token',
            refreshToken: 'refresh',
            expiresAt: Date.now() - 1000
          }),
          set: () => {},
          clear: () => {},
          isExpired: () => true
        })
      ]
    })

    const result = await scope.exec({ flow: fetchUser, input: { userId: '123' } })

    assert.equal(result.success, false)
    if (!result.success) {
      assert.equal(result.reason, 'TOKEN_EXPIRED')
    }

    await scope.dispose()
  })

  it('returns user when authenticated', async () => {
    const mockUser = { id: '123', name: 'Test User', email: 'test@example.com' }

    const scope = createScope({
      initialValues: [
        preset(oauthTokensCtl, {
          get: () => ({
            accessToken: 'valid-token',
            refreshToken: 'refresh-token',
            expiresAt: Date.now() + 60000
          }),
          set: () => {},
          clear: () => {},
          isExpired: () => false
        }),
        preset(apiClient, {
          fetch: async () => ({ success: true as const, data: mockUser })
        })
      ]
    })

    const result = await scope.exec({ flow: fetchUser, input: { userId: '123' } })

    assert.equal(result.success, true)
    if (result.success) {
      assert.equal(result.user.id, '123')
      assert.equal(result.user.name, 'Test User')
    }

    await scope.dispose()
  })

  it('returns API_ERROR when api fails', async () => {
    const scope = createScope({
      initialValues: [
        preset(oauthTokensCtl, {
          get: () => ({
            accessToken: 'valid-token',
            refreshToken: 'refresh-token',
            expiresAt: Date.now() + 60000
          }),
          set: () => {},
          clear: () => {},
          isExpired: () => false
        }),
        preset(apiClient, {
          fetch: async () => ({ success: false as const, error: 'Network error' })
        })
      ]
    })

    const result = await scope.exec({ flow: fetchUser, input: { userId: '123' } })

    assert.equal(result.success, false)
    if (!result.success) {
      assert.equal(result.reason, 'API_ERROR')
      if (result.reason === 'API_ERROR') {
        assert.equal(result.message, 'Network error')
      }
    }

    await scope.dispose()
  })
})

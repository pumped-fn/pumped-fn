/**
 * @file resource.api-client.ts
 * API client resource depending on oauth token state
 *
 * Demonstrates:
 * - Resource depending on state
 * - State → Resource composition
 * - .static.get() for imperative access
 *
 * Verify: pnpm -F @pumped-fn/examples typecheck
 */

import { derive } from '@pumped-fn/core-next'
import { oauthTokensCtl } from './state.oauth-tokens'

export namespace ApiClient {
  export type Config = {
    baseUrl: string
  }

  export type Response<T> = {
    success: true
    data: T
  } | {
    success: false
    error: string
  }
}

export const apiClient = derive(oauthTokensCtl, (tokensCtl) => {
  const config: ApiClient.Config = {
    baseUrl: process.env.API_BASE_URL || 'https://api.example.com'
  }

  return {
    fetch: async <T>(path: string): Promise<ApiClient.Response<T>> => {
      const tokens = tokensCtl.get()

      if (tokensCtl.isExpired()) {
        return { success: false, error: 'Token expired' }
      }

      if (!tokens.accessToken) {
        return { success: false, error: 'Not authenticated' }
      }

      try {
        const response = await fetch(`${config.baseUrl}${path}`, {
          headers: {
            'Authorization': `Bearer ${tokens.accessToken}`
          }
        })

        if (!response.ok) {
          return { success: false, error: `HTTP ${response.status}` }
        }

        const data = await response.json() as T
        return { success: true, data }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }
})

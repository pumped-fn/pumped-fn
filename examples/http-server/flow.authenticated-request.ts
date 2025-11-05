/**
 * @file flow.authenticated-request.ts
 * Flow orchestrating oauth state and api client resource
 *
 * Demonstrates:
 * - entrypoint → flow → state → resource pattern
 * - Flow as orchestration entry point
 * - Error handling with discriminated unions
 *
 * Verify: pnpm -F @pumped-fn/examples typecheck
 */

import { flow } from '@pumped-fn/core-next'
import { oauthTokensCtl } from './state.oauth-tokens'
import { apiClient } from './resource.api-client'

export namespace FetchUser {
  export type Input = {
    userId: string
  }

  export type User = {
    id: string
    name: string
    email: string
  }

  export type Success = {
    success: true
    user: User
  }

  export type Error =
    | { success: false; reason: 'NOT_AUTHENTICATED' }
    | { success: false; reason: 'TOKEN_EXPIRED' }
    | { success: false; reason: 'API_ERROR'; message: string }

  export type Result = Success | Error
}

export const fetchUser = flow(
  [oauthTokensCtl, apiClient] as const,
  async ([tokensCtl, api], ctx, input: FetchUser.Input): Promise<FetchUser.Result> => {
    const tokens = await ctx.exec({
      key: 'check-tokens',
      fn: () => tokensCtl.get()
    })

    if (!tokens.accessToken) {
      return { success: false, reason: 'NOT_AUTHENTICATED' }
    }

    if (tokensCtl.isExpired()) {
      return { success: false, reason: 'TOKEN_EXPIRED' }
    }

    const response = await ctx.exec({
      key: 'fetch-user',
      fn: () => api.fetch<FetchUser.User>(`/users/${input.userId}`)
    })

    if (!response.success) {
      return {
        success: false,
        reason: 'API_ERROR',
        message: response.error
      }
    }

    return { success: true, user: response.data }
  }
)

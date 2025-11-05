import { flow } from '@pumped-fn/core-next'
import { oauthTokensCtl } from './state.oauth-tokens'
import { apiClient } from './resource.api-client'

type User = { id: string; name: string; email: string }
type Result =
  | { success: true; user: User }
  | { success: false; reason: 'NOT_AUTHENTICATED' | 'TOKEN_EXPIRED' | 'API_ERROR'; message?: string }

export const fetchUser = flow(
  [oauthTokensCtl, apiClient] as const,
  async ([tokens, api], ctx, input: { userId: string }): Promise<Result> => {
    if (!tokens.get().accessToken) return { success: false, reason: 'NOT_AUTHENTICATED' }
    if (tokens.isExpired()) return { success: false, reason: 'TOKEN_EXPIRED' }

    const res = await api.fetch<User>(`/users/${input.userId}`)
    if (!res.success) return { success: false, reason: 'API_ERROR', message: res.error }

    return { success: true, user: res.data }
  }
)

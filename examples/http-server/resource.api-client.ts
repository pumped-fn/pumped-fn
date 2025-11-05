import { derive } from '@pumped-fn/core-next'
import { oauthTokensCtl } from './state.oauth-tokens'

type Response<T> = { success: true; data: T } | { success: false; error: string }

export const apiClient = derive(oauthTokensCtl, (tokens) => ({
  fetch: async <T>(path: string): Promise<Response<T>> => {
    if (tokens.isExpired()) return { success: false, error: 'Token expired' }
    const { accessToken } = tokens.get()
    if (!accessToken) return { success: false, error: 'Not authenticated' }

    try {
      const res = await fetch(`https://api.example.com${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
      return { success: true, data: await res.json() as T }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown' }
    }
  }
}))

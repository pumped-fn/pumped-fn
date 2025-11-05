import { derive } from '@pumped-fn/core-next'
import { oauthTokensCtl } from './state.oauth-tokens'

export const apiClient = derive(oauthTokensCtl, (tokens) => ({
  fetch: async <T>(path: string): Promise<T> => {
    const { accessToken } = tokens.get()
    if (!accessToken) throw new Error('Not authenticated')

    const res = await fetch(`https://api.example.com${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    return await res.json() as T
  }
}))

import { flow } from '@pumped-fn/core-next'
import { apiClient } from './resource.api-client'

type User = { id: string; name: string }

export const fetchUser = flow(
  apiClient,
  async (api, ctx, userId: string) => {
    return await api.fetch<User>(`/users/${userId}`)
  }
)

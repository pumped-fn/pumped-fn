// Three-Layer Architecture Example
// Demonstrates Resource → Feature → UI pattern without JSX

import { provide, derive, tag, custom, createScope } from '@pumped-fn/core-next'

// ===== Layer 1: Resource Layer =====
// External systems: API clients, WebSocket, etc.

export const apiBaseUrl = tag(custom<string>(), {
  label: 'api.baseUrl',
  default: 'https://api.example.com'
})

type User = {
  id: string
  name: string
  roles: Array<{ name: string; permissions: string[] }>
}

type Post = {
  id: string
  title: string
  authorId: string
}

type APIClient = {
  get<T>(path: string): Promise<T>
}

export const apiClient = provide<APIClient>((controller) => {
  const base = apiBaseUrl.get(controller.scope)

  return {
    async get<T>(path: string): Promise<T> {
      const res = await fetch(`${base}${path}`)
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      return res.json()
    }
  }
})

export const currentUser = derive(apiClient, async (client) => {
  return await client.get<User>('/me')
})

// ===== Layer 2: Feature State =====
// Business logic: derived data, permissions, computed values

export const userPermissions = derive(
  currentUser.reactive,
  (user) => user.roles.flatMap((role: { permissions: string[] }) => role.permissions)
)

export const canEditPosts = derive(
  userPermissions.reactive,
  (permissions) => permissions.includes('posts.edit')
)

export const posts = derive(apiClient, async (client) => {
  return await client.get<Post[]>('/posts')
})

export const userPosts = derive(
  { posts: posts.reactive, user: currentUser.reactive },
  ({ posts, user }) => posts.filter((p: Post) => p.authorId === user.id)
)

export const postCount = derive(
  userPosts.reactive,
  (posts) => posts.length
)

// ===== Layer 3: UI Integration (conceptual) =====
// In React components, use: useResolves(currentUser, canEditPosts, userPosts)

// ===== Scope Setup =====

export const appScope = createScope({
  tags: [apiBaseUrl('https://api.example.com')]
})

// Usage in React:
// <ScopeProvider scope={appScope}>
//   <App />
// </ScopeProvider>

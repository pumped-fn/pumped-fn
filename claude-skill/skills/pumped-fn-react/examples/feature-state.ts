// Feature State Example
// Shows business logic layer - pure TypeScript, no React imports

import { derive, provide } from '@pumped-fn/core-next'
import { apiClient, currentUser, protectedApi } from './resource-layer'

// ===== User permissions =====
export const userPermissions = derive(
  currentUser.reactive,
  (user) => user.roles.flatMap(role => role.permissions)
)

export const canEditPosts = derive(
  userPermissions.reactive,
  (permissions) => permissions.includes('posts.edit')
)

export const canDeletePosts = derive(
  userPermissions.reactive,
  (permissions) => permissions.includes('posts.delete')
)

export const canManageUsers = derive(
  userPermissions.reactive,
  (permissions) => permissions.includes('users.manage')
)

// ===== Posts data =====
type Post = {
  id: string
  title: string
  content: string
  authorId: string
}

export const posts = provide((controller) => {
  const api = protectedApi.get(controller.scope)
  return api.get<Post[]>('/posts')
})

export const editablePosts = derive(
  { posts: posts.reactive, canEdit: canEditPosts.reactive },
  ({ posts, canEdit }) => {
    if (!canEdit) return []
    return posts
  }
)

// ===== Computed state =====
export const postCount = derive(
  posts.reactive,
  (postList) => postList.length
)

export const userPosts = derive(
  { posts: posts.reactive, user: currentUser.reactive },
  ({ posts, user }) => posts.filter(p => p.authorId === user.id)
)

export const hasUnpublishedPosts = derive(
  userPosts.reactive,
  (posts) => posts.some(p => p.content === '')
)

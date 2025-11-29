/**
 * Mutations with optimistic updates
 *
 * Mutations define operations that:
 * 1. Apply an optimistic change immediately (before server responds)
 * 2. Execute the actual server request
 * 3. Either commit the change (on success) or rollback (on failure)
 *
 * The optimistic layer is separate from the atom layer:
 * - Atoms hold server truth
 * - Optimistic layer overlays pending changes
 * - Components see the merged result
 */

import { mutation } from "@pumped-fn/lite-react"
import { api } from "./api"
import type { Atoms } from "./atoms"
import type { Post, Notification, CreatePostInput } from "./types"

/**
 * Like post mutation
 *
 * Optimistically updates the post's liked state and count.
 * Rolls back automatically if the server request fails.
 */
export const likeMutation = mutation<Atoms, { postId: string }>({
  optimistic: (posts: Post[], { postId }) =>
    posts.map((post) =>
      post.id === postId
        ? { ...post, liked: true, likeCount: post.likeCount + 1 }
        : post
    ),

  mutate: async (ctx, { postId }) => {
    await api.likePost(postId)
  },

  onSuccess: (ctx) => {
    ctx.invalidate("posts")
  },

  onError: (ctx, error, { postId }) => {
    console.error(`Failed to like post ${postId}:`, error.message)
  },

  invalidates: ["posts"],
})

/**
 * Unlike post mutation
 */
export const unlikeMutation = mutation<Atoms, { postId: string }>({
  optimistic: (posts: Post[], { postId }) =>
    posts.map((post) =>
      post.id === postId
        ? { ...post, liked: false, likeCount: Math.max(0, post.likeCount - 1) }
        : post
    ),

  mutate: async (ctx, { postId }) => {
    await api.unlikePost(postId)
  },

  invalidates: ["posts"],
})

/**
 * Delete post mutation
 *
 * Optimistically removes the post from the list.
 * If the server fails, the post reappears.
 */
export const deletePostMutation = mutation<Atoms, { postId: string }>({
  optimistic: (posts: Post[], { postId }) => posts.filter((post) => post.id !== postId),

  mutate: async (ctx, { postId }) => {
    await api.deletePost(postId)
  },

  onSuccess: (ctx) => {
    ctx.invalidate("posts")
  },

  onError: (ctx, error, { postId }) => {
    console.error(`Failed to delete post ${postId}:`, error.message)
  },

  invalidates: ["posts"],
})

/**
 * Create post mutation
 *
 * Optimistically adds a placeholder post to the top of the feed.
 * Replaces with real post data on success.
 */
export const createPostMutation = mutation<Atoms, CreatePostInput, Post>({
  optimistic: (posts: Post[], input) => [
    {
      id: `temp-${Date.now()}`,
      authorId: "pending",
      authorName: "You",
      authorAvatar: "",
      content: input.content,
      imageUrl: input.imageUrl,
      liked: false,
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date().toISOString(),
    },
    ...posts,
  ],

  mutate: async (ctx, input) => {
    const post = await api.createPost(input)
    return post
  },

  onSuccess: (ctx, newPost) => {
    ctx.invalidate("posts")
    ctx.invalidate("postForm")
  },

  onError: (ctx, error) => {
    console.error("Failed to create post:", error.message)
  },

  invalidates: ["posts"],
})

/**
 * Mark notifications as read
 *
 * Optimistically marks notifications as read.
 */
export const markNotificationsReadMutation = mutation<Atoms, { ids: string[] }>({
  optimistic: (notifications: Notification[], { ids }) =>
    notifications.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)),

  mutate: async (ctx, { ids }) => {
    await api.markNotificationsRead(ids)
  },

  invalidates: ["notifications"],
})

/**
 * Mark all notifications as read
 */
export const markAllNotificationsReadMutation = mutation<Atoms, void>({
  optimistic: (notifications: Notification[]) =>
    notifications.map((n) => ({ ...n, read: true })),

  mutate: async () => {
    const allIds = ["notif-1", "notif-2", "notif-3"]
    await api.markNotificationsRead(allIds)
  },

  invalidates: ["notifications"],
})

/**
 * Update user settings
 */
export const updateSettingsMutation = mutation<
  Atoms,
  { theme?: "light" | "dark"; notifications?: boolean; language?: string }
>({
  mutate: async (ctx, settings) => {
    await api.updateUserSettings(settings)
  },

  onSuccess: (ctx) => {
    ctx.invalidate("user")
  },

  invalidates: ["user"],
})

/**
 * Mutation registry for the machine
 */
export const mutations = {
  LIKE: likeMutation,
  UNLIKE: unlikeMutation,
  DELETE_POST: deletePostMutation,
  CREATE_POST: createPostMutation,
  MARK_NOTIFICATIONS_READ: markNotificationsReadMutation,
  MARK_ALL_NOTIFICATIONS_READ: markAllNotificationsReadMutation,
  UPDATE_SETTINGS: updateSettingsMutation,
} as const

export type Mutations = typeof mutations

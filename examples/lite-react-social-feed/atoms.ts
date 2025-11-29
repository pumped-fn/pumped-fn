/**
 * Atoms - Pure data primitives
 *
 * Atoms define WHAT data exists and HOW to fetch it.
 * They don't define WHEN to update - that's the controller's job.
 */

import { atom, controller } from "@pumped-fn/lite"
import type { Lite } from "@pumped-fn/lite"
import { api } from "./api"
import type { User, Post, Notification } from "./types"

/**
 * User atom - current authenticated user
 */
export const userAtom: Lite.Atom<User> = atom({
  factory: async () => api.fetchUser(),
})

/**
 * Posts atom - feed posts
 */
export const postsAtom: Lite.Atom<Post[]> = atom({
  factory: async () => api.fetchPosts(),
})

/**
 * Notifications atom
 */
export const notificationsAtom: Lite.Atom<Notification[]> = atom({
  factory: async () => api.fetchNotifications(),
})

/**
 * Composite Controller Atom
 *
 * This is the key pattern: an atom that depends on controllers
 * of other atoms and returns an orchestration API.
 *
 * - Controls load order via initialize()
 * - Coordinates invalidations
 * - Handles optimistic updates
 * - Single place for all mutations
 */
export const feedControllerAtom = atom({
  deps: {
    user: controller(userAtom),
    posts: controller(postsAtom),
    notifications: controller(notificationsAtom),
  },

  factory: (ctx, { user, posts, notifications }) => {
    const optimistic = new Map<string, Partial<Post>>()
    const listeners = new Set<() => void>()

    const notify = () => listeners.forEach((fn) => fn())

    return {
      /**
       * Initialize with controlled load order
       */
      async initialize() {
        await user.resolve()
        await Promise.all([posts.resolve(), notifications.resolve()])
      },

      /**
       * Refresh feed data
       */
      refresh() {
        posts.invalidate()
        notifications.invalidate()
      },

      /**
       * Get post with optimistic overlay
       */
      getPost(id: string): Post | undefined {
        const serverPost = posts.get().find((p) => p.id === id)
        if (!serverPost) return undefined

        const overlay = optimistic.get(id)
        return overlay ? { ...serverPost, ...overlay } : serverPost
      },

      /**
       * Get all posts with optimistic overlay
       */
      getPosts(): Post[] {
        return posts.get().map((post) => {
          const overlay = optimistic.get(post.id)
          return overlay ? { ...post, ...overlay } : post
        })
      },

      /**
       * Get post IDs (for list optimization)
       */
      getPostIds(): string[] {
        return posts.get().map((p) => p.id)
      },

      /**
       * Subscribe to changes
       */
      subscribe(listener: () => void): () => void {
        listeners.add(listener)
        const unsubPosts = posts.on(listener)
        const unsubNotifications = notifications.on(listener)
        return () => {
          listeners.delete(listener)
          unsubPosts()
          unsubNotifications()
        }
      },

      /**
       * Like post with optimistic update
       *
       * Pattern: apply optimistic → execute → cleanup via finally
       * Errors propagate to framework (React Error Boundary, etc.)
       */
      async likePost(postId: string) {
        const currentPost = posts.get().find((p) => p.id === postId)
        if (!currentPost) return

        optimistic.set(postId, {
          liked: true,
          likeCount: currentPost.likeCount + 1,
        })
        notify()

        await api.likePost(postId).finally(() => {
          optimistic.delete(postId)
        })

        posts.invalidate()
      },

      /**
       * Unlike post with optimistic update
       */
      async unlikePost(postId: string) {
        const currentPost = posts.get().find((p) => p.id === postId)
        if (!currentPost) return

        optimistic.set(postId, {
          liked: false,
          likeCount: Math.max(0, currentPost.likeCount - 1),
        })
        notify()

        await api.unlikePost(postId).finally(() => {
          optimistic.delete(postId)
        })

        posts.invalidate()
      },

      /**
       * Delete post
       */
      async deletePost(postId: string) {
        await api.deletePost(postId)
        posts.invalidate()
      },

      /**
       * Create post
       */
      async createPost(content: string, imageUrl?: string) {
        await api.createPost({ content, imageUrl })
        posts.invalidate()
      },

      /**
       * Mark notifications as read
       */
      async markNotificationsRead(ids: string[]) {
        await api.markNotificationsRead(ids)
        notifications.invalidate()
      },

      /**
       * Get unread notification count
       */
      getUnreadCount(): number {
        return notifications.get().filter((n) => !n.read).length
      },

      /**
       * Logout - invalidate everything
       */
      async logout() {
        await api.logout()
        user.invalidate()
        posts.invalidate()
        notifications.invalidate()
      },
    }
  },
})

export type FeedController = ReturnType<typeof feedControllerAtom.factory>

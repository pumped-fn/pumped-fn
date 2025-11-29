/**
 * Atom definitions for the social feed
 *
 * Atoms are pure data containers - they define how to fetch/compute data.
 * The Machine (see machine.ts) orchestrates when atoms are invalidated.
 *
 * Key principle: Atoms don't self-invalidate or subscribe to each other.
 * All reactivity is centralized in the Machine.
 */

import { atom } from "@pumped-fn/lite"
import type { Lite } from "@pumped-fn/lite"
import { api } from "./api"
import type { User, Post, Notification } from "./types"

/**
 * Current authenticated user
 *
 * This atom fetches the current user's profile.
 * Invalidated by: LOGIN, LOGOUT, UPDATE_PROFILE events
 */
export const userAtom: Lite.Atom<User | null> = atom({
  factory: async (ctx) => {
    try {
      const user = await api.fetchUser()
      return user
    } catch {
      return null
    }
  },
})

/**
 * Posts feed
 *
 * Fetches all posts for the feed.
 * Invalidated by: REFRESH, CREATE_POST, DELETE_POST, LIKE, UNLIKE events
 */
export const postsAtom: Lite.Atom<Post[]> = atom({
  factory: async () => {
    const posts = await api.fetchPosts()
    return posts
  },
})

/**
 * User notifications
 *
 * Fetches unread and recent notifications.
 * Invalidated by: REFRESH, MARK_READ events
 */
export const notificationsAtom: Lite.Atom<Notification[]> = atom({
  factory: async () => {
    const notifications = await api.fetchNotifications()
    return notifications
  },
})

/**
 * Form state for creating a new post
 *
 * Local state atom - not fetched from server.
 * Invalidated by: CHANGE_FORM, SUBMIT_SUCCESS, RESET_FORM events
 */
export interface PostFormState {
  content: string
  imageUrl: string
  errors: Record<string, string>
}

export const postFormAtom: Lite.Atom<PostFormState> = atom({
  factory: () => ({
    content: "",
    imageUrl: "",
    errors: {},
  }),
})

/**
 * Comments for a specific post (parameterized via tag)
 *
 * This demonstrates how to use tags for parameterized atoms.
 * In the machine, you'd pass the postId via execution context.
 */
import { tag, tags } from "@pumped-fn/lite"

export const postIdTag = tag<string>({ label: "postId" })

export const commentsAtom: Lite.Atom<Comment[]> = atom({
  deps: { postId: tags.required(postIdTag) },
  factory: async (ctx, { postId }) => {
    const comments = await api.fetchComments(postId)
    return comments
  },
})

/**
 * Derived atom: User's own posts
 *
 * Filters posts to only show current user's posts.
 * Depends on both userAtom and postsAtom.
 */
export const myPostsAtom: Lite.Atom<Post[]> = atom({
  deps: { user: userAtom, posts: postsAtom },
  factory: (ctx, { user, posts }) => {
    if (!user) return []
    return posts.filter((post) => post.authorId === user.id)
  },
})

/**
 * Atom registry for the machine
 *
 * Export all atoms in a typed object for the machine to reference.
 */
export const atoms = {
  user: userAtom,
  posts: postsAtom,
  notifications: notificationsAtom,
  postForm: postFormAtom,
  myPosts: myPostsAtom,
} as const

export type Atoms = typeof atoms

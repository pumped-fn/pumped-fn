/**
 * Selectors for granular state subscriptions
 *
 * Selectors derive "slices" from atoms. Components using a selector
 * only re-render when the specific slice changes, not when unrelated
 * parts of the atom change.
 *
 * Example: Avatar component uses userAvatarSelector
 *          → Only re-renders when avatar changes
 *          → Does NOT re-render when user.stats.followers changes
 */

import { selector, equals } from "@pumped-fn/lite-react"
import { userAtom, postsAtom, notificationsAtom } from "./atoms"
import type { User, Post, Notification } from "./types"

/**
 * User profile selectors
 *
 * Break down the user object into specific slices that components need.
 */
export const userNameSelector = selector({
  source: userAtom,
  select: (user): string | null => user?.name ?? null,
})

export const userAvatarSelector = selector({
  source: userAtom,
  select: (user): string | null => user?.avatar ?? null,
})

export const userBioSelector = selector({
  source: userAtom,
  select: (user): string | null => user?.bio ?? null,
})

export const userStatsSelector = selector({
  source: userAtom,
  select: (user): User["stats"] | null => user?.stats ?? null,
  equals: equals.shallow,
})

export const userSettingsSelector = selector({
  source: userAtom,
  select: (user): User["settings"] | null => user?.settings ?? null,
  equals: equals.shallow,
})

export const themeSelector = selector({
  source: userAtom,
  select: (user): "light" | "dark" => user?.settings.theme ?? "light",
})

export const isAuthenticatedSelector = selector({
  source: userAtom,
  select: (user): boolean => user !== null,
})

/**
 * Notification selectors
 */
export const unreadCountSelector = selector({
  source: notificationsAtom,
  select: (notifications): number => notifications.filter((n) => !n.read).length,
})

export const hasUnreadSelector = selector({
  source: notificationsAtom,
  select: (notifications): boolean => notifications.some((n) => !n.read),
})

export const unreadNotificationsSelector = selector({
  source: notificationsAtom,
  select: (notifications): Notification[] => notifications.filter((n) => !n.read),
  equals: equals.shallow,
})

/**
 * Posts selectors
 */
export const postCountSelector = selector({
  source: postsAtom,
  select: (posts): number => posts.length,
})

export const likedPostsSelector = selector({
  source: postsAtom,
  select: (posts): Post[] => posts.filter((p) => p.liked),
  equals: equals.shallow,
})

export const topPostsSelector = selector({
  source: postsAtom,
  select: (posts): Post[] =>
    [...posts].sort((a, b) => b.likeCount - a.likeCount).slice(0, 5),
  equals: equals.shallow,
})

/**
 * Multi-source selector
 *
 * Combines data from multiple atoms into a single derived value.
 * Only re-renders when the combined result changes.
 */
export const dashboardStatsSelector = selector({
  sources: { user: userAtom, posts: postsAtom, notifications: notificationsAtom },
  select: ({ user, posts, notifications }): DashboardStats => ({
    userName: user?.name ?? "Guest",
    totalPosts: posts.length,
    likedPosts: posts.filter((p) => p.liked).length,
    unreadNotifications: notifications.filter((n) => !n.read).length,
  }),
  equals: equals.shallow,
})

export interface DashboardStats {
  userName: string
  totalPosts: number
  likedPosts: number
  unreadNotifications: number
}

/**
 * Parameterized selector factory
 *
 * For selecting a specific post by ID.
 * Returns a selector that can be used with useSelector.
 */
export const createPostSelector = (postId: string) =>
  selector({
    source: postsAtom,
    select: (posts): Post | undefined => posts.find((p) => p.id === postId),
    equals: equals.shallow,
  })

/**
 * Selector with custom equality
 *
 * Uses deep equality for complex nested objects.
 */
export const fullUserProfileSelector = selector({
  source: userAtom,
  select: (user): UserProfile | null => {
    if (!user) return null
    return {
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      bio: user.bio,
      stats: user.stats,
    }
  },
  equals: equals.deep,
})

export interface UserProfile {
  id: string
  name: string
  avatar: string
  bio: string
  stats: User["stats"]
}

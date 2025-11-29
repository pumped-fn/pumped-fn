/**
 * Selectors - Granular subscriptions to atom slices
 *
 * Selectors let components subscribe to specific parts of an atom.
 * When only the slice changes, only subscribed components re-render.
 */

import type { Lite } from "@pumped-fn/lite"
import { userAtom, postsAtom, notificationsAtom } from "./atoms"
import type { User, Post } from "./types"

/**
 * Selector type definition
 */
export interface Selector<TSource, TSlice> {
  source: Lite.Atom<TSource>
  select: (source: TSource) => TSlice
  equals: (a: TSlice, b: TSlice) => boolean
}

/**
 * Create a selector
 */
export function selector<TSource, TSlice>(config: {
  source: Lite.Atom<TSource>
  select: (source: TSource) => TSlice
  equals?: (a: TSlice, b: TSlice) => boolean
}): Selector<TSource, TSlice> {
  return {
    source: config.source,
    select: config.select,
    equals: config.equals ?? Object.is,
  }
}

/**
 * Equality helpers
 */
export const equals = {
  strict: Object.is,

  shallow: <T>(a: T, b: T): boolean => {
    if (a === b) return true
    if (!a || !b) return false
    if (typeof a !== "object" || typeof b !== "object") return false

    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false

    return keysA.every(
      (key) => (a as Record<string, unknown>)[key] === (b as Record<string, unknown>)[key]
    )
  },

  shallowArray: <T>(a: T[], b: T[]): boolean => {
    if (a === b) return true
    if (a.length !== b.length) return false
    return a.every((item, i) => item === b[i])
  },
}

/**
 * User selectors
 */
export const userNameSelector = selector({
  source: userAtom,
  select: (user): string | null => user?.name ?? null,
})

export const userAvatarSelector = selector({
  source: userAtom,
  select: (user): string | null => user?.avatar ?? null,
})

export const userStatsSelector = selector({
  source: userAtom,
  select: (user): User["stats"] | null => user?.stats ?? null,
  equals: equals.shallow,
})

export const isAuthenticatedSelector = selector({
  source: userAtom,
  select: (user): boolean => user !== null,
})

/**
 * Posts selectors
 */
export const postIdsSelector = selector({
  source: postsAtom,
  select: (posts): string[] => posts.map((p) => p.id),
  equals: equals.shallowArray,
})

export const postCountSelector = selector({
  source: postsAtom,
  select: (posts): number => posts.length,
})

/**
 * Single post selector factory
 *
 * Usage: const post = useSelector(useMemo(() => postSelector(id), [id]))
 */
export function postSelector(postId: string): Selector<Post[], Post | undefined> {
  return selector({
    source: postsAtom,
    select: (posts) => posts.find((p) => p.id === postId),
    equals: equals.shallow,
  })
}

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

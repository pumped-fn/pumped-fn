/**
 * React Components
 *
 * Demonstrates the key patterns:
 * 1. useAtom - Full atom subscription
 * 2. useSelector - Slice subscription (only re-renders when slice changes)
 * 3. Composite controller - Orchestrated mutations
 * 4. List optimization - IDs + per-item subscription
 *
 * NOTE: This is a conceptual example. @pumped-fn/lite-react is proposed
 * in ADR-005 and not yet implemented.
 */

import React, { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react"
import type { Lite } from "@pumped-fn/lite"
import { feedControllerAtom, userAtom } from "./atoms"
import {
  userNameSelector,
  userAvatarSelector,
  postIdsSelector,
  postSelector,
  unreadCountSelector,
  type Selector,
} from "./selectors"
import type { Post } from "./types"

/**
 * ============================================================================
 * HOOKS (would be in @pumped-fn/lite-react)
 * ============================================================================
 */

const ScopeContext = React.createContext<Lite.Scope | null>(null)

function useScope(): Lite.Scope {
  const scope = React.useContext(ScopeContext)
  if (!scope) throw new Error("Missing LiteProvider")
  return scope
}

function useAtom<T>(atom: Lite.Atom<T>): T {
  const scope = useScope()
  const ctrlRef = useRef<Lite.Controller<T>>()

  if (!ctrlRef.current) {
    ctrlRef.current = scope.controller(atom)
  }

  const ctrl = ctrlRef.current

  return useSyncExternalStore(
    useCallback((cb) => ctrl.on(cb), [ctrl]),
    useCallback(() => ctrl.get(), [ctrl])
  )
}

function useSelector<TSource, TSlice>(sel: Selector<TSource, TSlice>): TSlice {
  const scope = useScope()
  const ctrl = scope.controller(sel.source)
  const sliceRef = useRef<TSlice>()

  const getSnapshot = useCallback(() => {
    const source = ctrl.get()
    const nextSlice = sel.select(source)

    if (sliceRef.current !== undefined && sel.equals(sliceRef.current, nextSlice)) {
      return sliceRef.current
    }

    sliceRef.current = nextSlice
    return nextSlice
  }, [ctrl, sel])

  return useSyncExternalStore(
    useCallback((cb) => ctrl.on(cb), [ctrl]),
    getSnapshot
  )
}

function LiteProvider({
  scope,
  children,
}: {
  scope: Lite.Scope
  children: React.ReactNode
}) {
  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>
}

/**
 * ============================================================================
 * COMPONENTS
 * ============================================================================
 */

/**
 * Header - Uses selectors for granular subscriptions
 *
 * Only re-renders when name OR avatar changes, not when other user fields change.
 */
function Header() {
  const name = useSelector(userNameSelector)
  const avatar = useSelector(userAvatarSelector)
  const unreadCount = useSelector(unreadCountSelector)
  const ctrl = useAtom(feedControllerAtom)

  return (
    <header className="header">
      <div className="header-left">
        <h1>Social Feed</h1>
      </div>
      <div className="header-right">
        <button className="notification-bell" onClick={() => ctrl.refresh()}>
          🔔 {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
        </button>
        <img src={avatar} alt={name} className="avatar" />
        <span>{name}</span>
        <button onClick={() => ctrl.logout()}>Logout</button>
      </div>
    </header>
  )
}

/**
 * PostList - Subscribes to IDs only
 *
 * Only re-renders when posts are added/removed.
 * Does NOT re-render when a post's content changes.
 */
function PostList() {
  const postIds = useSelector(postIdsSelector)

  return (
    <div className="post-list">
      {postIds.map((id) => (
        <PostItem key={id} postId={id} />
      ))}
    </div>
  )
}

/**
 * PostItem - Subscribes to single post via controller
 *
 * Only re-renders when THIS post changes.
 * Uses optimistic data from controller.
 */
function PostItem({ postId }: { postId: string }) {
  const ctrl = useAtom(feedControllerAtom)

  const post = useSyncExternalStore(ctrl.subscribe, () => ctrl.getPost(postId))

  if (!post) return null

  const handleLike = () => {
    if (post.liked) {
      ctrl.unlikePost(postId)
    } else {
      ctrl.likePost(postId)
    }
  }

  return (
    <article className="post-item">
      <div className="post-header">
        <img src={post.authorAvatar} alt={post.authorName} className="post-avatar" />
        <span className="author-name">{post.authorName}</span>
      </div>
      <div className="post-content">
        <p>{post.content}</p>
        {post.imageUrl && <img src={post.imageUrl} alt="" className="post-image" />}
      </div>
      <div className="post-actions">
        <button onClick={handleLike} className={post.liked ? "liked" : ""}>
          {post.liked ? "♥" : "♡"} {post.likeCount}
        </button>
        <button>💬 {post.commentCount}</button>
        <button onClick={() => ctrl.deletePost(postId)}>🗑️</button>
      </div>
    </article>
  )
}

/**
 * Alternative: PostItem using selector
 *
 * This version uses a memoized selector instead of the controller's getPost.
 * Use this when you don't need optimistic updates.
 */
function PostItemWithSelector({ postId }: { postId: string }) {
  const sel = useMemo(() => postSelector(postId), [postId])
  const post = useSelector(sel)
  const ctrl = useAtom(feedControllerAtom)

  if (!post) return null

  return (
    <article className="post-item">
      <p>{post.content}</p>
      <button onClick={() => ctrl.likePost(postId)}>
        {post.liked ? "♥" : "♡"} {post.likeCount}
      </button>
    </article>
  )
}

/**
 * CreatePostForm - Simple form using controller
 */
function CreatePostForm() {
  const ctrl = useAtom(feedControllerAtom)
  const [content, setContent] = React.useState("")
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return

    setIsSubmitting(true)
    try {
      await ctrl.createPost(content)
      setContent("")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="create-post-form">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="What's on your mind?"
        disabled={isSubmitting}
      />
      <button type="submit" disabled={isSubmitting || !content.trim()}>
        {isSubmitting ? "Posting..." : "Post"}
      </button>
    </form>
  )
}

/**
 * RefreshButton - Uses controller for refresh action
 */
function RefreshButton() {
  const ctrl = useAtom(feedControllerAtom)
  const [isRefreshing, setIsRefreshing] = React.useState(false)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    ctrl.refresh()
    setTimeout(() => setIsRefreshing(false), 1000)
  }

  return (
    <button onClick={handleRefresh} disabled={isRefreshing}>
      {isRefreshing ? "Refreshing..." : "🔄 Refresh"}
    </button>
  )
}

/**
 * Feed - Main content area
 */
function Feed() {
  return (
    <main className="feed">
      <CreatePostForm />
      <RefreshButton />
      <PostList />
    </main>
  )
}

/**
 * App - Root component
 *
 * Initializes the controller on mount.
 */
function AppContent() {
  const ctrl = useAtom(feedControllerAtom)

  useEffect(() => {
    ctrl.initialize()
  }, [ctrl])

  return (
    <div className="app">
      <Header />
      <Feed />
    </div>
  )
}

/**
 * App with provider
 */
export function App({ scope }: { scope: Lite.Scope }) {
  return (
    <LiteProvider scope={scope}>
      <AppContent />
    </LiteProvider>
  )
}

export { LiteProvider, useAtom, useSelector, useScope }

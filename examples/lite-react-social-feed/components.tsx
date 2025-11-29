/**
 * React Components
 *
 * This file demonstrates how components consume the state management system:
 *
 * 1. useAtom - Full atom subscription (re-renders on any change)
 * 2. useSelector - Slice subscription (re-renders only when slice changes)
 * 3. useMachineState - Machine state and transitions
 * 4. useMutation - Optimistic mutations with loading states
 * 5. useSend - Event dispatch
 *
 * NOTE: This is a conceptual example. The @pumped-fn/lite-react package
 * is proposed in ADR-005 and not yet implemented.
 */

import React, { Suspense, useCallback, useState } from "react"
import {
  LiteProvider,
  MachineProvider,
  useAtom,
  useSelector,
  useController,
  useMachine,
  useMachineState,
  useMachineAtom,
  useSend,
  useMutation,
} from "@pumped-fn/lite-react"

import { atoms, postsAtom, notificationsAtom } from "./atoms"
import {
  userNameSelector,
  userAvatarSelector,
  themeSelector,
  unreadCountSelector,
  hasUnreadSelector,
  isAuthenticatedSelector,
  dashboardStatsSelector,
  createPostSelector,
} from "./selectors"
import { initializeMachine, type AppMachine, type AppEvents } from "./machine"
import type { Post, Notification } from "./types"

/**
 * Header Component
 *
 * Uses selectors for granular subscriptions:
 * - userNameSelector: Only re-renders when name changes
 * - userAvatarSelector: Only re-renders when avatar changes
 * - unreadCountSelector: Only re-renders when unread count changes
 */
function Header() {
  const name = useSelector(userNameSelector)
  const avatar = useSelector(userAvatarSelector)
  const unreadCount = useSelector(unreadCountSelector)
  const send = useSend<AppEvents>()

  return (
    <header className="header">
      <div className="header-left">
        <h1>Social Feed</h1>
      </div>

      <div className="header-right">
        <NotificationBell count={unreadCount} />

        {avatar && <img src={avatar} alt={name ?? ""} className="avatar" />}

        <span className="user-name">{name}</span>

        <button onClick={() => send("LOGOUT")} className="btn-logout">
          Logout
        </button>
      </div>
    </header>
  )
}

/**
 * Notification Bell
 *
 * Isolated component that only re-renders when count changes.
 */
function NotificationBell({ count }: { count: number }) {
  const send = useSend<AppEvents>()

  return (
    <button
      className="notification-bell"
      onClick={() => send("MARK_ALL_NOTIFICATIONS_READ")}
    >
      🔔 {count > 0 && <span className="badge">{count}</span>}
    </button>
  )
}

/**
 * Theme Toggle
 *
 * Uses themeSelector - only re-renders when theme changes,
 * not when other user settings change.
 */
function ThemeToggle() {
  const theme = useSelector(themeSelector)
  const send = useSend<AppEvents>()

  const toggleTheme = () => {
    send("UPDATE_SETTINGS", { theme: theme === "dark" ? "light" : "dark" })
  }

  return (
    <button onClick={toggleTheme} className="theme-toggle">
      {theme === "dark" ? "🌙" : "☀️"}
    </button>
  )
}

/**
 * Dashboard Stats
 *
 * Uses multi-source selector that combines user, posts, and notifications.
 * Only re-renders when the combined stats change.
 */
function DashboardStats() {
  const stats = useSelector(dashboardStatsSelector)

  return (
    <div className="dashboard-stats">
      <div className="stat">
        <span className="stat-value">{stats.totalPosts}</span>
        <span className="stat-label">Posts</span>
      </div>
      <div className="stat">
        <span className="stat-value">{stats.likedPosts}</span>
        <span className="stat-label">Liked</span>
      </div>
      <div className="stat">
        <span className="stat-value">{stats.unreadNotifications}</span>
        <span className="stat-label">Notifications</span>
      </div>
    </div>
  )
}

/**
 * Post List
 *
 * Uses full atom subscription since it needs all posts.
 * Individual PostItem components handle their own optimizations.
 */
function PostList() {
  const posts = useMachineAtom<Post[]>("posts")

  if (posts.length === 0) {
    return <div className="empty-state">No posts yet. Be the first to post!</div>
  }

  return (
    <div className="post-list">
      {posts.map((post) => (
        <PostItem key={post.id} post={post} />
      ))}
    </div>
  )
}

/**
 * Post Item
 *
 * Demonstrates optimistic mutations:
 * - Like/Unlike buttons show immediate feedback
 * - Delete removes post immediately
 * - All rollback automatically on failure
 */
function PostItem({ post }: { post: Post }) {
  const { mutate: like, isPending: isLiking } = useMutation<{ postId: string }>("LIKE")
  const { mutate: unlike, isPending: isUnliking } = useMutation<{ postId: string }>("UNLIKE")
  const { mutate: deletePost, isPending: isDeleting } = useMutation<{ postId: string }>("DELETE_POST")

  const handleLikeToggle = () => {
    if (post.liked) {
      unlike({ postId: post.id })
    } else {
      like({ postId: post.id })
    }
  }

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this post?")) {
      deletePost({ postId: post.id })
    }
  }

  const isOptimistic = post.id.startsWith("temp-")

  return (
    <article className={`post-item ${isOptimistic ? "optimistic" : ""}`}>
      <div className="post-header">
        <img src={post.authorAvatar} alt={post.authorName} className="post-avatar" />
        <div className="post-author">
          <span className="author-name">{post.authorName}</span>
          <span className="post-time">{formatTime(post.createdAt)}</span>
        </div>
      </div>

      <div className="post-content">
        <p>{post.content}</p>
        {post.imageUrl && <img src={post.imageUrl} alt="" className="post-image" />}
      </div>

      <div className="post-actions">
        <button
          onClick={handleLikeToggle}
          disabled={isLiking || isUnliking}
          className={`btn-like ${post.liked ? "liked" : ""}`}
        >
          {post.liked ? "♥" : "♡"} {post.likeCount}
          {(isLiking || isUnliking) && <span className="spinner" />}
        </button>

        <button className="btn-comment">
          💬 {post.commentCount}
        </button>

        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="btn-delete"
        >
          🗑️ {isDeleting && <span className="spinner" />}
        </button>
      </div>
    </article>
  )
}

/**
 * Create Post Form
 *
 * Demonstrates:
 * - Form state via atom
 * - Machine state for submission flow
 * - Optimistic post creation
 */
function CreatePostForm() {
  const { state, matches } = useMachineState()
  const send = useSend<AppEvents>()
  const { mutate: createPost, isPending, isOptimistic } = useMutation<{
    content: string
    imageUrl?: string
  }>("CREATE_POST")

  const [content, setContent] = useState("")
  const [imageUrl, setImageUrl] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return

    createPost({ content, imageUrl: imageUrl || undefined })
    setContent("")
    setImageUrl("")
  }

  const isSubmitting = matches("submitting") || isPending

  return (
    <form onSubmit={handleSubmit} className="create-post-form">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="What's on your mind?"
        disabled={isSubmitting}
        className="post-input"
      />

      <input
        type="url"
        value={imageUrl}
        onChange={(e) => setImageUrl(e.target.value)}
        placeholder="Image URL (optional)"
        disabled={isSubmitting}
        className="image-input"
      />

      <button type="submit" disabled={isSubmitting || !content.trim()} className="btn-post">
        {isSubmitting ? (
          <>
            <span className="spinner" /> Posting...
          </>
        ) : (
          "Post"
        )}
      </button>

      {isOptimistic && (
        <span className="optimistic-indicator">Posting...</span>
      )}
    </form>
  )
}

/**
 * Notification List
 *
 * Full atom subscription with mutation for marking as read.
 */
function NotificationList() {
  const notifications = useMachineAtom<Notification[]>("notifications")
  const { mutate: markRead } = useMutation<{ ids: string[] }>("MARK_NOTIFICATIONS_READ")

  const handleMarkRead = (id: string) => {
    markRead({ ids: [id] })
  }

  return (
    <div className="notification-list">
      <h2>Notifications</h2>
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`notification-item ${notification.read ? "read" : "unread"}`}
          onClick={() => !notification.read && handleMarkRead(notification.id)}
        >
          <span className="notification-icon">
            {notification.type === "like" && "♥"}
            {notification.type === "comment" && "💬"}
            {notification.type === "follow" && "👤"}
          </span>
          <span className="notification-message">{notification.message}</span>
          <span className="notification-time">{formatTime(notification.createdAt)}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Refresh Button
 *
 * Demonstrates machine state transitions.
 */
function RefreshButton() {
  const { state, matches, can } = useMachineState()
  const send = useSend<AppEvents>()

  const isRefreshing = matches("refreshing")

  return (
    <button
      onClick={() => send("REFRESH")}
      disabled={!can("REFRESH") || isRefreshing}
      className="btn-refresh"
    >
      {isRefreshing ? (
        <>
          <span className="spinner" /> Refreshing...
        </>
      ) : (
        "🔄 Refresh"
      )}
    </button>
  )
}

/**
 * Login Form
 *
 * Demonstrates machine state for auth flow.
 */
function LoginForm() {
  const { state, matches } = useMachineState()
  const send = useSend<AppEvents>()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    send("LOGIN", { email, password })
  }

  const isLoading = matches("authenticating")

  return (
    <form onSubmit={handleSubmit} className="login-form">
      <h2>Login</h2>

      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        disabled={isLoading}
      />

      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        disabled={isLoading}
      />

      <button type="submit" disabled={isLoading}>
        {isLoading ? (
          <>
            <span className="spinner" /> Logging in...
          </>
        ) : (
          "Login"
        )}
      </button>
    </form>
  )
}

/**
 * Auth Gate
 *
 * Uses selector to check authentication state.
 * Renders login form or authenticated content.
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useSelector(isAuthenticatedSelector)
  const { matches } = useMachineState()

  if (matches("authenticating")) {
    return <div className="loading">Authenticating...</div>
  }

  if (!isAuthenticated || matches("anonymous")) {
    return <LoginForm />
  }

  return <>{children}</>
}

/**
 * Feed Page
 *
 * Main authenticated view combining all components.
 */
function FeedPage() {
  return (
    <div className="feed-page">
      <Header />

      <main className="main-content">
        <aside className="sidebar">
          <DashboardStats />
          <ThemeToggle />
        </aside>

        <section className="feed">
          <CreatePostForm />
          <RefreshButton />
          <PostList />
        </section>

        <aside className="sidebar-right">
          <NotificationList />
        </aside>
      </main>
    </div>
  )
}

/**
 * App Component
 *
 * Top-level component that:
 * 1. Initializes the machine
 * 2. Provides scope and machine to the tree
 * 3. Handles loading and error states
 */
export function App() {
  const [machine, setMachine] = useState<AppMachine | null>(null)
  const [error, setError] = useState<Error | null>(null)

  React.useEffect(() => {
    initializeMachine()
      .then(setMachine)
      .catch(setError)
  }, [])

  if (error) {
    return <div className="error">Failed to initialize: {error.message}</div>
  }

  if (!machine) {
    return <div className="loading">Loading...</div>
  }

  return (
    <LiteProvider scope={machine.scope}>
      <MachineProvider machine={machine}>
        <Suspense fallback={<div className="loading">Loading...</div>}>
          <AuthGate>
            <FeedPage />
          </AuthGate>
        </Suspense>
      </MachineProvider>
    </LiteProvider>
  )
}

/**
 * Utility: Format time
 */
function formatTime(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

export default App

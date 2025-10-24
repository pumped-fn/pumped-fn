// UI Components Example
// Shows thin React views that project into executor graph

import React from 'react'
import { useResolves, useResolve, useUpdate } from '@pumped-fn/react'
import { currentUser, canEditPosts, posts, editablePosts } from './feature-state'

// ===== Simple projection =====
export function UserBadge() {
  const [user] = useResolves(currentUser)

  return (
    <div className="user-badge">
      <img src={user.avatarUrl} alt={user.name} />
      <span>{user.name}</span>
    </div>
  )
}

// ===== Selective re-render with useResolve =====
export function UserAvatar() {
  const avatarUrl = useResolve(
    currentUser.reactive,
    user => user.avatarUrl,
    { equality: (a, b) => a === b }
  )

  return <img src={avatarUrl} alt="User avatar" className="avatar" />
}

// ===== Conditional rendering based on permissions =====
export function PostEditor() {
  const [canEdit] = useResolves(canEditPosts)
  const [user] = useResolves(currentUser)

  if (!canEdit) {
    return (
      <div className="access-denied">
        <h2>Access Denied</h2>
        <p>You need editor permissions to access this page.</p>
      </div>
    )
  }

  return (
    <div className="post-editor">
      <h1>Post Editor</h1>
      <p>Editing as: {user.name}</p>
      <textarea placeholder="Write your post..." />
      <button>Publish</button>
    </div>
  )
}

// ===== List with reactive updates =====
export function PostList() {
  const [postList] = useResolves(posts.reactive)

  return (
    <ul className="post-list">
      {postList.map(post => (
        <li key={post.id}>
          <h3>{post.title}</h3>
          <p>{post.content.slice(0, 100)}...</p>
        </li>
      ))}
    </ul>
  )
}

// ===== Component with update capability =====
export function PostDashboard() {
  const [postList] = useResolves(posts.reactive)
  const updatePosts = useUpdate(posts)

  const refreshPosts = async () => {
    // Trigger refetch by updating executor
    const api = /* get api somehow */
    const fresh = await api.get('/posts')
    updatePosts(fresh)
  }

  return (
    <div className="dashboard">
      <div className="header">
        <h1>Posts ({postList.length})</h1>
        <button onClick={refreshPosts}>Refresh</button>
      </div>
      <PostList />
    </div>
  )
}

// ===== Editable posts (filtered by permissions) =====
export function EditablePostList() {
  const [editable] = useResolves(editablePosts)

  if (editable.length === 0) {
    return <div>No editable posts available.</div>
  }

  return (
    <ul className="editable-posts">
      {editable.map(post => (
        <li key={post.id}>
          <input defaultValue={post.title} />
          <button>Save</button>
          <button>Delete</button>
        </li>
      ))}
    </ul>
  )
}

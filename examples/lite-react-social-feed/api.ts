/**
 * Mock API for the social feed example
 * In a real app, these would be actual HTTP calls
 */

import type { User, Post, Notification, Comment, CreatePostInput } from "./types"

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const mockUser: User = {
  id: "user-1",
  name: "Alice Chen",
  avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=alice",
  bio: "Software engineer passionate about DX",
  stats: {
    posts: 42,
    followers: 1337,
    following: 256,
  },
  settings: {
    theme: "dark",
    notifications: true,
    language: "en",
  },
}

const mockPosts: Post[] = [
  {
    id: "post-1",
    authorId: "user-2",
    authorName: "Bob Smith",
    authorAvatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=bob",
    content: "Just discovered @pumped-fn/lite - the DI pattern is so clean!",
    liked: false,
    likeCount: 23,
    commentCount: 5,
    createdAt: "2025-11-29T10:00:00Z",
  },
  {
    id: "post-2",
    authorId: "user-3",
    authorName: "Carol Davis",
    authorAvatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=carol",
    content: "The machine pattern for React state is exactly what I needed. No more scattered invalidations!",
    imageUrl: "https://picsum.photos/seed/code/600/400",
    liked: true,
    likeCount: 89,
    commentCount: 12,
    createdAt: "2025-11-29T09:30:00Z",
  },
  {
    id: "post-3",
    authorId: "user-4",
    authorName: "David Lee",
    authorAvatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=david",
    content: "Optimistic updates with automatic rollback? Yes please! 🚀",
    liked: false,
    likeCount: 156,
    commentCount: 24,
    createdAt: "2025-11-29T08:15:00Z",
  },
]

const mockNotifications: Notification[] = [
  {
    id: "notif-1",
    type: "like",
    message: "Bob liked your post",
    read: false,
    createdAt: "2025-11-29T10:30:00Z",
  },
  {
    id: "notif-2",
    type: "follow",
    message: "Carol started following you",
    read: false,
    createdAt: "2025-11-29T09:45:00Z",
  },
  {
    id: "notif-3",
    type: "comment",
    message: "David commented on your post",
    read: true,
    createdAt: "2025-11-29T08:00:00Z",
  },
]

export const api = {
  async fetchUser(): Promise<User> {
    await delay(500)
    return { ...mockUser }
  },

  async fetchPosts(): Promise<Post[]> {
    await delay(300)
    return mockPosts.map((p) => ({ ...p }))
  },

  async fetchNotifications(): Promise<Notification[]> {
    await delay(200)
    return mockNotifications.map((n) => ({ ...n }))
  },

  async fetchComments(postId: string): Promise<Comment[]> {
    await delay(200)
    return [
      {
        id: "comment-1",
        postId,
        authorId: "user-2",
        authorName: "Bob Smith",
        content: "Great post!",
        createdAt: "2025-11-29T10:05:00Z",
      },
    ]
  },

  async likePost(postId: string): Promise<void> {
    await delay(300)
    const shouldFail = Math.random() < 0.1
    if (shouldFail) {
      throw new Error("Network error: Failed to like post")
    }
  },

  async unlikePost(postId: string): Promise<void> {
    await delay(300)
  },

  async createPost(input: CreatePostInput): Promise<Post> {
    await delay(500)
    return {
      id: `post-${Date.now()}`,
      authorId: mockUser.id,
      authorName: mockUser.name,
      authorAvatar: mockUser.avatar,
      content: input.content,
      imageUrl: input.imageUrl,
      liked: false,
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date().toISOString(),
    }
  },

  async deletePost(postId: string): Promise<void> {
    await delay(400)
  },

  async markNotificationsRead(ids: string[]): Promise<void> {
    await delay(200)
  },

  async updateUserSettings(settings: Partial<User["settings"]>): Promise<User["settings"]> {
    await delay(300)
    return { ...mockUser.settings, ...settings }
  },

  async login(credentials: { email: string; password: string }): Promise<User> {
    await delay(800)
    if (credentials.password.length < 4) {
      throw new Error("Invalid credentials")
    }
    return { ...mockUser }
  },

  async logout(): Promise<void> {
    await delay(200)
  },
}

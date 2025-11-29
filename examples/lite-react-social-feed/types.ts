/**
 * Domain types for the social feed example
 */

export interface User {
  id: string
  name: string
  avatar: string
  bio: string
  stats: {
    posts: number
    followers: number
    following: number
  }
  settings: {
    theme: "light" | "dark"
    notifications: boolean
    language: string
  }
}

export interface Post {
  id: string
  authorId: string
  authorName: string
  authorAvatar: string
  content: string
  imageUrl?: string
  liked: boolean
  likeCount: number
  commentCount: number
  createdAt: string
}

export interface Notification {
  id: string
  type: "like" | "comment" | "follow"
  message: string
  read: boolean
  createdAt: string
}

export interface Comment {
  id: string
  postId: string
  authorId: string
  authorName: string
  content: string
  createdAt: string
}

export interface CreatePostInput {
  content: string
  imageUrl?: string
}

export interface ApiError {
  code: string
  message: string
}

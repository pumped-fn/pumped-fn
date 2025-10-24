// Testing Patterns Example
// Shows how to test React components with pumped-fn

import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createScope, preset } from '@pumped-fn/core-next'
import { ScopeProvider } from '@pumped-fn/react'
import { apiClient } from './resource-layer'
import { PostEditor, PostList, UserBadge } from './ui-components'

describe('React Component Testing', () => {
  test('shows editor UI when user has permissions', () => {
    const mockApi = {
      get: vi.fn(async (path: string) => {
        if (path === '/me') {
          return {
            id: '1',
            name: 'Alice',
            avatarUrl: '/avatar.png',
            roles: [{ permissions: ['posts.edit'] }]
          }
        }
      }),
      post: vi.fn()
    }

    const scope = createScope({
      presets: [preset(apiClient, mockApi)]
    })

    render(
      <ScopeProvider scope={scope}>
        <PostEditor />
      </ScopeProvider>
    )

    expect(screen.getByText('Post Editor')).toBeInTheDocument()
    expect(screen.getByText(/Editing as: Alice/)).toBeInTheDocument()
  })

  test('shows access denied when user lacks permissions', () => {
    const mockApi = {
      get: vi.fn(async (path: string) => {
        if (path === '/me') {
          return {
            id: '2',
            name: 'Bob',
            avatarUrl: '/avatar.png',
            roles: [{ permissions: [] }]
          }
        }
      }),
      post: vi.fn()
    }

    const scope = createScope({
      presets: [preset(apiClient, mockApi)]
    })

    render(
      <ScopeProvider scope={scope}>
        <PostEditor />
      </ScopeProvider>
    )

    expect(screen.getByText('Access Denied')).toBeInTheDocument()
  })

  test('renders post list from API', () => {
    const mockApi = {
      get: vi.fn(async (path: string) => {
        if (path === '/me') {
          return {
            id: '1',
            name: 'Alice',
            roles: [{ permissions: ['posts.edit'] }]
          }
        }
        if (path === '/posts') {
          return [
            { id: '1', title: 'First Post', content: 'Content 1', authorId: '1' },
            { id: '2', title: 'Second Post', content: 'Content 2', authorId: '1' }
          ]
        }
      }),
      post: vi.fn()
    }

    const scope = createScope({
      presets: [preset(apiClient, mockApi)]
    })

    render(
      <ScopeProvider scope={scope}>
        <PostList />
      </ScopeProvider>
    )

    expect(screen.getByText('First Post')).toBeInTheDocument()
    expect(screen.getByText('Second Post')).toBeInTheDocument()
  })

  test('different scenarios with different presets', () => {
    // Scenario 1: Admin user
    const adminApi = {
      get: vi.fn(async (path: string) => {
        if (path === '/me') {
          return {
            id: '1',
            name: 'Admin',
            roles: [{ permissions: ['posts.edit', 'posts.delete', 'users.manage'] }]
          }
        }
      }),
      post: vi.fn()
    }

    const adminScope = createScope({
      presets: [preset(apiClient, adminApi)]
    })

    const { rerender } = render(
      <ScopeProvider scope={adminScope}>
        <UserBadge />
      </ScopeProvider>
    )

    expect(screen.getByText('Admin')).toBeInTheDocument()

    // Scenario 2: Regular user
    const userApi = {
      get: vi.fn(async (path: string) => {
        if (path === '/me') {
          return {
            id: '2',
            name: 'User',
            roles: [{ permissions: [] }]
          }
        }
      }),
      post: vi.fn()
    }

    const userScope = createScope({
      presets: [preset(apiClient, userApi)]
    })

    rerender(
      <ScopeProvider scope={userScope}>
        <UserBadge />
      </ScopeProvider>
    )

    expect(screen.getByText('User')).toBeInTheDocument()
  })
})

// ===== Testing business logic without React =====
describe('Feature State Testing', () => {
  test('derives permissions from user roles', async () => {
    const mockApi = {
      get: vi.fn(async (path: string) => {
        if (path === '/me') {
          return {
            id: '1',
            name: 'Alice',
            roles: [
              { permissions: ['posts.edit', 'posts.delete'] },
              { permissions: ['users.view'] }
            ]
          }
        }
      }),
      post: vi.fn()
    }

    const scope = createScope({
      presets: [preset(apiClient, mockApi)]
    })

    const { userPermissions, canEditPosts } = await import('./feature-state')

    const permissions = await scope.resolve(userPermissions)
    expect(permissions).toEqual(['posts.edit', 'posts.delete', 'users.view'])

    const canEdit = await scope.resolve(canEditPosts)
    expect(canEdit).toBe(true)
  })
})

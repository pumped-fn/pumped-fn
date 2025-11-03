/**
 * TanStack Start Integration Examples
 *
 * Extracted from integration-tanstack.md
 */

import { createScope, flow, tag, type Flow } from '@pumped-fn/core-next'
import { createFileRoute, createRootRoute, redirect, Outlet, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/start'
import { z } from 'zod'

// ============================================================================
// TANSTACK START INTEGRATION
// ============================================================================

/**
 * TanStack Module-level Scope
 *
 * Create scope in shared module for loaders/actions.
 *
 * Referenced in: integration-tanstack.md
 * Section: Create Module-level Scope
 */
export const tanstackModuleScope = createScope({
  tags: [
    tag('db-config', {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'app',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres'
    }),
    tag('api-key', process.env.API_KEY || '')
  ]
})

/**
 * TanStack List Users Flow
 *
 * Flow for data fetching in route loaders.
 *
 * Referenced in: integration-tanstack.md
 * Section: Loaders for Data Fetching
 */
export const tanstackListUsersFlow = flow({
  name: 'list-users',
  handle: async (ctx, input: {}) => {
    return { success: true, users: [{ id: '1', name: 'Alice', email: 'alice@example.com' }] }
  }
})

/**
 * TanStack Get User Flow
 *
 * Loader with route params from URL.
 *
 * Referenced in: integration-tanstack.md
 * Section: Dynamic Route Loaders
 */
export const tanstackGetUserFlow = flow({
  name: 'get-user',
  handle: async (ctx, input: { id: string }) => {
    return { success: true, user: { id: input.id, name: 'Alice', email: 'alice@example.com', createdAt: new Date() } }
  }
})

/**
 * TanStack Create User Flow
 *
 * Server function for mutations.
 *
 * Referenced in: integration-tanstack.md
 * Section: Actions for Mutations
 */
export const tanstackCreateUserFlow = flow({
  name: 'create-user',
  handle: async (ctx, input: { email: string; name: string }) => {
    return { success: true, user: { id: '1', email: input.email, name: input.name } }
  }
})

/**
 * TanStack Create User Server Function
 *
 * Server function wrapping flow execution.
 *
 * Referenced in: integration-tanstack.md
 * Section: Actions for Mutations
 */
export const tanstackCreateUserFn = createServerFn('POST', async (data: { email: string; name: string }) => {
  const result = await tanstackModuleScope.exec(tanstackCreateUserFlow, data)

  if (!result.success) {
    throw new Error(result.reason)
  }

  return result.user
})

/**
 * TanStack Update User Flow
 *
 * Flow for updating user data.
 *
 * Referenced in: integration-tanstack.md
 * Section: Complete CRUD Example
 */
export const tanstackUpdateUserFlow = flow({
  name: 'update-user',
  handle: async (ctx, input: { id: string; email: string; name: string }) => {
    return { success: true, user: { id: input.id, email: input.email, name: input.name } }
  }
})

export const tanstackUpdateUserFn = createServerFn('PUT', async (data: { id: string; email: string; name: string }) => {
  const result = await tanstackModuleScope.exec(tanstackUpdateUserFlow, data)

  if (!result.success) {
    throw new Error(result.reason)
  }

  return result.user
})

/**
 * TanStack Delete User Flow
 *
 * Flow for deleting users.
 *
 * Referenced in: integration-tanstack.md
 * Section: Complete CRUD Example
 */
export const tanstackDeleteUserFlow = flow({
  name: 'delete-user',
  handle: async (ctx, input: { id: string }) => {
    return { success: true }
  }
})

export const tanstackDeleteUserFn = createServerFn('DELETE', async (data: { id: string }) => {
  const result = await tanstackModuleScope.exec(tanstackDeleteUserFlow, data)

  if (!result.success) {
    throw new Error(result.reason)
  }

  return { success: true }
})

/**
 * TanStack Search Users Flow
 *
 * Flow with query params for search.
 *
 * Referenced in: integration-tanstack.md
 * Section: Search Params with Loaders
 */
export const tanstackSearchUsersFlow = flow({
  name: 'search-users',
  handle: async (ctx, input: { query: string; page: number }) => {
    return { success: true, users: [], total: 0 }
  }
})

/**
 * TanStack Search Schema
 *
 * Zod schema for search params validation.
 *
 * Referenced in: integration-tanstack.md
 * Section: Search Params with Loaders
 */
export const tanstackUsersSearchSchema = z.object({
  query: z.string().optional(),
  page: z.number().optional()
})

/**
 * TanStack Validate Session Flow
 *
 * Flow for authentication in beforeLoad.
 *
 * Referenced in: integration-tanstack.md
 * Section: Authentication with Before Load
 */
export const tanstackValidateSessionFlow = flow({
  name: 'validate-session',
  handle: async (ctx, input: { token: string }) => {
    return { success: true, userId: 'user-123' }
  }
})

/**
 * TanStack Get Dashboard Flow
 *
 * Protected route data fetching.
 *
 * Referenced in: integration-tanstack.md
 * Section: Authentication with Before Load
 */
export const tanstackGetDashboardFlow = flow({
  name: 'get-user-dashboard',
  handle: async (ctx, input: { userId: string }) => {
    return { success: true, dashboard: { stats: [], activities: [] } }
  }
})

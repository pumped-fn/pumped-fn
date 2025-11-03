---
name: integration-tanstack
tags: integration, add, tanstack, router, ssr, loader, action, start
description: TanStack Start/Router integration patterns. Module-level scope singleton, use in loaders/actions for data fetching and mutations. Loaders for SSR data, actions for mutations, scope shared across request lifecycle. Type-safe routing with flow results. Error boundaries handle flow errors.
---

# Integration: TanStack Start

## When to Use

- Building TanStack Start applications
- Type-safe routing with TanStack Router
- SSR data fetching with loaders
- Mutations with actions
- Full-stack TypeScript applications

## Scope Lifecycle Pattern

**Module-level scope (singleton), shared across SSR lifecycle**

- Create scope at module level
- Import scope in route files
- Use in loaders (data fetching) and actions (mutations)
- Scope persists across requests (long-running server)

## Core Integration Pattern

### 1. Create Module-level Scope


See: `tanstackModuleScope` in skill-examples/integrations-tanstack.ts

```typescript
// src/lib/scope.ts
import { createScope } from '@pumped-fn/core-next'
import { dbConfig, apiKey } from '@/resources'

export const appScope = createScope({
  tags: [
    dbConfig({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'app',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres'
    }),
    apiKey(process.env.API_KEY || '')
  ]
})
```

### 2. Loaders for Data Fetching

Use scope in route loaders for SSR data:


See: `tanstackListUsersFlow` in skill-examples/integrations-tanstack.ts

```typescript
// src/routes/users.tsx
import { createFileRoute } from '@tanstack/react-router'
import { appScope } from '@/lib/scope'
import { listUsers } from '@/flows'

export const Route = createFileRoute('/users')({
  loader: async () => {
    const result = await appScope.exec(listUsers, {})

    if (!result.success) {
      throw new Error(result.reason)
    }

    return { users: result.users }
  },
  component: UsersPage
})

function UsersPage() {
  const { users } = Route.useLoaderData()

  return (
    <div>
      <h1>Users</h1>
      <ul>
        {users.map(user => (
          <li key={user.id}>{user.name} - {user.email}</li>
        ))}
      </ul>
    </div>
  )
}
```

### 3. Dynamic Route Loaders


See: `tanstackGetUserFlow` in skill-examples/integrations-tanstack.ts

```typescript
// src/routes/users/$userId.tsx
import { createFileRoute } from '@tanstack/react-router'
import { appScope } from '@/lib/scope'
import { getUser } from '@/flows'

export const Route = createFileRoute('/users/$userId')({
  loader: async ({ params }) => {
    const result = await appScope.exec(getUser, { id: params.userId })

    if (!result.success) {
      throw new Error(result.reason)
    }

    return { user: result.user }
  },
  component: UserDetailPage
})

function UserDetailPage() {
  const { user } = Route.useLoaderData()

  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
      <p>Created: {user.createdAt.toLocaleDateString()}</p>
    </div>
  )
}
```

### 4. Actions for Mutations

Use scope in server functions for mutations:


See: `tanstackCreateUserFn` in skill-examples/integrations-tanstack.ts

```typescript
// src/routes/users/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/start'
import { appScope } from '@/lib/scope'
import { createUser, listUsers } from '@/flows'

const createUserAction = createServerFn('POST', async (data: { email: string; name: string }) => {
  const result = await appScope.exec(createUser, data)

  if (!result.success) {
    throw new Error(result.reason)
  }

  return result.user
})

export const Route = createFileRoute('/users/')({
  loader: async () => {
    const result = await appScope.exec(listUsers, {})

    if (!result.success) {
      throw new Error(result.reason)
    }

    return { users: result.users }
  },
  component: UsersPage
})

function UsersPage() {
  const { users } = Route.useLoaderData()
  const navigate = Route.useNavigate()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    try {
      await createUserAction({
        email: formData.get('email') as string,
        name: formData.get('name') as string
      })

      navigate({ to: '/users' })
    } catch (error) {
      console.error('Failed to create user:', error)
    }
  }

  return (
    <div>
      <h1>Users</h1>
      <form onSubmit={handleSubmit}>
        <input name="email" type="email" required />
        <input name="name" type="text" required />
        <button type="submit">Create User</button>
      </form>
      <ul>
        {users.map(user => (
          <li key={user.id}>{user.name} - {user.email}</li>
        ))}
      </ul>
    </div>
  )
}
```

## Complete CRUD Example


See: `tanstackDeleteUserFlow` in skill-examples/integrations-tanstack.ts

```typescript
// src/routes/users.tsx
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/start'
import { appScope } from '@/lib/scope'
import { listUsers, createUser, updateUser, deleteUser } from '@/flows'

const createUserFn = createServerFn('POST', async (data: { email: string; name: string }) => {
  const result = await appScope.exec(createUser, data)

  if (!result.success) {
    throw new Error(result.reason)
  }

  return result.user
})

const updateUserFn = createServerFn('PUT', async (data: { id: string; email: string; name: string }) => {
  const result = await appScope.exec(updateUser, data)

  if (!result.success) {
    throw new Error(result.reason)
  }

  return result.user
})

const deleteUserFn = createServerFn('DELETE', async (data: { id: string }) => {
  const result = await appScope.exec(deleteUser, data)

  if (!result.success) {
    throw new Error(result.reason)
  }

  return { success: true }
})

export const Route = createFileRoute('/users')({
  loader: async () => {
    const result = await appScope.exec(listUsers, {})

    if (!result.success) {
      throw new Error(result.reason)
    }

    return { users: result.users }
  },
  component: UsersPage
})

function UsersPage() {
  const { users } = Route.useLoaderData()
  const navigate = Route.useNavigate()

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    await createUserFn({
      email: formData.get('email') as string,
      name: formData.get('name') as string
    })

    navigate({ to: '/users' })
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete user?')) return

    await deleteUserFn({ id })
    navigate({ to: '/users' })
  }

  return (
    <div>
      <h1>Users</h1>
      <form onSubmit={handleCreate}>
        <input name="email" type="email" placeholder="Email" required />
        <input name="name" type="text" placeholder="Name" required />
        <button type="submit">Create</button>
      </form>
      <ul>
        {users.map(user => (
          <li key={user.id}>
            {user.name} - {user.email}
            <button onClick={() => handleDelete(user.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

## Search Params with Loaders


See: `tanstackUsersSearchSchema` in skill-examples/integrations-tanstack.ts

```typescript
// src/routes/users/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { appScope } from '@/lib/scope'
import { searchUsers } from '@/flows'
import { z } from 'zod'

const usersSearchSchema = z.object({
  query: z.string().optional(),
  page: z.number().optional()
})

export const Route = createFileRoute('/users/')({
  validateSearch: usersSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ deps }) => {
    const result = await appScope.exec(searchUsers, {
      query: deps.search.query || '',
      page: deps.search.page || 1
    })

    if (!result.success) {
      throw new Error(result.reason)
    }

    return { users: result.users, total: result.total }
  },
  component: UsersPage
})

function UsersPage() {
  const { users, total } = Route.useLoaderData()
  const navigate = Route.useNavigate()
  const { query } = Route.useSearch()

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const query = formData.get('query') as string

    navigate({ search: { query } })
  }

  return (
    <div>
      <h1>Users ({total})</h1>
      <form onSubmit={handleSearch}>
        <input name="query" defaultValue={query} placeholder="Search..." />
        <button type="submit">Search</button>
      </form>
      <ul>
        {users.map(user => (
          <li key={user.id}>{user.name} - {user.email}</li>
        ))}
      </ul>
    </div>
  )
}
```

## Error Boundaries

```typescript
// src/routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: RootComponent,
  errorComponent: ({ error }) => (
    <div>
      <h1>Error</h1>
      <p>{error.message}</p>
    </div>
  )
})

function RootComponent() {
  return (
    <>
      <nav>
        <a href="/users">Users</a>
      </nav>
      <Outlet />
    </>
  )
}
```

## Optimistic Updates

```typescript
// src/routes/users/index.tsx
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/start'
import { appScope } from '@/lib/scope'
import { createUser, listUsers } from '@/flows'
import { useState } from 'react'

const createUserFn = createServerFn('POST', async (data: { email: string; name: string }) => {
  const result = await appScope.exec(createUser, data)

  if (!result.success) {
    throw new Error(result.reason)
  }

  return result.user
})

export const Route = createFileRoute('/users/')({
  loader: async () => {
    const result = await appScope.exec(listUsers, {})

    if (!result.success) {
      throw new Error(result.reason)
    }

    return { users: result.users }
  },
  component: UsersPage
})

function UsersPage() {
  const { users } = Route.useLoaderData()
  const router = useRouter()
  const [optimisticUsers, setOptimisticUsers] = useState(users)

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string
    const name = formData.get('name') as string

    const tempUser = {
      id: `temp-${Date.now()}`,
      email,
      name,
      createdAt: new Date()
    }

    setOptimisticUsers([...optimisticUsers, tempUser])

    try {
      const user = await createUserFn({ email, name })
      await router.invalidate()
    } catch (error) {
      setOptimisticUsers(optimisticUsers)
      console.error('Failed to create user:', error)
    }
  }

  return (
    <div>
      <h1>Users</h1>
      <form onSubmit={handleCreate}>
        <input name="email" type="email" required />
        <input name="name" type="text" required />
        <button type="submit">Create</button>
      </form>
      <ul>
        {optimisticUsers.map(user => (
          <li key={user.id}>{user.name} - {user.email}</li>
        ))}
      </ul>
    </div>
  )
}
```

## Pending States

```typescript
// src/routes/users/index.tsx
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/start'
import { appScope } from '@/lib/scope'
import { createUser, listUsers } from '@/flows'
import { useState } from 'react'

const createUserFn = createServerFn('POST', async (data: { email: string; name: string }) => {
  const result = await appScope.exec(createUser, data)

  if (!result.success) {
    throw new Error(result.reason)
  }

  return result.user
})

export const Route = createFileRoute('/users/')({
  loader: async () => {
    const result = await appScope.exec(listUsers, {})

    if (!result.success) {
      throw new Error(result.reason)
    }

    return { users: result.users }
  },
  component: UsersPage
})

function UsersPage() {
  const { users } = Route.useLoaderData()
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    setIsPending(true)

    try {
      await createUserFn({
        email: formData.get('email') as string,
        name: formData.get('name') as string
      })

      await router.invalidate()
      e.currentTarget.reset()
    } catch (error) {
      console.error('Failed to create user:', error)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div>
      <h1>Users</h1>
      <form onSubmit={handleCreate}>
        <input name="email" type="email" required disabled={isPending} />
        <input name="name" type="text" required disabled={isPending} />
        <button type="submit" disabled={isPending}>
          {isPending ? 'Creating...' : 'Create User'}
        </button>
      </form>
      <ul>
        {users.map(user => (
          <li key={user.id}>{user.name} - {user.email}</li>
        ))}
      </ul>
    </div>
  )
}
```

## Authentication with Before Load


See: `tanstackGetDashboardFlow` in skill-examples/integrations-tanstack.ts

```typescript
// src/routes/_authenticated.tsx
import { createFileRoute, redirect } from '@tanstack/react-router'
import { appScope } from '@/lib/scope'
import { validateSession } from '@/flows'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context }) => {
    const sessionToken = context.session?.token

    if (!sessionToken) {
      throw redirect({ to: '/login' })
    }

    const result = await appScope.exec(validateSession, { token: sessionToken })

    if (!result.success) {
      throw redirect({ to: '/login' })
    }

    return { userId: result.userId }
  }
})
```


See: `tanstackGetDashboardFlow` in skill-examples/integrations-tanstack.ts

```typescript
// src/routes/_authenticated/dashboard.tsx
import { createFileRoute } from '@tanstack/react-router'
import { appScope } from '@/lib/scope'
import { getUserDashboard } from '@/flows'

export const Route = createFileRoute('/_authenticated/dashboard')({
  loader: async ({ context }) => {
    const result = await appScope.exec(getUserDashboard, { userId: context.userId })

    if (!result.success) {
      throw new Error(result.reason)
    }

    return { dashboard: result.dashboard }
  },
  component: DashboardPage
})

function DashboardPage() {
  const { dashboard } = Route.useLoaderData()

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome back!</p>
      <pre>{JSON.stringify(dashboard, null, 2)}</pre>
    </div>
  )
}
```

## Troubleshooting

### Scope created in loader/action

**Problem:** New scope per request, performance issues

**Solution:**
```typescript
// ❌ Wrong - creating scope in loader
export const Route = createFileRoute('/users')({
  loader: async () => {
    const scope = createScope({ tags: [...] }) // Don't do this
    const result = await scope.exec(listUsers, {})
    return { users: result.users }
  }
})

// ✅ Correct - module-level scope
// src/lib/scope.ts
export const appScope = createScope({ tags: [...] })

// src/routes/users.tsx
import { appScope } from '@/lib/scope'

export const Route = createFileRoute('/users')({
  loader: async () => {
    const result = await appScope.exec(listUsers, {})
    return { users: result.users }
  }
})
```

### Throwing raw errors from flows

**Problem:** Discriminated unions not converted to thrown errors

**Solution:**
```typescript
// ❌ Wrong - returning error, not throwing
export const Route = createFileRoute('/users')({
  loader: async () => {
    const result = await appScope.exec(listUsers, {})
    return result // Component gets error object
  }
})

// ✅ Correct - throw on error
export const Route = createFileRoute('/users')({
  loader: async () => {
    const result = await appScope.exec(listUsers, {})

    if (!result.success) {
      throw new Error(result.reason)
    }

    return { users: result.users }
  }
})
```

### Missing loader dependencies

**Problem:** Loader doesn't re-run when search params change

**Solution:**
```typescript
// ❌ Wrong - no loaderDeps
export const Route = createFileRoute('/users')({
  loader: async ({ search }) => {
    const result = await appScope.exec(searchUsers, { query: search.query })
    return result
  }
})

// ✅ Correct - declare dependencies
export const Route = createFileRoute('/users')({
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ deps }) => {
    const result = await appScope.exec(searchUsers, { query: deps.search.query })

    if (!result.success) {
      throw new Error(result.reason)
    }

    return result
  }
})
```

### Stale data after mutation

**Problem:** UI doesn't update after server function completes

**Solution:**
```typescript
// ❌ Wrong - no invalidation
const handleCreate = async (data) => {
  await createUserFn(data)
  // UI shows stale data
}

// ✅ Correct - invalidate router
import { useRouter } from '@tanstack/react-router'

const router = useRouter()

const handleCreate = async (data) => {
  await createUserFn(data)
  await router.invalidate() // Refetch loader data
}
```

### Disposal in loaders/actions

**Problem:** Calling scope.dispose() in routes

**Solution:**
```typescript
// ❌ Wrong - never dispose in TanStack Start
export const Route = createFileRoute('/users')({
  loader: async () => {
    const result = await appScope.exec(listUsers, {})
    await appScope.dispose() // NEVER do this
    return result
  }
})

// ✅ Correct - never dispose (long-running server)
export const Route = createFileRoute('/users')({
  loader: async () => {
    const result = await appScope.exec(listUsers, {})
    return result
  }
})
```

## Related Sub-skills

- `coding-standards.md` - Type safety and discriminated unions
- `flow-subflows.md` - Orchestrating business logic
- `entrypoint-patterns.md` - Application structure
- `testing-flows.md` - Testing loaders and actions

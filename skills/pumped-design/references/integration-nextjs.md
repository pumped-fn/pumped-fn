---
name: integration-nextjs
tags: integration, add, nextjs, ssr, react, server-actions, api-routes, app-router
description: Next.js integration patterns. Module-level scope singleton, import where needed, use in Server Components/Actions/API Routes. Server Actions for mutations, API Routes for external APIs, Server Components for data fetching. Never dispose (long-running server). Client components call Server Actions or API Routes.
---

# Integration: Next.js

## When to Use

- Building Next.js applications (App Router or Pages Router)
- Server Components data fetching
- Server Actions for mutations
- API Routes for external APIs
- SSR/SSG with pumped-fn flows

## Scope Lifecycle Pattern

**Module-level scope (singleton), never dispose**

- Create scope at module level
- Import scope where needed
- Use in Server Components, Server Actions, API Routes
- Long-running server (no disposal needed)

## Core Integration Pattern

### 1. Create Module-level Scope

Create scope in shared module, import where needed:

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

### 2. Server Components with Flow Execution

Use scope directly in Server Components:

```typescript
// src/app/users/page.tsx
import { appScope } from '@/lib/scope'
import { listUsers } from '@/flows'

export default async function UsersPage() {
  const result = await appScope.exec(listUsers, {})

  if (!result.success) {
    return <div>Error: {result.reason}</div>
  }

  return (
    <div>
      <h1>Users</h1>
      <ul>
        {result.users.map(user => (
          <li key={user.id}>{user.name} - {user.email}</li>
        ))}
      </ul>
    </div>
  )
}
```

### 3. Server Actions for Mutations

Use "use server" directive with scope:

```typescript
// src/app/users/actions.ts
'use server'

import { appScope } from '@/lib/scope'
import { createUser, updateUser, deleteUser } from '@/flows'
import { revalidatePath } from 'next/cache'

export async function createUserAction(formData: FormData) {
  const email = formData.get('email') as string
  const name = formData.get('name') as string

  const result = await appScope.exec(createUser, { email, name })

  if (!result.success) {
    return { error: result.reason }
  }

  revalidatePath('/users')
  return { success: true, user: result.user }
}

export async function updateUserAction(id: string, formData: FormData) {
  const email = formData.get('email') as string
  const name = formData.get('name') as string

  const result = await appScope.exec(updateUser, { id, email, name })

  if (!result.success) {
    return { error: result.reason }
  }

  revalidatePath('/users')
  revalidatePath(`/users/${id}`)
  return { success: true, user: result.user }
}

export async function deleteUserAction(id: string) {
  const result = await appScope.exec(deleteUser, { id })

  if (!result.success) {
    return { error: result.reason }
  }

  revalidatePath('/users')
  return { success: true }
}
```

### 4. Client Components Calling Server Actions

Client components use Server Actions via forms or transitions:

```typescript
// src/app/users/create-form.tsx
'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { createUserAction } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Creating...' : 'Create User'}
    </button>
  )
}

export function CreateUserForm() {
  const [state, formAction] = useFormState(createUserAction, null)

  return (
    <form action={formAction}>
      <input name="email" type="email" required placeholder="Email" />
      <input name="name" type="text" required placeholder="Name" />
      <SubmitButton />
      {state?.error && <p>Error: {state.error}</p>}
      {state?.success && <p>User created!</p>}
    </form>
  )
}
```

## API Routes Pattern (App Router)

### Route Handlers with Scope

```typescript
// src/app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { appScope } from '@/lib/scope'
import { createUser, listUsers } from '@/flows'

export async function GET(request: NextRequest) {
  const result = await appScope.exec(listUsers, {})

  if (!result.success) {
    return NextResponse.json({ error: result.reason }, { status: 500 })
  }

  return NextResponse.json(result.users)
}

export async function POST(request: NextRequest) {
  const body = await request.json()

  const result = await appScope.exec(createUser, {
    email: body.email,
    name: body.name
  })

  if (!result.success) {
    const statusMap = {
      INVALID_EMAIL: 400,
      EMAIL_EXISTS: 409,
      NAME_TOO_SHORT: 400
    }
    return NextResponse.json(
      { error: result.reason },
      { status: statusMap[result.reason] || 400 }
    )
  }

  return NextResponse.json(result.user, { status: 201 })
}
```

### Dynamic Route Handlers

```typescript
// src/app/api/users/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { appScope } from '@/lib/scope'
import { getUser, updateUser, deleteUser } from '@/flows'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const result = await appScope.exec(getUser, { id: params.id })

  if (!result.success) {
    return NextResponse.json({ error: result.reason }, { status: 404 })
  }

  return NextResponse.json(result.user)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json()

  const result = await appScope.exec(updateUser, {
    id: params.id,
    email: body.email,
    name: body.name
  })

  if (!result.success) {
    return NextResponse.json({ error: result.reason }, { status: 400 })
  }

  return NextResponse.json(result.user)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const result = await appScope.exec(deleteUser, { id: params.id })

  if (!result.success) {
    return NextResponse.json({ error: result.reason }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
```

## API Routes Pattern (Pages Router)

```typescript
// pages/api/users/index.ts
import { NextApiRequest, NextApiResponse } from 'next'
import { appScope } from '@/lib/scope'
import { createUser, listUsers } from '@/flows'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const result = await appScope.exec(listUsers, {})

    if (!result.success) {
      return res.status(500).json({ error: result.reason })
    }

    return res.status(200).json(result.users)
  }

  if (req.method === 'POST') {
    const result = await appScope.exec(createUser, {
      email: req.body.email,
      name: req.body.name
    })

    if (!result.success) {
      const statusMap = {
        INVALID_EMAIL: 400,
        EMAIL_EXISTS: 409,
        NAME_TOO_SHORT: 400
      }
      return res.status(statusMap[result.reason] || 400).json({
        error: result.reason
      })
    }

    return res.status(201).json(result.user)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
```

## Server-side Rendering (getServerSideProps)

```typescript
// pages/users/index.tsx
import { GetServerSideProps } from 'next'
import { appScope } from '@/lib/scope'
import { listUsers } from '@/flows'

export const getServerSideProps: GetServerSideProps = async () => {
  const result = await appScope.exec(listUsers, {})

  if (!result.success) {
    return {
      props: { users: [], error: result.reason }
    }
  }

  return {
    props: { users: result.users, error: null }
  }
}

export default function UsersPage({ users, error }: { users: any[]; error: string | null }) {
  if (error) {
    return <div>Error: {error}</div>
  }

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

## Static Site Generation (getStaticProps)

```typescript
// pages/users/[id].tsx
import { GetStaticProps, GetStaticPaths } from 'next'
import { appScope } from '@/lib/scope'
import { getUser, listUsers } from '@/flows'

export const getStaticPaths: GetStaticPaths = async () => {
  const result = await appScope.exec(listUsers, {})

  if (!result.success) {
    return { paths: [], fallback: 'blocking' }
  }

  const paths = result.users.map(user => ({
    params: { id: user.id }
  }))

  return { paths, fallback: 'blocking' }
}

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const result = await appScope.exec(getUser, { id: params?.id as string })

  if (!result.success) {
    return { notFound: true }
  }

  return {
    props: { user: result.user },
    revalidate: 60
  }
}

export default function UserPage({ user }: { user: any }) {
  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  )
}
```

## Middleware Pattern

```typescript
// src/middleware.ts
import { NextRequest, NextResponse } from 'next/server'
import { appScope } from '@/lib/scope'
import { validateSession } from '@/flows'

export async function middleware(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value

  if (!sessionToken) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const result = await appScope.exec(validateSession, { token: sessionToken })

  if (!result.success) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const response = NextResponse.next()
  response.headers.set('x-user-id', result.userId)

  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/protected/:path*']
}
```

## Progressive Enhancement with Forms

```typescript
// src/app/users/page.tsx
import { appScope } from '@/lib/scope'
import { listUsers } from '@/flows'
import { CreateUserForm } from './create-form'

export default async function UsersPage() {
  const result = await appScope.exec(listUsers, {})

  if (!result.success) {
    return <div>Error loading users</div>
  }

  return (
    <div>
      <h1>Users</h1>
      <CreateUserForm />
      <ul>
        {result.users.map(user => (
          <li key={user.id}>{user.name} - {user.email}</li>
        ))}
      </ul>
    </div>
  )
}
```

```typescript
// src/app/users/create-form.tsx
'use client'

import { useFormState } from 'react-dom'
import { createUserAction } from './actions'

export function CreateUserForm() {
  const [state, formAction] = useFormState(createUserAction, null)

  return (
    <form action={formAction}>
      <input name="email" type="email" required />
      <input name="name" type="text" required />
      <button type="submit">Create</button>
      {state?.error && <p>Error: {state.error}</p>}
    </form>
  )
}
```

## Troubleshooting

### Scope created per-request

**Problem:** New scope on every request, performance issues

**Solution:**
```typescript
// ❌ Wrong - creating scope in route/action
export async function GET(request: NextRequest) {
  const scope = createScope({ tags: [...] }) // Don't do this
  const result = await scope.exec(listUsers, {})
  return NextResponse.json(result.users)
}

// ✅ Correct - module-level scope
// src/lib/scope.ts
export const appScope = createScope({ tags: [...] })

// src/app/api/users/route.ts
import { appScope } from '@/lib/scope'

export async function GET(request: NextRequest) {
  const result = await appScope.exec(listUsers, {})
  return NextResponse.json(result.users)
}
```

### Using flows in Client Components

**Problem:** Flows imported in "use client" components

**Solution:**
```typescript
// ❌ Wrong - can't use flows directly in client
'use client'

import { appScope } from '@/lib/scope'
import { createUser } from '@/flows'

export function UserForm() {
  const handleSubmit = async (e) => {
    const result = await appScope.exec(createUser, {...}) // Server code!
  }
}

// ✅ Correct - use Server Actions
// actions.ts
'use server'
export async function createUserAction(data) {
  return appScope.exec(createUser, data)
}

// form.tsx
'use client'
import { createUserAction } from './actions'

export function UserForm() {
  const handleSubmit = async (e) => {
    const result = await createUserAction({ email, name })
  }
}
```

### Missing revalidation after mutations

**Problem:** Stale data shown after Server Action completes

**Solution:**
```typescript
// ❌ Wrong - no revalidation
'use server'

export async function createUserAction(formData: FormData) {
  const result = await appScope.exec(createUser, {...})
  return result // Page shows stale data
}

// ✅ Correct - revalidate paths
'use server'

import { revalidatePath } from 'next/cache'

export async function createUserAction(formData: FormData) {
  const result = await appScope.exec(createUser, {...})

  if (result.success) {
    revalidatePath('/users')
  }

  return result
}
```

### Environment variables not available

**Problem:** process.env.* undefined in scope creation

**Solution:**
- Ensure variables defined in .env.local
- Prefix with NEXT_PUBLIC_ for client-side access
- Access server-side variables only in Server Components/Actions/API Routes
- Never expose sensitive values to client

```typescript
// ✅ Correct - server-only scope
// src/lib/scope.ts
export const appScope = createScope({
  tags: [
    dbConfig({
      host: process.env.DB_HOST!, // Server-side only
      password: process.env.DB_PASSWORD! // Never NEXT_PUBLIC_
    })
  ]
})
```

### Disposal in Server Actions

**Problem:** Calling scope.dispose() in actions/routes

**Solution:**
```typescript
// ❌ Wrong - never dispose in Next.js
export async function createUserAction(data) {
  const result = await appScope.exec(createUser, data)
  await appScope.dispose() // NEVER do this
  return result
}

// ✅ Correct - never dispose (long-running server)
export async function createUserAction(data) {
  const result = await appScope.exec(createUser, data)
  return result
}
```

### Mixing App Router and Pages Router patterns

**Problem:** Inconsistent data fetching patterns

**Solution:**
- Choose one router architecture
- App Router: Use Server Components and Server Actions
- Pages Router: Use getServerSideProps/getStaticProps and API Routes
- Don't mix patterns in same application

## Related Sub-skills

- `coding-standards.md` - Type safety and file organization
- `flow-subflows.md` - Orchestrating business logic
- `entrypoint-patterns.md` - Application initialization
- `testing-flows.md` - Testing Server Actions and flows

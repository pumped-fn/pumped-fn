# Pumped-fn React Pattern Reference

Quick reference for common React + pumped-fn patterns.

## Application Structure

```
src/
├── app/
│   ├── scope.ts          # App scope + tag definitions
│   ├── resources.ts      # Base infrastructure (API clients)
│   └── main.tsx          # App initialization
├── domain/
│   ├── user.ts           # User feature state
│   ├── posts.ts          # Posts feature state
│   └── resources.ts      # Feature-specific resources
└── ui/
    ├── UserDashboard.tsx
    ├── PostEditor.tsx
    └── components/
```

## Initialization Pattern

```typescript
// app/scope.ts
export const apiBaseUrl = tag(custom<string>(), { label: 'api.baseUrl' })
export const authToken = tag(custom<string | null>(), { label: 'auth.token', default: null })

export const appScope = createScope({
  tags: [
    apiBaseUrl(import.meta.env.VITE_API_URL),
    authToken(localStorage.getItem('auth_token'))
  ]
})

// app/main.tsx
appScope.run(async () => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <ScopeProvider scope={appScope}>
      <App />
    </ScopeProvider>
  )
})
```

## Resource Patterns

### API Client
```typescript
export const apiClient = provide((controller) => {
  const base = apiBaseUrl.get(controller.scope)
  const token = authToken.find(controller.scope)

  return {
    get: async <T>(path: string): Promise<T> => {
      const res = await fetch(`${base}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      return res.json()
    }
  }
})
```

### WebSocket
```typescript
export const chatSocket = provide((controller) => {
  const base = apiBaseUrl.get(controller.scope)
  const ws = new WebSocket(base.replace('http', 'ws') + '/chat')

  controller.cleanup(() => ws.close())

  return ws
})
```

### SSE
```typescript
export const notificationStream = provide((controller) => {
  const base = apiBaseUrl.get(controller.scope)
  const events = new EventSource(`${base}/notifications`)

  controller.cleanup(() => events.close())

  return events
})
```

### OAuth Client
```typescript
export const oauthClient = provide((controller) => {
  const token = authToken.get(controller.scope)

  return {
    refreshToken: async () => {
      const res = await fetch('/auth/refresh', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const { token: newToken } = await res.json()
      controller.scope.update(authToken, newToken)
      localStorage.setItem('auth_token', newToken)
      return newToken
    }
  }
})
```

## Feature State Patterns

### User & Permissions
```typescript
export const currentUser = provide((controller) =>
  apiClient.get(controller.scope).get('/me')
)

export const userPermissions = derive(
  currentUser.reactive,
  (user) => user.roles.flatMap(r => r.permissions)
)

export const canEditPosts = derive(
  userPermissions.reactive,
  (perms) => perms.includes('posts.edit')
)
```

### Data Fetching
```typescript
export const posts = provide((controller) =>
  apiClient.get(controller.scope).get('/posts')
)

export const userPosts = derive(
  { posts: posts.reactive, user: currentUser.reactive },
  ({ posts, user }) => posts.filter(p => p.authorId === user.id)
)
```

### Computed State
```typescript
export const postCount = derive(
  posts.reactive,
  (list) => list.length
)

export const hasUnpublishedPosts = derive(
  userPosts.reactive,
  (posts) => posts.some(p => !p.published)
)
```

### Conditional Resources
```typescript
export const protectedApi = derive(
  { api: apiClient, user: currentUser.reactive },
  ({ api, user }) => {
    if (!user) throw new Error('Not authenticated')
    return api
  }
)
```

## Component Patterns

### Basic Projection
```typescript
function UserBadge() {
  const [user] = useResolves(currentUser)
  return <div>{user.name}</div>
}
```

### Selective Re-render
```typescript
function UserAvatar() {
  const avatarUrl = useResolve(
    currentUser.reactive,
    user => user.avatarUrl,
    { equality: (a, b) => a === b }
  )
  return <img src={avatarUrl} />
}
```

### Conditional Rendering
```typescript
function PostEditor() {
  const [canEdit] = useResolves(canEditPosts)

  if (!canEdit) return <AccessDenied />

  return <Editor />
}
```

### Multiple Executors
```typescript
function Dashboard() {
  const [user, posts, permissions] = useResolves(
    currentUser,
    posts.reactive,
    userPermissions.reactive
  )

  return (
    <div>
      <h1>Welcome {user.name}</h1>
      <p>You have {posts.length} posts</p>
      <p>Permissions: {permissions.join(', ')}</p>
    </div>
  )
}
```

### Updating State
```typescript
function PostDashboard() {
  const [posts] = useResolves(posts.reactive)
  const updatePosts = useUpdate(posts)

  const refresh = async () => {
    const api = /* ... */
    const fresh = await api.get('/posts')
    updatePosts(fresh)
  }

  return (
    <div>
      <button onClick={refresh}>Refresh</button>
      <PostList posts={posts} />
    </div>
  )
}
```

## Testing Patterns

### Component Test
```typescript
test('shows editor when user has permissions', () => {
  const mockApi = {
    get: vi.fn(async (path) => {
      if (path === '/me') return { roles: [{ permissions: ['posts.edit'] }] }
    })
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
})
```

### Feature Logic Test
```typescript
test('derives permissions from roles', async () => {
  const mockApi = {
    get: vi.fn(async () => ({
      roles: [{ permissions: ['posts.edit', 'posts.delete'] }]
    }))
  }

  const scope = createScope({
    presets: [preset(apiClient, mockApi)]
  })

  const permissions = await scope.resolve(userPermissions)
  expect(permissions).toEqual(['posts.edit', 'posts.delete'])

  const canEdit = await scope.resolve(canEditPosts)
  expect(canEdit).toBe(true)
})
```

### Multiple Scenarios
```typescript
describe('UserDashboard', () => {
  const createTestScope = (userRole: string) => {
    const mockApi = {
      get: vi.fn(async (path) => {
        if (path === '/me') {
          return {
            name: userRole === 'admin' ? 'Admin' : 'User',
            roles: [{ permissions: userRole === 'admin' ? ['posts.edit'] : [] }]
          }
        }
      })
    }

    return createScope({ presets: [preset(apiClient, mockApi)] })
  }

  test('admin sees editor', () => {
    const scope = createTestScope('admin')
    render(<ScopeProvider scope={scope}><Dashboard /></ScopeProvider>)
    expect(screen.getByText('Post Editor')).toBeInTheDocument()
  })

  test('user sees access denied', () => {
    const scope = createTestScope('user')
    render(<ScopeProvider scope={scope}><Dashboard /></ScopeProvider>)
    expect(screen.getByText('Access Denied')).toBeInTheDocument()
  })
})
```

## Protocol Abstraction Pattern

### Define Transport Interface
```typescript
export type RPCTransport = {
  call: <T>(method: string, params: unknown) => Promise<T>
}

export const rpcTransport = tag(custom<RPCTransport>(), {
  label: 'rpc.transport'
})
```

### Use Transport in Client
```typescript
export const rpcClient = provide((controller) => {
  const transport = rpcTransport.get(controller.scope)

  return {
    getUser: (id: string) => transport.call('user.get', { id }),
    listPosts: () => transport.call('posts.list', {})
  }
})
```

### Inject Implementation
```typescript
// Production
const appScope = createScope({
  tags: [rpcTransport(fetchTransport)]
})

// Testing
const testScope = createScope({
  tags: [rpcTransport(mockTransport)]
})
```

## Performance Patterns

### Selective Re-render
```typescript
// Only re-render when name changes, ignore other user fields
const userName = useResolve(
  currentUser.reactive,
  user => user.name,
  { equality: (a, b) => a === b }
)
```

### Memoized Selectors
```typescript
const selectUserName = useMemo(
  () => (user: User) => user.name,
  []
)

const userName = useResolve(currentUser.reactive, selectUserName)
```

### Batched Updates
```typescript
// React automatically batches updates from scope.update()
act(() => {
  scope.update(user, newUser)
  scope.update(posts, newPosts)
})
// Single re-render for both updates
```

## Common Mistakes

### ❌ Resource in useEffect
```typescript
// WRONG
function Chat() {
  useEffect(() => {
    const ws = new WebSocket('ws://...')
    return () => ws.close()
  }, [])
}

// CORRECT
const chatSocket = provide((controller) => {
  const ws = new WebSocket('ws://...')
  controller.cleanup(() => ws.close())
  return ws
})
```

### ❌ Scope as Prop
```typescript
// WRONG
<Dashboard scope={scope} />

// CORRECT
<ScopeProvider scope={scope}>
  <Dashboard />
</ScopeProvider>
```

### ❌ Derived State in useState
```typescript
// WRONG
const [canEdit, setCanEdit] = useState(false)
useEffect(() => {
  setCanEdit(user.roles.includes('editor'))
}, [user])

// CORRECT
const canEdit = derive(currentUser.reactive, user =>
  user.roles.includes('editor')
)
```

### ❌ Multiple Scopes
```typescript
// WRONG (unless multi-tenant)
function Component() {
  const scope = useMemo(() => createScope(), [])
  return <ScopeProvider scope={scope}>...</ScopeProvider>
}

// CORRECT
const appScope = createScope()

function App() {
  return <ScopeProvider scope={appScope}>
    <Component />
  </ScopeProvider>
}
```

## Progressive Migration Pattern

### Prototype → Production Workflow

```typescript
// 1. Define storage interface
type Storage = {
  get: <T>(key: string) => T | null | Promise<T | null>
  set: <T>(key: string, value: T) => void | Promise<void>
  list: <T>(prefix: string) => T[] | Promise<T[]>
}

const storageImpl = tag(custom<Storage>(), { label: 'storage.impl' })

// 2. Prototype with localStorage
const prototypeScope = createScope({
  tags: [storageImpl(localStorageImpl)]
})

// 3. Scale to IndexedDB
const scaledScope = createScope({
  tags: [storageImpl(indexedDBImpl)]
})

// 4. Production with API
const productionScope = createScope({
  tags: [storageImpl(remoteStorageImpl(api))]
})
```

**Business logic unchanged across all phases.**

### Migration Stages

| Stage | Storage | When to Use |
|-------|---------|-------------|
| Prototype | localStorage | Days 1-7, validate features |
| Scale | IndexedDB | Need >5MB storage, complex queries |
| Production | Remote API | Backend ready, multi-device sync |
| Hybrid | Cache + API | Optimize performance, offline-first |

### Why This Works

- **Same interface:** localStorage, IndexedDB, API all expose `get/set/list`
- **Swap tags:** Change one line in scope creation
- **Zero refactoring:** Components/logic never change
- **Testable:** Validate behavior at each stage

## Cheat Sheet

| Task | Pattern |
|------|---------|
| Initialize app | `appScope.run()` + `<ScopeProvider>` |
| API client | `provide()` with fetch wrapper |
| WebSocket | `provide()` + `controller.cleanup()` |
| Feature state | `derive()` from resources |
| Permissions | `derive()` from user roles |
| Component data | `useResolves()` |
| Selective render | `useResolve(exec, selector)` |
| Update state | `useUpdate(executor)` |
| Test component | `createScope({ presets: [...] })` |
| Test logic | `scope.resolve(executor)` |
| Protocol swap | Tag injection |
| **Prototype → Prod** | **Tag-based storage swap** |

## File Organization (Prefer Flat)

**Recommended (Flat):**
```
src/
  scope.ts          - App scope + tags
  resources.ts      - Resource layer
  user.ts           - User feature state
  posts.ts          - Posts feature state
  App.tsx
  Dashboard.tsx
  PostEditor.tsx
  components/       - Shared components only
```

**When to add folders:** >10 related files, clear domain boundary

**Avoid:** Deep nesting (`app/config/`, `domain/usecases/`, `presentation/pages/`)

## Type Inference

**Use Core.InferOutput:**
```typescript
import { type Core } from '@pumped-fn/core-next'

// ✅ CORRECT
type User = Core.InferOutput<typeof currentUser>
type APIClient = Core.InferOutput<typeof apiClient>

// ❌ WRONG: Complex patterns
type User = Awaited<ReturnType<typeof currentUser>>
```

**For arrays/records:**
```typescript
const executors = [user, posts, permissions]
type Results = Core.InferOutput<typeof executors>
// = [User, Post[], string[]]
```

**Rule:** Let inference work. Type errors = usage errors, not type errors.

## Promised API

All async operations return `Promised<T>` with chainable operators:

```typescript
// Transformation
const userName = scope.resolve(currentUser)
  .map(user => user.name)
  .mapError(error => new Error('Failed'))

// Chaining
const posts = scope.resolve(currentUser)
  .flatMap(user => scope.resolve(userPosts))

// Error recovery
const data = scope.resolve(remote)
  .catch(() => scope.resolve(cached))
```

**In React:** Hooks handle Promised internally
```typescript
// ✅ user is T, not Promised<T>
const [user] = useResolves(currentUser)
```

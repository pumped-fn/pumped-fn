# Pumped-fn React Skill Validation Quiz

This quiz validates understanding of pumped-fn-react patterns through practical scenarios.

## Scoring System

**Total: 100 points across 5 questions (20 points each)**

### Scoring Criteria per Question

Each question scored on:
- **Pattern Consistency (8 pts)**: Follows skill patterns exactly
- **Architecture Correctness (6 pts)**: Proper layer separation (Resource/Feature/UI)
- **Best Practices (4 pts)**: No anti-patterns, uses correct APIs
- **Type Safety (2 pts)**: No `any`, proper inference

### Grade Ranges
- 90-100: Excellent - Ready to implement
- 75-89: Good - Minor pattern deviations
- 60-74: Needs Review - Missing key concepts
- <60: Requires Re-reading - Major misunderstandings

---

## Question 1: Resource Layer Setup (20 points)

**Scenario:** You're building a dashboard that needs:
- Fetch user data from `/api/user`
- Fetch posts from `/api/posts`
- Both require OAuth token from `authToken` tag

**Task:** Write the resource layer executors.

**Expected Answer Should Include:**
1. `apiClient` executor using `provide()`
2. Uses `apiBaseUrl` and `authToken` tags
3. Returns object with `get()` method
4. Uses `controller.scope` to access tags
5. Type-safe (generic `<T>` for responses)

**Grading Rubric:**
- ✅ 8pts Pattern: Uses `provide()` + `controller.scope.get(tag)`
- ✅ 6pts Architecture: Resource layer, no business logic
- ✅ 4pts Best Practices: Uses tags (not globals), proper cleanup consideration
- ✅ 2pts Type Safety: Generic types, no `any`

**Red Flags (deduct points):**
- ❌ Using `process.env` or globals (-4pts)
- ❌ Mixing business logic in resource (-3pts)
- ❌ Not using tags (-4pts)
- ❌ Missing type parameters (-2pts)

---

## Question 2: Feature State Design (20 points)

**Scenario:** Given the resource layer from Q1, create feature state for:
- `currentUser` - Fetches `/api/user`
- `userPermissions` - Derives permissions from user roles
- `canDeletePosts` - True if permissions include 'posts.delete'

**Task:** Write the feature state executors.

**Expected Answer Should Include:**
1. `currentUser` uses `provide()` or `derive()` from `apiClient`
2. `userPermissions` uses `derive()` with `.reactive`
3. `canDeletePosts` uses `derive()` with `.reactive`
4. No React imports
5. Pure TypeScript transformations

**Grading Rubric:**
- ✅ 8pts Pattern: Correct executor types, `.reactive` for derived state
- ✅ 6pts Architecture: Business logic layer, derives from resources
- ✅ 4pts Best Practices: No React, no useState patterns
- ✅ 2pts Type Safety: Inferred types from upstream executors

**Red Flags:**
- ❌ React imports or hooks (-6pts)
- ❌ Not using `.reactive` (-4pts)
- ❌ Mixing resource and feature concerns (-3pts)

---

## Question 3: Component Integration (20 points)

**Scenario:** Build a `PostDeleteButton` component that:
- Shows button only if `canDeletePosts` is true
- Shows user name from `currentUser`
- Calls `deletePost(id)` on click

**Task:** Write the React component.

**Expected Answer Should Include:**
1. Uses `useResolves()` for reactive executors
2. Conditional rendering based on permissions
3. No business logic in component
4. No `useState` for derived state
5. Proper TypeScript types

**Grading Rubric:**
- ✅ 8pts Pattern: Uses `useResolves()`, not `useState`
- ✅ 6pts Architecture: Thin view, no business logic
- ✅ 4pts Best Practices: Conditional render, no manual state sync
- ✅ 2pts Type Safety: Props typed, no `any`

**Red Flags:**
- ❌ `useState` + `useEffect` for derived state (-6pts)
- ❌ Business logic in component (-4pts)
- ❌ Passing scope as prop (-4pts)

---

## Question 4: Testing Strategy (20 points)

**Scenario:** Write a test for `PostDeleteButton` that verifies:
- Button hidden when user lacks permissions
- Button shown when user has permissions

**Task:** Write the test using pumped-fn patterns.

**Expected Answer Should Include:**
1. Creates test scope with `createScope()`
2. Uses `preset()` to mock `apiClient`
3. Mock returns different permissions per test
4. Wraps component in `<ScopeProvider scope={testScope}>`
5. Tests behavior, not implementation

**Grading Rubric:**
- ✅ 8pts Pattern: Uses `preset()` for resource mocking
- ✅ 6pts Architecture: Mocks at resource layer, not individual executors
- ✅ 4pts Best Practices: Different scopes per test, no global mocks
- ✅ 2pts Type Safety: Mock types match real API

**Red Flags:**
- ❌ Mocking individual executors (not resource) (-6pts)
- ❌ Global mocks (vi.mock at module level) (-4pts)
- ❌ Shared scope between tests (-3pts)

---

## Question 5: Progressive Migration (20 points)

**Scenario:** You prototyped a notes app with localStorage. Now migrating to remote API. Currently:

```typescript
const notes = provide(() => {
  const stored = localStorage.getItem('notes')
  return stored ? JSON.parse(stored) : []
})
```

**Task:** Refactor for progressive migration (localStorage → API).

**Expected Answer Should Include:**
1. Define `Storage` interface type
2. Create `storageImpl` tag
3. Implement `localStorageImpl` and `remoteStorageImpl`
4. Use `storage` executor in `notes`
5. Show scope creation for both phases

**Grading Rubric:**
- ✅ 8pts Pattern: Tag-based injection, interface abstraction
- ✅ 6pts Architecture: Same interface for both implementations
- ✅ 4pts Best Practices: Business logic unchanged between phases
- ✅ 2pts Type Safety: Storage interface typed, implementations match

**Red Flags:**
- ❌ Different interfaces for local/remote (-6pts)
- ❌ Hardcoded storage type in business logic (-4pts)
- ❌ No tag abstraction (-4pts)

---

## Bonus Question: Anti-Pattern Detection (Optional +10 points)

**Scenario:** Review this code and list all anti-patterns:

```typescript
// App.tsx
function App() {
  const scope = createScope()

  return (
    <Dashboard scope={scope} />
  )
}

// Dashboard.tsx
function Dashboard({ scope }: { scope: Core.Scope }) {
  const [user, setUser] = useState(null)
  const [canEdit, setCanEdit] = useState(false)

  useEffect(() => {
    fetch('/api/user')
      .then(r => r.json())
      .then(setUser)
  }, [])

  useEffect(() => {
    if (user) {
      setCanEdit(user.roles.includes('editor'))
    }
  }, [user])

  return <div>{canEdit ? 'Can edit' : 'Read only'}</div>
}
```

**Expected Answer Should Identify:**
1. ❌ Scope created in component (should be app-level)
2. ❌ Scope passed as prop (should use Context)
3. ❌ Fetch in useEffect (should be resource executor)
4. ❌ Derived state in useState (should be executor)
5. ❌ No executor graph usage

**Grading:**
- 2pts per anti-pattern identified (max 10pts)

---

## Answer Key Summary

### Question 1: Resource Layer
```typescript
const apiBaseUrl = tag(custom<string>(), { label: 'api.baseUrl' })
const authToken = tag(custom<string | null>(), { label: 'auth.token', default: null })

const apiClient = provide((controller) => {
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

### Question 2: Feature State
```typescript
const currentUser = provide((controller) =>
  apiClient.get(controller.scope).get('/api/user')
)

const userPermissions = derive(
  currentUser.reactive,
  (user) => user.roles.flatMap(r => r.permissions)
)

const canDeletePosts = derive(
  userPermissions.reactive,
  (perms) => perms.includes('posts.delete')
)
```

### Question 3: Component
```typescript
function PostDeleteButton({ postId }: { postId: string }) {
  const [canDelete, user] = useResolves(canDeletePosts, currentUser)

  if (!canDelete) return null

  const handleDelete = () => deletePost(postId)

  return (
    <button onClick={handleDelete}>
      Delete (as {user.name})
    </button>
  )
}
```

### Question 4: Testing
```typescript
test('hides button when no permissions', () => {
  const mockApi = {
    get: vi.fn(async (path) => {
      if (path === '/api/user') {
        return { name: 'User', roles: [{ permissions: [] }] }
      }
    })
  }

  const scope = createScope({
    presets: [preset(apiClient, mockApi)]
  })

  render(
    <ScopeProvider scope={scope}>
      <PostDeleteButton postId="1" />
    </ScopeProvider>
  )

  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
```

### Question 5: Progressive Migration
```typescript
type Storage = {
  get: <T>(key: string) => T | null | Promise<T | null>
  set: <T>(key: string, value: T) => void | Promise<void>
}

const storageImpl = tag(custom<Storage>(), { label: 'storage.impl' })
const storage = provide((controller) => storageImpl.get(controller.scope))

const localStorageImpl: Storage = {
  get: <T>(key: string): T | null => {
    const item = localStorage.getItem(key)
    return item ? JSON.parse(item) : null
  },
  set: <T>(key: string, value: T): void => {
    localStorage.setItem(key, JSON.stringify(value))
  }
}

const remoteStorageImpl = (api: APIClient): Storage => ({
  get: async <T>(key: string): Promise<T | null> => {
    return api.get<T>(`/storage/${key}`)
  },
  set: async <T>(key: string, value: T): Promise<void> => {
    await api.post(`/storage/${key}`, value)
  }
})

const notes = provide((controller) =>
  storage.get(controller.scope).get('notes') ?? []
)

// Prototype
const prototypeScope = createScope({
  tags: [storageImpl(localStorageImpl)]
})

// Production
const productionScope = createScope({
  tags: [storageImpl(remoteStorageImpl(api))]
})
```

---

## Scoring Summary Template

**Candidate:**
**Total Score: ___ / 100**

| Question | Pattern | Architecture | Best Practices | Type Safety | Total |
|----------|---------|--------------|----------------|-------------|-------|
| Q1: Resource | __/8 | __/6 | __/4 | __/2 | __/20 |
| Q2: Feature | __/8 | __/6 | __/4 | __/2 | __/20 |
| Q3: Component | __/8 | __/6 | __/4 | __/2 | __/20 |
| Q4: Testing | __/8 | __/6 | __/4 | __/2 | __/20 |
| Q5: Migration | __/8 | __/6 | __/4 | __/2 | __/20 |
| Bonus | - | - | - | - | __/10 |

**Grade:** ___
**Readiness:** ___
**Key Gaps:** ___

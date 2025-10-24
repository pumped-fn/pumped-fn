# Pumped-fn React Skill

Architecture guidance for building testable, maintainable React applications with `@pumped-fn/react`.

## Overview

This skill provides patterns for structuring React apps with:
- **Resource Layer** - Infrastructure (API clients, WebSocket, SSE)
- **Feature State** - Business logic (derived data, permissions)
- **UI Projection** - React components (thin views)

## Activation

Auto-activates when:
- `@pumped-fn/react` in package.json
- Brainstorming React architecture
- Discussing frontend state management
- Planning testability strategies

## Core Principles

1. **One App = One Scope** (like TanStack Query)
2. **Resources Live Outside React** (executors, not useEffect)
3. **Business Logic = Pure TypeScript** (no React imports)
4. **Context API for Scope** (never props)
5. **Mock Resources, Not Calls** (preset() for testing)

## Pattern Structure

```
Resource Layer (scope-level executors)
    ↓ derive
Feature State (reactive executors)
    ↓ useResolves/useResolve
UI Components (React views)
```

## Examples

### Resource Layer
```typescript
const apiClient = provide((controller) => {
  const base = apiBaseUrl.get(controller.scope)
  return {
    get: (path) => fetch(`${base}${path}`).then(r => r.json())
  }
})

const chatSocket = provide((controller) => {
  const ws = new WebSocket('ws://...')
  controller.cleanup(() => ws.close())
  return ws
})
```

### Feature State
```typescript
const currentUser = provide((controller) =>
  apiClient.get(controller.scope).get('/me')
)

const userPermissions = derive(
  currentUser.reactive,
  (user) => user.roles.flatMap(r => r.permissions)
)

const canEditPosts = derive(
  userPermissions.reactive,
  (perms) => perms.includes('posts.edit')
)
```

### UI Components
```typescript
function PostEditor() {
  const [canEdit] = useResolves(canEditPosts)

  if (!canEdit) return <AccessDenied />

  return <Editor />
}
```

### Testing
```typescript
test('shows editor UI when user has permissions', () => {
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

## Critical Anti-Patterns

❌ Resources in useEffect
❌ Passing scope as props
❌ Derived state in useState
❌ Multiple scopes without reason

See SKILL.md for detailed corrections.

## Files

- `SKILL.md` - Complete pattern documentation (1100+ lines)
- `pattern-reference.md` - Quick cheat sheet with common patterns
- `PROMISED-API.md` - Promised chainability guide

## Examples

Working, typechecked examples in `examples/react-state-management/`:

- `three-layer-architecture.ts` - Complete Resource → Feature → UI pattern
- `storage-migration.ts` - Progressive migration (localStorage → IndexedDB → API)

Run `pnpm --filter @pumped-fn/examples typecheck` to verify.

## Testing Strategy

1. Mock resource layer via `preset()`
2. Graph resolves derived state automatically
3. Different scenarios = different preset combinations
4. Test business logic without React

## When to Use

✅ Complex cross-component state
✅ API-heavy apps with derived state
✅ Multi-tenant applications
✅ Need testability without mocking every call
✅ **Prototyping with local storage → production migration**
✅ **Offline-first apps with progressive API integration**

❌ Simple CRUD with local state
❌ Static sites
❌ Single-component apps with no shared state

## Related

- [pumped-fn-typescript skill](../pumped-fn-typescript/README.md) - Core patterns
- [@pumped-fn/react docs](https://github.com/lagz0ne/pumped-fn/tree/main/packages/react)

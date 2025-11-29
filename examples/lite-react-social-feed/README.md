# Social Feed Example - @pumped-fn/lite-react

> **Note:** This is a **conceptual example** demonstrating the proposed API from [ADR-005](/.c3/adr/adr-005-lite-react-integration.md). The `@pumped-fn/lite-react` package is not yet implemented.

## Overview

This example demonstrates React integration with `@pumped-fn/lite` using the **Composite Controller Pattern**:

1. **Atoms** - Pure data primitives (what data exists)
2. **Selectors** - Granular subscriptions (slices of atoms)
3. **Composite Controller** - Orchestrated mutations (when data updates)
4. **List Optimization** - IDs + per-item subscriptions

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Composite Controller Pattern                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                     ┌─────────────────────────┐                         │
│                     │  feedControllerAtom     │                         │
│                     │  (orchestrates all)     │                         │
│                     └───────────┬─────────────┘                         │
│                                 │                                       │
│              deps: { user: controller(userAtom), ... }                  │
│                                 │                                       │
│              ┌──────────────────┼──────────────────┐                    │
│              ▼                  ▼                  ▼                    │
│         ┌─────────┐       ┌──────────┐      ┌──────────────┐           │
│         │  user   │       │  posts   │      │ notifications│           │
│         │  Atom   │       │   Atom   │      │     Atom     │           │
│         └────┬────┘       └────┬─────┘      └──────┬───────┘           │
│              │                 │                   │                    │
│              ▼                 ▼                   ▼                    │
│         ┌─────────┐       ┌──────────┐      ┌──────────────┐           │
│         │ Slices  │       │  Slices  │      │    Slices    │           │
│         │ name,   │       │ postIds, │      │ unreadCount  │           │
│         │ avatar  │       │ post(id) │      │              │           │
│         └─────────┘       └──────────┘      └──────────────┘           │
│                                                                         │
│   READ:  useAtom(atom) / useSelector(slice) → direct, granular         │
│   WRITE: useAtom(controllerAtom).method() → orchestrated               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## File Structure

```
lite-react-social-feed/
├── types.ts          # Domain types (User, Post, Notification)
├── api.ts            # Mock API
├── atoms.ts          # Atoms + Composite Controller
├── selectors.ts      # Selectors for granular subscriptions
├── components.tsx    # React components
└── README.md         # This file
```

## Key Patterns

### 1. Atoms as Pure Data

Atoms define **what** data exists and **how** to fetch it:

```typescript
const postsAtom = atom({
  factory: async () => api.fetchPosts()
})
```

### 2. Composite Controller

The controller atom depends on other controllers and returns an API:

```typescript
const feedControllerAtom = atom({
  deps: {
    user: controller(userAtom),
    posts: controller(postsAtom),
    notifications: controller(notificationsAtom),
  },

  factory: (ctx, { user, posts, notifications }) => ({
    // Controlled initialization
    async initialize() {
      await user.resolve()
      await Promise.all([posts.resolve(), notifications.resolve()])
    },

    // Orchestrated mutations
    async likePost(postId: string) {
      await api.likePost(postId)
      posts.invalidate()
    },

    // Optimistic updates
    async likePostOptimistic(postId: string) {
      optimistic.set(postId, { liked: true })
      notify()
      try {
        await api.likePost(postId)
        posts.invalidate()
      } catch {
        optimistic.delete(postId)
        notify()
      }
    }
  })
})
```

### 3. Selectors for Slices

Components subscribe to only what they need:

```typescript
const userNameSelector = selector({
  source: userAtom,
  select: (user) => user?.name ?? null,
})

// Component only re-renders when name changes
function UserName() {
  const name = useSelector(userNameSelector)
  return <span>{name}</span>
}
```

### 4. List Optimization

Split list into IDs (parent) and items (children):

```
┌─────────────────────────────────────────────────────────────────┐
│   BEFORE: Every change re-renders all items                     │
│                                                                 │
│   postsAtom ──► PostList ──┬──► PostItem(1) ◄── re-render      │
│     (all)                  ├──► PostItem(2) ◄── re-render      │
│                            └──► PostItem(3) ◄── re-render      │
├─────────────────────────────────────────────────────────────────┤
│   AFTER: Only changed item re-renders                           │
│                                                                 │
│   postIdsSelector ──► PostList ──┬──► <PostItem id="1" />      │
│   (IDs only)                     ├──► <PostItem id="2" />      │
│                                  └──► <PostItem id="3" />      │
│                                              │                 │
│   ctrl.getPost(id) ──────────────────► PostItem                │
│   (single post)                        (own subscription)      │
└─────────────────────────────────────────────────────────────────┘
```

```tsx
// Parent: subscribes to IDs only
function PostList() {
  const postIds = useSelector(postIdsSelector)
  return postIds.map(id => <PostItem key={id} postId={id} />)
}

// Child: subscribes to single post
function PostItem({ postId }) {
  const ctrl = useAtom(feedControllerAtom)
  const post = useSyncExternalStore(ctrl.subscribe, () => ctrl.getPost(postId))
  return <article>{post.content}</article>
}
```

## Hooks Summary

| Hook | Purpose | Re-renders |
|------|---------|------------|
| `useAtom(atom)` | Full atom value | Any atom change |
| `useSelector(sel)` | Slice of atom | When slice changes |
| `useScope()` | Access scope | Never |

## Read vs Write Paths

| Operation | Path | Example |
|-----------|------|---------|
| Get user name | useSelector | `useSelector(userNameSelector)` |
| Get all posts | useAtom | `useAtom(postsAtom)` |
| Get single post | Controller | `ctrl.getPost(id)` |
| Like a post | Controller | `ctrl.likePost(id)` |
| Refresh feed | Controller | `ctrl.refresh()` |

## Benefits

1. **Simple API** - Just 3 hooks: `useAtom`, `useSelector`, `useScope`
2. **Granular updates** - Selectors prevent unnecessary re-renders
3. **Orchestrated writes** - All mutations go through controller
4. **Optimistic updates** - Built into controller pattern
5. **Load control** - Controller decides initialization order
6. **Type safety** - Full inference from atoms to components

## Related

- [ADR-005: lite-react Integration](/.c3/adr/adr-005-lite-react-integration.md)
- [ADR-003: Controller Reactivity](/.c3/adr/adr-003-controller-reactivity.md)
- [@pumped-fn/lite Documentation](/.c3/c3-2-lite/README.md)

# Social Feed Example - @pumped-fn/lite-react

> **Note:** This is a **conceptual example** demonstrating the proposed API from [ADR-005](/.c3/adr/adr-005-lite-react-integration.md). The `@pumped-fn/lite-react` package is not yet implemented.

## Overview

This example demonstrates a social media feed application using the proposed `@pumped-fn/lite-react` bindings. It showcases:

1. **Centralized Machine Pattern** - All state transitions in one place
2. **Selectors (Slices)** - Granular subscriptions for optimized rendering
3. **Optimistic Updates** - Immediate UI feedback with automatic rollback
4. **Transition States** - Explicit state machine for UI flows

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Social Feed App                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                         Machine                                   │ │
│  │                                                                   │ │
│  │  States: anonymous → authenticating → authenticated              │ │
│  │          authenticated → refreshing → authenticated              │ │
│  │          authenticated → submitting → authenticated              │ │
│  │                                                                   │ │
│  │  Events: LOGIN, LOGOUT, REFRESH, LIKE, UNLIKE, CREATE_POST, ... │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                              │                                          │
│              ┌───────────────┼───────────────┐                         │
│              ▼               ▼               ▼                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Atoms (Server Truth)                         │   │
│  │                                                                 │   │
│  │   userAtom          postsAtom          notificationsAtom       │   │
│  │   └─ User | null    └─ Post[]          └─ Notification[]       │   │
│  │                                                                 │   │
│  │   postFormAtom      myPostsAtom                                 │   │
│  │   └─ FormState      └─ Post[] (derived)                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│              │               │               │                         │
│              └───────────────┼───────────────┘                         │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Optimistic Layer                             │   │
│  │                                                                 │   │
│  │   Pending: { LIKE: post-1, CREATE_POST: temp-123 }             │   │
│  │   Components see merged server + optimistic state              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Selectors (Slices)                           │   │
│  │                                                                 │   │
│  │   userNameSelector      → string | null                        │   │
│  │   userAvatarSelector    → string | null                        │   │
│  │   themeSelector         → "light" | "dark"                     │   │
│  │   unreadCountSelector   → number                               │   │
│  │   dashboardStatsSelector → { userName, totalPosts, ... }       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    React Components                             │   │
│  │                                                                 │   │
│  │   Header          → useSelector(userNameSelector, avatarSelector)   │
│  │   ThemeToggle     → useSelector(themeSelector)                 │   │
│  │   NotificationBell→ useSelector(unreadCountSelector)           │   │
│  │   PostList        → useMachineAtom("posts")                    │   │
│  │   PostItem        → useMutation("LIKE"), useMutation("DELETE") │   │
│  │   CreatePostForm  → useMachineState(), useMutation("CREATE")   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## File Structure

```
lite-react-social-feed/
├── types.ts          # Domain types (User, Post, Notification, etc.)
├── api.ts            # Mock API (simulates server calls)
├── atoms.ts          # Atom definitions (data primitives)
├── selectors.ts      # Selector definitions (sliced subscriptions)
├── mutations.ts      # Mutation definitions (optimistic updates)
├── machine.ts        # Central machine configuration
├── components.tsx    # React components
└── README.md         # This file
```

## Key Concepts Demonstrated

### 1. Atoms as Pure Data Primitives

Atoms define **what** data exists, not **when** it updates:

```typescript
// atoms.ts
export const userAtom = atom({
  factory: async () => {
    const user = await api.fetchUser()
    return user
  },
})

export const postsAtom = atom({
  factory: async () => {
    const posts = await api.fetchPosts()
    return posts
  },
})
```

Key points:
- No self-invalidation logic in atoms
- No subscriptions to other atoms
- Pure factory functions that fetch/compute data

### 2. Selectors for Granular Subscriptions

Selectors derive slices from atoms. Components only re-render when their slice changes:

```typescript
// selectors.ts
export const userNameSelector = selector({
  source: userAtom,
  select: (user) => user?.name ?? null,
})

export const themeSelector = selector({
  source: userAtom,
  select: (user) => user?.settings.theme ?? "light",
})

// Multi-source selector
export const dashboardStatsSelector = selector({
  sources: { user: userAtom, posts: postsAtom, notifications: notificationsAtom },
  select: ({ user, posts, notifications }) => ({
    userName: user?.name ?? "Guest",
    totalPosts: posts.length,
    unreadNotifications: notifications.filter((n) => !n.read).length,
  }),
  equals: equals.shallow,
})
```

### 3. Machine for Centralized State Transitions

The machine is the **single source of truth** for what happens when:

```typescript
// machine.ts
export const appMachineConfig = machine({
  atoms,
  mutations,

  initial: "anonymous",

  states: {
    anonymous: {
      on: { LOGIN: "authenticating" }
    },

    authenticating: {
      entry: async (ctx) => {
        await api.login(ctx.payload)
        ctx.invalidate("user", "posts", "notifications")
        ctx.send("AUTH_SUCCESS")
      },
      on: {
        AUTH_SUCCESS: "authenticated",
        AUTH_FAILURE: "anonymous"
      }
    },

    authenticated: {
      on: {
        LOGOUT: {
          target: "anonymous",
          action: (ctx) => ctx.invalidateAll()
        },
        REFRESH: "refreshing",
        LIKE: { action: (ctx, { postId }) => ctx.send("LIKE", { postId }) }
      }
    },

    refreshing: {
      entry: (ctx) => ctx.invalidate("posts", "notifications"),
      on: { REFRESH_SUCCESS: "authenticated" }
    }
  }
})
```

Benefits:
- All state transitions visible in one place
- Easy to understand "what happens when X"
- Predictable, testable flows

### 4. Optimistic Mutations

Mutations apply changes immediately, rollback on failure:

```typescript
// mutations.ts
export const likeMutation = mutation({
  // Apply immediately (before server responds)
  optimistic: (posts, { postId }) =>
    posts.map((post) =>
      post.id === postId
        ? { ...post, liked: true, likeCount: post.likeCount + 1 }
        : post
    ),

  // Actual server call
  mutate: async (ctx, { postId }) => {
    await api.likePost(postId)
  },

  // On failure: optimistic change is automatically rolled back
  onError: (ctx, error) => {
    console.error("Failed to like:", error)
  },

  invalidates: ["posts"],
})
```

### 5. React Component Integration

Components use hooks to subscribe to state:

```tsx
// components.tsx

// Selector: Only re-renders when name changes
function Header() {
  const name = useSelector(userNameSelector)
  const avatar = useSelector(userAvatarSelector)
  return <header>{name} <img src={avatar} /></header>
}

// Machine state: Access current state and transitions
function RefreshButton() {
  const { matches, can } = useMachineState()
  const send = useSend()

  return (
    <button
      onClick={() => send("REFRESH")}
      disabled={!can("REFRESH") || matches("refreshing")}
    >
      {matches("refreshing") ? "Refreshing..." : "Refresh"}
    </button>
  )
}

// Mutation: Optimistic update with loading state
function LikeButton({ post }) {
  const { mutate, isPending, isOptimistic } = useMutation("LIKE")

  return (
    <button
      onClick={() => mutate({ postId: post.id })}
      disabled={isPending}
    >
      {post.liked ? "♥" : "♡"} {post.likeCount}
    </button>
  )
}
```

## State Flow Diagrams

### Authentication Flow

```
┌──────────┐     LOGIN      ┌────────────────┐
│anonymous │───────────────►│ authenticating │
└──────────┘                └───────┬────────┘
     ▲                              │
     │                    ┌─────────┴─────────┐
     │                    │                   │
     │              AUTH_SUCCESS         AUTH_FAILURE
     │                    │                   │
     │                    ▼                   │
     │           ┌────────────────┐           │
     │           │ authenticated  │           │
     │           └───────┬────────┘           │
     │                   │                    │
     │                LOGOUT                  │
     │                   │                    │
     └───────────────────┴────────────────────┘
```

### Post Interaction Flow

```
User clicks Like
       │
       ▼
┌─────────────────────────────────────────┐
│ 1. Optimistic update applied            │
│    post.liked = true                    │
│    post.likeCount++                     │
│    UI updates immediately               │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ 2. API request sent                     │
│    await api.likePost(postId)           │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
     SUCCESS             FAILURE
        │                   │
        ▼                   ▼
┌───────────────┐   ┌───────────────┐
│ Keep change   │   │ Rollback      │
│ Invalidate    │   │ post.liked    │
│ posts atom    │   │ = false       │
└───────────────┘   └───────────────┘
```

## Comparison: Before vs After

### Before (Decentralized Reactivity)

```typescript
// Scattered invalidation logic
const postsAtom = atom({
  deps: { user: controller(userAtom) },
  factory: async (ctx, { user }) => {
    // Subscribe to user changes
    user.on(() => ctx.invalidate())
    return fetchPosts(user.get().id)
  }
})

// Hard to trace: "What happens when user changes?"
// Answer: Need to check every atom that subscribes to user
```

### After (Centralized Machine)

```typescript
// All transitions in one place
const machine = machine({
  atoms: { user, posts, notifications },
  on: {
    USER_CHANGED: (ctx) => ctx.invalidate("user", "posts"),
    LOGOUT: (ctx) => ctx.invalidateAll()
  }
})

// Easy to answer: "What happens when user changes?"
// Answer: Look at machine.on.USER_CHANGED
```

## Hooks API Summary

| Hook | Purpose | Re-renders When |
|------|---------|-----------------|
| `useAtom(atom)` | Full atom subscription | Any atom change |
| `useSelector(selector)` | Slice subscription | Slice changes (per equality) |
| `useController(atom)` | Manual atom control | Never (returns controller) |
| `useMachine()` | Access machine instance | Never (returns machine) |
| `useMachineState()` | Machine state + helpers | Machine state changes |
| `useMachineAtom(key)` | Atom via machine | Atom changes |
| `useSend()` | Event dispatch | Never (returns function) |
| `useMutation(name)` | Optimistic mutation | isPending/isOptimistic changes |

## Testing Strategy

```typescript
// Test machine transitions
test("LOGIN transitions to authenticating", async () => {
  const machine = await createTestMachine(appMachineConfig)

  expect(machine.state).toBe("anonymous")

  machine.send("LOGIN", { email: "test@example.com", password: "password" })

  expect(machine.state).toBe("authenticating")
})

// Test optimistic mutations
test("like mutation applies optimistically", async () => {
  const machine = await createTestMachine(appMachineConfig, {
    presets: [preset(postsAtom, [{ id: "1", liked: false, likeCount: 0 }])]
  })

  machine.send("LIKE", { postId: "1" })

  const posts = machine.getOptimisticValue("posts")
  expect(posts[0].liked).toBe(true)
  expect(posts[0].likeCount).toBe(1)
})

// Test selector isolation
test("changing theme doesn't re-render name component", async () => {
  const renderCount = { current: 0 }

  function NameDisplay() {
    renderCount.current++
    const name = useSelector(userNameSelector)
    return <span>{name}</span>
  }

  render(<NameDisplay />)
  expect(renderCount.current).toBe(1)

  // Change theme (different slice)
  machine.send("UPDATE_SETTINGS", { theme: "dark" })

  // Name component should NOT re-render
  expect(renderCount.current).toBe(1)
})
```

## Next Steps

1. **Review ADR-005** for full API specification
2. **Discuss patterns** - any concerns or improvements?
3. **Implement** `@pumped-fn/lite-react` package
4. **Create real example** with actual React + bundler setup

## Related

- [ADR-005: lite-react Integration](/.c3/adr/adr-005-lite-react-integration.md)
- [ADR-003: Controller Reactivity](/.c3/adr/adr-003-controller-reactivity.md)
- [@pumped-fn/lite Documentation](/.c3/c3-2-lite/README.md)

---
id: ADR-005-lite-react-integration
title: React Integration for @pumped-fn/lite with Composite Controller Pattern
summary: >
  Design a React binding for @pumped-fn/lite using a composite controller pattern
  for orchestrated mutations, selectors for granular subscriptions, and optimized
  list rendering through ID-based item subscriptions.
status: proposed
date: 2025-11-29
---

# [ADR-005] React Integration for @pumped-fn/lite

## Status {#adr-005-status}
**Proposed** - 2025-11-29

## Problem/Requirement {#adr-005-problem}

`@pumped-fn/lite` provides lightweight DI with Controller-based reactivity (ADR-003). To use it effectively with React, we need:

1. **Efficient subscriptions** - Components should only re-render when their data changes
2. **Granular slices** - Subscribe to parts of an atom, not the whole thing
3. **List optimization** - Changing one item shouldn't re-render the entire list
4. **Orchestrated mutations** - Control load order and coordinate invalidations
5. **Optimistic updates** - Immediate UI feedback with rollback on failure

### Design Principles

1. **Minimal API** - Few hooks, leverage existing lite primitives
2. **Read/Write separation** - Direct atom reads, orchestrated writes
3. **No new concepts** - Build on atoms, controllers, selectors
4. **Composition over configuration** - Controller pattern, not state machines

## Solution {#adr-005-solution}

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Composite Controller Pattern                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                     ┌─────────────────────────┐                         │
│                     │   Composite Controller  │                         │
│                     │   (atom that returns    │                         │
│                     │    orchestration API)   │                         │
│                     └───────────┬─────────────┘                         │
│                                 │                                       │
│                    deps: { posts: controller(postsAtom), ... }          │
│                                 │                                       │
│              ┌──────────────────┼──────────────────┐                    │
│              ▼                  ▼                  ▼                    │
│         ┌─────────┐       ┌──────────┐      ┌──────────────┐           │
│         │  users  │       │  posts   │      │ notifications│           │
│         │  Atom   │       │   Atom   │      │     Atom     │           │
│         └─────────┘       └──────────┘      └──────────────┘           │
│              │                  │                  │                    │
│              │                  │                  │                    │
│              ▼                  ▼                  ▼                    │
│         ┌─────────┐       ┌──────────┐      ┌──────────────┐           │
│         │ Slices  │       │  Slices  │      │    Slices    │           │
│         │ name,   │       │ postIds, │      │ unreadCount  │           │
│         │ avatar  │       │ post(id) │      │              │           │
│         └─────────┘       └──────────┘      └──────────────┘           │
│                                                                         │
│   READ PATH:  useAtom(atom) / useSelector(slice) - direct, granular    │
│   WRITE PATH: useAtom(controllerAtom).method() - orchestrated          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1. Core Hooks

#### useAtom

Subscribe to an atom's value. Re-renders when atom changes.

```typescript
function useAtom<T>(atom: Lite.Atom<T>): T
```

**Implementation:**
```typescript
function useAtom<T>(atom: Lite.Atom<T>): T {
  const scope = useScope()
  const ctrlRef = useRef<Lite.Controller<T>>()

  if (!ctrlRef.current) {
    ctrlRef.current = scope.controller(atom)
  }

  return useSyncExternalStore(
    useCallback(cb => ctrlRef.current!.on(cb), []),
    useCallback(() => ctrlRef.current!.get(), [])
  )
}
```

#### useSelector

Subscribe to a derived slice. Re-renders only when slice changes.

```typescript
interface Selector<TSource, TSlice> {
  source: Lite.Atom<TSource>
  select: (source: TSource) => TSlice
  equals?: (a: TSlice, b: TSlice) => boolean
}

function useSelector<TSource, TSlice>(
  selector: Selector<TSource, TSlice>
): TSlice
```

**Implementation:**
```typescript
function useSelector<TSource, TSlice>(
  selector: Selector<TSource, TSlice>
): TSlice {
  const scope = useScope()
  const ctrl = scope.controller(selector.source)
  const sliceRef = useRef<TSlice>()
  const equalsFn = selector.equals ?? Object.is

  const getSnapshot = useCallback(() => {
    const source = ctrl.get()
    const nextSlice = selector.select(source)

    if (sliceRef.current !== undefined &&
        equalsFn(sliceRef.current, nextSlice)) {
      return sliceRef.current
    }

    sliceRef.current = nextSlice
    return nextSlice
  }, [ctrl, selector.select, equalsFn])

  return useSyncExternalStore(
    useCallback(cb => ctrl.on(cb), [ctrl]),
    getSnapshot
  )
}
```

#### useController

Get raw controller for advanced use cases.

```typescript
function useController<T>(atom: Lite.Atom<T>): Lite.Controller<T>
```

### 2. Selector Factory

```typescript
function selector<TSource, TSlice>(config: {
  source: Lite.Atom<TSource>
  select: (source: TSource) => TSlice
  equals?: (a: TSlice, b: TSlice) => boolean
}): Selector<TSource, TSlice>
```

**Equality helpers:**
```typescript
const equals = {
  strict: Object.is,
  shallow: shallowEqual,
  shallowArray: (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
}
```

### 3. Composite Controller Pattern

The composite controller is an atom that depends on other atoms' controllers and returns an orchestration API.

```typescript
const feedControllerAtom = atom({
  deps: {
    user: controller(userAtom),
    posts: controller(postsAtom),
    notifications: controller(notificationsAtom),
  },

  factory: (ctx, { user, posts, notifications }) => ({
    /**
     * Initialize with controlled load order
     */
    async initialize() {
      await user.resolve()
      await Promise.all([
        posts.resolve(),
        notifications.resolve()
      ])
    },

    /**
     * Refresh specific data
     */
    refresh() {
      posts.invalidate()
      notifications.invalidate()
    },

    /**
     * Orchestrated mutation
     */
    async likePost(postId: string) {
      await api.likePost(postId)
      posts.invalidate()
    },

    /**
     * Cascading invalidation
     */
    async logout() {
      await api.logout()
      user.invalidate()
      posts.invalidate()
      notifications.invalidate()
    }
  })
})
```

### 4. List Rendering Optimization

The key insight: split list subscription into **IDs** and **items**.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    List Optimization Pattern                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   BEFORE (naive): Every change re-renders all items                     │
│                                                                         │
│   postsAtom ──► PostList ──┬──► PostItem(post1) ◄── re-renders         │
│     (all)                  ├──► PostItem(post2) ◄── re-renders         │
│                            └──► PostItem(post3) ◄── re-renders         │
│                                                                         │
│   ─────────────────────────────────────────────────────────────────     │
│                                                                         │
│   AFTER (optimized): Only changed item re-renders                       │
│                                                                         │
│   postIdsSelector ──► PostList ──┬──► <PostItem id="1" />              │
│   (IDs only)                     ├──► <PostItem id="2" />              │
│                                  └──► <PostItem id="3" />              │
│                                              │                         │
│   postSelector(id) ──────────────────► PostItem                        │
│   (single post)                        (own subscription)              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Selectors:**
```typescript
const postIdsSelector = selector({
  source: postsAtom,
  select: posts => posts.map(p => p.id),
  equals: equals.shallowArray
})

function postSelector(postId: string) {
  return selector({
    source: postsAtom,
    select: posts => posts.find(p => p.id === postId),
    equals: equals.shallow
  })
}
```

**Components:**
```tsx
function PostList() {
  const postIds = useSelector(postIdsSelector)
  return (
    <div>
      {postIds.map(id => <PostItem key={id} postId={id} />)}
    </div>
  )
}

function PostItem({ postId }: { postId: string }) {
  const post = useSelector(useMemo(() => postSelector(postId), [postId]))
  const ctrl = useAtom(feedControllerAtom)

  if (!post) return null

  return (
    <article>
      <p>{post.content}</p>
      <button onClick={() => ctrl.likePost(postId)}>
        {post.liked ? '♥' : '♡'} {post.likeCount}
      </button>
    </article>
  )
}
```

### 5. Optimistic Updates

Optimistic updates are handled inside the composite controller using an overlay layer.

```typescript
const feedControllerAtom = atom({
  deps: {
    posts: controller(postsAtom),
  },

  factory: (ctx, { posts }) => {
    const optimistic = new Map<string, Partial<Post>>()
    const listeners = new Set<() => void>()

    const notify = () => listeners.forEach(fn => fn())

    return {
      /**
       * Get post with optimistic overlay
       */
      getPost(id: string): Post | undefined {
        const serverPost = posts.get().find(p => p.id === id)
        if (!serverPost) return undefined

        const overlay = optimistic.get(id)
        return overlay ? { ...serverPost, ...overlay } : serverPost
      },

      /**
       * Get all posts with optimistic overlay
       */
      getPosts(): Post[] {
        return posts.get().map(post => {
          const overlay = optimistic.get(post.id)
          return overlay ? { ...post, ...overlay } : post
        })
      },

      /**
       * Subscribe to controller changes
       */
      subscribe(listener: () => void): () => void {
        listeners.add(listener)
        const unsubPosts = posts.on(listener)
        return () => {
          listeners.delete(listener)
          unsubPosts()
        }
      },

      /**
       * Optimistic like mutation
       */
      async likePost(postId: string) {
        const currentPost = posts.get().find(p => p.id === postId)
        if (!currentPost) return

        optimistic.set(postId, {
          liked: true,
          likeCount: currentPost.likeCount + 1
        })
        notify()

        try {
          await api.likePost(postId)
          posts.invalidate()
        } catch (error) {
          optimistic.delete(postId)
          notify()
          throw error
        } finally {
          optimistic.delete(postId)
        }
      }
    }
  }
})
```

**Usage with optimistic controller:**
```tsx
function PostItem({ postId }: { postId: string }) {
  const ctrl = useAtom(feedControllerAtom)
  const post = useSyncExternalStore(
    ctrl.subscribe,
    () => ctrl.getPost(postId)
  )

  if (!post) return null

  return (
    <article>
      <p>{post.content}</p>
      <button onClick={() => ctrl.likePost(postId)}>
        {post.liked ? '♥' : '♡'} {post.likeCount}
      </button>
    </article>
  )
}
```

## API Summary {#adr-005-api}

### Hooks

| Hook | Purpose | Re-renders |
|------|---------|------------|
| `useAtom(atom)` | Full atom subscription | Any atom change |
| `useSelector(selector)` | Slice subscription | When slice changes |
| `useController(atom)` | Raw controller access | Never |
| `useScope()` | Access scope | Never |

### Utilities

| Utility | Purpose |
|---------|---------|
| `selector(config)` | Create selector definition |
| `equals.strict` | `Object.is` comparison |
| `equals.shallow` | Shallow object comparison |
| `equals.shallowArray` | Shallow array comparison |

### Provider

```tsx
<LiteProvider scope={scope}>
  <App />
</LiteProvider>
```

## Package Structure {#adr-005-structure}

```
packages/lite-react/
├── src/
│   ├── index.ts          # Public exports
│   ├── context.ts        # ScopeContext, LiteProvider
│   ├── hooks.ts          # useAtom, useSelector, useController, useScope
│   ├── selector.ts       # selector factory, equals helpers
│   └── types.ts          # Type definitions
├── tests/
│   ├── hooks.test.tsx
│   ├── selector.test.tsx
│   └── optimization.test.tsx
└── package.json
```

## Examples {#adr-005-examples}

### Example 1: Basic Usage

```tsx
import { atom, controller, createScope } from '@pumped-fn/lite'
import { LiteProvider, useAtom, useSelector, selector } from '@pumped-fn/lite-react'

const countAtom = atom({ factory: () => 0 })

const countSelector = selector({
  source: countAtom,
  select: n => n
})

function Counter() {
  const count = useSelector(countSelector)
  const ctrl = useController(countAtom)

  return (
    <div>
      <span>{count}</span>
      <button onClick={() => ctrl.invalidate()}>Refresh</button>
    </div>
  )
}

function App() {
  const [scope] = useState(() => createScope())

  return (
    <LiteProvider scope={scope}>
      <Counter />
    </LiteProvider>
  )
}
```

### Example 2: Composite Controller

```tsx
const userAtom = atom({ factory: () => api.fetchUser() })
const postsAtom = atom({ factory: () => api.fetchPosts() })

const appControllerAtom = atom({
  deps: {
    user: controller(userAtom),
    posts: controller(postsAtom),
  },
  factory: (ctx, { user, posts }) => ({
    async initialize() {
      await user.resolve()
      await posts.resolve()
    },
    refresh() {
      posts.invalidate()
    },
    async likePost(id: string) {
      await api.likePost(id)
      posts.invalidate()
    }
  })
})

function App() {
  const ctrl = useAtom(appControllerAtom)

  useEffect(() => {
    ctrl.initialize()
  }, [ctrl])

  return <Feed />
}

function Feed() {
  const ctrl = useAtom(appControllerAtom)
  return (
    <div>
      <button onClick={() => ctrl.refresh()}>Refresh</button>
      <PostList />
    </div>
  )
}
```

### Example 3: Optimized List

```tsx
const postIdsSelector = selector({
  source: postsAtom,
  select: posts => posts.map(p => p.id),
  equals: equals.shallowArray
})

const createPostSelector = (id: string) => selector({
  source: postsAtom,
  select: posts => posts.find(p => p.id === id)
})

function PostList() {
  const ids = useSelector(postIdsSelector)
  return (
    <ul>
      {ids.map(id => <PostItem key={id} postId={id} />)}
    </ul>
  )
}

function PostItem({ postId }: { postId: string }) {
  const postSel = useMemo(() => createPostSelector(postId), [postId])
  const post = useSelector(postSel)
  const ctrl = useAtom(appControllerAtom)

  if (!post) return null

  return (
    <li>
      {post.content}
      <button onClick={() => ctrl.likePost(postId)}>
        {post.liked ? '♥' : '♡'}
      </button>
    </li>
  )
}
```

## Verification {#adr-005-verification}

### Type System
- [ ] `useAtom<T>` returns `T` with correct inference
- [ ] `useSelector` returns slice type correctly
- [ ] Selector `select` function is properly typed
- [ ] Controller atom factory return type is inferred

### Runtime Behavior
- [ ] `useAtom` re-renders on atom invalidation
- [ ] `useSelector` only re-renders when slice changes
- [ ] List optimization: item change doesn't re-render siblings
- [ ] Optimistic updates apply immediately
- [ ] Optimistic rollback works on error

### React Integration
- [ ] Works with React 18 Concurrent features
- [ ] StrictMode compatible
- [ ] No memory leaks on unmount
- [ ] Suspense support for async atoms

## Comparison {#adr-005-comparison}

| Aspect | lite-react | Zustand | Jotai | Redux |
|--------|------------|---------|-------|-------|
| Bundle size | ~2KB | ~1KB | ~2KB | ~7KB |
| Boilerplate | Low | Low | Low | High |
| Selectors | Yes | Yes | Derived atoms | Yes |
| List optimization | Manual (pattern) | Manual | Atom per item | Manual |
| Async built-in | Yes | Middleware | Yes | Middleware |
| DI/Testing | Yes (presets) | No | No | No |

## Related {#adr-005-related}

- [ADR-003](./adr-003-controller-reactivity.md) - Controller pattern that enables this integration
- [c3-201](../c3-2-lite/c3-201-scope.md) - Scope and Controller documentation
- [c3-202](../c3-2-lite/c3-202-atom.md) - Atom documentation

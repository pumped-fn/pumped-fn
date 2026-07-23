# @pumped-fn/lite-react

React bindings for `@pumped-fn/lite`.

`@pumped-fn/lite-react` lets React observe a Lite graph without making React own the graph. Components
subscribe to atoms, selected slices, resources, and scoped values. Event handlers execute flows with
`useFlow`, through the provider-owned execution context. Forms and nested UI state can live in execution-scoped resources instead
of local component mirrors.

## Migration to 3.0.0

Install 3.0 with Lite 6:

```bash
npm install @pumped-fn/lite@^6.0.0 @pumped-fn/lite-react@^3.0.0
```

## The Rule

React components are observers.
The graph owns logic and mutable state; components subscribe and dispatch.
ExecutionContextProvider owns UI execution by default.

The Lite graph owns:

- Dependencies
- Async work
- Validation and application decisions
- Mutable state and derived state
- Resources and cleanup
- Execution boundaries

React owns:

- Rendering
- Browser events
- Provider wiring
- Subscriptions to graph state

Feature components should not call `createScope`, call `scope.createContext`, close execution contexts,
mirror graph-owned state with local state, or perform inline IO when the graph can own that behavior.
Feature components should not call `scope.createContext()` or close contexts manually. Components use
`useFlow` for event-triggered graph work. In short, components use `useFlow`, and
components should not mirror graph state with `useState`.

`useScope` is an infrastructure hook. Use it for provider/bootstrap helpers and rare integration code that
must inspect the current scope, not as the normal feature-component pattern.

## Providers

`ScopeProvider` supplies the graph boundary. `ExecutionContextProvider` supplies the UI execution boundary.

```tsx
import { createScope } from "@pumped-fn/lite"
import { ExecutionContextProvider, ScopeProvider } from "@pumped-fn/lite-react"

const scope = createScope()

export function AppRoot() {
  return (
    <ScopeProvider scope={scope}>
      <ExecutionContextProvider>
        <App />
      </ExecutionContextProvider>
    </ScopeProvider>
  )
}
```

Create scopes outside component bodies. Create explicit contexts outside component bodies when a route,
request, test, or integration boundary already owns the context:

```tsx
import { createScope } from "@pumped-fn/lite"
import { ExecutionContextProvider, ScopeProvider } from "@pumped-fn/lite-react"

const scope = createScope()
const ctx = scope.createContext()

export function MountedApp() {
  return (
    <ScopeProvider scope={scope}>
      <ExecutionContextProvider ctx={ctx}>
        <App />
      </ExecutionContextProvider>
    </ScopeProvider>
  )
}
```

When `ctx` is omitted, managed mode creates a context from the surrounding scope, inherits the nearest
execution context for the same scope, and closes the managed context on unmount. Managed mode also works
during server render. Contexts created by renders that suspend before commit are reclaimed after their
in-flight work settles.

Managed providers reuse their execution context when the parent and tag records are the same. For
object-valued boundary tags, define `eq` on the tag family only when equal values are fully substitutable.
`ExecutionContextProvider` uses `tag.same()` for this reuse decision. That preserves current-owned UI
state across ordinary rerenders without changing tag lookup, resource ownership, or cache identity.

## React APIs

| API | Use it for |
| --- | --- |
| `ScopeProvider` | Provide a Lite scope to a React subtree |
| `ExecutionContextProvider` | Provide or create the UI execution context |
| `useFlow` | Execute flows from event handlers and observe action lifecycle |
| `useExecutionContext` | Infrastructure escape hatch for provider/context integrations |
| `useAtom` | Read atom state with Suspense/ErrorBoundary integration or manual load state |
| `useSelect` | Read a derived atom slice and avoid rerenders when the slice is equal |
| `useResource` | Read execution-scoped resources from the current provider context |
| `scopedValue` | Define execution-scoped frontend state, actions, and dependencies |
| `useScopedValue` | Render and dispatch against a `scopedValue` |
| `useController` | Low-level atom controller access |
| `useScope` | Infrastructure escape hatch for provider/bootstrap integrations |

Most feature components should use `useAtom`, `useSelect`, `useResource`, `useScopedValue`, and
`useFlow`. Treat `useExecutionContext`, `useScope`, and raw controllers as integration tools.

## Atom Observation

`useAtom` subscribes to an atom controller. In Suspense mode, idle and first resolving states suspend,
failed state throws to an ErrorBoundary, and refreshes keep rendering the stale value until the new value
settles.

```tsx
import { Suspense } from "react"
import { createScope } from "@pumped-fn/lite"
import { ExecutionContextProvider, ScopeProvider, useAtom } from "@pumped-fn/lite-react"

const scope = createScope()

function Dashboard() {
  const dashboard = useAtom(dashboardState)
  return <h1>{dashboard.title}</h1>
}

export function AppRoot() {
  return (
    <ScopeProvider scope={scope}>
      <ExecutionContextProvider>
        <Suspense fallback={<p>Loading</p>}>
          <Dashboard />
        </Suspense>
      </ExecutionContextProvider>
    </ScopeProvider>
  )
}
```

Manual mode returns load state instead of throwing:

```tsx
import { useAtom } from "@pumped-fn/lite-react"

function Profile() {
  const profile = useAtom(profileState, { suspense: false, resolve: true })

  if (profile.loading && !profile.data) return <p>Loading</p>
  if (profile.error) return <p role="alert">{profile.error.message}</p>
  if (!profile.data) return <p>No profile</p>

  return <p>{profile.data.name}</p>
}
```

`useSelect` observes only a slice:

```tsx
import { useSelect } from "@pumped-fn/lite-react"

function InboxBadge() {
  const unread = useSelect(inboxState, (inbox) => inbox.unreadCount)
  return <span>{unread}</span>
}
```

## UI Actions

Use `useFlow` for event-triggered graph work. The provider owns the context lifecycle, and the hook
tracks the action lifecycle without adding a Suspense mode.

```tsx
import { useFlow } from "@pumped-fn/lite-react"

function SaveButton() {
  const save = useFlow(saveProfile)

  return (
    <button onClick={() => save.execute({ source: "toolbar" })}>
      Save
    </button>
  )
}
```

This keeps extensions, resources, tags, `onClose`, and cleanup attached to the same UI boundary.
`reset()` clears the hook state and ignores stale completions; it does not cancel the underlying flow.
When a newer execution starts, the older completion cannot update hook state or call lifecycle callbacks.

Submit flows should compose graph state inside the graph instead of mapping browser events in React:

```tsx
function LoginForm() {
  const submit = useFlow(submitLogin)

  return (
    <form onSubmit={(event) => {
      event.preventDefault()
      submit.execute()
    }} />
  )
}
```

## Execution-Scoped Resources

`useResource` reads resources visible from the current execution context. Use it for request/session
data, per-boundary clients, feature sessions, and other values whose lifetime is below the scope.

```tsx
import { useResource } from "@pumped-fn/lite-react"

function CurrentUser() {
  const user = useResource(currentUser)
  return <p>{user.name}</p>
}
```

Without Suspense, `useResource` returns a stable load union:

```tsx
import { useResource } from "@pumped-fn/lite-react"

function CurrentUserManual() {
  const user = useResource(currentUser, { suspense: false })

  if (user.status === "loading") return <p>Loading</p>
  if (user.status === "error") return <p role="alert">{user.error.message}</p>

  return <p>{user.data.name}</p>
}
```

Do not load resources with effects. `useResource` starts and observes resource work at the provider
boundary and stays reset-aware when the owner context releases or closes the resource.

## Scoped Frontend State

Use `scopedValue` for forms, drafts, modal state, editors, optimistic action buffers, and nested UI
state. It is backed by a current-owned resource, so it resets with the owning execution context and can be
tested without React.

```tsx
import { createScope, resource } from "@pumped-fn/lite"
import { ExecutionContextProvider, ScopeProvider, scopedValue, useScopedValue } from "@pumped-fn/lite-react"

const auth = resource({
  factory: () => ({
    login: async (email: string, password: string) => ({ email, password }),
  }),
})

const loginForm = scopedValue({
  name: "login-form",
  deps: { auth },
  initial: () => ({
    email: "",
    password: "",
    status: "editing" as const,
    error: undefined as string | undefined,
  }),
  actions: ({ get, patch }, deps) => ({
    setEmail(email: string) {
      patch({ email, status: "editing", error: undefined })
    },
    setPassword(password: string) {
      patch({ password, status: "editing", error: undefined })
    },
    async submit() {
      const snapshot = get()
      if (!snapshot.email.includes("@")) {
        patch({ status: "editing", error: "Enter a valid email" })
        return undefined
      }
      patch({ status: "submitting", error: undefined })
      const user = await deps.auth.login(snapshot.email, snapshot.password)
      patch({ status: "submitted" })
      return user
    },
  }),
})

const scope = createScope()

export function LoginScreen() {
  return (
    <ScopeProvider scope={scope}>
      <ExecutionContextProvider>
        <LoginForm />
      </ExecutionContextProvider>
    </ScopeProvider>
  )
}

function LoginForm() {
  const form = useScopedValue(loginForm)

  return (
    <form onSubmit={(event) => { event.preventDefault(); void form.actions.submit() }}>
      <input value={form.snapshot.email} onChange={(event) => form.actions.setEmail(event.currentTarget.value)} />
      <input value={form.snapshot.password} onChange={(event) => form.actions.setPassword(event.currentTarget.value)} />
      {form.snapshot.error ? <p role="alert">{form.snapshot.error}</p> : null}
      <button disabled={form.snapshot.status === "submitting"}>Sign in</button>
    </form>
  )
}
```

React receives `snapshot + actions`. Outside React, resolved access uses `getSnapshot()` or `get()`:

```ts
import { createScope } from "@pumped-fn/lite"

const scope = createScope()
const ctx = scope.createContext()
const form = await loginForm.resolve(ctx)

form.actions.setEmail("a@example.com")
if (form.getSnapshot().email !== "a@example.com") throw new Error("expected updated email")

await ctx.release(loginForm)
await ctx.close()
await scope.dispose()
```

Components should render from `form.snapshot` and mutate through `form.actions`. Do not mirror scoped
fields into local component state. Do not use controllers as the form/resource state API.

## Nested Boundaries

Nested managed `ExecutionContextProvider` instances are useful for modals, editors, side panels, and
per-card forms. Every managed provider creates an explicit execution boundary, so both boundary-owned
and current-owned resources reset with the nested provider. Work started through `ctx.exec()` inside one
provider still shares that provider's boundary-owned resources. A provider given an explicit `ctx` uses
that context as-is and does not create another boundary.

Use boundary tags to describe the nested owner:

```tsx
import { tag } from "@pumped-fn/lite"
import { ExecutionContextProvider } from "@pumped-fn/lite-react"

const card = tag<{ cardId: string }>({
  label: "card",
  eq: (a, b) => a.cardId === b.cardId,
})

function CardEditor(props: { cardId: string }) {
  return (
    <ExecutionContextProvider tags={[card({ cardId: props.cardId })]}>
      <EditorForm />
    </ExecutionContextProvider>
  )
}
```

The `eq` function lets rerenders recreate the tag object without resetting the current-owned form for the
same card.

## Testing

Split tests by responsibility:

- Node logic tests exercise atoms, flows, resources, and scoped values through `createScope({ presets, tags, extensions })`.
- Browser observer tests render components under `ScopeProvider` and `ExecutionContextProvider`; browser observer tests cover provider wiring and dispatch.
- Browser mode proves that React observes and dispatches correctly. Browser mode does not replace node logic tests.
- The Lightpanda smoke runs a Vite-served `useFlow` page through a real CDP browser and catches browser-runtime drift before release.

```tsx
import { createScope, preset } from "@pumped-fn/lite"
import { ExecutionContextProvider, ScopeProvider } from "@pumped-fn/lite-react"
import { render } from "@testing-library/react"

const scope = createScope({
  presets: [preset(profileState, { name: "Test User" })],
})

await scope.resolve(profileState)

render(
  <ScopeProvider scope={scope}>
    <ExecutionContextProvider>
      <Profile />
    </ExecutionContextProvider>
  </ScopeProvider>,
)
```

Use `@pumped-fn/lite-lint` to enforce the React-facing guardrails: feature components should not call
`useScope` or `useExecutionContext`, create or close execution contexts manually, mirror graph-owned state
with local state, or put rendered observer tests outside browser test files.

## SSR

The package is SSR-compatible:

- The build output includes the client directive.
- Hooks provide server snapshots.
- Managed `ExecutionContextProvider` renders its subtree on the server.
- Scopes are passed through providers rather than hidden globals.
- Module caches are keyed by controller and context, so concurrent requests stay isolated.

Pre-resolve atoms for `renderToString`, or let streaming Suspense resolve during render.

## React Compiler

The bindings are compatible with React Compiler setups. Hook outputs are stable when observed state is
unchanged, and compiler-memoized inline selectors make `useSelect` cheaper instead of incorrect. The
library build prevents compiler memoization of hook internals that read live controller state during
render.

## Exports

`@pumped-fn/lite-react` re-exports the common Lite constructors for convenience:

```ts
export { createScope, atom, flow, preset, resource } from "@pumped-fn/lite"
```

It also exports:

- `ScopeProvider`
- `ExecutionContextProvider`
- `scopedValue`
- `useScope`
- `useExecutionContext`
- `useFlow`
- `useController`
- `useAtom`
- `useSelect`
- `useResource`
- `useScopedValue`

Complete type reference: [`dist/index.d.mts`](https://github.com/pumped-fn/pumped-fn/blob/main/pkg/react/lite-react/dist/index.d.mts)

Patterns and guardrails: [`PATTERNS.md`](https://github.com/pumped-fn/pumped-fn/blob/main/pkg/react/lite-react/PATTERNS.md)

Core runtime: [`@pumped-fn/lite`](https://github.com/pumped-fn/pumped-fn/blob/main/pkg/core/lite/README.md)

## License

MIT

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).

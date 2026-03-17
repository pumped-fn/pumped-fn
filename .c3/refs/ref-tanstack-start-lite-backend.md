---
id: ref-tanstack-start-lite-backend
c3-version: 4
title: TanStack Start Backend Integration
goal: Standardize how lite scopes and execution contexts flow through TanStack Start server functions and middleware
scope: []
---

# TanStack Start Backend Integration

## Goal

Define the canonical pattern for wiring lite's scope (long-lived) and execution context (per-request) into TanStack Start's `createServerFn` / `createMiddleware` stack, so that server functions get dependency injection, ambient tags, and observability without manual plumbing.

## Choice

**Singleton scope at server entry, per-request execution context via middleware chain.**

The server creates one `Scope` at startup (with extensions and config tags). Each incoming request gets a fresh `ExecutionContext` from a TanStack middleware. Downstream middleware and handlers receive the context through TanStack's `context` object. Flows run inside that context; atoms resolve from the shared scope.

## Why

| Alternative | Rejected Because |
|-------------|------------------|
| Scope per request | Atoms are singletons (DB connections, service instances) — recreating scope per request wastes init cost and breaks caching |
| Global `execCtx` | Execution contexts must be request-scoped for tag isolation (user, transaction, tracing) — globals leak across requests |
| Pass scope to every flow manually | Boilerplate; TanStack middleware already propagates typed context |
| AsyncLocalStorage for context | Adds Node-only runtime coupling; TanStack context is framework-native and works in edge runtimes |

## How

### 1. Server entry — create singleton scope

```typescript
// src/server.tsx
import { createScope } from '@pumped-fn/lite'
import { otel } from '@pumped-fn/lite-extension-otel'

const scope = createScope({
  extensions: [otel()],
  tags: [envTag(process.env.NODE_ENV)],
})

export default createServerEntry({
  async fetch(request) {
    return handler.fetch(request, { context: { scope } })
  },
})
```

### 2. Execution context middleware — per-request lifecycle

```typescript
// src/server/middleware.ts
import { createMiddleware } from '@tanstack/react-start'

export const executionContextMiddleware = createMiddleware()
  .server(async ({ next, context: { scope } }) => {
    const execContext = scope.createContext({})
    try {
      return await next({ context: { execContext } })
    } finally {
      await execContext.close()
    }
  })
```

### 3. Tag-seeding middleware — ambient data for downstream

```typescript
export const authMiddleware = createMiddleware()
  .middleware([executionContextMiddleware])
  .server(async ({ next, context: { execContext } }) => {
    const user = await resolveCurrentUser()
    execContext.data.setTag(currentUserTag, user)
    return next({ context: { user } })
  })

export const transactionMiddleware = createMiddleware()
  .middleware([authMiddleware])
  .server(async ({ next, context: { execContext } }) => {
    const tx = await beginTransaction()
    execContext.data.setTag(transactionTag, tx)
    try {
      const result = await next()
      await tx.commit()
      return result
    } catch (e) {
      await tx.rollback()
      throw e
    }
  })
```

### 4. Server functions — consume context, execute flows

```typescript
// src/server/functions/invoices.ts
export const listInvoices = createServerFn({ method: 'POST' })
  .middleware([transactionMiddleware])
  .handler(async ({ data, context: { execContext } }) => {
    return execContext.exec({
      flow: invoiceFlows.list,
      rawInput: data,
    })
  })
```

### 5. Client hydration — preset server data into client scope

```typescript
// src/routes/_authed.tsx
const loaderData = Route.useLoaderData()

const scope = createScope({
  presets: [
    preset(invoicesAtom, loaderData.invoices),
    preset(userAtom, loaderData.user),
  ],
})

return (
  <ScopeProvider scope={scope}>
    <Outlet />
  </ScopeProvider>
)
```

### Rules summary

| Rule | Rationale |
|------|-----------|
| One scope per server process | Atoms cache singletons (connections, services) |
| One execution context per request | Tag isolation (user, tx, tracing) |
| Middleware creates and closes context | Guarantees cleanup even on error |
| Tags over function params | Flows read ambient tags — no signature coupling |
| `execContext.exec({ flow })` for request work | Flows get lifecycle, tracing, cleanup |
| `scope.resolve(atom)` for shared deps | Atoms are long-lived, cached in scope |
| Preset server data on client scope | No re-fetch; atoms hydrate from loader |

### Compliance questions

1. Does the server entry create exactly one `Scope` and pass it through request context?
2. Does a middleware create `ExecutionContext` with try/finally close?
3. Do server function handlers use `execContext.exec({ flow })` rather than calling flow factories directly?

## Not This

| Anti-pattern | Why it's wrong |
|--------------|----------------|
| `const scope = createScope()` inside a server function | Creates new scope per request — atoms re-resolve, connections leak |
| `await flow.factory(ctx, deps)` in handler | Bypasses execution context lifecycle, tags, extensions, cleanup |
| Passing user/tx as flow input instead of tags | Couples flow signatures to transport concerns; tags are ambient |
| `scope.resolve(flowAtom)` for request work | Flows are ephemeral — `exec()`, don't `resolve()` |
| Creating `ScopeProvider` without presets from loader | Client atoms re-fetch everything the server already loaded |

## Scope

**Applies to:**
- Any TanStack Start application using `@pumped-fn/lite` for backend DI
- Server functions (`createServerFn`), middleware (`createMiddleware`)
- Client-side hydration via `ScopeProvider` with loader presets

**Does NOT apply to:**
- Pure client-side SPAs (no server functions — use `ScopeProvider` + `useAtom` directly)
- Non-TanStack backends (Hono, Express — similar pattern but different middleware API)

## Override

To override this ref:
1. Document justification in an ADR under "Pattern Overrides"
2. Cite this ref and explain why the override is necessary
3. Specify the scope of the override (which components deviate)

## Cited By

<!-- Updated when components cite this ref -->

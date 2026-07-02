# Hono Todo Backend Practical

This example is a small HTTP todo backend using `@pumped-fn/lite-hono`.

The domain module owns todos, validation, and flows. The Hono app stays shaped like a Hono app: it exports `app`, installs middleware with `app.use`, and executes public flows from route handlers through `context.var.lite`.

## Canonical Shape

Framework values enter the graph as request tags. The Hono adapter creates the Lite request context, route
handlers call public flows through `context.var.lite`, and domain tests still use `createScope` directly.

## Shape

- `src/domain.ts` defines tags, the store atom, and todo flows.
- `src/app.ts` exports the Hono app and wires `hono.adapter()` through normal Hono middleware.
- `tests/domain.test.ts` exercises the domain through `createScope`.
- `tests/http.test.ts` exercises the same flows through real Hono requests.
- `tests/guardrails.test.ts` checks the example for implicit external reads and scope helper drift.

Framework values enter the graph only as required deps:

```ts
deps: {
  requestId: tags.required(requestId),
  tenantId: tags.required(tenantId),
  actorId: tags.required(actorId),
  operation: tags.required(operation),
}
```

# Hono Todo Backend Practical

This example is a small HTTP todo backend using `@pumped-fn/lite-hono`.

The domain module owns todos, validation, and flows. The Hono module only creates the request context, supplies request tags, and executes public flows through `context.var.lite`.

## Shape

- `src/domain.ts` defines tags, the store atom, and todo flows.
- `src/app.ts` wires `hono.adapter()` into Hono middleware.
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

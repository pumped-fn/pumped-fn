# Parking Lot Hono

Hono API entrypoint over the shared parking lot management flows.

## Canonical Shape

The Hono app owns HTTP routing and request tags only. The Lite Hono adapter creates request contexts,
routes execute shared flows through `context.var.lite`, and the store is injected at app composition.

## Shape

- `src/app.ts` creates the Hono app and installs the Lite middleware.
- `src/index.ts` exports the app factory.
- `tests/app.test.ts` drives real Hono requests through the shared workflows.

## Run

```bash
pnpm test
pnpm typecheck
```

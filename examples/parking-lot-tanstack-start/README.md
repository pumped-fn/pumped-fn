# Parking Lot TanStack Start

TanStack Start server-function entrypoint over the shared parking lot management flows.

## Canonical Shape

Server-function handlers stay framework-shaped. The Lite TanStack Start adapter wraps shared parking flows,
and tests provide the Lite context with actor, clock, and store runtime values.

## Shape

- `src/handlers.ts` creates Lite-backed server-function handlers.
- `src/index.ts` exports the handlers.
- `tests/handlers.test.ts` executes handlers with real Lite contexts over the shared store.

## Run

```bash
pnpm test
pnpm typecheck
```

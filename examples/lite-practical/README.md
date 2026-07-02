# Practical examples for @pumped-fn/lite

Runnable examples that show how lite code is supposed to be shaped: errors are injectable through the graph, runtime context is carried by tags, lifecycle belongs to scopes/resources, and tests use the same seam as production.

The package has two parts:

- `patterns/` shows one smell at a time. Each folder keeps the broken shape next to the practical
  transformation, then pins the behavior through `createScope({ presets, tags, extensions })` and the
  public atoms/flows/resources.
- `capstone/` combines those moves into a service health monitor with registry flows, scheduled checks,
  transaction resources, metrics, incident transitions, observability extensions, alert hooks, and explicit
  shutdown.

Use these examples as the reference shape for application code: raw IO sits behind atoms/adapters, feature
logic imports the graph nodes it needs directly, lifecycle is owned by scopes/resources/execution contexts,
and tests change radius by changing presets instead of mocking modules.

## Canonical Shape

Application logic is declared as atoms, flows, resources, tags, and extensions. Tests exercise the same
public handles through `createScope({ presets, tags, extensions })`; `before.*` files exist only as paired
anti-pattern specimens with canonical rewrites and tests.

## Run

```bash
pnpm test
pnpm typecheck
```

## Index

| NN | Smell | Harm | Primitives | Lenses |
|---|---|---|---|---|
| 01 | Import-time singleton | Importing connects and nothing closes | `atom`, `tag`, `cleanup`, `preset` | IO, OI, E |
| 02 | Parameter drilling | Signature churn through unaware layers | `tag`, `tags.required`, `ctx.exec` | IO, OI |
| 03 | Module mocking | Path-string mocks leak and drift | `atom`, `flow`, `preset` | IO, OI |
| 04 | Test-env branches | Product branches differ by environment | `preset`, `createScope` | IO, OI |
| 05 | Leaked timers | Handles outlive tests and reloads | `atom`, `cleanup`, `release` | IO, E |
| 06 | Transaction boilerplate | Rollback and release logic duplicated | `resource`, `onClose`, `cleanup` | IO, OI, E |
| 07 | Scattered env config | Defaults and validation drift | `tag`, `parse`, `ParseError` | IO, OI |
| 08 | Stale derived cache | Dirty flags miss invalidations | `controller`, `watch:true`, `flush` | IO, E |
| 09 | Inline cross-cutting | Logging/timing holes are unanswerable | `extension`, `wrapExec`, `wrapResolve`, `logging`, `observable` | IO, OI, E |
| 10 | Request-scoped globals | Concurrent requests corrupt state | `resource`, `ExecutionContext` | IO, OI, E |
| 11 | Shutdown choreography | Manual close order rots | `atom`, `cleanup`, `scope.dispose` | OI, E |
| 12 | Tenant instance maps | Eviction leaks and tenants bleed | `createScope`, `tag`, `preset` | IO, OI, E |

See [lite patterns](../../pkg/core/lite/PATTERNS.md) for the API pattern guide these examples exercise.

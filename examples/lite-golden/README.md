# Golden examples for @pumped-fn/lite

Runnable examples that show how lite code makes coverage a structural result of injectable errors, tag-driven configuration, and explicit lifecycle ownership.

## Run

```bash
pnpm -F @pumped-fn/lite-golden test
pnpm -F @pumped-fn/lite-golden typecheck
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
| 09 | Inline cross-cutting | Logging/timing holes are unanswerable | `extension`, `wrapExec`, `wrapResolve` | IO, OI, E |
| 10 | Request-scoped globals | Concurrent requests corrupt state | `resource`, `ExecutionContext` | IO, OI, E |
| 11 | Shutdown choreography | Manual close order rots | `atom`, `cleanup`, `scope.dispose` | OI, E |
| 12 | Tenant instance maps | Eviction leaks and tenants bleed | `createScope`, `tag`, `preset` | IO, OI, E |

See [lite patterns](../../packages/lite/PATTERNS.md) for the API pattern guide these examples exercise.

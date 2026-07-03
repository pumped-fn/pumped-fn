# 06 - Transaction Boilerplate
## Smell
Handlers open a transaction, do business work, commit on success, roll back on error, and release in `finally` every time.
## Harm
Transaction outcome and connection release are coupled to each handler, so one missed rollback or release path can hold locks and duplicate safety logic across N flows.
## Provenance
- yikart/AiToEarn, `project/aitoearn-electron/electron/db/index.ts`, https://github.com/yikart/AiToEarn/blob/74e884f0e250b902097c355bf8fb55a9ed2c79a5/project/aitoearn-electron/electron/db/index.ts#L145, MIT: database import opens a TypeORM runner, starts a transaction, applies SQL statements, commits, rolls back on error, and releases.
- b310-digital/teammapper, `teammapper-backend/src/map/services/maps.service.ts`, https://github.com/b310-digital/teammapper/blob/32bc3d6f42ae020e31427912c8d039a6b05cab6e/teammapper-backend/src/map/services/maps.service.ts#L111, MIT: map mutation services repeat query-runner transaction choreography across bulk-add and update methods.
## Transformation
`before.ts` repeats transaction scaffolding in each handler. `after.ts` moves begin/commit/rollback/release into the current-owned `tx` resource: its factory opens the transaction, `ctx.onClose` chooses commit or rollback from `CloseResult`, and `ctx.cleanup` releases the connection. Business flows declare `tx` as a dependency, and the action execution closes its child context once. `after.ts` ships only the clean ledger store plus the `TxStore`/`TxConnection`/`TxEvent` types; the failing store whose second write rejects is constructed in the test file against those types and substituted with `preset(txStore, store)`.
## Lens coverage
inside-out, outside-in, and effect-managed are all present. Outside-in is primary because request execution determines the final transaction outcome.
## Why 100% is natural
The only product branch is the `CloseResult` commit/rollback decision inside `tx`'s `onClose`. OI1 drives the ok side, OI2 drives the error side with the test-file failing store, and E1/E2 pin release ordering — all through public lite APIs, with no fault-injection options anywhere in product code.

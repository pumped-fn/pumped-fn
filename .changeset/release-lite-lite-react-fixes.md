---
"@pumped-fn/lite": patch
"@pumped-fn/lite-react": patch
---

- Fix watch and invalidation edge cases in `@pumped-fn/lite` by aligning `select()` with `Object.is`, snapshotting select listeners during notification, making watch option typing match the runtime contract, and surfacing invalidation-chain failures from `flush()` instead of leaking them as background rejections.
- Fix `@pumped-fn/lite-react` hook refresh behavior by keeping stale values visible during re-resolution, recomputing `useSelect` snapshots when selector or equality semantics change, tracking pending promises per controller, and suppressing non-Suspense `unhandledRejection` leaks on failed refreshes.

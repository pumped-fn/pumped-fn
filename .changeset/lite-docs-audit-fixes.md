---
"@pumped-fn/lite": patch
---

Fix `Lite.Utils.FlowOutput` returning `never` for every flow under strictFunctionTypes (contravariant input slot; now infers against `Flow<infer O, any>`). Correct false `Controller.set`/`update` TSDoc (they never ran cleanups or emitted `resolving`). Docs audit fixes across README, PATTERNS, MIGRATION, CLI reference, and TSDoc: transaction middleware rewritten as the resource idiom (no tx in `ctx.data`), React hydration scope memoized, request-lifecycle try/finally + `rawInput`, three crashing MIGRATION examples repaired, GC/`keepAlive` guidance added, controller/select resolve preconditions documented, parse-channel and shallow-equality semantics corrected.

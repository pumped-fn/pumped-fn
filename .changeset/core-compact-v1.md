---
"@pumped-fn/core-next": major
---

## Breaking Changes

### File Consolidation (21 → 11 files)
- `tag-types.ts` + `tag-executors.ts` + `tags/merge.ts` → `tag.ts`
- `promises.ts` + `ssch.ts` → `primitives.ts`
- `flow-execution.ts` → merged into `flow.ts`
- `extension.ts` → merged into `helpers.ts`
- `internal/` directory → inlined into main modules

### API Changes

**ctx.exec()**: Changed from positional params to config object
```typescript
// Before
ctx.exec(myFlow, input)

// After
ctx.exec({ flow: myFlow, input })
```

**Promised**: Removed 9 methods, simplified to core functionality
- Removed: `switch`, `switchError`, `fulfilled`, `rejected`, `firstFulfilled`, `findFulfilled`, `mapFulfilled`, `assertAllFulfilled`
- Kept: `map`, `mapError`, `partition`

**Extension.ExecutionOperation**: Flattened structure
- Removed nested `target` object
- Added flat `mode` field: `"sequential" | "parallel" | "parallel-settled"`
- Check `operation.flow` instead of `operation.target.type === "flow"`

**Tag**: Removed `injectTo` alias and `partial` method

**FlowDefinition**: Removed builder pattern (`.handler()` chaining)

See `packages/next/MIGRATION.md` for detailed migration guide.

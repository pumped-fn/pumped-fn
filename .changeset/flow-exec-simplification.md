---
"@pumped-fn/core-next": patch
---

Fix validation bug, simplify flow execution, and fix tag/metadata access

**Bug Fix:**
- Fixed: Non-journaled flows now validate input/output (previously skipped validation)
- All flows with schemas now guarantee validation on every execution
- Fixed: flowMeta.depth calculation when parent depth is undefined (was NaN, now 0)
- Fixed: Tag access via ctx.get() - Tag objects are functions, not objects (typeof check was wrong)
- Fixed: Child context created before operation (extensions now see correct depth metadata)
- Fixed: FlowContext.get() now checks scope.tags after execution tags
- Fixed: Test using ctx.get() changed to ctx.find() for optional tags

**Refactor:**
- Simplified exec() from 190 lines to ~50 lines via functional decomposition
- Extracted pure helper functions: createChildContext, executeFlowHandler, executeJournaledFlow, executeNonJournaledFlow, executeJournaledFn, executeNonJournaledFn, executeAndWrap, executeWithTimeout
- Enforced safety via TypeScript: UnwrappedExecutor type prevents returning without extension wrapping, ContextConfig type requires parent linkage
- Eliminated 4 execution paths into single route with helpers
- Removed duplicate validation/wrapping logic across paths

**Enhanced:**
- custom() now accepts optional validator function for inline validation:
  ```ts
  custom<number>((value) => {
    if (typeof value !== 'number') {
      return { success: false, issues: [{ message: 'Expected number' }] }
    }
    return value
  })
  ```

**Testing:**
- Rebuilt test suite from scratch: 2 files, ~500 lines total
- flow-execution.test.ts: API behavior for app developers (22/22 tests passing ✅)
- flow-extensions.test.ts: Extension integration (20/20 tests passing ✅)
- Added comprehensive result inspection throughout tests
- Deleted 8 overlapping legacy test files
- All 268 core-next tests passing ✅

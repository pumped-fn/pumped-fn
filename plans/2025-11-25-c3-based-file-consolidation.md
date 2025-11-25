# C3-Based File Consolidation Plan

## Analysis Summary

Based on C3 architecture documentation (`.c3/TOC.md`), the codebase has 8 logical components mapped to 21 source files. This plan consolidates files by C3 component to improve navigability.

**Current State**: 21 source files, 5,684 LOC
**Target**: 14 source files (~33% file count reduction)

## Current vs C3 Component Mapping

| C3 Component | Current Files | LOC |
|--------------|--------------|-----|
| c3-101: Scope & Executor | scope.ts, executor.ts, internal/dependency-utils.ts | 1,609 |
| c3-102: Flow & ExecutionContext | flow.ts, flow-execution.ts, execution-context.ts, internal/abort-utils.ts, internal/journal-utils.ts | 1,445 |
| c3-103: Tag System | tag.ts, tag-types.ts, tag-executors.ts, tags/merge.ts | 508 |
| c3-104: Extension System | extension.ts, internal/extension-utils.ts | 35 |
| c3-105: Error Classes | errors.ts | 321 |
| c3-106: StandardSchema | ssch.ts | 44 |
| c3-107: Multi-Executor | multi.ts | 156 |
| c3-108: Promised | promises.ts | 291 |
| Shared Types | types.ts | 745 |
| Public API | index.ts | 547 |
| Utilities | helpers.ts | 17 |

## Consolidation Opportunities

### Priority 1: Tag System (c3-103)
**Impact**: 4 files → 1 file

Merge into single `tag.ts`:
- `tag-types.ts` (66 lines) - Type definitions only
- `tag-executors.ts` (69 lines) - 3 helper functions + 3 guards
- `tags/merge.ts` (34 lines) - 1 utility function

**Rationale**: All serve Tag component; types can live with implementation.

### Priority 2: Flow System (c3-102)
**Impact**: 2 files → 1 file

Merge `flow-execution.ts` (121 lines) into `flow.ts`:
- `FlowExecutionImpl` class is only used by flow.ts
- Single consumer pattern

**Note**: Keep execution-context.ts separate (1091 lines) - it's core infrastructure.

### Priority 3: Internal Utilities
**Impact**: 4 files → 2 files

Option A - By domain:
- Merge `abort-utils.ts` + `journal-utils.ts` → `internal/flow-utils.ts` (63 lines)
- Keep `dependency-utils.ts` and `extension-utils.ts` separate

Option B - Single file:
- Merge all into `internal/utils.ts` (174 lines)

### Priority 4: Tiny Files
**Impact**: 3 files → 0 files (merged elsewhere)

| File | Lines | Recommended Action |
|------|-------|-------------------|
| extension.ts | 10 | Inline into types.ts or scope.ts |
| helpers.ts | 17 | Move `resolves` to scope.ts, `Escapable` to types.ts |
| ssch.ts | 44 | Could stay (it's small but focused) OR merge into types.ts |

## Proposed File Structure

```
packages/next/src/
├── index.ts              # Public API exports (unchanged)
├── types.ts              # Core types + StandardSchema + Escapable
├── scope.ts              # Scope implementation + resolves helper
├── executor.ts           # Executor creation (unchanged)
├── tag.ts                # Tag implementation + types + executors + merge
├── flow.ts               # Flow API + FlowExecution
├── execution-context.ts  # ExecutionContext (unchanged - large)
├── promises.ts           # Promised class (unchanged)
├── multi.ts              # Multi-executor (unchanged)
├── errors.ts             # Error catalog (unchanged)
└── internal/
    ├── dependency-utils.ts  # Dependency resolution (unchanged)
    ├── extension-utils.ts   # Extension pipeline (unchanged)
    └── flow-utils.ts        # Abort + journal utilities (merged)
```

**Result**: 21 files → 14 files

## Implementation Steps

1. **Tag consolidation** (safest, most impact)
   - Move `Tag` namespace from tag-types.ts to tag.ts
   - Move `tags`, `isTag`, `isTagExecutor`, `isTagged` from tag-executors.ts to tag.ts
   - Move `mergeFlowTags` from tags/merge.ts to tag.ts
   - Delete tag-types.ts, tag-executors.ts, tags/merge.ts

2. **Flow consolidation**
   - Move `FlowExecutionImpl` from flow-execution.ts to flow.ts
   - Delete flow-execution.ts

3. **Internal utilities merge**
   - Create internal/flow-utils.ts from abort-utils.ts + journal-utils.ts
   - Delete abort-utils.ts, journal-utils.ts

4. **Tiny file absorption**
   - Move `extension()` helper to end of types.ts (near Extension namespace)
   - Move `resolves` to scope.ts (it uses scope anyway)
   - Move `Escapable` type to types.ts
   - Delete extension.ts, helpers.ts

5. **Update imports**
   - Run full typecheck after each step
   - Update index.ts re-exports as needed

## Verification Commands

```bash
# Before starting
wc -l packages/next/src/*.ts packages/next/src/**/*.ts | tail -1

# After each step
pnpm -F @pumped-fn/core-next typecheck
pnpm -F @pumped-fn/core-next typecheck:full
pnpm -F @pumped-fn/core-next test

# After all steps
pnpm -F @pumped-fn/examples typecheck
```

## Risks & Mitigations

1. **Circular imports**: Tag consolidation must be careful with types.ts dependency
   - Mitigation: Keep `StandardSchemaV1` in types.ts, import into tag.ts

2. **Breaking public API**: index.ts re-exports must remain unchanged
   - Mitigation: Only internal file moves, public exports stay same

3. **Large files**: scope.ts (1355) and execution-context.ts (1091) are already large
   - Mitigation: Do NOT merge more into these; they're at capacity

## Out of Scope

- Code pattern optimizations (covered in `packages-next-compaction.md`)
- Test file compaction (covered in `packages-next-tests-compaction.md`)
- Splitting large files (scope.ts, execution-context.ts)
- Documentation changes

## Success Metrics

- File count: 21 → 14 (33% reduction)
- LOC: Neutral (reorganization only)
- All tests pass
- All typechecks pass
- Public API unchanged

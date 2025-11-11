# Code Consolidation Design

**Date:** 2025-11-11
**Goal:** Reduce file count by 44% through internal consolidation while preserving public API

## Design Summary

Consolidate 18 source files into 10 files by merging internal utilities and type files into their parent modules. All 56 public API exports remain unchanged and accessible through index.ts.

## Constraints

- **Zero breaking changes:** All index.ts exports must remain accessible
- **Preserve test behavior:** All 31 test files must pass unchanged
- **Backward compatibility:** Public API import paths stay identical

## Consolidation Plan

### 1. Type Files → types.ts

**Files to merge:**
- `tag-types.ts` (56 LOC)
- `ssch.ts` (30 LOC)

**Result:** types.ts grows from 760 → 846 LOC

**Rationale:**
- tag-types.ts depends on types.ts (StandardSchemaV1)
- ssch.ts depends on types.ts (StandardSchemaV1, SchemaError)
- All foundational type/schema code

**Affected imports:**
- tag.ts: `from "./tag-types"` → `from "./types"`
- tag.ts: `from "./ssch"` → `from "./types"`
- index.ts: Update import paths

### 2. Flow Utilities → flow.ts

**Files to merge:**
- `internal/journal-utils.ts` (26 LOC)
- `internal/abort-utils.ts` (37 LOC)

**Result:** flow.ts grows from 1,181 → 1,244 LOC

**Rationale:**
- Both used exclusively by flow.ts
- Flow-specific execution utilities

**Test impact:**
- Tests importing from internal files need path updates to `./flow`

### 3. Scope Utilities → scope.ts

**Files to merge:**
- `internal/extension-utils.ts` (25 LOC)
- `internal/dependency-utils.ts` (63 LOC)

**Result:** scope.ts grows from 1,262 → 1,350 LOC

**Rationale:**
- extension-utils.ts used only by scope.ts
- dependency-utils.ts used by scope.ts and helpers.ts
- Scope-specific utilities

### 4. Executor Utilities → executor.ts

**Files to merge:**
- `helpers.ts` (17 LOC)
- `extension.ts` (10 LOC)

**Result:** executor.ts grows from 168 → 195 LOC

**Rationale:**
- Small single-export files
- Semantically related to executor creation
- Both exported in public API

**Affected imports:**
- index.ts: `from "./helpers"` → `from "./executor"`
- index.ts: `from "./extension"` → `from "./executor"`

## Final Structure

```
packages/next/src/
├── index.ts (update imports)
├── types.ts (+ tag-types + ssch) [846 LOC]
├── tag.ts [270 LOC]
├── promises.ts [291 LOC]
├── executor.ts (+ helpers + extension) [195 LOC]
├── scope.ts (+ extension-utils + dependency-utils) [1,350 LOC]
├── flow.ts (+ journal-utils + abort-utils) [1,244 LOC]
├── flow-execution.ts [115 LOC]
├── multi.ts [156 LOC]
└── errors.ts [263 LOC]
```

**Result:** 10 files (was 18), 44% reduction

## Migration Steps

### Step 1: Merge Type Files
1. Append tag-types.ts content to types.ts
2. Append ssch.ts content to types.ts
3. Update tag.ts imports
4. Update index.ts imports
5. Verify: `pnpm -F @pumped-fn/core-next typecheck`

### Step 2: Merge Flow Utilities
1. Append journal-utils.ts to flow.ts
2. Append abort-utils.ts to flow.ts
3. Update test imports from internal/ to ./flow
4. Verify: `pnpm -F @pumped-fn/core-next typecheck:full`

### Step 3: Merge Scope Utilities
1. Append extension-utils.ts to scope.ts
2. Append dependency-utils.ts to scope.ts
3. Update internal imports in scope.ts
4. Verify: `pnpm -F @pumped-fn/core-next typecheck`

### Step 4: Merge Executor Utilities
1. Append helpers.ts to executor.ts
2. Append extension.ts to executor.ts
3. Update index.ts imports
4. Verify: `pnpm -F @pumped-fn/core-next typecheck`

### Step 5: Delete Old Files
1. Remove internal/ directory (4 files)
2. Remove helpers.ts, extension.ts, tag-types.ts, ssch.ts (4 files)
3. Verify: `pnpm -F @pumped-fn/core-next typecheck:full`

### Step 6: Full Verification
```bash
pnpm -F @pumped-fn/core-next typecheck       # src types
pnpm -F @pumped-fn/core-next typecheck:full  # test types
pnpm -F @pumped-fn/core-next test            # all tests
pnpm -F @pumped-fn/examples typecheck        # examples
pnpm -F @pumped-fn/core-next build           # build
```

## Impact Analysis

**File count:** 18 → 10 files (44% reduction)
**LOC:** 4,785 LOC (unchanged, code moved not deleted)
**Public API:** 56 exports (unchanged)
**Breaking changes:** 0
**Test changes:** Path updates only for internal imports

## Success Criteria

- [ ] All 31 test files pass
- [ ] All 27 example files typecheck
- [ ] Build succeeds
- [ ] No changes to index.ts exports (public API preserved)
- [ ] 8 files deleted
- [ ] Navigation complexity reduced

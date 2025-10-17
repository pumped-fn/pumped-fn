# Coverage Analysis

Generated: 2025-10-17
Package: @pumped-fn/core-next

## Current Coverage Summary

Based on vitest coverage report:

- **Overall Coverage**: 80.96%
- **Lines**: 80.96%
- **Branches**: 82.94%
- **Functions**: 78.39%
- **Test Count**: 135 tests across 11 files

## Coverage by Source File

| Source File | Stmt % | Branch % | Func % | Lines % | Uncovered Lines | Test Coverage |
|------------|--------|----------|--------|---------|-----------------|---------------|
| accessor.ts | 75% | 75% | 72.22% | 75% | 71-76, 87-88, 121-122 | core.test.ts, flow-expected.test.ts |
| errors.ts | 85.06% | 50% | 83.33% | 85.06% | 235, 244-245, 258-259 | error-handling.test.ts |
| executor.ts | 96.63% | 94.11% | 91.66% | 96.63% | 95-98 | core.test.ts, index.test.ts, error-handling.test.ts |
| extension.ts | 100% | 100% | 100% | 100% | - | extensions.test.ts |
| flow.ts | 84.63% | 81.41% | 91.42% | 84.63% | 778, 960-963, 997-998 | flow-*.test.ts, core.test.ts |
| helpers.ts | 3.84% | 100% | 0% | 3.84% | 9-42 | MINIMAL |
| index.ts | 100% | 100% | 100% | 100% | - | ALL |
| meta.ts | 92.4% | 83.33% | 83.33% | 92.4% | 24-25, 28-29, 43-44 | meta.test.ts, flow-execution-meta.test.ts, index.test.ts |
| multi.ts | 11.53% | 0% | 0% | 11.53% | 110, 113-134, 137-159 | MINIMAL |
| promises.ts | 86.91% | 93.33% | 88.88% | 86.91% | 111, 114-122, 141-142 | promised-settled.test.ts, flow-expected.test.ts |
| scope.ts | 85.04% | 84.57% | 80.64% | 85.04% | 968, 975-981, 985-986 | core.test.ts, index.test.ts, error-handling.test.ts |
| ssch.ts | 84% | 60% | 100% | 84% | 10-11, 14-15 | core.test.ts, flow-*.test.ts, meta.test.ts |
| types.ts | 85.56% | 63.63% | 63.63% | 85.56% | 60-63, 430-431, 439-446 | error-handling.test.ts, extensions.test.ts |

## Test File Breakdown

### Test Distribution

| Test File | Tests | Lines | Primary Focus | Dependencies |
|-----------|-------|-------|---------------|--------------|
| core.test.ts | 13 | 250 | Executor, Scope, Basic DI | accessor, executor, scope, flow |
| error-handling.test.ts | 17 | 252 | Error callbacks, Extension errors | scope, executor, types |
| extensions.test.ts | 4 | 290 | Extension operations, wrapping | flow, extension, types |
| flow-definition-property.test.ts | 3 | 46 | Flow definition patterns | flow, custom |
| flow-execution-meta.test.ts | 5 | 95 | Flow metadata access | flow, meta, custom |
| flow-expected.test.ts | 37 | 646 | Flow API patterns, operations | flow, executor, promises |
| flow-router.test.ts | 7 | 217 | Flow routing patterns | flow, custom |
| flow-type-inference.test.ts | 6 | 123 | Flow type inference | flow, custom |
| index.test.ts | 8 | 294 | Integration, reactivity | executor, scope, meta, promises |
| meta.test.ts | 4 | 82 | Meta system, scope meta | meta, scope, executor |
| promised-settled.test.ts | 31 | 539 | Promise utilities, settled results | flow, promises |

## Coverage Gaps Analysis

### Critical Gaps (0-50% coverage)

**helpers.ts (3.84% coverage)**
- Lines 9-42 uncovered
- Zero functions covered
- **Impact**: UNKNOWN utility functions not exercised
- **Test Coverage**: Minimal or indirect
- **Action Required**: Investigate if this is dead code or needs dedicated tests

**multi.ts (11.53% coverage)**
- Lines 110, 113-134, 137-159 uncovered
- Zero functions covered
- **Impact**: Multi-executor operations not tested
- **Test Coverage**: Minimal
- **Action Required**: Either add tests or remove if deprecated

### Moderate Gaps (50-85% coverage)

**accessor.ts (75% coverage)**
- Uncovered: Lines 71-76, 87-88, 121-122
- **Missing**: Some accessor edge cases
- **Test Files**: core.test.ts, flow-expected.test.ts
- **Potential Issues**: Edge case error handling, boundary conditions

**errors.ts (85.06% coverage, but only 50% branch coverage)**
- Uncovered lines: 235, 244-245, 258-259
- **Missing**: Error path branches not fully exercised
- **Test Files**: error-handling.test.ts
- **Potential Issues**: Some error scenarios not tested

**flow.ts (84.63% coverage)**
- Uncovered: Lines 778, 960-963, 997-998
- **Missing**: Some flow edge cases
- **Test Files**: Multiple flow-*.test.ts files
- **Potential Issues**: Specific execution paths not covered

**scope.ts (85.04% coverage)**
- Uncovered: Lines 968, 975-981, 985-986
- **Missing**: Some scope lifecycle edge cases
- **Test Files**: core.test.ts, index.test.ts, error-handling.test.ts
- **Potential Issues**: Cleanup/disposal edge cases

**ssch.ts (84% coverage, but only 60% branch coverage)**
- Uncovered: Lines 10-11, 14-15
- **Missing**: Schema validation branches
- **Test Files**: core.test.ts, flow-*.test.ts, meta.test.ts
- **Potential Issues**: Edge case validation not tested

**types.ts (85.56% coverage, but only 63.63% branch/function coverage)**
- Uncovered: Lines 60-63, 430-431, 439-446
- **Missing**: Type guard functions, utility helpers
- **Test Files**: error-handling.test.ts, extensions.test.ts
- **Potential Issues**: Type utilities not fully exercised

## Test Overlap Analysis

### High Overlap (Potential Duplicates)

**Flow Execution Basics**
- **Duplicated across**: flow-expected.test.ts (37 tests), core.test.ts (flow tests), index.test.ts (exec tests)
- **Overlap**: Basic flow execution patterns tested multiple times
- **Evidence**:
  - flow-expected.test.ts:8-13 "shortest form - handler only"
  - core.test.ts:130-142 "scope.exec executes flow with provided scope"
  - core.test.ts:195-214 "scope.exec(flow) with/without input"
- **Recommendation**: Consolidate basic flow execution into single canonical location

**Error Handling Patterns**
- **Duplicated across**: error-handling.test.ts (17 tests), flow-expected.test.ts (error tests), core.test.ts (error tests)
- **Overlap**: Error throwing and handling tested in multiple contexts
- **Evidence**:
  - error-handling.test.ts: Comprehensive error callback tests
  - flow-expected.test.ts:244-262: FlowError throwing tests
  - core.test.ts:29-42: Circular dependency errors
- **Recommendation**: Keep error-handling.test.ts as canonical, remove basic error tests from flow files

**Dependency Injection**
- **Duplicated across**: core.test.ts, index.test.ts, flow-expected.test.ts
- **Overlap**: Basic executor resolution with dependencies
- **Evidence**:
  - core.test.ts:44-64 "scope processes dependencies in correct order"
  - index.test.ts:11-64 "syntax" test covers similar DI patterns
  - flow-expected.test.ts:130-163 "nameless with dependencies"
- **Recommendation**: Consolidate into core.test.ts, keep flow-expected focused on flow-specific features

**Reactivity and Updates**
- **Duplicated across**: index.test.ts (multiple tests), core.test.ts (limited)
- **Overlap**: Executor updates and reactive dependencies
- **Evidence**:
  - index.test.ts:66-119 "reactive changes"
  - index.test.ts:184-203 "can use release to control counter"
  - Both test the same reactive update mechanism
- **Recommendation**: Consolidate reactive tests into dedicated section in index.test.ts

**Promised Utilities**
- **Duplicated across**: promised-settled.test.ts (31 tests), flow-expected.test.ts (partial)
- **Overlap**: allSettled operations tested both standalone and in flow context
- **Evidence**:
  - promised-settled.test.ts:455-504 "Works with Promised.allSettled()"
  - flow-expected.test.ts:312-340 "ctx.parallelSettled()"
- **Recommendation**: Keep promised-settled.test.ts as canonical utility tests, flow-expected should focus on ctx usage

**Meta System**
- **Duplicated across**: meta.test.ts (4 tests), flow-execution-meta.test.ts (5 tests), index.test.ts (partial)
- **Overlap**: Meta definition and access patterns
- **Evidence**:
  - meta.test.ts:6-39 "basic meta functionality"
  - flow-execution-meta.test.ts: Flow-specific meta access
  - index.test.ts:9-64 Uses meta("name", ...) pattern
- **Recommendation**: meta.test.ts for meta APIs, flow-execution-meta.test.ts for flow-specific meta only

**Executor Resolution**
- **Duplicated across**: core.test.ts, index.test.ts
- **Overlap**: Basic provide/derive/resolve patterns
- **Evidence**:
  - core.test.ts:44-64 "scope processes dependencies"
  - index.test.ts:11-64 "syntax" test
  - index.test.ts:205-221 "preset works"
- **Recommendation**: Consolidate basic patterns into core.test.ts

### Medium Overlap (Related but Different Aspects)

**Flow Patterns**
- **Files**: flow-expected.test.ts, flow-router.test.ts, flow-type-inference.test.ts, flow-definition-property.test.ts
- **Analysis**: Each focuses on different aspect of flows
  - flow-expected.test.ts: Usage patterns, operations (37 tests)
  - flow-router.test.ts: Routing/branching logic (7 tests)
  - flow-type-inference.test.ts: Type system verification (6 tests)
  - flow-definition-property.test.ts: Definition API (3 tests)
- **Recommendation**: Keep separated but review for duplicate basic patterns

**Extensions**
- **Files**: extensions.test.ts (4 tests), error-handling.test.ts (extension error tests)
- **Analysis**: Different aspects of extensions
  - extensions.test.ts: Operation wrapping, tracking
  - error-handling.test.ts: Error handling in extensions
- **Recommendation**: Keep separated as they test different concerns

### Low Overlap (Unique Coverage)

**Core Scope Mechanics**
- **File**: core.test.ts
- **Unique Coverage**: Circular dependencies, execution order, mixed sync/async
- **Keep**: Yes - foundational patterns

**Promise Utilities**
- **File**: promised-settled.test.ts
- **Unique Coverage**: fulfilled(), rejected(), partition(), findFulfilled(), mapFulfilled(), assertAllFulfilled()
- **Keep**: Yes - comprehensive utility coverage

## Recommendations for Test Consolidation

### Phase 1: Remove Clear Duplicates (Target: -20 to -30 tests)

1. **Flow Execution Basics**: Merge duplicate basic flow tests into core.test.ts, keep flow-expected focused on advanced patterns
2. **Error Handling**: Remove basic error tests from flow-expected.test.ts, keep error-handling.test.ts canonical
3. **Dependency Injection**: Remove basic DI duplication from index.test.ts and flow-expected.test.ts
4. **Reactivity**: Consolidate reactive tests in index.test.ts
5. **Promised Utilities**: Remove duplicate allSettled tests from flow-expected.test.ts

### Phase 2: Investigate Dead Code (Target: Coverage improvement)

1. **helpers.ts**: Determine if this is dead code (3.84% coverage)
2. **multi.ts**: Determine if this is deprecated/unused (11.53% coverage)
3. Add minimal tests if needed, or remove if dead code

### Phase 3: Fill Coverage Gaps (Target: 100% coverage)

Priority order:
1. **accessor.ts**: Add tests for lines 71-76, 87-88, 121-122 (edge cases)
2. **errors.ts**: Add branch coverage for error scenarios (lines 235, 244-245, 258-259)
3. **flow.ts**: Cover remaining edge cases (lines 778, 960-963, 997-998)
4. **scope.ts**: Add disposal/lifecycle edge case tests (lines 968, 975-981, 985-986)
5. **ssch.ts**: Add schema validation branch tests (lines 10-11, 14-15)
6. **types.ts**: Add type utility tests (lines 60-63, 430-431, 439-446)

### Phase 4: Restructure for Readability

1. Rename tests to describe scenarios, not implementation
2. Remove all comments (code should be self-documenting)
3. Use line breaks to separate setup/action/assertion
4. Use descriptive variable names

## Expected Outcome

**Before:**
- 135 tests across 11 files
- 80.96% coverage
- Significant duplication

**Target:**
- 60-80 tests across 8-9 files
- 100% coverage
- Zero duplication
- All tests serve as usage examples

## Files Most Likely to Change

1. **flow-expected.test.ts** (37 → ~20 tests): Remove duplicates, keep advanced patterns
2. **promised-settled.test.ts** (31 → ~20 tests): Remove duplicates with flow tests
3. **error-handling.test.ts** (17 → ~12 tests): Consolidate similar error scenarios
4. **core.test.ts** (13 → ~15 tests): Add missing coverage, consolidate basic patterns
5. **index.test.ts** (8 → ~8 tests): Keep integration tests, consolidate reactivity
6. **flow-router.test.ts** (7 → ~5 tests): Check for duplicates with flow-expected
7. **flow-type-inference.test.ts** (6 → ~5 tests): Keep if testing unique type scenarios
8. **flow-execution-meta.test.ts** (5 → ~3 tests): Keep flow-specific meta only
9. **extensions.test.ts** (4 → ~4 tests): Keep, comprehensive coverage
10. **meta.test.ts** (4 → ~4 tests): Keep, focused on meta API
11. **flow-definition-property.test.ts** (3 → ~2 tests): Check for merging with flow-expected

**Potential Deletions:**
- helpers.ts tests (if dead code)
- multi.ts tests (if deprecated)

## Next Steps

1. Manually review duplicate candidates identified above
2. Create detailed duplicate-candidates.md with specific test names
3. Begin systematic deletion in small batches
4. Add missing coverage tests
5. Restructure remaining tests for readability

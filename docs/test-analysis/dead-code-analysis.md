# Dead Code and Coverage Analysis

## Analysis Date
2025-10-17

## Coverage Status
- Overall: 86.55% statement, 86.71% branch, 84.92% function
- Total tests: 161

## Findings

### 1. multi.ts - UNTESTED PUBLIC API (11.53% coverage)

**Status:** Public API feature with virtually zero test coverage

**Details:**
- Exported as `export * as multi from "./multi"` in index.ts
- Provides MultiExecutor pattern for pool-based executor management
- Uncovered lines: 98-110, 113-134, 137-159 (basically all public functions)
- Usage: NONE found in tests, examples, or other packages

**Functions:**
- `multi.provide<T, K>(option, valueFn, ...metas)` - 0% coverage
- `multi.derive<T, K, D>(option, valueFn, ...metas)` - 0% coverage
- Internal: `createMultiExecutor`, `createValidatedExecutor` - 0% coverage

**Recommendation:** CRITICAL
- Option A: Remove multi.ts if not part of planned feature set
- Option B: Add comprehensive tests (15-20 tests minimum)
- Option C: Mark as experimental/unstable in docs until tested

**Risk:** High - Public API that's completely untested could break silently

---

### 2. helpers.ts - UNUSED PUBLIC API (100% coverage via test-only)

**Status:** Public API with no production usage, only tested

**Details:**
- Exported as `export { resolves } from "./helpers"` in index.ts
- Function: `resolves<T>(scope, executors)` - Helper for batch executor resolution
- Coverage: 100% (from coverage-gaps.test.ts)
- Usage: NONE in src code, NONE in tests except coverage test

**Recommendation:** MEDIUM
- Option A: Keep if part of planned public API surface
- Option B: Remove if not used (potential YAGNI violation)
- Option C: Add usage examples in docs/examples if keeping

**Risk:** Low - Well tested, just unused

---

### 3. ssch.ts - UNTESTED ERROR PATHS (84% coverage)

**Status:** Core validation module with untested error handling

**Uncovered lines:**
- Line 10-11: `throw new Error("validating async is not supported")`
- Line 14-15: `throw new SchemaError(result.issues)`

**Recommendation:** HIGH PRIORITY
- Add 2 tests for error paths:
  1. Test async validation rejection
  2. Test validation failure with issues

**Risk:** Medium - Error paths in validation are critical

---

### 4. types.ts - CLASS CONSTRUCTORS (85.56% coverage)

**Status:** Type definitions with some untested constructors

**Uncovered lines:**
- 60-63: SchemaError constructor
- 430-431, 439-446: FlowError/FlowValidationError constructors

**Recommendation:** LOW PRIORITY
- These are class definitions, naturally covered when errors are thrown
- Coverage gaps may be reporting artifacts

**Risk:** Low - Constructors tested indirectly through error handling tests

---

### 5. flow.ts, scope.ts - LARGE FILES (84-89% coverage)

**Status:** Core implementation files with good but not complete coverage

**Recommendation:** DEFER
- 84-89% coverage is acceptable for complex core files
- Focus on critical paths rather than 100% coverage
- Evaluate specific uncovered branches if bugs occur

**Risk:** Low - High coverage in core functionality

---

## Prioritized Action Items

### Immediate (Before Next Release)
1. **Decide on multi.ts fate**
   - If keeping: Write 15-20 tests for MultiExecutor
   - If removing: Delete multi.ts and remove from exports

2. **Test ssch.ts error paths**
   - Add async validation rejection test
   - Add validation failure test

### Short Term (Next Sprint)
3. **Evaluate helpers.ts usage**
   - Document intended use cases for `resolves()`
   - Add examples if keeping, remove if not needed

4. **Update coverage targets**
   - Adjust from 100% to realistic 85-90% for this codebase type
   - Document rationale in testing docs

### Long Term (Future)
5. **Monitor coverage trends**
   - Set up coverage regression detection
   - Review low-coverage files quarterly

---

## Coverage Philosophy

**Current Target:** 100% (unrealistic)
**Recommended Target:** 85-90% statement, 80-85% branch

**Rationale:**
- Graph-based DI libraries have inherent complexity
- Some code paths are defensive programming (hard to test)
- Diminishing returns above 90% for this domain
- Focus on critical paths and public API

**Exceptions:**
- Public API: Aim for 95%+ coverage
- Error handling: 100% coverage of error paths
- Core resolution logic: 95%+ coverage
- Utilities and helpers: Can be 80%+ if well-isolated

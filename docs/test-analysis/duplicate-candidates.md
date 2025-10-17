# Duplicate Test Candidates Analysis

## Summary

Total test files: 11
Total tests: 135

Tests per file:
- flow-expected.test.ts: 37 tests
- promised-settled.test.ts: 31 tests
- error-handling.test.ts: 17 tests
- core.test.ts: 13 tests
- index.test.ts: 8 tests
- flow-router.test.ts: 7 tests
- flow-type-inference.test.ts: 6 tests
- flow-execution-meta.test.ts: 5 tests
- meta.test.ts: 4 tests
- extensions.test.ts: 4 tests
- flow-definition-property.test.ts: 3 tests

---

## Duplicate Group 1: Scope.exec() with Flow Execution

### Scenario: Basic flow execution via scope.exec

**KEEP: core.test.ts:130-143** - "scope.exec executes flow with provided scope"
- Clear example of scope.exec with dependencies
- Shows multiplier config pattern
- Line 131-140: Clean setup/action/assertion

**KEEP: core.test.ts:195-213** - "scope.exec(flow) without/with input parameter"
- Two complementary tests (lines 195-203 and 205-213)
- Demonstrates void input vs parameterized input patterns
- Essential for documenting both signatures

**EVALUATE: index.test.ts:11-64** - "syntax" mega-test
- Lines 11-64: Covers executor resolution, reactive changes, accessor usage, scope.exec
- This is more comprehensive but tests too many concepts
- Contains scope.exec at lines 45-63 but buried in larger test
- **DECISION: KEEP** - Different focus (reactive system demonstration), not pure duplicate

**DECISION**: Keep all core.test.ts tests, keep index.test.ts:11-64 as integration example

---

## Duplicate Group 2: Flow Execution with Details Option

### Scenario: Execute with details:true returns execution context

**KEEP: core.test.ts:161-174** - "scope.exec with details returns execution details on success"
- Via scope.exec API
- Lines 161-174: Clear success case with type narrowing
- Tests execution details structure

**KEEP: core.test.ts:176-193** - "scope.exec with details returns execution details on error"
- Via scope.exec API
- Lines 176-193: Error case with type narrowing
- Complements success case

**DUPLICATE: flow-expected.test.ts:589-598** - "execute with details: true returns execution details on success"
- Via flow.execute API
- Lines 589-598: Same concept, different API
- **DECISION: DELETE** - flow.execute details covered by flow-expected.test.ts:431-448 (inDetails method)

**DUPLICATE: flow-expected.test.ts:600-614** - "execute with details: true returns execution details on error"
- Via flow.execute API
- Lines 600-614: Same concept as core.test.ts:176-193
- **DECISION: DELETE** - Redundant with inDetails method tests

**KEEP: flow-expected.test.ts:615-620** - "execute with details: false returns normal result"
- Lines 615-620: Tests default behavior explicitly
- **DECISION: KEEP** - Documents explicit false behavior

**DUPLICATE: flow-expected.test.ts:622-627** - "execute without details option returns normal result"
- Lines 622-627: Tests implicit default
- **DECISION: DELETE** - Covered by all other tests without details option

**KEEP: flow-expected.test.ts:629-645** - "details: true works with nested flows"
- Lines 629-645: Nested flow scenario
- **DECISION: KEEP** - Unique nested scenario

**DECISION**: Delete 2 duplicate tests from flow-expected.test.ts (lines 589-598, 600-614, 622-627 = 3 tests)

---

## Duplicate Group 3: Execution Context Access (journal, meta)

### Scenario: ctx() method returns execution context

**KEEP: flow-expected.test.ts:414-429** - "ctx() returns execution data after flow completes"
- Lines 414-429: Tests ctx() method on execution promise
- Checks flowMeta values (flowName, depth, isParallel)
- Clear demonstration of journal access

**KEEP: flow-expected.test.ts:431-448** - "inDetails() returns both result and context on success"
- Lines 431-448: Tests inDetails() method
- Shows journal size validation
- Different API from ctx()

**KEEP: flow-expected.test.ts:450-470** - "journal captures all operations"
- Lines 450-470: Focuses on journal content validation
- Tests specific journal keys
- Unique focus on journal internals

**KEEP: flow-expected.test.ts:472-487** - "contextData captures custom context values"
- Lines 472-487: Custom accessor usage in context
- Unique scenario not covered elsewhere

**KEEP: flow-expected.test.ts:489-505** - "inDetails() captures context even on error"
- Lines 489-505: Error case with context
- Essential error scenario

**KEEP: flow-expected.test.ts:506-540** - "flowMeta tracks flow execution hierarchy"
- Lines 506-540: Tests subflow meta tracking
- Unique hierarchical scenario

**KEEP: flow-expected.test.ts:542-558** - "inDetails() works with transformed promises"
- Lines 542-558: Tests with .map() chain
- Unique promise transformation scenario

**KEEP: flow-expected.test.ts:560-586** - "inDetails() type discrimination"
- Lines 560-586: Type narrowing for success/failure
- Important for TypeScript usage

**DECISION**: No duplicates found - all tests cover unique aspects

---

## Duplicate Group 4: Error Handling Across Files

### Scenario: Factory execution errors

**KEEP: error-handling.test.ts:8-14** - "triggers global error callback when executor factory throws"
- Lines 8-14: Uses helper, focused on global callback
- Part of comprehensive error handling suite

**PARTIAL DUPLICATE: core.test.ts:29-42** - "scope handles circular dependencies"
- Lines 29-42: Tests circular dependency error
- Specific error scenario, not general factory error
- **DECISION: KEEP** - Tests different error type (circular deps)

**DECISION**: Keep both - different error scenarios

### Scenario: Error callbacks and cleanup

**KEEP: error-handling.test.ts:60-77** - "invokes callback only for specific executor that fails"
- Lines 60-77: Per-executor error callbacks
- Part of systematic error callback testing

**KEEP: error-handling.test.ts:156-168** - "removes global error callback when cleanup function is invoked"
- Lines 156-168: Callback cleanup
- Essential lifecycle test

**DECISION**: No duplicates - comprehensive error handling coverage needed

---

## Duplicate Group 5: Meta System

### Scenario: Meta operations on executors

**KEEP: meta.test.ts:7-39** - "basic meta functionality"
- Lines 7-39: Tests getValue, findValue, findValues
- Includes validation callback
- Core meta operations

**KEEP: meta.test.ts:41-46** - "meta should work with void as well"
- Lines 41-46: Edge case for void type
- Short but important edge case

**DECISION**: Keep both

### Scenario: Scope meta access

**KEEP: meta.test.ts:53-66** - "scope should implement Meta.MetaContainer"
- Lines 53-66: Tests scope meta configuration
- Direct scope meta access

**KEEP: meta.test.ts:68-80** - "executors can access scope meta through controller"
- Lines 68-80: Tests meta access from executor
- Different access pattern

**DECISION**: Keep both - different access patterns

### Scenario: Flow execution meta

**KEEP: flow-execution-meta.test.ts:7-19** - "scopeMeta is applied to scope when creating new scope"
- Lines 7-19: Tests scopeMeta option in flow.execute
- Clean focused test

**KEEP: flow-execution-meta.test.ts:21-33** - "execution meta is accessible via flow context"
- Lines 21-33: Tests execution-level meta
- Different from scope meta

**KEEP: flow-execution-meta.test.ts:35-52** - "execution meta is isolated per execution"
- Lines 35-52: Tests isolation between executions
- Important isolation guarantee

**KEEP: flow-execution-meta.test.ts:54-73** - "both scopeMeta and execution meta can coexist"
- Lines 54-73: Tests interaction of both types
- Important integration test

**KEEP: flow-execution-meta.test.ts:75-95** - "execution meta doesn't affect scope when scope is provided"
- Lines 75-95: Tests scope immutability
- Important guarantee

**DECISION**: Keep all - systematic coverage of meta scoping rules

---

## Duplicate Group 6: Flow Patterns - Multiple Tests per Concept

### Scenario: Nameless flow creation

**KEEP: flow-expected.test.ts:8-12** - "shortest form - handler only"
- Lines 8-12: Minimal example
- Essential baseline

**KEEP: flow-expected.test.ts:15-62** - "shortest form with dependencies, nested flow, and operations"
- Lines 15-62: Comprehensive integration
- Shows real-world pattern with API, subflows, ctx.run
- High value as practical example

**KEEP: flow-expected.test.ts:64-73** - "handler only with explicit generics"
- Lines 64-73: Generic type annotation pattern
- Documents TypeScript usage

**KEEP: flow-expected.test.ts:75-82** - "simple transformation"
- Lines 75-82: String to number transformation
- Clear simple example

**KEEP: flow-expected.test.ts:84-91** - "nameless with optional name for journaling"
- Lines 84-91: Name for debugging
- **DECISION: EVALUATE** - Very similar to other nameless tests
- **DECISION: DELETE** - Doesn't demonstrate unique value

**DECISION**: Delete 1 test (flow-expected.test.ts:84-91)

### Scenario: Basic flow creation patterns

**KEEP: flow-expected.test.ts:167-176** - "pattern 1: generic types with handler"
- Lines 167-176: Generic type pattern
- Part of pattern documentation

**DUPLICATE: flow-expected.test.ts:64-73** - "handler only with explicit generics"
- Lines 64-73: Same pattern as above
- **DECISION: DELETE** - Covered by pattern 1

**KEEP: flow-expected.test.ts:178-192** - "pattern 2: schema-based with inferred types"
- Lines 178-192: Definition-based pattern
- Unique pattern

**KEEP: flow-expected.test.ts:194-208** - "pattern 3: definition then handler"
- Lines 194-208: Two-step pattern
- Unique pattern

**DECISION**: Delete 1 test (flow-expected.test.ts:64-73)

---

## Duplicate Group 7: Dependency Resolution Order

### Scenario: Dependencies execute in correct order

**KEEP: core.test.ts:44-64** - "scope processes dependencies in correct order"
- Lines 44-64: Tests execution order tracking
- Uses executionOrder array
- Clear demonstration of ordering

**PARTIAL DUPLICATE: core.test.ts:86-112** - "preserves execution order with mixed dependencies"
- Lines 86-112: Tests sync/async mix with ordering
- More complex scenario
- **DECISION: KEEP** - Tests async ordering specifically

**DECISION**: Keep both - one simple, one with async complexity

---

## Duplicate Group 8: Scope Cache Delegation

### Scenario: Flow execution reuses scope-cached resources

**KEEP: core.test.ts:218-248** - "scope.exec(flow) reuses scope-cached resources"
- Lines 218-248: Tests that flow.exec doesn't re-resolve scope resources
- Counts resolution calls
- Critical performance behavior

**NO DUPLICATES FOUND**

**DECISION**: Keep

---

## Duplicate Group 9: Promised Settled Operations

### Scenario: Multiple tests for same operation pattern

The promised-settled.test.ts file (31 tests) contains systematic coverage of Promised utilities.
Each test covers a unique method or scenario:
- fulfilled() - 3 tests (all scenarios, empty, mixed)
- rejected() - 2 tests
- partition() - 3 tests
- firstFulfilled() - 3 tests
- firstRejected() - 3 tests
- findFulfilled() - 4 tests
- mapFulfilled() - 4 tests
- assertAllFulfilled() - 4 tests
- Works with Promised.allSettled() - 3 tests
- Edge cases - 2 tests

**EVALUATION**:
- Tests are systematic and cover edge cases
- Each method needs success/failure/mixed scenarios
- Could potentially combine some edge case tests
- **DECISION: EVALUATE FURTHER** - Potential to merge 5-8 tests

**MERGE CANDIDATE 1**: "fulfilled() - returns empty array when all rejected" (lines 25-38)
- Can merge with "handles all rejected" tests in partition()
- **DECISION: KEEP SEPARATE** - Different methods need independent validation

**MERGE CANDIDATE 2**: "returns undefined when all fulfilled/rejected" patterns
- Lines 179-190 (firstFulfilled undefined)
- Lines 226-235 (firstRejected undefined)
- **DECISION: KEEP SEPARATE** - Each method needs edge case validation

**DECISION**: Keep all 31 tests - systematic API coverage

---

## Duplicate Group 10: Extension Operation Tracking

### Scenario: Extension wrap functionality

**KEEP: extensions.test.ts:6-49** - "journal operations - parameters and outputs"
- Lines 6-49: Tests journal operation wrapping
- Captures params and output
- Clean focused example

**KEEP: extensions.test.ts:51-85** - "execution and subflow - input/output tracking"
- Lines 51-85: Tests execute and subflow operations
- Different operations than journal
- Unique scenario

**KEEP: extensions.test.ts:87-185** - "comprehensive tracking - all operation types with errors"
- Lines 87-185: Tests all operation types including parallel
- Error scenarios
- Comprehensive integration test

**KEEP: extensions.test.ts:187-288** - "real-world example - e-commerce order processing with error scenarios"
- Lines 187-288: Large realistic example
- Tests parallel operations, error handling
- High value as practical example

**DECISION**: Keep all - each demonstrates different extension patterns

---

## Duplicate Group 11: Type Inference Tests

### Scenario: Flow type inference utilities

All tests in flow-type-inference.test.ts (6 tests) cover different inference scenarios:
- flow() return inference
- flow with dependencies inference
- anonymous flow inference
- flow.define().handler() inference
- Flow.Flow type annotation
- definition property access

**DECISION**: Keep all - systematic API coverage

---

## Duplicate Group 12: Flow Router Tests

All tests in flow-router.test.ts (7 tests) cover different router type utilities:
- PathsToFlows
- GetFlowFromPath
- InferInputFromPath
- InferOutputFromPath
- FlowRouterExecutor
- Single-level router
- Deeply nested routers

**DECISION**: Keep all - systematic type utility coverage

---

## Duplicate Group 13: Flow Definition Property

All tests in flow-definition-property.test.ts (3 tests) cover definition property access:
- With flow.define().handler()
- With dependencies
- With anonymous flow

**EVALUATION**:
- Similar to flow-type-inference.test.ts:103-122
- **DECISION: MERGE** - These 3 tests can be merged into flow-type-inference.test.ts

---

## Duplicate Group 14: Reactive System

### Scenario: Reactive changes and updates

**KEEP: index.test.ts:66-119** - "reactive changes"
- Lines 66-119: Comprehensive reactive test
- Tests .reactive, onUpdate, cleanup
- Multiple derivation types (single, array, object)
- Essential reactive system demo

**KEEP: index.test.ts:121-182** - "complicated cleanup"
- Lines 121-182: Tests reactive cleanup with config controller
- Complex real-world scenario
- Demonstrates cleanup ordering

**KEEP: index.test.ts:184-203** - "can use release to control counter"
- Lines 184-203: Tests accessor.update
- Different API pattern

**DECISION**: Keep all - different aspects of reactive system

---

## Duplicate Group 15: Preset System

### Scenario: Preset with value and executor

**KEEP: index.test.ts:205-221** - "preset works with value and executor"
- Lines 205-221: Tests preset with direct value and executor
- Shows both patterns
- Clean example

**KEEP: core.test.ts:144-159** - "scope.exec with presets"
- Lines 144-159: Tests preset in scope.exec context
- Different usage context
- **DECISION: KEEP** - Different API usage

**DECISION**: Keep both - different contexts (createScope vs scope.exec)

---

## Summary of Deletions

### Confirmed DELETE (7 tests total):

1. **flow-expected.test.ts:589-598** - "execute with details: true returns execution details on success"
   - Reason: Duplicate of inDetails() method test

2. **flow-expected.test.ts:600-614** - "execute with details: true returns execution details on error"
   - Reason: Duplicate of inDetails() error test

3. **flow-expected.test.ts:622-627** - "execute without details option returns normal result"
   - Reason: Implicit default covered by all other tests

4. **flow-expected.test.ts:84-91** - "nameless with optional name for journaling"
   - Reason: Doesn't demonstrate unique value over other nameless tests

5. **flow-expected.test.ts:64-73** - "handler only with explicit generics"
   - Reason: Duplicate of "pattern 1: generic types with handler"

### Confirmed MERGE (3 tests):

6-8. **flow-definition-property.test.ts** - All 3 tests
   - Reason: Merge into flow-type-inference.test.ts as they test related concepts
   - Target: Add definition property checks to existing flow-type-inference tests

---

## Recommended Consolidation Actions

### Phase 1: Delete Clear Duplicates (5 tests)
- Delete tests #1-5 above
- Expected reduction: 135 → 130 tests
- Risk: Low (all have clear superior alternatives)

### Phase 2: Merge Type Tests (3 tests → net -2)
- Merge flow-definition-property.test.ts into flow-type-inference.test.ts
- Delete flow-definition-property.test.ts file
- Expected reduction: 130 → 128 tests
- Risk: Low (same test category)

### Phase 3: Evaluate Promised Utilities (potential -5 to -8 tests)
- Review promised-settled.test.ts for edge case consolidation
- Expected reduction: 128 → 120-123 tests
- Risk: Medium (need to ensure edge case coverage)

---

## Final Target

- Current: 135 tests
- After Phase 1-2: 128 tests (7 deletions)
- After Phase 3 (aggressive): 120 tests (15 deletions)
- Goal range: 60-80 tests

**Next Steps**: Need deeper consolidation beyond duplicates. Consider:
- Combining similar edge case tests
- Merging tests within same file that test incremental variations
- Creating comprehensive "scenario" tests that cover multiple related cases

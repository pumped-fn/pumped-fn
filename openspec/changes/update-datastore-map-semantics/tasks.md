## Status: ⚠️ REFRAME AS SPEC CLARIFICATION

Verification on 2025-12-09 found that **Map-like semantics already exist**. The ADR's problem statement is factually incorrect - `get()` already returns `T | undefined` and does NOT use tag defaults.

## 1. Implementation ✅ ALREADY CORRECT

- [x] 1.1 Update `get()` signature in DataStore interface to return `T | undefined` - ALREADY DONE (types.ts:66-69)
- [x] 1.2 Update `get()` implementation to not use tag defaults - ALREADY DONE (scope.ts:11-13)
- [x] 1.3 Add third overload to `getOrSet()` for tags with defaults - ALREADY DONE (types.ts:77-79)

**Evidence:** Current `get()` implementation is a pure Map lookup:
```typescript
get<T>(tag: Lite.Tag<T, boolean>): T | undefined {
  return this.map.get(tag.key) as T | undefined
}
```

## 2. Testing ✅ ALREADY COMPLETE

- [x] 2.1 Test `get()` returns undefined when not set (even with default tag) - scope.test.ts:1201-1217
- [x] 2.2 Test `get()` returns stored value when present - scope.test.ts:1245
- [x] 2.3 Test `getOrSet()` stores and returns tag default when missing - scope.test.ts:1271
- [x] 2.4 Test `getOrSet(tag, value)` stores provided value, not tag default - covered
- [x] 2.5 Test `getOrSet()` returns existing value without overwriting - covered
- [x] 2.6 Test `has()` returns true after `getOrSet()` - covered

## 3. Type System Verification ✅ ALREADY CORRECT

- [x] 3.1 `get()` always returns `T | undefined` regardless of tag default
- [x] 3.2 `getOrSet(tagWithDefault)` compiles without second argument
- [x] 3.3 `getOrSet(tagWithDefault, value)` compiles with optional override
- [x] 3.4 `getOrSet(tagWithoutDefault)` is compile error (missing required value)
- [x] 3.5 `getOrSet(tagWithoutDefault, value)` compiles

## 4. Documentation

- [x] 4.1 Update c3-202-atom.md "Per-Atom Private Storage" examples - ALREADY CORRECT (lines 296-310)
- [N/A] 4.2 Add migration guide for breaking change - NOT NEEDED (no breaking change)

## Remaining Work

**ADR Correction Required:**
1. Update ADR-014 to reframe as "Spec Clarification" not "Breaking Change"
2. Remove incorrect problem statement examples
3. State that implementation already has Map-like semantics
4. Keep the spec changes as they formalize existing behavior

**Spec Enhancement:**
1. Merge proposed spec changes to explicitly document `get()` behavior
2. This formalizes existing behavior, not changing it

---
id: adr-20260312-fix-watch-shallow-equal
title: Fix watch:true false cascades via shallow equality default
type: adr
status: proposed
date: 2026-03-12
affects: [packages/lite/src/scope.ts, packages/lite/src/equality.ts, packages/lite/tests/scope.test.ts]
---

# Fix watch:true false cascades via shallow equality default

## Goal

Replace `Object.is` default in `watch:true` deps with shallow structural equality. Fixes #238 — atom factories returning new object literals cause spurious invalidation cascades.

## Work Breakdown

1. Create `packages/lite/src/equality.ts` — `shallowEqual` utility
2. Update `scope.ts:699` — swap `Object.is` → `shallowEqual`
3. Update existing bug-documenting test `scope.test.ts:2536` — `derivedCount` should be `1`
4. Add edge-case tests for `shallowEqual` behavior

## Risks

- Breaking change: code relying on identity semantics for objects stops cascading. Mitigation: pass `eq: Object.is` explicitly.
- Shallow only — nested object changes still require custom `eq`. This matches React's `shallowEqual` precedent.

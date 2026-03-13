---
id: adr-20260313-harden-lite-types-issue-241
title: Harden Lite Type Contracts for Issue 241
type: adr
status: implemented
date: 2026-03-13
affects: [packages/lite/src/types.ts, packages/lite/src/atom.ts, packages/lite/src/flow.ts, packages/lite/src/resource.ts, packages/lite/tests/type-contracts.ts]
---

# Harden Lite Type Contracts for Issue 241

## Goal

Remove the remaining gaps where `@pumped-fn/lite` accepts shapes that runtime rejects, and lock the intended public contracts with compile-only fixtures.

## Work Breakdown

1. Add compile-only fixtures covering invalid `watch:true` usage and context API misuse
2. Restrict `watch:true` controller deps so they are only legal in atom deps
3. Replace loose tag-like dep constraints with the real tag-executor contract
4. Verify with `bunx @typescript/native-preview --noEmit -p packages/lite/tsconfig.test.json` and targeted package tests

## Risks

- Type alias changes can accidentally regress inference for valid atom/flow/resource deps
- Compile-only fixtures must stay out of the runtime Vitest suite
- Tightening overloads may surface downstream misuse that was previously compiling by accident

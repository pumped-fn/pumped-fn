# Flow Tag Helper Reference

**Date**: 2025-11-17  
**Purpose**: Capture behavior of `mergeFlowTags` + dependency guard so future tasks reuse consistent pattern.

## Highlights
- `packages/next/src/tags/merge.ts` exports `mergeFlowTags(definitionTags?, executionTags?)`
  - Filters `undefined` entries
  - Returns `undefined` when both inputs empty (FlowContext receives no tags)
  - Preserves order `[definition..., execution...]`
- Flow execution touchpoints:
  - `packages/next/src/flow.ts` → `executeJournaledFlow` + `executeNonJournaledFlow`
  - `packages/next/src/scope.ts` → `Scope["~executeFlow"]`
- Tests guarding helper:
  - `packages/next/tests/scope-run.test.ts` suite `scope tag merging`
  - `packages/next/tests/flow-execution.test.ts` for spread + runtime tags

## Usage Checklist
1. Always source definition tags via `FlowDefinition.tags`
2. At runtime, wrap any additional `executionTags` with `mergeFlowTags`
3. Never mutate `FlowContext.tags` after creation; rely on helper to finalize list
4. When documenting tag flows, reference `mergeFlowTags` behavior (diagram in `docs/plans/2025-01-13-flow-tags-spread-syntax-design.md`)

---
id: c3-802
c3-version: 4
title: Transforms
type: component
category: foundation
parent: c3-8
goal: Rewrite older pumped-fn APIs into lite-compatible source by applying targeted AST transforms.
summary: >
  Jscodeshift transforms and helper modules for the codemod package.
---

# Transforms

## Goal

Rewrite older pumped-fn APIs into lite-compatible source by applying targeted AST
transforms.

## Container Connection

This component carries the actual migration logic. Without it, the container could
launch a codemod process and print reports, but it would not know how to rewrite any
source code from the older APIs to lite.

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | Codemod AST APIs | |
| IN (uses) | Edge-case collection for manual follow-up | c3-803 |
| OUT (provides) | Transform entrypoints and collector data | c3-8 |

## Code References

| File | Purpose |
|------|---------|
| `packages/codemod/src/transforms/core-next-to-lite.ts` | Main codemod entrypoint and orchestration |
| `packages/codemod/src/transforms/imports.ts` | Import rewrites onto lite packages |
| `packages/codemod/src/transforms/executors.ts` | Provide/derive executor rewrites |
| `packages/codemod/src/transforms/controller-methods.ts` | Controller helper rewrites |
| `packages/codemod/src/transforms/accessors.ts` | Accessor rewrites and edge-case capture |
| `packages/codemod/src/transforms/types.ts` | Type-level rewrite helpers and edge-case capture |

## Related Refs

No component-specific refs are documented for this surface yet.

## Layer Constraints

This component operates within these boundaries:

**MUST:**
- Focus on single responsibility within its domain
- Cite refs for patterns instead of re-implementing
- Hand off cross-component concerns to container

**MUST NOT:**
- Import directly from other containers (use container linkages)
- Define system-wide configuration (context responsibility)
- Orchestrate multiple peer components (container responsibility)
- Redefine patterns that exist in refs

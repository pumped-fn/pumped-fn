---
id: c3-502
c3-version: 4
title: HMR Runtime
type: component
category: foundation
parent: c3-5
goal: Maintain the hot-module atom registry and return stable atom references across reloads.
summary: >
  Runtime helper and types that preserve atom identity through import-meta hot data.
---

# HMR Runtime

## Goal

Maintain the hot-module atom registry and return stable atom references across reloads.

## Container Connection

This component makes the plugin's transform worthwhile. Without it, rewritten source
would still create fresh atom objects on every hot reload and the lite scope cache
would continue to miss.

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | Atom identity expectations | c3-2 |
| IN (uses) | Rewritten registration calls | c3-501 |
| OUT (provides) | Stable runtime registry and public HMR types | c3-5 |

## Code References

| File | Purpose |
|------|---------|
| `packages/lite-hmr/src/runtime.ts` | `__hmr_register()` registry implementation |
| `packages/lite-hmr/src/types.ts` | Registry and hot-data type contracts |

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

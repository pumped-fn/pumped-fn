---
id: c3-501
c3-version: 4
title: Vite Plugin
type: component
category: foundation
parent: c3-5
goal: Filter candidate modules and apply the build-time atom rewrite that injects stable HMR registration keys during development.
summary: >
  Vite-facing plugin entrypoint and AST rewrite coordination.
---

# Vite Plugin

## Goal

Filter candidate modules and apply the build-time atom rewrite that injects stable
HMR registration keys during development.

## Container Connection

This component is the development-time integration point for the container. Without it,
the package would have no Vite hook to detect eligible source files or to inject the
runtime registration wrapper that preserves atom identity.

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | Build tool plugin lifecycle | |
| IN (uses) | Stable atom registration helper | c3-502 |
| OUT (provides) | File filtering and AST rewrite entrypoint | c3-5 |

## Code References

| File | Purpose |
|------|---------|
| `packages/lite-hmr/src/index.ts` | Public plugin export |
| `packages/lite-hmr/src/plugin.ts` | Vite plugin implementation |
| `packages/lite-hmr/src/transform.ts` | AST parsing and rewrite logic |

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

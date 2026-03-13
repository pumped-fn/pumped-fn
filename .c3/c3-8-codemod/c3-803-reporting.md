---
id: c3-803
c3-version: 4
title: Reporting
type: component
category: foundation
parent: c3-8
goal: Collect migration edge cases and generate the markdown report that guides manual follow-up after a codemod run.
summary: >
  Collector and report generator for the codemod package.
---

# Reporting

## Goal

Collect migration edge cases and generate the markdown report that guides manual
follow-up after a codemod run.

## Container Connection

This component turns a raw rewrite run into something reviewable. Without it, users
would lose the collected edge cases, the migration summary, and the explicit prompts
for manual cleanup after the automated transforms finish.

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | Edge cases emitted by transform passes | c3-802 |
| OUT (provides) | Collector state and markdown report output | c3-8 |

## Code References

| File | Purpose |
|------|---------|
| `packages/codemod/src/report/collector.ts` | Edge-case collection and aggregate stats |
| `packages/codemod/src/report/generator.ts` | Markdown report rendering |
| `packages/codemod/src/report/types.ts` | Reporting data contracts |

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

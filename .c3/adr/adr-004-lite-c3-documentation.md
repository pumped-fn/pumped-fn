---
id: ADR-004-lite-c3-documentation
title: C3 Documentation Structure for @pumped-fn/lite
summary: >
  Create Container and Component level C3 documentation for @pumped-fn/lite
  to make the package consumer-ready with clear architecture documentation.
status: accepted
date: 2025-11-28
---

# [ADR-004] C3 Documentation Structure for @pumped-fn/lite

## Status {#adr-004-status}
**Accepted** - 2025-11-28

## Problem/Requirement {#adr-004-problem}

The `@pumped-fn/lite` package is ready for npm release but lacks proper C3 architecture documentation:

**Current state:**
- ADR-002: Describes initial package design decisions
- ADR-003: Describes controller-based reactivity additions
- Context README: Lists lite in Containers table, points to ADRs
- **Missing**: Container-level docs (`c3-2-lite/`)
- **Missing**: Component-level docs for internal modules

**Consumer needs:**
- Clear understanding of package architecture
- API reference organized by component
- Migration guidance from core-next
- Usage patterns for common scenarios

## Exploration Journey {#adr-004-exploration}

**Hypothesis:** Create c3-2-lite/ mirroring the c3-1-core/ structure.

**Explored source structure:**
```
packages/lite/src/
├── index.ts      # Public exports
├── types.ts      # Lite namespace with all interfaces
├── symbols.ts    # Unique symbols for type guards
├── atom.ts       # atom(), controller(), isAtom(), isControllerDep()
├── flow.ts       # flow(), isFlow()
├── tag.ts        # tag(), tags, isTag(), isTagged()
├── preset.ts     # preset(), isPreset()
└── scope.ts      # createScope(), Scope, ExecutionContext, Controller
```

**Component mapping (based on responsibilities):**

| Source File | Component ID | Responsibility |
|-------------|--------------|----------------|
| scope.ts | c3-201 | Core DI - Scope, Controller, ExecutionContext |
| atom.ts | c3-202 | Atom definition and controller dependency |
| flow.ts | c3-203 | Flow execution pattern |
| tag.ts | c3-204 | Metadata tagging system |
| preset.ts | c3-205 | Value/atom preset injection |
| types.ts + symbols.ts | (in c3-2 README) | Type definitions, not separate component |

**Comparison with c3-1-core structure:**
- c3-1 has 8 components (c3-101 to c3-108)
- c3-2 needs 5 components (simpler package, fewer features)
- Extension is documented in c3-2 README (simple interface, no separate component needed)

## Solution {#adr-004-solution}

### Container Documentation: c3-2-lite/

Create `c3-2-lite/README.md` with:
- Overview of lightweight DI philosophy
- Technology stack (tsdown, vitest, zero deps)
- Component relationships diagram
- Data flow through scope/controller/context
- Public API summary
- Comparison with core-next

### Component Documentation

| ID | File | Title | Focus |
|----|------|-------|-------|
| c3-201 | c3-201-scope.md | Scope & Controller | DI container, resolution, lifecycle states, reactivity |
| c3-202 | c3-202-atom.md | Atom | Long-lived dependency, factory pattern, controller dep |
| c3-203 | c3-203-flow.md | Flow & ExecutionContext | Request handling, context lifecycle |
| c3-204 | c3-204-tag.md | Tag System | Metadata attachment, required/optional/all modes |
| c3-205 | c3-205-preset.md | Preset | Value injection, atom redirection |

### ID Numbering Scheme

Following C3 naming convention:
- `c3-2` = Container 2 (lite package)
- `c3-2XX` = Components within Container 2
- Starting at 201 (not 200) to leave room for container-level anchors

## Changes Across Layers {#adr-004-changes}

### Context Level (c3-0)
- Update Containers table to point to `[c3-2-lite](./c3-2-lite/)` instead of ADRs

### Container Level
- Create `.c3/c3-2-lite/README.md`

### Component Level
- Create `.c3/c3-2-lite/c3-201-scope.md`
- Create `.c3/c3-2-lite/c3-202-atom.md`
- Create `.c3/c3-2-lite/c3-203-flow.md`
- Create `.c3/c3-2-lite/c3-204-tag.md`
- Create `.c3/c3-2-lite/c3-205-preset.md`

### TOC
- Regenerate TOC to include new c3-2 container and components

## Implementation Plan {#adr-004-plan}

### Code Changes

| Layer Change | Code Location | Description |
|--------------|---------------|-------------|
| Context (c3-0) | `.c3/README.md:71` | Update lite container link |
| Container (c3-2) | `.c3/c3-2-lite/README.md` | New file: container overview |
| Component c3-201 | `.c3/c3-2-lite/c3-201-scope.md` | New file: Scope, Controller, ExecutionContext |
| Component c3-202 | `.c3/c3-2-lite/c3-202-atom.md` | New file: atom(), controller() |
| Component c3-203 | `.c3/c3-2-lite/c3-203-flow.md` | New file: flow(), ExecutionContext |
| Component c3-204 | `.c3/c3-2-lite/c3-204-tag.md` | New file: tag(), tags helpers |
| Component c3-205 | `.c3/c3-2-lite/c3-205-preset.md` | New file: preset() |
| TOC | `.c3/TOC.md` | Regenerate via build-toc.sh |

### Dependencies

1. Create c3-2-lite directory
2. Create container README (can reference ADR-002, ADR-003)
3. Create component docs (can be parallel)
4. Update context README
5. Regenerate TOC (depends on all above)

### Acceptance Criteria

| Verification Item | Test |
|-------------------|------|
| Container doc exists | `test -f .c3/c3-2-lite/README.md` |
| All 5 components exist | `ls .c3/c3-2-lite/c3-20*.md \| wc -l` = 5 |
| Context links updated | `grep "c3-2-lite" .c3/README.md` |
| TOC includes c3-2 | `grep "c3-2" .c3/TOC.md` |
| No duplicate IDs | All c3-2XX IDs unique |

## Verification {#adr-004-verification}

- [ ] Container README created with all required sections
- [ ] Component docs created for scope, atom, flow, tag, preset
- [ ] Context README updated to link to c3-2-lite
- [ ] TOC regenerated and includes new documents
- [ ] Document IDs follow c3-2XX scheme
- [ ] API examples match current implementation

## Related {#adr-004-related}

- [ADR-002](./adr-002-lightweight-lite-package.md) - Original package design
- [ADR-003](./adr-003-controller-reactivity.md) - Controller reactivity design
- [c3-1-core](../c3-1-core/) - Reference structure for documentation pattern

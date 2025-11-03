# Skill Examples Extraction Plan

**Date:** 2025-11-03
**Status:** Complete (Task 10 pending: markdown updates)
**Author:** Claude + User

## Problem

250+ code blocks across 14 pumped-design sub-skills need verification:
- No type checking on inline code in markdown
- Tag API errors similar to extension-authoring (30+ errors found)
- Code can drift from actual library API
- Hard to maintain quality across skills

## Solution

Extract code blocks to TypeScript files (max 500 LOC each) using grep-friendly references.

## File Structure

```
.claude/skills/pumped-design/examples/skill-examples/
├── package.json          # Already exists (@pumped-fn/skill-examples)
├── tsconfig.json         # Already exists (strict mode)
├── resources.ts          # ~400 LOC: basic, derived, lazy patterns
├── flows.ts              # ~350 LOC: context, subflows, orchestration
├── extensions.ts         # ~450 LOC: existing 4 + basics patterns
├── integrations.ts       # ~400 LOC: hono, nextjs, tanstack
├── testing.ts            # ~300 LOC: utilities, flows, e2e
├── entrypoints.ts        # ~250 LOC: scope, lifecycle, structure
├── correlation-tracker.ts # Keep existing examples
├── rate-limiter.ts
├── apm-integration.ts
├── tenant-isolation.ts
└── README.md
```

**Total:** ~10 files (~2150 LOC new + 4 existing)

## Extraction Strategy

### Priority Order (High-impact first)
1. **flows.ts** - Most used skill (flow-context, flow-subflows)
2. **resources.ts** - Core building blocks (basic, derived, lazy)
3. **entrypoints.ts** - Entry point to pumped-fn apps
4. **integrations.ts** - Framework integration (hono, nextjs, tanstack)
5. **testing.ts** - Testing patterns (utilities, flows, integration)
6. **extensions.ts** - Merge with existing 4 examples

### Extraction Process
1. **Extract first, batch fix** - Extract all code blocks, then typecheck and fix errors together
2. **Grep-friendly naming** - Use descriptive function/const names for easy reference
3. **File headers** - Each example has comment with skill reference

### Example Structure

```typescript
/**
 * Basic Resource Pattern
 *
 * Demonstrates standalone resource with config and lifecycle.
 *
 * Referenced in: .claude/skills/pumped-design/references/resource-basic.md
 * Section: Creating Your First Resource
 */
export const basicConfigResource = resource({
  name: 'config',
  init: () => ({ apiUrl: process.env.API_URL })
})
```

## Skill Markdown Updates

After extraction, update skill markdown to reference TypeScript identifiers:

**Before:**
```markdown
### Example: Basic Resource
\`\`\`typescript
const config = resource({ name: 'config', init: () => ({ ... }) })
\`\`\`
```

**After:**
```markdown
### Example: Basic Resource

See: `basicConfigResource` in skill-examples/resources.ts

\`\`\`typescript
const config = resource({ name: 'config', init: () => ({ ... }) })
\`\`\`
```

**AI Usage:** AI sees "basicConfigResource" → greps `skill-examples/*.ts` → finds exact file:line

## Expected Issues

Based on extension-authoring extraction:
- Tag API usage errors (tag vs tag.key)
- Context access patterns (ctx vs operation.context)
- Type assertions that need proper narrowing
- Missing imports

## Success Criteria

- ✅ All code blocks extracted to TypeScript files
- ✅ Max 500 LOC per file maintained
- ✅ All files typecheck with `pnpm --filter "@pumped-fn/skill-examples" typecheck`
- ⏳ Skill markdown updated with grep references (Task 10)
- ✅ File headers reference source skills

## Final File Inventory

Extracted 13 TypeScript files from 250+ code blocks across 14 sub-skills:

| File | LOC | Source Skills |
|------|-----|---------------|
| flows-context.ts | 364 | flow-context.md |
| flows-subflows.ts | 373 | flow-subflows.md |
| resources-basic.ts | 190 | resource-basic.md |
| resources-derived.ts | 276 | resource-derived.md |
| resources-lazy.ts | 302 | resource-lazy.md |
| entrypoints.ts | 419 | entrypoint-scope.md, entrypoint-lifecycle.md, entrypoint-structure.md |
| integrations-hono.ts | 482 | integration-hono.md |
| integrations-nextjs.ts | 323 | integration-nextjs.md |
| integrations-tanstack.ts | 206 | integration-tanstack.md |
| testing-utilities.ts | 435 | testing-utilities.md |
| testing-flows.ts | 407 | testing-flows.md |
| testing-integration.ts | 242 | testing-integration.md |
| extensions.ts | 490 | extension-authoring.md + existing 4 examples |

**Total: 4,509 LOC** from 250+ code blocks

All files:
- ✅ Typecheck successfully
- ✅ Stay under 500 LOC limit
- ✅ Include file headers with source skill references
- ✅ Use grep-friendly naming conventions

## Related

- `docs/plans/2025-11-03-verifiable-skill-code-pattern.md` - Pattern documentation
- `.claude/skills/pumped-design/examples/skill-examples/` - Implementation directory

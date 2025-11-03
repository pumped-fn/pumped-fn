# Extract Skill Examples Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract 250+ code blocks from 14 pumped-design sub-skills into typechecked TypeScript files (max 500 LOC each)

**Architecture:** Extract high-impact skills first (flows, resources, entrypoints), extract all code then batch fix type errors, use grep-friendly function names for AI reference

**Tech Stack:** TypeScript 5.7, @pumped-fn/core-next, pnpm workspace

---

## Task 1: Extract flows.ts (flow-context.md + flow-subflows.md)

**Files:**
- Read: `.claude/skills/pumped-design/references/flow-context.md`
- Read: `.claude/skills/pumped-design/references/flow-subflows.md`
- Create: `.claude/skills/pumped-design/examples/skill-examples/flows.ts`

**Step 1: Extract code blocks from flow-context.md**

Read flow-context.md and extract all TypeScript code blocks. Identify examples:
- Basic context operations (ctx.run, ctx.exec)
- Context propagation patterns
- Tag usage in flows
- Error handling with context
- Parallel execution

Expected: ~15-20 code examples

**Step 2: Extract code blocks from flow-subflows.md**

Read flow-subflows.md and extract all TypeScript code blocks. Identify examples:
- Flow calling other flows
- Orchestration patterns
- Data passing between flows
- Subflow error handling

Expected: ~10-15 code examples

**Step 3: Write flows.ts with all extracted examples**

Create flows.ts with:
- File header comment
- Imports from @pumped-fn/core-next
- Each example as exported const/function with descriptive name
- JSDoc comment referencing source skill and section

Template:
```typescript
/**
 * Flow Examples
 *
 * Extracted from flow-context.md and flow-subflows.md
 */

import { flow, tag, custom, type Flow } from '@pumped-fn/core-next'

/**
 * Basic Context Run Pattern
 *
 * Demonstrates ctx.run() for named execution segments.
 *
 * Referenced in: flow-context.md
 * Section: Basic Context Operations
 */
export const basicContextRun = flow({
  name: 'basic-context-run',
  handle: async (ctx, input: { value: number }) => {
    return ctx.run('calculate', () => {
      return { success: true, result: input.value * 2 }
    })
  }
})

// ... more examples
```

**Step 4: Verify file is under 500 LOC**

Run: `wc -l .claude/skills/pumped-design/examples/skill-examples/flows.ts`
Expected: Less than 500 lines

If over 500 LOC, split into flows-context.ts and flows-subflows.ts

**Step 5: Commit extraction (errors expected, will fix later)**

```bash
git add .claude/skills/pumped-design/examples/skill-examples/flows.ts
git commit -m "feat(skill): extract flows examples from flow-context and flow-subflows

- Extract ~25-35 code blocks into flows.ts
- Add descriptive function names for grep reference
- Add JSDoc with skill references
- Type errors expected, will batch fix after all extraction

Related: docs/plans/2025-11-03-skill-examples-extraction.md"
```

---

## Task 2: Extract resources.ts (resource-basic.md + resource-derived.md + resource-lazy.md)

**Files:**
- Read: `.claude/skills/pumped-design/references/resource-basic.md`
- Read: `.claude/skills/pumped-design/references/resource-derived.md`
- Read: `.claude/skills/pumped-design/references/resource-lazy.md`
- Create: `.claude/skills/pumped-design/examples/skill-examples/resources.ts`

**Step 1: Extract code blocks from resource-basic.md**

Read resource-basic.md and extract all TypeScript code blocks. Identify examples:
- Basic resource creation
- Config resources
- Lifecycle (init, dispose)
- Resource resolution

Expected: ~8-12 code examples

**Step 2: Extract code blocks from resource-derived.md**

Read resource-derived.md and extract all TypeScript code blocks. Identify examples:
- Resources with dependencies
- Derived resources (from other resources)
- Dependency injection patterns

Expected: ~10-15 code examples

**Step 3: Extract code blocks from resource-lazy.md**

Read resource-lazy.md and extract all TypeScript code blocks. Identify examples:
- .lazy modifier usage
- Conditional resolution
- Lazy caching patterns
- Performance optimization

Expected: ~12-18 code examples

**Step 4: Write resources.ts with all extracted examples**

Create resources.ts with:
- File header comment
- Imports from @pumped-fn/core-next
- Grouped by pattern: basic, derived, lazy
- Descriptive exported names

Template:
```typescript
/**
 * Resource Examples
 *
 * Extracted from resource-basic.md, resource-derived.md, resource-lazy.md
 */

import { resource, type Resource } from '@pumped-fn/core-next'

// ============================================================================
// BASIC RESOURCES
// ============================================================================

/**
 * Basic Config Resource
 *
 * Demonstrates standalone resource with initialization.
 *
 * Referenced in: resource-basic.md
 * Section: Creating Your First Resource
 */
export const basicConfigResource = resource({
  name: 'config',
  init: () => ({
    apiUrl: process.env.API_URL || 'http://localhost:3000'
  })
})

// ============================================================================
// DERIVED RESOURCES
// ============================================================================

// ... examples

// ============================================================================
// LAZY RESOURCES
// ============================================================================

// ... examples
```

**Step 5: Verify file is under 500 LOC**

Run: `wc -l .claude/skills/pumped-design/examples/skill-examples/resources.ts`
Expected: Less than 500 lines

**Step 6: Commit extraction**

```bash
git add .claude/skills/pumped-design/examples/skill-examples/resources.ts
git commit -m "feat(skill): extract resources examples from basic, derived, lazy

- Extract ~30-45 code blocks into resources.ts
- Grouped by pattern: basic, derived, lazy
- Add descriptive names for grep reference
- Type errors expected, will batch fix later

Related: docs/plans/2025-11-03-skill-examples-extraction.md"
```

---

## Task 3: Extract entrypoints.ts (entrypoint-patterns.md)

**Files:**
- Read: `.claude/skills/pumped-design/references/entrypoint-patterns.md`
- Create: `.claude/skills/pumped-design/examples/skill-examples/entrypoints.ts`

**Step 1: Extract code blocks from entrypoint-patterns.md**

Read entrypoint-patterns.md and extract all TypeScript code blocks. Identify examples:
- Scope creation
- Resource registration
- Extension registration
- Lifecycle management (dispose)
- Entrypoint structure patterns

Expected: ~20-30 code examples

**Step 2: Write entrypoints.ts with all extracted examples**

Create entrypoints.ts with:
- File header comment
- Imports from @pumped-fn/core-next
- Complete entrypoint patterns
- Scope lifecycle examples

Template:
```typescript
/**
 * Entrypoint Examples
 *
 * Extracted from entrypoint-patterns.md
 */

import { scope, resource, extension } from '@pumped-fn/core-next'

/**
 * Basic Entrypoint Pattern
 *
 * Demonstrates minimal scope creation and registration.
 *
 * Referenced in: entrypoint-patterns.md
 * Section: Your First Entrypoint
 */
export const basicEntrypoint = () => {
  const app = scope()

  // Register resources
  app.add(resource({ name: 'config', init: () => ({}) }))

  return app
}

// ... more examples
```

**Step 3: Verify file is under 500 LOC**

Run: `wc -l .claude/skills/pumped-design/examples/skill-examples/entrypoints.ts`
Expected: Less than 500 lines (should be ~250 LOC)

**Step 4: Commit extraction**

```bash
git add .claude/skills/pumped-design/examples/skill-examples/entrypoints.ts
git commit -m "feat(skill): extract entrypoint examples

- Extract ~20-30 code blocks into entrypoints.ts
- Scope lifecycle, resource/extension registration
- Type errors expected, will batch fix later

Related: docs/plans/2025-11-03-skill-examples-extraction.md"
```

---

## Task 4: Extract integrations.ts (integration-hono.md + integration-nextjs.md + integration-tanstack.md)

**Files:**
- Read: `.claude/skills/pumped-design/references/integration-hono.md`
- Read: `.claude/skills/pumped-design/references/integration-nextjs.md`
- Read: `.claude/skills/pumped-design/references/integration-tanstack.md`
- Create: `.claude/skills/pumped-design/examples/skill-examples/integrations.ts`

**Step 1: Extract code blocks from all three integration files**

Read all integration markdown files and extract TypeScript code blocks. Identify examples:
- Hono server setup with pumped-fn
- Next.js API routes integration
- TanStack Start integration
- Request/response handling
- Middleware patterns

Expected: ~15-20 code examples per framework = ~45-60 total

**Step 2: Write integrations.ts with all extracted examples**

Create integrations.ts with:
- File header comment
- Imports from @pumped-fn/core-next, hono, next, tanstack
- Grouped by framework: Hono, Next.js, TanStack
- Complete integration patterns

Template:
```typescript
/**
 * Framework Integration Examples
 *
 * Extracted from integration-hono.md, integration-nextjs.md, integration-tanstack.md
 */

import { scope, flow, resource } from '@pumped-fn/core-next'
import { Hono } from 'hono'
import type { NextApiRequest, NextApiResponse } from 'next'

// ============================================================================
// HONO INTEGRATION
// ============================================================================

/**
 * Basic Hono Server with Pumped
 *
 * Referenced in: integration-hono.md
 * Section: Setting Up Hono Server
 */
export const honoBasicSetup = () => {
  const app = new Hono()
  const pumped = scope()

  // ... integration code

  return app
}

// ============================================================================
// NEXT.JS INTEGRATION
// ============================================================================

// ... examples

// ============================================================================
// TANSTACK START INTEGRATION
// ============================================================================

// ... examples
```

**Step 3: Verify file is under 500 LOC**

Run: `wc -l .claude/skills/pumped-design/examples/skill-examples/integrations.ts`
Expected: Less than 500 lines

If over, split into integrations-http.ts (hono) and integrations-ssr.ts (next+tanstack)

**Step 4: Commit extraction**

```bash
git add .claude/skills/pumped-design/examples/skill-examples/integrations.ts
git commit -m "feat(skill): extract framework integration examples

- Extract ~45-60 code blocks from hono, nextjs, tanstack
- Grouped by framework
- Type errors expected, will batch fix later

Related: docs/plans/2025-11-03-skill-examples-extraction.md"
```

---

## Task 5: Extract testing.ts (testing-utilities.md + testing-flows.md + testing-integration.md)

**Files:**
- Read: `.claude/skills/pumped-design/references/testing-utilities.md`
- Read: `.claude/skills/pumped-design/references/testing-flows.md`
- Read: `.claude/skills/pumped-design/references/testing-integration.md`
- Create: `.claude/skills/pumped-design/examples/skill-examples/testing.ts`

**Step 1: Extract code blocks from all testing files**

Read all testing markdown files and extract TypeScript code blocks. Identify examples:
- preset() usage for dependencies
- Flow testing patterns
- Error branch testing
- Integration test setup
- E2E patterns

Expected: ~25-35 code examples total

**Step 2: Write testing.ts with all extracted examples**

Create testing.ts with:
- File header comment
- Imports from @pumped-fn/core-next
- Grouped by: utilities, flow testing, integration testing
- Complete test examples

Template:
```typescript
/**
 * Testing Examples
 *
 * Extracted from testing-utilities.md, testing-flows.md, testing-integration.md
 */

import { scope, flow, resource, preset } from '@pumped-fn/core-next'
import { describe, it, expect } from 'vitest'

// ============================================================================
// TESTING UTILITIES
// ============================================================================

/**
 * Basic Preset Usage
 *
 * Referenced in: testing-utilities.md
 * Section: Using preset() for Dependencies
 */
export const testWithPreset = () => {
  it('should use preset dependency', async () => {
    const app = scope()

    const mockDb = preset({ query: async () => ({ id: 1 }) })
    app.add(mockDb)

    // ... test code
  })
}

// ============================================================================
// FLOW TESTING
// ============================================================================

// ... examples

// ============================================================================
// INTEGRATION TESTING
// ============================================================================

// ... examples
```

**Step 3: Verify file is under 500 LOC**

Run: `wc -l .claude/skills/pumped-design/examples/skill-examples/testing.ts`
Expected: Less than 500 lines (should be ~300 LOC)

**Step 4: Commit extraction**

```bash
git add .claude/skills/pumped-design/examples/skill-examples/testing.ts
git commit -m "feat(skill): extract testing examples

- Extract ~25-35 code blocks from utilities, flows, integration
- Grouped by testing layer
- Type errors expected, will batch fix later

Related: docs/plans/2025-11-03-skill-examples-extraction.md"
```

---

## Task 6: Merge extension examples into extensions.ts

**Files:**
- Read: `.claude/skills/pumped-design/references/extension-basics.md`
- Read: `.claude/skills/pumped-design/examples/skill-examples/correlation-tracker.ts`
- Read: `.claude/skills/pumped-design/examples/skill-examples/rate-limiter.ts`
- Read: `.claude/skills/pumped-design/examples/skill-examples/apm-integration.ts`
- Read: `.claude/skills/pumped-design/examples/skill-examples/tenant-isolation.ts`
- Create: `.claude/skills/pumped-design/examples/skill-examples/extensions.ts`

**Step 1: Extract code blocks from extension-basics.md**

Read extension-basics.md and extract all TypeScript code blocks. Identify examples:
- Basic wrap() patterns
- Extension lifecycle (init, dispose)
- Operation types
- Observability patterns

Expected: ~15-20 code examples

**Step 2: Merge existing extension examples**

Copy content from:
- correlation-tracker.ts (Part 2 guided example)
- rate-limiter.ts (stateful pattern)
- apm-integration.ts (integration pattern)
- tenant-isolation.ts (context propagation)

These are already correct and typechecked.

**Step 3: Write extensions.ts combining basics + existing**

Create extensions.ts with:
- File header comment
- Section 1: Extension Basics (from extension-basics.md)
- Section 2: Advanced Patterns (from existing 4 files)
- All imports consolidated

Template:
```typescript
/**
 * Extension Examples
 *
 * Extracted from extension-basics.md + existing advanced patterns
 */

import { extension, tag, custom, type Extension, type Core } from '@pumped-fn/core-next'

// ============================================================================
// EXTENSION BASICS
// ============================================================================

/**
 * Basic Logging Extension
 *
 * Referenced in: extension-basics.md
 * Section: Your First Extension
 */
export const loggingExtension = extension({
  name: 'logging',
  wrap: (scope, next, operation) => {
    console.log(`[${operation.kind}] starting`)
    return next().then((result) => {
      console.log(`[${operation.kind}] completed`)
      return result
    })
  }
})

// ... more basics examples

// ============================================================================
// ADVANCED PATTERNS
// ============================================================================

// Copy correlation-tracker.ts content here
// Copy rate-limiter.ts content here
// Copy apm-integration.ts content here
// Copy tenant-isolation.ts content here
```

**Step 4: Verify file is under 500 LOC**

Run: `wc -l .claude/skills/pumped-design/examples/skill-examples/extensions.ts`
Expected: Less than 500 lines

**Step 5: Delete old standalone files**

```bash
git rm .claude/skills/pumped-design/examples/skill-examples/correlation-tracker.ts
git rm .claude/skills/pumped-design/examples/skill-examples/rate-limiter.ts
git rm .claude/skills/pumped-design/examples/skill-examples/apm-integration.ts
git rm .claude/skills/pumped-design/examples/skill-examples/tenant-isolation.ts
```

**Step 6: Commit consolidation**

```bash
git add .claude/skills/pumped-design/examples/skill-examples/extensions.ts
git commit -m "feat(skill): consolidate extension examples

- Merge extension-basics.md examples with existing 4 files
- Single extensions.ts with basics + advanced patterns
- Remove standalone files to reduce file pollution
- Type errors expected, will batch fix later

Related: docs/plans/2025-11-03-skill-examples-extraction.md"
```

---

## Task 7: Batch typecheck and fix all errors

**Files:**
- Modify: All `.claude/skills/pumped-design/examples/skill-examples/*.ts`

**Step 1: Run typecheck to see all errors**

Run: `pnpm --filter "@pumped-fn/skill-examples" typecheck`

Expected: Multiple type errors across all files

Save output to analyze error patterns:
```bash
pnpm --filter "@pumped-fn/skill-examples" typecheck 2>&1 | tee /tmp/typecheck-errors.txt
```

**Step 2: Categorize errors**

Analyze error patterns (based on extension-authoring experience):
1. Tag API errors (tag vs tag.key)
2. Missing imports
3. Type narrowing issues
4. Context access patterns (ctx vs operation.context)
5. Missing type annotations

**Step 3: Fix Tag API errors**

Search and fix tag usage:
- Change `tag.get(context)` → `context.get(tag.key)`
- Change `tag.set(context, value)` → `context.set(tag.key, value)`
- Only in extension wrap() - flows use Tag objects directly

**Step 4: Fix import errors**

Add missing imports:
```typescript
import { tag, custom, flow, resource, scope, extension, preset } from '@pumped-fn/core-next'
import type { Flow, Resource, Extension, Core } from '@pumped-fn/core-next'
```

**Step 5: Fix type narrowing**

Add proper type guards where needed:
```typescript
if (operation.kind === 'execute') {
  // TypeScript now knows operation is Execute type
}
```

**Step 6: Run typecheck again**

Run: `pnpm --filter "@pumped-fn/skill-examples" typecheck`
Expected: No errors

**Step 7: Commit fixes**

```bash
git add .claude/skills/pumped-design/examples/skill-examples/*.ts
git commit -m "fix(skill): resolve typecheck errors in all examples

Common fixes:
- Tag API: use tag.key for operation.context access
- Add missing imports
- Add type narrowing for operation kinds
- Fix type annotations

Verification: pnpm --filter '@pumped-fn/skill-examples' typecheck ✅

Related: docs/plans/2025-11-03-skill-examples-extraction.md"
```

---

## Task 8: Update README.md with file inventory

**Files:**
- Modify: `.claude/skills/pumped-design/examples/skill-examples/README.md`

**Step 1: Update file structure section**

Edit README.md to reflect new structure:

```markdown
## Structure

\`\`\`
skill-examples/
├── package.json          # References @pumped-fn/core-next
├── tsconfig.json         # Strict typechecking config
├── flows.ts             # Flow context + subflows patterns
├── resources.ts         # Basic, derived, lazy resources
├── entrypoints.ts       # Scope lifecycle and structure
├── integrations.ts      # Hono, Next.js, TanStack integration
├── testing.ts           # Utilities, flow, integration testing
├── extensions.ts        # Extension basics + advanced patterns
└── README.md            # This file
\`\`\`
```

**Step 2: Add file inventory with line counts**

Run and capture:
```bash
wc -l .claude/skills/pumped-design/examples/skill-examples/*.ts
```

Add to README:
```markdown
## File Inventory

| File | LOC | Source Skills |
|------|-----|---------------|
| flows.ts | ~350 | flow-context, flow-subflows |
| resources.ts | ~400 | resource-basic, resource-derived, resource-lazy |
| entrypoints.ts | ~250 | entrypoint-patterns |
| integrations.ts | ~400 | integration-hono, integration-nextjs, integration-tanstack |
| testing.ts | ~300 | testing-utilities, testing-flows, testing-integration |
| extensions.ts | ~450 | extension-basics, extension-authoring |

**Total:** ~2150 LOC extracted from 250+ code blocks
```

**Step 3: Commit README update**

```bash
git add .claude/skills/pumped-design/examples/skill-examples/README.md
git commit -m "docs(skill): update README with final file inventory

- Add file structure reflecting 6 consolidated files
- Add file inventory table with LOC counts
- Document source skills for each file

Related: docs/plans/2025-11-03-skill-examples-extraction.md"
```

---

## Task 9: Update plan document with completion status

**Files:**
- Modify: `docs/plans/2025-11-03-skill-examples-extraction.md`

**Step 1: Mark success criteria complete**

Update success criteria section:

```markdown
## Success Criteria

- ✅ All code blocks extracted to TypeScript files
- ✅ Max 500 LOC per file maintained
- ✅ All files typecheck with `pnpm --filter "@pumped-fn/skill-examples" typecheck`
- ⏳ Skill markdown updated with grep references (Task 10)
- ✅ File headers reference source skills
```

**Step 2: Add actual file inventory**

Add section:
```markdown
## Final File Inventory

| File | LOC | Code Blocks | Source Skills |
|------|-----|-------------|---------------|
| flows.ts | [actual] | ~30 | flow-context, flow-subflows |
| resources.ts | [actual] | ~40 | resource-basic, derived, lazy |
| entrypoints.ts | [actual] | ~25 | entrypoint-patterns |
| integrations.ts | [actual] | ~50 | hono, nextjs, tanstack |
| testing.ts | [actual] | ~30 | testing-utilities, flows, integration |
| extensions.ts | [actual] | ~40 | extension-basics, authoring |

**Total:** [actual] LOC, ~215 code blocks
```

**Step 3: Commit plan update**

```bash
git add docs/plans/2025-11-03-skill-examples-extraction.md
git commit -m "docs(plan): mark extraction tasks complete

- Update success criteria
- Add final file inventory
- Ready for Task 10: skill markdown updates

Related: docs/plans/2025-11-03-skill-examples-extraction.md"
```

---

## Task 10: Update skill markdown files with grep references

**Files:**
- Modify: All `.claude/skills/pumped-design/references/*.md` (14 files)

**Step 1: Update flow-context.md**

For each code example in flow-context.md, add grep reference:

Before:
```markdown
### Example: Basic Context Run
\`\`\`typescript
const myFlow = flow({ ... })
\`\`\`
```

After:
```markdown
### Example: Basic Context Run

See: `basicContextRun` in skill-examples/flows.ts

\`\`\`typescript
const myFlow = flow({ ... })
\`\`\`
```

**Step 2: Update flow-subflows.md**

Add grep references for all subflow examples.

**Step 3: Update resource-basic.md, resource-derived.md, resource-lazy.md**

Add grep references for all resource examples.

**Step 4: Update entrypoint-patterns.md**

Add grep references for all entrypoint examples.

**Step 5: Update integration-hono.md, integration-nextjs.md, integration-tanstack.md**

Add grep references for all framework integration examples.

**Step 6: Update testing-utilities.md, testing-flows.md, testing-integration.md**

Add grep references for all testing examples.

**Step 7: Update extension-basics.md**

Add grep references for all extension basics examples.

**Step 8: Verify all references are valid**

Run grep test to ensure all referenced identifiers exist:
```bash
# Extract all "See: `identifier`" references
grep -r "See: \`" .claude/skills/pumped-design/references/ | \
  sed 's/.*See: `\([^`]*\)`.*/\1/' | \
  while read identifier; do
    if ! grep -q "export.*$identifier" .claude/skills/pumped-design/examples/skill-examples/*.ts; then
      echo "ERROR: $identifier not found"
    fi
  done
```

Expected: No errors (all identifiers found)

**Step 9: Commit skill markdown updates**

```bash
git add .claude/skills/pumped-design/references/*.md
git commit -m "docs(skill): add grep references to all skill markdown

- Add 'See: identifier in skill-examples/file.ts' to 250+ code blocks
- Enables AI to grep for exact implementation
- All references verified to exist

Related: docs/plans/2025-11-03-skill-examples-extraction.md"
```

---

## Completion

**Verification checklist:**
- [ ] All 6 files created and under 500 LOC
- [ ] All files typecheck: `pnpm --filter "@pumped-fn/skill-examples" typecheck`
- [ ] All skill markdown updated with grep references
- [ ] README reflects final structure
- [ ] Plan document marked complete
- [ ] All commits follow conventional format

**Total commits:** ~10 commits (one per task)

**Final validation:**
```bash
# Verify typecheck
pnpm --filter "@pumped-fn/skill-examples" typecheck

# Count files
ls -1 .claude/skills/pumped-design/examples/skill-examples/*.ts | wc -l
# Expected: 6 files (flows, resources, entrypoints, integrations, testing, extensions)

# Verify LOC constraint
wc -l .claude/skills/pumped-design/examples/skill-examples/*.ts
# Expected: All files < 500 LOC

# Count grep references
grep -r "See: \`" .claude/skills/pumped-design/references/*.md | wc -l
# Expected: ~215 references (one per code block)
```

**Success criteria met when all checks pass.**

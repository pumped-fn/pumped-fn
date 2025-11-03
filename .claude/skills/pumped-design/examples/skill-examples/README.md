# Pumped-Design Skill TypeScript Examples

TypeScript examples for pumped-design skills that are **typechecked** to ensure correctness.

## Purpose

Skill markdown files can contain code errors. These TypeScript files:
1. Are actual source files that typecheck against `@pumped-fn/core-next`
2. Serve as grep-able reference implementations
3. Are referenced from the skill markdown with file paths

## Structure

```
skill-examples/
├── package.json               # References @pumped-fn/core-next
├── tsconfig.json              # Strict typechecking config
├── flows-context.ts           # Flow context patterns
├── flows-subflows.ts          # Flow subflows and orchestration
├── resources-basic.ts         # Basic resources
├── resources-derived.ts       # Derived resources with dependencies
├── resources-lazy.ts          # Lazy resources and caching
├── entrypoints.ts             # Scope lifecycle and structure
├── integrations-hono.ts       # Hono integration
├── integrations-nextjs.ts     # Next.js integration
├── integrations-tanstack.ts   # TanStack Start integration
├── testing-utilities.ts       # Utility testing patterns
├── testing-flows.ts           # Flow testing patterns
├── testing-integration.ts     # Integration testing patterns
├── extensions.ts              # Extension basics + advanced patterns
└── README.md                  # This file
```

## File Inventory

| File | LOC | Source Skills |
|------|-----|---------------|
| flows-context.ts | 364 | flow-context |
| flows-subflows.ts | 373 | flow-subflows |
| resources-basic.ts | 190 | resource-basic |
| resources-derived.ts | 276 | resource-derived |
| resources-lazy.ts | 302 | resource-lazy |
| entrypoints.ts | 419 | entrypoint-patterns |
| integrations-hono.ts | 482 | integration-hono |
| integrations-nextjs.ts | 323 | integration-nextjs |
| integrations-tanstack.ts | 206 | integration-tanstack |
| testing-utilities.ts | 435 | testing-utilities |
| testing-flows.ts | 407 | testing-flows |
| testing-integration.ts | 242 | testing-integration |
| extensions.ts | 490 | extension-basics, extension-authoring |

**Total:** 4,509 LOC extracted from 250+ code blocks across 14 sub-skills

## Usage

### Typecheck Examples

```bash
cd .claude/skills/pumped-design/examples/skill-examples
pnpm typecheck
```

Or from project root:
```bash
pnpm --filter "@pumped-fn/skill-examples" typecheck
```

### AI Usage Pattern

When AI reads a pumped-design skill:
1. Skill references file path (e.g., `correlation-tracker.ts`)
2. AI can grep for `correlation-tracker.ts` to find exact implementation
3. AI reads actual TypeScript file for correct, typechecked code

### Adding New Examples

1. Create TypeScript file in this directory
2. Add file header with:
   - Description
   - What it demonstrates
   - Reference to skill section
3. Ensure `pnpm typecheck` passes
4. Reference file path in skill markdown

## Pattern for All Skills

This pattern should be applied to all skills with code examples:

```
.claude/skills/
  <skill-name>/
    SKILL.md or references/
    examples/
      <topic>/
        package.json    # Workspace reference to library
        tsconfig.json   # Strict typechecking
        *.ts           # Typechecked examples
        README.md      # Usage instructions
```

**Benefits:**
- Code quality guaranteed by TypeScript compiler
- Easy for AI to find and use correct patterns
- Prevents skill documentation from becoming stale
- Real examples that can be copied and tested

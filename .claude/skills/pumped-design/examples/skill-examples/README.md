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
├── package.json          # References @pumped-fn/core-next
├── tsconfig.json         # Strict typechecking config
├── correlation-tracker.ts  # Extension authoring: Guided example
├── rate-limiter.ts        # Extension authoring: Stateful pattern
├── apm-integration.ts     # Extension authoring: Integration pattern
├── tenant-isolation.ts    # Extension authoring: Context propagation
└── README.md             # This file
```

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

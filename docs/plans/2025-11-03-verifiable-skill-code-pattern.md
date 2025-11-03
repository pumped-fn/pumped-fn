# Verifiable Skill Code Pattern

**Date:** 2025-11-03
**Status:** Proposed
**Author:** Claude + User

## Problem

Skills contain code examples that can become stale or incorrect:
- No type checking on inline code in markdown
- Easy for examples to drift from actual API
- Hard to maintain code quality across skills
- AI might use outdated patterns

## Solution

Store skill code examples as actual TypeScript files that can be typechecked against the library.

## Pattern Structure

```
.claude/skills/
  <skill-name>/
    SKILL.md or references/*.md    # Skill documentation
    examples/
      <topic>/
        package.json      # Links to actual library package
        tsconfig.json     # Strict typechecking config
        *.ts              # Typechecked example files
        README.md         # Usage instructions
```

## Implementation Example

See `.claude/skills/pumped-design/examples/extension-authoring/` for reference.

### Directory Contents

**package.json:**
```json
{
  "name": "@pumped-fn/skill-extension-examples",
  "private": true,
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@pumped-fn/core-next": "link:../../../packages/next",
    "typescript": "^5.7.2"
  }
}
```

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "module": "esnext",
    "target": "es2022"
  },
  "include": ["*.ts"]
}
```

**Example file header:**
```typescript
/**
 * <Example Name>
 *
 * <Description of what it demonstrates>
 * Demonstrates: <Key patterns>
 *
 * Referenced in: <path-to-skill-file.md>
 * Section: <section-name>
 */
```

### Workspace Integration

Add to `pnpm-workspace.yaml`:
```yaml
packages:
  - '.claude/skills/*/examples/*'
```

### Verification

```bash
# Typecheck all skill examples
pnpm --filter "@pumped-fn/skill-*" typecheck

# Typecheck specific skill
pnpm --filter @pumped-fn/skill-extension-examples typecheck
```

## Benefits

1. **Type Safety** - Examples guaranteed to compile
2. **Grep-able** - AI can find examples by file name
3. **Maintainable** - Breaking API changes caught by typecheck
4. **Trustworthy** - Examples are real, working code
5. **Testable** - Can add unit tests for examples

## AI Usage Pattern

When AI reads skill:
1. Skill markdown references file path (e.g., `correlation-tracker.ts`)
2. AI greps for `correlation-tracker.ts` in skill examples
3. AI reads actual typechecked TypeScript file
4. AI uses verified, current API patterns

## Example References in Markdown

In skill markdown:
```markdown
### Complete Example: Request Correlation Tracker

See: `.claude/skills/pumped-design/examples/extension-authoring/correlation-tracker.ts`

\`\`\`typescript
// Reference implementation (typechecked)
import { extension, type Extension, type Core } from '@pumped-fn/core-next'
...
\`\`\`
```

## Current Limitations

### Module Resolution (TODO)

TypeScript path resolution from examples/ to packages/ needs configuration work:
- `link:` in package.json doesn't create node_modules
- `paths` in tsconfig.json not resolving correctly
- May need pnpm workspace adjustments

**Workaround for now:**
- Examples are structurally correct TypeScript
- Will typecheck once module resolution fixed
- Still valuable as grep-able reference implementations

### Future Improvements

1. Fix module resolution (workspace or paths config)
2. Add CI step to verify all skill examples typecheck
3. Add unit tests for skill examples
4. Generate skill markdown from TypeScript (single source of truth)

## Adoption Guidelines

### When to Use

Use this pattern for:
- API usage examples
- Complete feature implementations
- Complex patterns requiring type safety
- Code that changes frequently

### When NOT to Use

Skip this pattern for:
- Simple conceptual examples
- Pseudo-code or simplified illustrations
- Examples spanning multiple incompatible environments

### Migration Path

For existing skills:
1. Create `examples/<topic>/` directory
2. Extract code examples to `.ts` files
3. Add package.json + tsconfig.json
4. Run typecheck, fix errors
5. Update skill markdown to reference files
6. Add to pnpm workspace

## Success Criteria

Pattern is successful when:
- ✅ Examples are actual TypeScript files
- ✅ Skill markdown references file paths
- ✅ AI can grep for examples
- ⏳ Examples typecheck (blocked by module resolution)
- ⏳ CI fails if examples don't typecheck

## Related

- `.claude/skills/pumped-design/examples/extension-authoring/` - First implementation
- `.claude/skills/pumped-design/references/extension-authoring.md` - References examples

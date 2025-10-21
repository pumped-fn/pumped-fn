# Pumped-fn TypeScript Skill

Auto-activating skill for `@pumped-fn/core-next` that ensures type-safe, pattern-consistent code.

## What it does

- Detects `@pumped-fn/core-next` imports
- Enforces type safety (no `any`/`unknown`/casting)
- Guides dependency modifier usage (`.reactive()`, `.lazy()`, `.static()`)
- Ensures proper tag system usage
- Separates scope vs flow lifecycle
- References canonical examples from `/examples`

## How it works

The skill automatically activates when it detects pumped-fn imports. It applies 3-tier pattern checking:

1. **Tier 1 (Critical)**: Blocks until fixed - type safety, dependency modifiers, tags, lifecycle
2. **Tier 2 (Important)**: Strong warnings - flow patterns, meta usage, extensions
3. **Tier 3 (Best Practices)**: Educational suggestions - testing, organization, error handling

## Examples

All guidance references canonical examples in `examples/`:
- `basic-handler.ts` - Simple patterns
- `type-inference.ts` - Type safety
- `reactive-updates.ts` - Reactivity
- `scope-lifecycle.ts` - Long-running resources
- `flow-composition.ts` - Short-span operations
- `tags-foundation.ts` - Tag system
- And 7 more...

## Pattern Reference

See `pattern-reference.md` for quick pattern → example mapping.

## Focus Areas

The skill focuses on the three hardest concepts:
1. Graph resolution model (vs imperative/OOP)
2. Dependency declaration with modifiers
3. Type inference without escape hatches

## Enforcement Style

Strong suggestions with examples, but allows overrides with justification. The goal is high-quality code, not rigid rules.

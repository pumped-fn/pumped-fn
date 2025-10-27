# Pumped-fn Claude Code Plugin

Comprehensive TypeScript guidance for `@pumped-fn/core-next` development.

## Installation

```bash
/plugin lagz0ne/pumped-fn
```

This installs the pumped-fn skill that auto-activates when working with `@pumped-fn/core-next` code.

## What It Does

Provides comprehensive support for pumped-fn TypeScript development:

### 🎯 Advice & Guidance
- Code composition patterns (executors, scopes, flows)
- Dependency management (`.reactive()`, `.lazy()`, `.static()`)
- Scope vs Flow lifecycle decisions
- Extension vs executor choices

### 🔍 Troubleshooting
- Graph resolution issues
- Reactivity debugging
- Type inference problems
- Lifecycle management bugs

### ✅ Code Review & Validation
- 3-tier pattern enforcement (Critical/Important/Best Practices)
- Type safety checks (no `any`/`unknown`/casting)
- Dependency modifier validation
- Tag system usage verification

### 🧪 Testing Support
- Graph swapping patterns
- Mock strategies
- Test scope setup
- Isolation techniques

### 📚 API Usage
- Right API for the job (provide/derive/executor)
- Type inference preservation
- Meta/tag configuration

### 🚫 Anti-pattern Detection
- Type escape hatches
- Missing reactivity
- String-based tags
- Lifecycle violations

## Auto-Activation

The skill automatically activates when it detects:
```typescript
import { ... } from '@pumped-fn/core-next'
```

No manual activation needed - just start coding!

## Pattern Enforcement

### Tier 1: Critical (Blocks until fixed)
- Type safety: No `any`, `unknown`, or casting
- Dependency modifiers: Correct `.reactive()`, `.lazy()`, `.static()` usage
- Tag system: Type-safe tags via `tag()` helper
- Lifecycle: Proper scope vs flow separation

### Tier 2: Important (Strong warnings)
- Flow patterns: Context management, sub-flows
- Extensions: Cross-cutting concerns
- Meta usage: Configuration via tags

### Tier 3: Best Practices (Educational)
- Testing patterns
- Code organization
- Error handling

## Examples

The skill references 13 canonical examples covering:
- Basic executor and scope setup
- Type inference patterns
- Reactive updates
- Scope lifecycle management
- Flow composition
- Database transactions
- Extension patterns
- Testing strategies
- Tag system usage
- Error handling
- Middleware chains
- Comprehensive real-world patterns

## Focus Areas

The skill focuses on the three hardest concepts:

1. **Graph resolution model** - Understanding dependency graphs vs imperative/OOP
2. **Dependency declaration** - Proper upstream relationships and modifiers
3. **Type inference** - Maintaining strict types without escape hatches

## Documentation

For more details:
- [Pumped-fn Documentation](https://github.com/lagz0ne/pumped-fn/tree/main/docs)
- [Skill README](../.claude/skills/pumped-fn-typescript/README.md)
- [Pattern Reference](../.claude/skills/pumped-fn-typescript/pattern-reference.md)

## Version

**1.0.0** - Tracks `@pumped-fn/core-next` patterns and best practices

## License

Same as pumped-fn monorepo

# Pumped-fn Project Instructions

# Prerequisites

This repo requires `c3-skill` and `superpowers` skill sets. If you encounter tool not found or skill not found related to c3 or superpowers, please have a look at ./troubleshooting.md

Diagrams mean a thousand words; make and use diagrams to communicate, make comments, give feedback, and request reviews.

# IMPORTANT

Always use /c3-skill:c3-use skill to start a session, that'll help with architecture understanding
Whenever attempting to make changes to the library, use /c3-skill:c3 to analyze and creating an ADR to address change

Prior to finish, always use /c3-skill:audit to up date corresponding docs

# Coding Style

- **NO `any`** - use `as unknown as TargetType` for intentional type violations
- **NEVER** inline `//` comments - code self-documents via naming
- **ALWAYS** TSDoc for public API (exports via packages/\*/src/index.ts)
- Group types using namespaces
- Use `import { type ... }` for type-only imports
- Never inline `import()`
- **Type guards**: use `symbol in obj` pattern, not duck typing

  ```typescript
  // YES: symbol-based guard
  const fooSymbol: unique symbol = Symbol.for("@pumped-fn/foo");
  function isFoo(x: unknown): x is Foo {
    return typeof x === "object" && x !== null && fooSymbol in x;
  }

  // NO: duck typing
  function isFoo(x: unknown): x is Foo {
    return "someMethod" in x && typeof x.someMethod === "function";
  }
  ```

# Library Typing Best Practices

## When `as unknown as` is Required

TypeScript cannot verify implementations of generic factory functions with conditional types.
This is a [known TypeScript limitation](https://github.com/microsoft/TypeScript/issues/33912).

**Use `as unknown as` for:**

1. **Generic factory functions** - When implementation signature differs from overloaded call signatures
2. **Conditional return types** - TypeScript can't narrow generic type parameters via control flow
3. **Consistent patterns** - Match existing codebase patterns (see atom.ts, flow.ts, tag.ts)

```typescript
// CORRECT: Factory with conditional deps type
export function atom<T, D extends Record<string, Dependency>>(
  config: AtomConfig<T, D>
): Atom<T> {
  return {
    [atomSymbol]: true,
    factory: config.factory as unknown as AtomFactory<T, Record<string, Dependency>>,
    deps: config.deps as unknown as Record<string, Dependency> | undefined,
  }
}
```

**Why not alternatives?**

| Alternative | Problem |
|-------------|---------|
| `any` | Violates zero-tolerance policy, loses all type safety |
| Single `as` | Fails - types not directly assignable |
| Runtime validation | Overkill for internal factory patterns |

## Type Safety Strategy

Since `as unknown as` bypasses compiler checks, ensure safety through:

1. **Function overloads** - Expose type-safe call signatures to consumers
2. **Comprehensive tests** - Test all type variations (with deps, without deps, etc.)
3. **Consistent patterns** - Follow established patterns in atom.ts/flow.ts/service.ts

```typescript
// Overload 1: No deps
export function atom<T>(config: { factory: () => T }): Atom<T>

// Overload 2: With deps
export function atom<T, D extends Record<string, Dependency>>(
  config: { deps: D; factory: (ctx, deps: InferDeps<D>) => T }
): Atom<T>

// Implementation: Uses as unknown as (type-safe via overloads + tests)
export function atom<T, D>(config: AtomConfig<T, D>): Atom<T> { ... }
```

## DX vs Type Safety Tradeoff

As library authors, prioritize consumer DX while maintaining internal discipline:

- **External API**: Full type inference, no assertions required by users
- **Internal implementation**: Use `as unknown as` where compiler can't help
- **Verification**: Tests validate what compiler cannot

# Coding Workflow

- Always use pnpm
- Typecheck before commit: `pnpm -F @pumped-fn/lite typecheck`
- Brainstorm before implementation

# Making Changes

API changes in packages/lite require updates to:

1. Implementation (packages/lite/src/)
2. Tests (packages/lite/tests/)
3. Docs (docs/)
4. **C3 docs** (.c3/c3-2-lite/) - if architecture changes

## Verification Commands

```bash
pnpm -F @pumped-fn/lite typecheck      # src types
pnpm -F @pumped-fn/lite typecheck:full # include tests
pnpm -F @pumped-fn/lite test           # run tests
```

## Before Opening a PR

1. Run `/c3-skill:c3-audit` - C3 docs MUST match code
2. Add changeset: `.changeset/<name>.md`
3. `grep -r "any" packages/lite/` - zero tolerance

**Test changes = C3 changes.** Update ALL `.c3/c3-2-lite/c3-20*.md` Testing sections.

## Public API Export Rules

**Pattern:**

- Direct re-exports: `export { X } from "./module"`
- Namespace exports via const (not `export * as`):
  ```typescript
  import * as moduleExports from "./module";
  const name: typeof moduleExports = moduleExports;
  export { name };
  ```

**Type exports:** Only types used in public function signatures.

# Plans Directory

- Location: `plans/` (project root)
- **NO** private paths (usernames, absolute paths)
- Use relative paths, `/tmp`, `${SUPERPOWERS_SKILLS_ROOT}`

# Priority

Library is GENERIC. No case-specific concepts in core API design.


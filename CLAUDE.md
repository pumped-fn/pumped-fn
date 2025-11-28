# Pumped-fn Project Instructions

# Prerequisites

This repo requires `c3-skill` and `superpowers` skill sets. If you encounter tool not found or skill not found related to c3 or superpowers, please have a look at ./troubleshooting.md

Diagrams meant thousand words, make and use diagram to communicate, making comment, making feedbacks and requesting review

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

# Coding Workflow

- Always use pnpm
- Typecheck before commit: `pnpm -F @pumped-fn/core-next typecheck`
- Brainstorm before implementation

# Making Changes

API changes in packages/next require updates to:

1. Implementation (packages/next/src/)
2. Tests (packages/next/tests/)
3. Examples (examples/)
4. Docs (docs/guides/)
5. **C3 docs** (.c3/c3-1-core/) - if architecture changes

## Verification Commands

```bash
pnpm -F @pumped-fn/core-next typecheck      # src types
pnpm -F @pumped-fn/core-next typecheck:full # include tests
pnpm -F @pumped-fn/core-next test           # run tests
pnpm -F @pumped-fn/examples typecheck       # examples
```

## Before Opening a PR

1. Run `/c3-skill:c3-audit` - C3 docs MUST match code
2. Add changeset: `.changeset/<name>.md`
3. `grep -r "any" packages/next/` - zero tolerance

**Test changes = C3 changes.** Update ALL `.c3/c3-1-core/c3-10*.md` Testing sections.

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

**Verification:** `pnpm -F @pumped-fn/core-next verify:public-docs` (release-only)

# Plans Directory

- Location: `plans/` (project root)
- **NO** private paths (usernames, absolute paths)
- Use relative paths, `/tmp`, `${SUPERPOWERS_SKILLS_ROOT}`

# Priority

Library is GENERIC. No case-specific concepts in core API design.

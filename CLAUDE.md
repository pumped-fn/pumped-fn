# Pumped-fn Project Instructions

# IMPORTANT
Always use /c3:c3-use skill to start a session, that'll help with architecture understanding


# Coding Style

- **NO `any`** - use `as unknown as TargetType` for intentional type violations
- **NEVER** inline `//` comments - code self-documents via naming
- **ALWAYS** TSDoc for public API (exports via packages/*/src/index.ts)
- Group types using namespaces
- Use `import { type ... }` for type-only imports
- Never inline `import()`

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
  import * as moduleExports from "./module"
  const name: typeof moduleExports = moduleExports
  export { name }
  ```

**Type exports:** Only types used in public function signatures.

**Verification:** `pnpm -F @pumped-fn/core-next verify:public-docs` (release-only)

# Plans Directory

- Location: `plans/` (project root)
- **NO** private paths (usernames, absolute paths)
- Use relative paths, `/tmp`, `${SUPERPOWERS_SKILLS_ROOT}`

# Priority

Library is GENERIC. No case-specific concepts in core API design.

# Pumped-fn Project Instructions

> Architecture documented in `.c3/` - Context/Container/Component documentation.

# Skills

- **CRITICAL:** Always use `superpowers:brainstorming` before code changes
- Project skills: `c3` (architecture docs), `superpowers` (development workflows)
- Architecture reference: `.c3/` (run `.c3/scripts/build-toc.sh` for index)

# Coding Style

- Strict typing: no `any`, `unknown` over casting
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

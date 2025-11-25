# Pumped-fn Project Instructions

# Prerequisites

This repo requires `c3-skill` and `superpowers` skill sets. If those cannot be found, install them first:

```bash
# Install c3-skill
/plugin marketplace add Lagz0ne/c3-skill
/plugin install c3-skill

# Install superpowers
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```

Verify installation with `/help` - you should see `/c3:*` and `/superpowers:*` commands available.

# IMPORTANT
Always use /c3:c3-use skill to start a session, that'll help with architecture understanding


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

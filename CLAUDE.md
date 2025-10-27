# Pumped-fn Project Instructions

> Pumped-fn skill active: Pattern enforcement, concepts, testing strategies handled by skill.
> This file: Project-specific overrides and workflow requirements.

# Skills

Project-scoped skills in `.claude/skills/`:

## Pumped-fn Specific Skills

- **pumped-fn** - Comprehensive guidance for building observable, testable TypeScript applications with @pumped-fn
  - Auto-activates for TypeScript projects
  - Covers entire development lifecycle (design, architecture, implementation, testing, troubleshooting)
  - Decision trees for API selection (provide, derive, flow, tags, Promised, scope)
  - Environment-specific guidance (HTTP, CLI, cron, React, Lambda)
  - Anti-pattern detection and corrections
  - Source of truth for marketplace skill

## Superpowers Skills (Upstream Copies)

- test-driven-development
- systematic-debugging
- verification-before-completion
- requesting-code-review
- brainstorming, writing-plans, executing-plans
- using-git-worktrees
- defense-in-depth
- condition-based-waiting

## Skill Use Cases

1. **Implementing features/extensions** - Skills guide correct pattern usage
2. **Creating examples** - Skills enforce consistency across examples
3. **Marketplace source** - pumped-fn-* skills published via claude-skill/plugin.json
4. **Project troubleshooting** - Skills catch anti-patterns and violations

## Updating Skills

Use `pnpm update-skills` to sync superpowers skills from upstream.
Manual review required before committing updates.

# Upmost important

Sacrifice English grammar for conciseness. Concrete and straightforward.
Use ast-grep where possible to search and replace code

# Plans directory

- use `plans/` (project root) for implementation plans
- plans are committed to git for reference
- **CRITICAL: plans MUST NOT include private/machine-specific information:**
  - NO usernames in paths (e.g., `/home/username/`)
  - NO absolute paths with user directories
  - USE relative paths for project files (`docs/guides/`, `examples/`)
  - USE `/tmp` for temporary file operations
  - USE `${SUPERPOWERS_SKILLS_ROOT}` for Claude skills/superpowers paths
  - USE environment variables or placeholders instead of hardcoded values
- before committing plans, verify no sensitive data (usernames, machine names, absolute paths)

# Coding style

- strict coding style, concrete reasonable naming
- **ALWAYS** guarantee no any, unknonw or casting to direct type required
- **ALWAYS** make sure typecheck pass/ or use tsc --noEmit to verify, especially tests
- **NEVER** add comments, most of the time those are codesmells (that's why it'll require comments)
- group types using namespace, less cluttered
- combine tests where possible, test running quite quickly, add test error message so it'll be easy to track from the stdout
- cleanup redundant codes, dead codes
- use `import { type ...}` where it's needed
- never use inline `import()`

# Priority

The library is meant to be GENERIC, it has its core, and extensions (plugins, middlewares). DO NOT bring case-specific concepts/api into the design of the library, the library is meant to be generic

# Coding workflow

- **ALWAYS** make sure typechecking passed, for both src code and tests code, to the directory you are working on
- **NEVER** use comment on code, code should be well named so the content explains for themseleves
- ALWAYS use pnpm, read to understand the project setting before hand
- use linebreak smartly to separate area of code with different meanings

# Making changes

To make change to the library, there are some details that'll need to be addressed as a completed workflow

Making API change in packages/next meant

- Potential change to docs (docs/guides/)
- Potential change to examples (examples/)
- Potential change to test (packages/next/tests/)
- **CRITICAL: Potential change to SKILL (.claude/skills/pumped-fn/SKILL.md)**

To keep things compact, economic, those should be planned as needed

## Checklist for API changes

When changing public API (types, function signatures, etc):

1. Update implementation in packages/next/src/
2. Update tests in packages/next/tests/
3. Update examples in examples/
4. Update documentation in docs/guides/
5. **ALWAYS check and update .claude/skills/pumped-fn/SKILL.md** - this is critical for skill accuracy
6. Verify all typechecks pass: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
7. Verify all tests pass: `pnpm -F @pumped-fn/core-next test`
8. Verify examples typecheck: `pnpm -F @pumped-fn/examples typecheck`

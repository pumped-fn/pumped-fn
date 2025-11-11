# Pumped-fn Project Instructions

> Pumped-design skill active: Pattern enforcement, architecture, testing strategies handled by skill.
> This file: Project-specific overrides and workflow requirements.

# Skills

- _IMPORTANT:_ Always use skill superpowers:brainstorming for all operations. If there's no skill like that, ask user to install obra/superpowers-marketplace prior to moving toward
- Current project skills is in `.claude/skills/`

## Pumped-design Skill

- **pumped-design** - Design, navigate, troubleshoot, and test pumped-fn backend applications
  - Strict organizational patterns (entrypoints, resources, flows, utilities)
  - Sub-skill architecture with on-demand pattern loading
  - Layer-specific testing strategies
  - Framework integration guides (Hono, Next.js, TanStack Start)
  - AI-assisted catalog system with mermaid diagrams
  - Type-safe error handling patterns
  - Source of truth for marketplace plugin

## Skill Use Cases

1. **Designing applications** - Phased design process with brainstorming integration
2. **Implementing features** - Sub-skills guide correct pattern usage
3. **Troubleshooting flows** - Catalog navigation with mermaid diagrams
4. **Testing** - Layer-specific strategies (utilities, flows, integration)
5. **Code reviews** - Enforce naming conventions and patterns

## External Skills

Use superpowers plugin from marketplace for general development workflows:

- test-driven-development, systematic-debugging, verification-before-completion
- requesting-code-review, brainstorming, writing-plans, executing-plans
- using-git-worktrees, defense-in-depth, condition-based-waiting

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

Making API change in packages/next means:

- Potential change to docs (docs/guides/)
- Potential change to examples (examples/)
- Potential change to test (packages/next/tests/)
- **CRITICAL: Potential change to SKILL (.claude/skills/pumped-design/references/)**

To keep things compact, economic, those should be planned as needed

## Checklist for API changes

When changing public API (types, function signatures, etc):

1. Update implementation in packages/next/src/
2. Update tests in packages/next/tests/
3. Update examples in examples/
4. Update documentation in docs/guides/
5. **ALWAYS check and update .claude/skills/pumped-design/references/** - critical for skill accuracy
6. Verify all typechecks pass: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
7. Verify all tests pass: `pnpm -F @pumped-fn/core-next test`
8. Verify examples typecheck: `pnpm -F @pumped-fn/examples typecheck`

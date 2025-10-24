# Pumped-fn Project Instructions

> Pumped-fn skill active: Pattern enforcement, concepts, testing strategies handled by skill.
> This file: Project-specific overrides and workflow requirements.

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

- Potential change to docs
- Potential change to examples
- Potential change to test
- Potential change to SKILL (claude-skill)

To keep things compact, economic, those should be planned as needed

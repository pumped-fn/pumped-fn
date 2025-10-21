# Claude Code Plugin for Pumped-fn Implementation Plan

> **For Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task.

**Goal:** Create distributable Claude Code plugin providing comprehensive TypeScript guidance for `@pumped-fn/core-next` with auto-activation and symlinked examples.

**Architecture:** Plugin in monorepo at `claude-skill/` with single comprehensive skill, symlinked examples from `/examples/http-server/`, installable via `/plugin` command.

**Tech Stack:** Claude Code plugin system, Markdown (skill definition), symlinks, JSON (plugin metadata)

---

## Task 1: Create Plugin Directory Structure

**Files:**
- Create: `/home/lagz0ne/dev/pumped-fn/claude-skill/`
- Create: `/home/lagz0ne/dev/pumped-fn/claude-skill/skills/`
- Create: `/home/lagz0ne/dev/pumped-fn/claude-skill/skills/pumped-fn-typescript/`

**Step 1: Create directories**

```bash
cd /home/lagz0ne/dev/pumped-fn
mkdir -p claude-skill/skills/pumped-fn-typescript
```

**Step 2: Verify structure**

Run: `ls -la /home/lagz0ne/dev/pumped-fn/claude-skill/`
Expected: Directory exists with `skills/` subdirectory

Run: `ls -la /home/lagz0ne/dev/pumped-fn/claude-skill/skills/`
Expected: `pumped-fn-typescript/` subdirectory exists

---

## Task 2: Write plugin.json Metadata

**Files:**
- Create: `/home/lagz0ne/dev/pumped-fn/claude-skill/plugin.json`

**Step 1: Create plugin.json**

```json
{
  "name": "pumped-fn",
  "version": "1.0.0",
  "description": "Comprehensive TypeScript guidance for @pumped-fn/core-next - auto-activating skill with pattern enforcement, troubleshooting, code review, testing support, and anti-pattern detection",
  "author": "lagz0ne",
  "repository": "https://github.com/lagz0ne/pumped-fn",
  "homepage": "https://github.com/lagz0ne/pumped-fn/tree/main/claude-skill",
  "skills": [
    "skills/pumped-fn-typescript"
  ],
  "tags": [
    "typescript",
    "graph-resolution",
    "dependency-injection",
    "reactive-programming",
    "code-quality"
  ],
  "minClaudeCodeVersion": "0.1.0"
}
```

**Step 2: Verify file created**

Run: `cat /home/lagz0ne/dev/pumped-fn/claude-skill/plugin.json`
Expected: Valid JSON with correct metadata

**Step 3: Validate JSON syntax**

Run: `cat /home/lagz0ne/dev/pumped-fn/claude-skill/plugin.json | python3 -m json.tool`
Expected: No syntax errors, pretty-printed output

---

## Task 3: Copy Skill Files from Superpowers

**Files:**
- Copy: `/home/lagz0ne/.config/superpowers/skills/skills/libraries/pumped-fn-typescript/SKILL.md` → `/home/lagz0ne/dev/pumped-fn/claude-skill/skills/pumped-fn-typescript/SKILL.md`
- Copy: `/home/lagz0ne/.config/superpowers/skills/skills/libraries/pumped-fn-typescript/pattern-reference.md` → `/home/lagz0ne/dev/pumped-fn/claude-skill/skills/pumped-fn-typescript/pattern-reference.md`
- Copy: `/home/lagz0ne/.config/superpowers/skills/skills/libraries/pumped-fn-typescript/README.md` → `/home/lagz0ne/dev/pumped-fn/claude-skill/skills/pumped-fn-typescript/README.md`

**Step 1: Copy SKILL.md**

```bash
cp /home/lagz0ne/.config/superpowers/skills/skills/libraries/pumped-fn-typescript/SKILL.md \
   /home/lagz0ne/dev/pumped-fn/claude-skill/skills/pumped-fn-typescript/SKILL.md
```

**Step 2: Copy pattern-reference.md**

```bash
cp /home/lagz0ne/.config/superpowers/skills/skills/libraries/pumped-fn-typescript/pattern-reference.md \
   /home/lagz0ne/dev/pumped-fn/claude-skill/skills/pumped-fn-typescript/pattern-reference.md
```

**Step 3: Copy README.md**

```bash
cp /home/lagz0ne/.config/superpowers/skills/skills/libraries/pumped-fn-typescript/README.md \
   /home/lagz0ne/dev/pumped-fn/claude-skill/skills/pumped-fn-typescript/README.md
```

**Step 4: Verify files copied**

Run: `ls -la /home/lagz0ne/dev/pumped-fn/claude-skill/skills/pumped-fn-typescript/`
Expected: SKILL.md, pattern-reference.md, README.md all present

---

## Task 4: Create Symlink to Examples

**Files:**
- Create: `/home/lagz0ne/dev/pumped-fn/claude-skill/skills/pumped-fn-typescript/examples` → symlink to `/home/lagz0ne/dev/pumped-fn/examples/http-server`

**Step 1: Create relative symlink**

```bash
cd /home/lagz0ne/dev/pumped-fn/claude-skill/skills/pumped-fn-typescript
ln -s ../../../examples/http-server examples
```

**Step 2: Verify symlink created**

Run: `ls -la /home/lagz0ne/dev/pumped-fn/claude-skill/skills/pumped-fn-typescript/`
Expected: `examples -> ../../../examples/http-server`

**Step 3: Test symlink resolves**

Run: `ls /home/lagz0ne/dev/pumped-fn/claude-skill/skills/pumped-fn-typescript/examples/`
Expected: Shows 13 .ts files from http-server examples

**Step 4: Verify symlink is relative**

Run: `readlink /home/lagz0ne/dev/pumped-fn/claude-skill/skills/pumped-fn-typescript/examples`
Expected: `../../../examples/http-server` (relative path, not absolute)

---

## Task 5: Update Paths in SKILL.md

**Files:**
- Modify: `/home/lagz0ne/dev/pumped-fn/claude-skill/skills/pumped-fn-typescript/SKILL.md`

**Step 1: Check for absolute paths**

Run: `grep -n "/home/lagz0ne/dev/pumped-fn/docs" /home/lagz0ne/dev/pumped-fn/claude-skill/skills/pumped-fn-typescript/SKILL.md`
Expected: Line 448 contains absolute path to docs

**Step 2: Update docs reference to relative path**

Find line 448:
```markdown
- Point to docs for deep dives: `/home/lagz0ne/dev/pumped-fn/docs/`
```

Replace with:
```markdown
- Point to docs for deep dives: See pumped-fn documentation at https://github.com/lagz0ne/pumped-fn/tree/main/docs
```

**Step 3: Verify no other absolute paths**

Run: `grep -n "/home/lagz0ne" /home/lagz0ne/dev/pumped-fn/claude-skill/skills/pumped-fn-typescript/SKILL.md`
Expected: No matches (or only in comments/examples if intentional)

**Step 4: Verify example references are correct**

The SKILL.md references examples like `examples/type-inference.ts`. Since we have `examples/` symlink, these paths are correct.

Run: `grep -c "examples/" /home/lagz0ne/dev/pumped-fn/claude-skill/skills/pumped-fn-typescript/SKILL.md`
Expected: Multiple matches (all the example references)

---

## Task 6: Create Plugin README

**Files:**
- Create: `/home/lagz0ne/dev/pumped-fn/claude-skill/README.md`

**Step 1: Write plugin README**

```markdown
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
- [Skill README](skills/pumped-fn-typescript/README.md)
- [Pattern Reference](skills/pumped-fn-typescript/pattern-reference.md)

## Version

**1.0.0** - Tracks `@pumped-fn/core-next` patterns and best practices

## License

Same as pumped-fn monorepo
```

**Step 2: Verify README created**

Run: `cat /home/lagz0ne/dev/pumped-fn/claude-skill/README.md | head -30`
Expected: Plugin README content visible

---

## Task 7: Test Local Plugin Installation

**Files:**
- Test: `/home/lagz0ne/dev/pumped-fn/claude-skill/`

**Step 1: Verify directory structure**

Run: `tree -L 3 /home/lagz0ne/dev/pumped-fn/claude-skill/`
Expected:
```
claude-skill/
├── plugin.json
├── README.md
└── skills/
    └── pumped-fn-typescript/
        ├── SKILL.md
        ├── pattern-reference.md
        ├── README.md
        └── examples -> ../../../examples/http-server
```

**Step 2: Validate plugin.json**

Run: `cat /home/lagz0ne/dev/pumped-fn/claude-skill/plugin.json | python3 -m json.tool`
Expected: Valid JSON structure

**Step 3: Test symlink resolution**

Run: `cat /home/lagz0ne/dev/pumped-fn/claude-skill/skills/pumped-fn-typescript/examples/basic-handler.ts | head -5`
Expected: TypeScript code visible (symlink works)

**Step 4: Verify skill has frontmatter**

Run: `head -10 /home/lagz0ne/dev/pumped-fn/claude-skill/skills/pumped-fn-typescript/SKILL.md`
Expected: YAML frontmatter with name, description, when_to_use, version

**Step 5: Document installation command**

The plugin will be installable via:
```bash
/plugin lagz0ne/pumped-fn
```

(Assuming GitHub repo is at github.com/lagz0ne/pumped-fn)

---

## Task 8: Commit Plugin to Pumped-fn Repo

**Files:**
- Add: `/home/lagz0ne/dev/pumped-fn/claude-skill/` (all files)

**Step 1: Check git status**

Run: `cd /home/lagz0ne/dev/pumped-fn && git status`
Expected: Untracked `claude-skill/` directory

**Step 2: Add all plugin files**

```bash
cd /home/lagz0ne/dev/pumped-fn
git add claude-skill/
```

**Step 3: Verify staged files**

Run: `git status`
Expected:
- claude-skill/plugin.json
- claude-skill/README.md
- claude-skill/skills/pumped-fn-typescript/SKILL.md
- claude-skill/skills/pumped-fn-typescript/pattern-reference.md
- claude-skill/skills/pumped-fn-typescript/README.md
- claude-skill/skills/pumped-fn-typescript/examples (symlink)

**Step 4: Commit with descriptive message**

```bash
git commit -m "feat: add Claude Code plugin for pumped-fn TypeScript

- Comprehensive skill covering guidance, troubleshooting, review, testing
- Auto-activates on @pumped-fn/core-next imports
- 3-tier pattern enforcement (critical/important/best-practices)
- Symlinked examples stay in sync with /examples/http-server
- Installable via /plugin lagz0ne/pumped-fn
- Includes pattern reference and documentation"
```

**Step 5: Verify commit**

Run: `git log -1 --stat`
Expected: Shows commit with 6 files added

**Step 6: Document next steps**

After pushing to GitHub, users can install via:
```bash
/plugin lagz0ne/pumped-fn
```

Or with specific path if plugin is in subdirectory:
```bash
/plugin lagz0ne/pumped-fn/claude-skill
```

---

## Task 9: Create .gitattributes for Symlink

**Files:**
- Create or modify: `/home/lagz0ne/dev/pumped-fn/.gitattributes`

**Step 1: Ensure symlinks are tracked correctly**

Git should track symlinks as symlinks, not as files. This is usually default, but we can ensure it:

```bash
cd /home/lagz0ne/dev/pumped-fn
echo "*.* text=auto" > .gitattributes
echo "claude-skill/skills/pumped-fn-typescript/examples symlink" >> .gitattributes
```

**Step 2: Verify symlink is tracked as symlink**

Run: `git ls-files -s claude-skill/skills/pumped-fn-typescript/examples`
Expected: Output starting with `120000` (mode for symlink)

**Step 3: Commit .gitattributes if created/modified**

```bash
git add .gitattributes
git commit -m "chore: ensure symlinks tracked correctly in claude-skill"
```

---

## Execution Complete

The Claude Code plugin is now:
- ✅ Structured in `/claude-skill/` directory
- ✅ Has valid `plugin.json` metadata
- ✅ Contains comprehensive skill with all capabilities
- ✅ Uses symlink to keep examples in sync
- ✅ Has plugin and skill READMEs
- ✅ Updated paths for portability
- ✅ Tested locally
- ✅ Committed to pumped-fn repo

Users can install via `/plugin lagz0ne/pumped-fn` once pushed to GitHub.

The skill provides:
- Auto-activation on `@pumped-fn/core-next` imports
- Comprehensive guidance (advice, troubleshooting, review, testing, API usage, anti-patterns)
- 3-tier pattern enforcement
- 13 canonical examples (synced via symlink)
- Pattern reference for quick lookup

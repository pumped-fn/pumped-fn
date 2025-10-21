# Automated Deadlink Detection Implementation Plan

> **For Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task.

**Goal:** Enable automated deadlink detection in VitePress and add CI validation to prevent broken documentation links.

**Architecture:** Enable VitePress built-in deadlink detection + GitHub Actions workflow to validate docs on every PR/push.

**Tech Stack:** VitePress, GitHub Actions, pnpm

---

## Task 1: Check Current VitePress Configuration

**Files:**
- Read: `docs/.vitepress/config.ts`

**Step 1: Read current config**

Check if `ignoreDeadLinks` is currently set.

**Step 2: Document current state**

Note the current value (true, false, array, or undefined).

**Step 3: Report findings**

Report back what the current deadlink handling configuration is.

---

## Task 2: Enable Deadlink Detection

**Files:**
- Modify: `docs/.vitepress/config.ts`

**Step 1: Update ignoreDeadLinks setting**

Set `ignoreDeadLinks: false` in the config object.

If the property doesn't exist, add it after the `base` property:

```typescript
export default withMermaid(defineConfig({
  title: "Pumped Functions",
  description: "Graph-based dependency resolution for TypeScript",
  base: "/pumped-fn/",
  ignoreDeadLinks: false,

  // ... rest of config
}))
```

**Step 2: Run build to detect broken links**

```bash
pnpm docs:build
```

Expected: Build should fail and show broken link errors

**Step 3: Capture broken links**

Save the list of all broken links reported by VitePress.

---

## Task 3: Fix Broken Links in index.md

**Files:**
- Modify: `docs/index.md`

**Step 1: Map old links to new structure**

Create mapping:
- `api.md` → `guides/01-executors-and-dependencies.md` (executors/scopes)
- `testings.md` → `patterns/testing-strategies.md`
- `how-does-it-work.md` → `guides/03-scope-lifecycle.md` (closest conceptual match)
- `graph-vs-traditional.md` → Remove (no replacement, delete references)
- `flow.md` → `guides/05-flow-basics.md`
- `accessor.md` → `guides/02-tags-the-type-system.md` (tags replaced accessors)
- `extensions.md` → `guides/09-extensions.md`
- `authoring.md` → Remove (no direct replacement)
- `meta.md` → `guides/02-tags-the-type-system.md` (meta merged into tags)

**Step 2: Update Documentation section**

Replace the "Documentation" section (lines ~123-139) with:

```markdown
## Documentation

### Getting Started

- [**Executors and Dependencies**](./guides/01-executors-and-dependencies.md) - Build your dependency graph
- [**Tags: The Type System**](./guides/02-tags-the-type-system.md) - Type-safe runtime data access
- [**Scope Lifecycle**](./guides/03-scope-lifecycle.md) - Manage long-running resources
- [**Type Inference Patterns**](./guides/04-type-inference-patterns.md) - Zero-annotation TypeScript

### Core Guides

- [**Flow Basics**](./guides/05-flow-basics.md) - Handle short-lived operations
- [**Flow Composition**](./guides/06-flow-composition.md) - Compose flows with ctx.exec
- [**Extensions**](./guides/09-extensions.md) - Cross-cutting concerns
- [**Error Handling**](./guides/10-error-handling.md) - Error boundaries and recovery

### Patterns

- [**Testing Strategies**](./patterns/testing-strategies.md) - Graph-based testing with presets
- [**HTTP Server Setup**](./patterns/http-server-setup.md) - Complete server lifecycle
- [**Database Transactions**](./patterns/database-transactions.md) - Transaction-per-flow pattern
- [**Middleware Composition**](./patterns/middleware-composition.md) - Extension pipelines

### Reference

- [**API Cheatsheet**](./reference/api-cheatsheet.md) - Quick API reference
- [**Common Mistakes**](./reference/common-mistakes.md) - Anti-patterns and fixes
- [**Error Solutions**](./reference/error-solutions.md) - TypeScript error mappings
```

**Step 3: Update Quick Navigation table**

Replace the "Quick Navigation" table (lines ~141-151) with:

```markdown
### Quick Navigation

| I want to...                  | Go to                                                           |
| ----------------------------- | --------------------------------------------------------------- |
| **Start building apps**       | [Executors and Dependencies](./guides/01-executors-and-dependencies.md) |
| **Add business logic**        | [Flow Basics](./guides/05-flow-basics.md)                      |
| **Manage context data**       | [Tags: The Type System](./guides/02-tags-the-type-system.md)  |
| **Build reusable components** | [Extensions](./guides/09-extensions.md)                        |
| **Add monitoring/logging**    | [Extensions](./guides/09-extensions.md)                        |
| **Test my application**       | [Testing Strategies](./patterns/testing-strategies.md)        |
| **Understand the concepts**   | [Scope Lifecycle](./guides/03-scope-lifecycle.md)              |
```

**Step 4: Verify build succeeds**

```bash
pnpm docs:build
```

Expected: Build completes successfully with no broken link errors

**Step 5: Commit changes**

```bash
git add docs/.vitepress/config.ts docs/index.md
git commit -m "docs: enable deadlink detection and fix index.md links

- Set ignoreDeadLinks: false in VitePress config
- Update documentation section to reference new guide structure
- Update quick navigation table with current links
- Remove references to deleted legacy documentation

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Create GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/docs-validation.yml`

**Step 1: Create workflow file**

```yaml
name: Documentation Validation

on:
  pull_request:
    paths:
      - 'docs/**'
      - 'examples/**'
  push:
    branches:
      - main
    paths:
      - 'docs/**'

jobs:
  validate-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: latest

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 'lts/*'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Build and validate documentation
        run: pnpm docs:build
```

**Step 2: Commit workflow**

```bash
git add .github/workflows/docs-validation.yml
git commit -m "ci: add documentation validation workflow

- Validates docs build on PRs and main pushes
- Catches broken links via VitePress deadlink detection
- Validates twoslash code blocks and example imports
- Uses latest stable versions (Node.js LTS, pnpm latest)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: Verify and Push Changes

**Files:**
- Check: All changes committed

**Step 1: Verify local build**

```bash
pnpm docs:build
```

Expected: Build succeeds with no errors

**Step 2: Check git status**

```bash
git status
```

Expected: Clean working tree, 2 commits ahead of origin

**Step 3: Push to remote**

```bash
git push origin main
```

Expected: Push succeeds

**Step 4: Verify GitHub Actions**

Check GitHub repository Actions tab to see if workflow runs successfully.

**Step 5: Report completion**

Report back:
- Build status (success/failure)
- Push status (success/failure)
- GitHub Actions status (if visible)
- Any issues encountered

---

## Success Criteria

- ✅ VitePress config has `ignoreDeadLinks: false`
- ✅ All links in `index.md` point to existing files
- ✅ `pnpm docs:build` succeeds locally
- ✅ GitHub Actions workflow created
- ✅ Changes pushed to remote
- ✅ CI runs on future PRs touching docs/

## Validation Commands

```bash
# Check for broken links
pnpm docs:build

# Verify config
grep ignoreDeadLinks docs/.vitepress/config.ts

# Verify workflow exists
ls -la .github/workflows/docs-validation.yml
```

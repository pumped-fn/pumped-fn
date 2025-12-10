# C3 Audit Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all C3 audit findings: regenerate TOC.md, fix c3-6 source listing, update ADR statuses.

**Architecture:** Direct file edits to C3 documentation. No code changes - documentation only.

**Tech Stack:** Markdown, bash (TOC script)

---

## Task 1: Fix c3-6 Source Listing (bin.ts → bin.tsx)

**Files:**
- Modify: `.c3/c3-6-lite-devtools-server/README.md:81`

**Step 1: Update the source listing**

Change line 81 from:
```
│   ├── bin.ts      # CLI entry point
```

To:
```
│   ├── bin.tsx     # CLI entry point
```

**Step 2: Verify the change**

Run: `grep "bin.tsx" .c3/c3-6-lite-devtools-server/README.md`
Expected: Match found showing `bin.tsx`

**Step 3: Commit**

```bash
git add .c3/c3-6-lite-devtools-server/README.md
git commit -m "docs(c3): fix bin.ts → bin.tsx in c3-6 source listing"
```

---

## Task 2: Update ADR-013 Status to Implemented

**Files:**
- Modify: `.c3/adr/adr-013-controller-set-update.md:8,15`

**Step 1: Update frontmatter status**

Change line 8 from:
```yaml
status: proposed
```

To:
```yaml
status: implemented
```

**Step 2: Update status section**

Change line 15 from:
```markdown
**Proposed** - 2025-12-03
```

To:
```markdown
**Implemented** - 2025-12-10
```

**Step 3: Verify implementation exists**

Run: `grep -n "set(value\|update(fn" packages/lite/src/scope.ts`
Expected: Lines 169 and 173 show set() and update() methods

**Step 4: Commit**

```bash
git add .c3/adr/adr-013-controller-set-update.md
git commit -m "docs(adr): update ADR-013 status to implemented"
```

---

## Task 3: Fix ADR-016 Frontmatter/Status Mismatch

**Files:**
- Modify: `.c3/adr/adr-016-hierarchical-execution-context.md:8`

**Step 1: Update frontmatter to match body**

The body says "Accepted" but frontmatter says "proposed". Change line 8 from:
```yaml
status: proposed
```

To:
```yaml
status: accepted
```

**Step 2: Verify hierarchical context is implemented**

Run: `grep -n "parent.*ExecutionContext" packages/lite/src/scope.ts`
Expected: Multiple matches showing parent/child context implementation

**Step 3: Commit**

```bash
git add .c3/adr/adr-016-hierarchical-execution-context.md
git commit -m "docs(adr): fix ADR-016 frontmatter status to accepted"
```

---

## Task 4: Regenerate TOC.md

**Files:**
- Execute: `.c3/scripts/build-toc.sh`
- Verify: `.c3/TOC.md` contains c3-6 entry

**Step 1: Run TOC build script**

Run: `cd /home/lagz0ne/dev/pumped-fn/.worktrees/http-transport && ./.c3/scripts/build-toc.sh`
Expected: Script completes without errors

**Step 2: Verify c3-6 is now in TOC**

Run: `grep -A3 "c3-6" .c3/TOC.md`
Expected: c3-6-lite-devtools-server entry with title and sections

**Step 3: Verify TOC timestamp updated**

Run: `head -6 .c3/TOC.md`
Expected: "Last generated:" shows today's date (2025-12-10)

**Step 4: Commit**

```bash
git add .c3/TOC.md
git commit -m "docs(c3): regenerate TOC.md with c3-6 entry"
```

---

## Task 5: Final Verification and Push

**Step 1: Run typecheck to ensure no breakage**

Run: `pnpm --filter @pumped-fn/lite-devtools-server typecheck`
Expected: No errors

**Step 2: Verify all C3 docs are consistent**

Run: `grep -l "c3-6" .c3/*.md .c3/**/*.md 2>/dev/null | wc -l`
Expected: At least 2 files (README.md and TOC.md)

**Step 3: Push all changes**

```bash
git push
```

**Step 4: Watch CI**

Run: `gh pr checks 192 --watch`
Expected: All checks pass

---

## Summary Checklist

- [ ] Task 1: c3-6 source listing fixed (bin.tsx)
- [ ] Task 2: ADR-013 status → implemented
- [ ] Task 3: ADR-016 frontmatter → accepted
- [ ] Task 4: TOC.md regenerated with c3-6
- [ ] Task 5: Verified and pushed

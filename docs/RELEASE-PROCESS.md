# Release Process

This document describes how to release pumped-fn packages and skills.

## Overview

Two independent release workflows:

1. **NPM Packages** - Automated via Changesets (core-next, react, devtools)
2. **Claude Skills** - Automated via GitHub Releases (pumped-fn skill zips)

## NPM Package Releases

### Process

Uses [Changesets](https://github.com/changesets/changesets) for version management.

**Steps:**

1. **Create changeset** when making changes:
   ```bash
   pnpm changeset
   # Select packages changed
   # Choose version bump (major/minor/patch)
   # Write change description
   ```

2. **Merge to main**: PR with changeset file

3. **Automatic version PR**: Changesets bot creates version bump PR

4. **Merge version PR**: Triggers npm publish + GitHub release

### Workflow

- **Trigger**: Merge to `main` branch
- **Workflow**: `.github/workflows/release.yml`
- **Actions**:
  - Builds packages
  - Runs tests
  - Creates version PR (if changesets pending)
  - Publishes to npm (when version PR merged)
  - Creates GitHub releases with changelogs

### Manual Publish (if needed)

```bash
# Build packages
pnpm build

# Publish (requires NPM_TOKEN)
pnpm changeset publish
```

## Claude Skills Releases

### Process

Automatic release when pumped-fn skill files change.

**Steps:**

1. **Update skill**: Modify `.claude/skills/pumped-fn/SKILL.md`

2. **Merge to main**: PR with skill changes

3. **Automatic release**: Workflow creates GitHub release with skill zip

### Workflow

- **Trigger**: Changes to `.claude/skills/pumped-fn/**` on `main`
- **Workflow**: `.github/workflows/package-skills.yml`
- **Actions**:
  - Detects changed skill files
  - Creates skill zips (standard Claude Code format)
  - Uploads to GitHub Actions artifacts (90-day retention)
  - Creates GitHub release with:
    - Tag: `skills-YYYYMMDD-HHMMSS`
    - Skill zip attached as asset
    - Installation instructions in release notes

### Installation

Users install via GitHub releases:

```bash
# Find latest skill release
gh release list --limit 5

# Download skill zip
gh release download skills-20251027-120000 --pattern "pumped-fn.zip"

# Extract to skills directory
unzip pumped-fn.zip -d ~/.claude/skills/
```

Or download manually from [Releases page](https://github.com/pumped-fn/pumped-fn/releases).

## Current Status

### Pending NPM Releases

Check for pending changesets:

```bash
ls .changeset/*.md
```

Current pending:
- `perf-tag-lookup.md` - Tag lookup performance optimization
- `perf-p0-optimizations.md` - Core performance improvements

### Latest Skill Release

Skills are released automatically when changed. Check [Releases](https://github.com/pumped-fn/pumped-fn/releases) for skill tags (`skills-*`).

## Known Issues

### Documentation Build Failures

**Issue**: Docs build fails due to TypeScript errors in code examples (Twoslash validation)

**Files affected**:
- `docs/guides/05-flow.md` - Old flow() API signatures
- `docs/guides/09-extensions.md` - Incomplete extension examples

**Impact**: Does not block NPM or skill releases (docs deployment skipped)

**Status**: Pre-existing, requires API documentation update

**Workaround**: CI checks pass for packages, docs errors isolated

## Troubleshooting

### NPM publish fails

1. Check NPM_TOKEN secret is configured
2. Verify package builds successfully: `pnpm build`
3. Check changeset files are valid: `pnpm changeset status`

### Skill release not created

1. Verify changes are in `.claude/skills/pumped-fn/**`
2. Check workflow run in Actions tab
3. Ensure merge was to `main` branch (not PR)

### Release conflicts

NPM and skill releases are independent:
- Changesets manages package versions
- Skills use timestamp-based tags
- No conflicts between workflows

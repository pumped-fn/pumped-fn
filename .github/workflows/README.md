# GitHub Actions Workflows

## package-skills.yml

Automatically packages pumped-fn skill as zip file when skill files are modified.

### Triggers

- **Push to main**: When `.claude/skills/pumped-fn/**` or `claude-skill/skills/pumped-fn/**` changes
- **Pull requests**: When pumped-fn skill files are modified in PRs

### Behavior

1. **Detects pumped-fn skill changes**: Monitors only pumped-fn skill directory (excludes superpowers copies)
2. **Validates structure**: Ensures `SKILL.md` exists in skill directory
3. **Creates zip file**: Packages pumped-fn skill directory in standard format
   - Format: `skill-name.zip` containing `skill-name/SKILL.md` and all skill files
   - Structure matches Claude Code skill directory layout
4. **Uploads artifacts**: Stores zips as GitHub Actions artifacts (90-day retention)
5. **Commits to repo** (main branch only): Pushes packaged zips to `dist/skills/`

### Zip File Format

Standard Claude Code skill structure:

```
pumped-fn.zip
└── pumped-fn/
    ├── SKILL.md          # Required: skill frontmatter + content
    ├── examples/         # Optional: supporting files
    ├── templates/        # Optional: code templates
    └── scripts/          # Optional: helper scripts
```

### Usage

#### Install Skills from Artifacts

Download zip from GitHub Actions artifacts:

```bash
# Extract to personal skills directory
unzip pumped-fn.zip -d ~/.claude/skills/

# Or extract to project skills directory
unzip pumped-fn.zip -d .claude/skills/
```

#### Install Skills from Repository

If zips are committed to `dist/skills/`:

```bash
# Download directly from repository
curl -L https://github.com/your-org/pumped-fn/raw/main/dist/skills/pumped-fn.zip -o pumped-fn.zip
unzip pumped-fn.zip -d ~/.claude/skills/
```

### Development

Test workflow locally with [act](https://github.com/nektos/act):

```bash
# List workflow jobs
act -l -W .github/workflows/package-skills.yml

# Run workflow (dry run)
act push -W .github/workflows/package-skills.yml --dry-run

# Run workflow with skill changes
act push -W .github/workflows/package-skills.yml
```

### Configuration

**Paths monitored**:
- `.claude/skills/pumped-fn/**` - Project-scoped pumped-fn skill
- `claude-skill/skills/pumped-fn/**` - Marketplace pumped-fn skill (plugin distribution)

**Note**: Only pumped-fn skills are packaged. Superpowers skills (copied from upstream) are excluded.

**Artifacts retention**: 90 days (configurable in workflow)

**Skip CI**: Commits include `[skip ci]` to prevent recursive workflows

### Troubleshooting

**Workflow not triggering**:
- Verify skill files are in monitored paths
- Check workflow file syntax: `act -l -W .github/workflows/package-skills.yml`

**Zip validation failed**:
- Ensure `SKILL.md` exists in skill directory
- Verify frontmatter is valid YAML (name, description, when_to_use)

**Missing artifacts**:
- Check Actions tab for workflow run logs
- Artifacts retained for 90 days, check retention period

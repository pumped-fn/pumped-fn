# Project-Scoped Skills

This directory contains skills for the pumped-fn project, committed to version control and shared with all team members.

## Skills Overview

### Superpowers Skills (Upstream Copies)

Copied from superpowers marketplace for consistency across team:

- **test-driven-development** - Write tests first, watch fail, implement
- **systematic-debugging** - 4-phase framework: root cause, patterns, hypothesis, implementation
- **verification-before-completion** - Run verification commands before claiming success
- **requesting-code-review** - Review implementation against plan/requirements
- **brainstorming** - Refine ideas through Socratic questioning
- **writing-plans** - Create detailed implementation plans
- **executing-plans** - Execute plans in batches with review checkpoints
- **using-git-worktrees** - Create isolated worktrees for feature work
- **defense-in-depth** - Validation at multiple system layers
- **condition-based-waiting** - Replace timeouts with condition polling

### Pumped-fn Specific Skills

- **pumped-fn** - Comprehensive guidance for building observable, testable TypeScript applications with @pumped-fn (auto-activates for TypeScript projects)
- ~~**pumped-fn-typescript**~~ - DEPRECATED: Use unified `pumped-fn` skill instead
- ~~**pumped-fn-react**~~ - DEPRECATED: Use unified `pumped-fn` skill instead

## Updating Upstream Skills

Superpowers skills are copied from plugin cache. To update:

```bash
# Copy latest version from plugin cache
cp -r ~/.claude/plugins/cache/superpowers/skills/<skill-name> .claude/skills/

# Check what changed
git diff .claude/skills/<skill-name>/

# Commit if beneficial
git add .claude/skills/<skill-name>/
git commit -m "chore(skills): update <skill-name> from upstream"
```

**When to update:**
- Major skill improvements announced
- Bug fixes in skill logic
- New patterns added to workflow
- Quarterly review (manual check)

**Plugin cache location:** `~/.claude/plugins/cache/superpowers/skills/`

## Skill Priority

Project-scoped skills take precedence over plugin skills with the same name. This allows customization while maintaining upstream sync.

## Adding New Skills

1. Create skill directory: `.claude/skills/<skill-name>/`
2. Add `SKILL.md` with frontmatter and content
3. Test with subagents before committing
4. Update this README
5. Commit to share with team

See [Claude Code Skills Documentation](https://docs.claude.com/en/docs/claude-code/skills) for skill authoring guide.

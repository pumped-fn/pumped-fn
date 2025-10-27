#!/bin/bash

set -e

SKILLS_DIR=".claude/skills"
PLUGIN_CACHE="$HOME/.claude/plugins/cache/superpowers/skills"

SUPERPOWERS_SKILLS=(
  "test-driven-development"
  "systematic-debugging"
  "verification-before-completion"
  "requesting-code-review"
  "brainstorming"
  "writing-plans"
  "executing-plans"
  "using-git-worktrees"
  "defense-in-depth"
  "condition-based-waiting"
)

echo "Updating superpowers skills from upstream..."
echo "Source: $PLUGIN_CACHE"
echo "Target: $SKILLS_DIR"
echo ""

if [ ! -d "$PLUGIN_CACHE" ]; then
  echo "Error: Plugin cache not found at $PLUGIN_CACHE"
  echo "Make sure superpowers plugin is installed: /plugin superpowers"
  exit 1
fi

for skill in "${SUPERPOWERS_SKILLS[@]}"; do
  echo "Updating $skill..."

  if [ ! -d "$PLUGIN_CACHE/$skill" ]; then
    echo "  Warning: $skill not found in plugin cache, skipping"
    continue
  fi

  cp -r "$PLUGIN_CACHE/$skill" "$SKILLS_DIR/"
  echo "  ✓ Updated"
done

echo ""
echo "Skills updated successfully!"
echo ""
echo "Next steps:"
echo "1. Review changes: git diff $SKILLS_DIR"
echo "2. Test skills work correctly"
echo "3. Commit if beneficial: git add $SKILLS_DIR && git commit -m 'chore(skills): update from upstream'"

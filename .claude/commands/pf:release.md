# Release Preparation Workflow

Automate release preparation for pumped-fn with changesets and CI validation.

## Process

Execute following steps sequentially:

1. **Run typecheck**
   - Run `pnpm -F @pumped-fn/core-next typecheck` for src code types
   - Run `pnpm -F @pumped-fn/core-next typecheck:full` for test code types
   - If typecheck fails, fix errors and re-run until passing
   - Both src and test typecheck must pass before proceeding

2. **Run tests**
   - Run `pnpm -r test` for all packages
   - If tests fail, fix errors and re-run until passing
   - All tests must pass before proceeding

3. **Commit staged changes**
   - Run `git status` to check current state
   - If uncommitted changes exist, draft commit message following repo conventions
   - Create commit with proper formatting
   - If commit fails due to pre-commit hooks, handle modifications and retry

4. **Handle conflicts**
   - Check for merge conflicts with `git status`
   - If conflicts exist, identify files and guide resolution
   - After resolution, verify with `git status`
   - Re-run typecheck and tests after conflict resolution

5. **Verify documentation builds**
   - Run `pnpm docs:build` to build documentation
   - Ensure build passes as docs depend on latest version content
   - Fix any documentation build failures before proceeding

6. **Create changeset**
   - Run `pnpm changeset add` interactively
   - **Always select patch version bump**
   - Provide clear, concise changeset description
   - Verify changeset file created in `.changeset/` directory

7. **Push to GitHub**
   - Get current branch name with `git branch --show-current`
   - Push commits with `git push`
   - Confirm push succeeded

8. **Monitor CI/CD**
   - Use `gh run list --branch <branch>` to check GitHub Actions status
   - Use `gh run watch` to monitor latest workflow run
   - If failures occur:
     - Use `gh run view --log-failed` to analyze failures
     - Identify root cause from logs
     - Apply fixes locally
     - Re-run typecheck and tests to verify fixes
     - Commit and push fixes
     - Monitor again until all workflows pass

## Success criteria

- Typecheck passes for all packages (src and tests)
- All tests pass
- All commits pushed to GitHub
- Changeset created with patch version
- All GitHub Actions workflows passing
- No merge conflicts
- Documentation builds successfully

## Error handling

If any step fails:
- Report error clearly with context
- Suggest corrective actions
- Wait for user input before proceeding
- Do not skip steps even if blocked

## Notes

- Use `gh` binary for GitHub interactions (already authenticated)
- Follow CLAUDE.md coding standards for any code fixes
- Ensure typecheck passes for TypeScript fixes
- Use pnpm as package manager

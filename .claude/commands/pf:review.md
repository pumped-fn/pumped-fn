# Review and PR Workflow

Review implementation against ADR, clean up slop, and create pull request.

## Arguments

- `$ARGUMENTS` - Optional: epic ID or feature name to review

## Process

Execute following steps sequentially:

1. **Verify all work complete**
   - Run `bd list --status=in_progress` to check for incomplete work
   - If tickets remain open → warn user and ask to continue or abort
   - Run `bd list --status=open` for the epic to confirm all done

2. **Review against ADR**
   - Locate relevant ADR in `.c3/` directory
   - Compare implementation against documented decisions
   - Verify all acceptance criteria met
   - Flag any deviations from ADR

3. **Run verification suite**
   - Typecheck: `pnpm -F @pumped-fn/lite typecheck`
   - Typecheck tests: `pnpm -F @pumped-fn/lite typecheck:full`
   - All tests: `pnpm -r test`
   - Documentation build: `pnpm docs:build`
   - All must pass before proceeding

4. **Execute noslop cleanup**
   - Remove excessive comments (keep only non-obvious explanations)
   - Remove unnecessary type annotations (where inference works)
   - Remove verbose error handling (simplify where appropriate)
   - Remove redundant documentation
   - Remove dead code and unused imports
   - Criteria: if a junior dev can understand without it, remove it

5. **Update package README**
   - Check if README.md needs updates for new features
   - Ensure diagrams reflect current architecture
   - Keep focused on how the library works

6. **Run C3 audit**
   - Use `/c3-skill:c3-audit` to verify docs match implementation
   - Fix any drift between docs and code
   - Update C3 documents if needed

7. **Re-run verification**
   - Repeat typecheck and tests after cleanup
   - Ensure noslop changes didn't break anything

8. **Commit all changes**
   - Run `git status` to review changes
   - Stage relevant files: `git add <files>`
   - Commit with descriptive message
   - Run `bd sync` to sync beads state

9. **Finish development branch**
   - Use `finishing-a-development-branch` skill
   - Choose appropriate integration path (merge, PR, cleanup)

10. **Create pull request**
    - Use `gh pr create` with:
      - Clear title summarizing the feature
      - Body containing:
        - Summary of changes (bullet points)
        - Link to ADR (if applicable)
        - Mermaid diagram of architecture changes
        - Test plan checklist
    - Format body using HEREDOC for proper formatting

## Slop Checklist

Remove these patterns during noslop cleanup:

- [ ] Comments that restate the code (`// increment counter` above `counter++`)
- [ ] JSDoc for self-explanatory functions
- [ ] Type annotations where TypeScript infers correctly
- [ ] Empty catch blocks or generic error handlers
- [ ] Console.log statements left from debugging
- [ ] Commented-out code
- [ ] TODO comments that won't be addressed
- [ ] Redundant null checks where types guarantee presence
- [ ] Over-defensive programming for internal APIs

## Success criteria

- All beads tickets for feature closed
- Implementation matches ADR decisions
- Typecheck and tests passing
- Noslop cleanup complete
- C3 audit passing
- README updated (if needed)
- PR created with proper documentation
- Mermaid diagram included in PR

## Error handling

If verification fails after cleanup:
- Revert problematic cleanup changes
- Keep functional code even if slightly verbose
- Document why cleanup was reverted

If C3 audit finds drift:
- Prioritize updating docs to match code
- Only change code if docs represent intended design

## Notes

- Noslop is about clarity, not minimalism
- Keep comments that explain "why", remove those that explain "what"
- PR should be reviewable by someone unfamiliar with the feature
- Use `gh pr view` to verify PR created correctly

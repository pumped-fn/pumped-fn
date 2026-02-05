# Implementation Workflow

Pick up tasks and implement them using subagent-driven-development with code review between tasks.

## Arguments

- `$ARGUMENTS` - Optional: specific task ID(s) to implement, or plan file to work on

## Process

Execute following steps sequentially:

1. **Find available work**
   - If specific task provided → use that
   - If plan file provided → read tasks from `.plans/<feature-slug>.md`
   - Otherwise → check TaskList for pending tasks
   - Show available tasks and let user confirm which to work on

2. **Review task context**
   - Read task description and acceptance criteria
   - Read referenced C3 documents (if any)
   - Understand acceptance criteria and dependencies
   - Identify exact files to modify

3. **Claim the work**
   - Mark task as in_progress using TaskUpdate

4. **Implement using subagent-driven-development**
   - Use `subagent-driven-development` skill for implementation
   - Follow TDD workflow: write test first, watch it fail, implement
   - Each task gets a fresh subagent
   - Code review between tasks

5. **Verify implementation**
   - Run typecheck: `pnpm -F <package> typecheck`
   - Run tests: `pnpm -r test`
   - Ensure all acceptance criteria met

6. **Close completed task**
   - Mark task as completed using TaskUpdate

7. **Continue**
   - Check TaskList for next available task
   - Ask user: "Continue with next task? (yes/no)"

## Success criteria

- Task claimed before work starts
- TDD workflow followed (test-first)
- Code review performed between tasks
- Typecheck and tests passing
- All acceptance criteria met
- Task closed upon completion

## Error handling

If implementation fails:
- Do NOT close the task
- Report what went wrong
- Keep task in `in_progress` status
- Ask for guidance before proceeding

If tests fail:
- Use `systematic-debugging` skill to investigate
- Fix root cause, not symptoms
- Re-run verification before closing

## Notes

- Prioritize unblocking work when possible
- Each task should be completable in one session
- If task is too large, discuss breaking it down

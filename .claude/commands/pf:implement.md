# Implementation Workflow

Pick up beads tickets and implement them using subagent-driven-development with code review between tasks.

## Arguments

- `$ARGUMENTS` - Optional: specific bead ID(s) to implement, or epic ID to work on

## Process

Execute following steps sequentially:

1. **Find available work**
   - If specific bead ID provided → use that
   - If epic ID provided → list tickets in that epic with `bd list`
   - Otherwise → run `bd ready` to find unblocked tickets
   - Show available tickets and let user confirm which to work on

2. **Review ticket context**
   - Run `bd show <id>` for selected ticket
   - Read referenced C3 documents (if any)
   - Understand acceptance criteria and dependencies
   - Identify exact files to modify

3. **Claim the work**
   - Run `bd update <id> --status=in_progress`

4. **Implement using subagent-driven-development**
   - Use `subagent-driven-development` skill for implementation
   - Follow TDD workflow: write test first, watch it fail, implement
   - Each task gets a fresh subagent
   - Code review between tasks

5. **Verify implementation**
   - Run typecheck: `pnpm -F <package> typecheck`
   - Run tests: `pnpm -r test`
   - Ensure all acceptance criteria met

6. **Close completed ticket**
   - Run `bd close <id>`
   - If multiple tickets completed → `bd close <id1> <id2> ...`

7. **Sync and continue**
   - Run `bd sync` to push changes
   - Check `bd ready` for next available ticket
   - Ask user: "Continue with next ticket? (yes/no)"

## Success criteria

- Ticket claimed before work starts
- TDD workflow followed (test-first)
- Code review performed between tasks
- Typecheck and tests passing
- All acceptance criteria met
- Ticket closed upon completion
- Changes synced to remote

## Error handling

If implementation fails:
- Do NOT close the ticket
- Report what went wrong
- Keep ticket in `in_progress` status
- Ask for guidance before proceeding

If tests fail:
- Use `systematic-debugging` skill to investigate
- Fix root cause, not symptoms
- Re-run verification before closing

## Notes

- Use `bd blocked` to check if current work is blocking others
- Prioritize unblocking work when possible
- Each ticket should be completable in one session
- If ticket is too large, discuss breaking it down

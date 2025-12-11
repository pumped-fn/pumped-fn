# Feature Development Workflow

Structured workflow for developing new features with proper scoping, documentation, and task breakdown.

## Arguments

- `$ARGUMENTS` - Brief description of the feature to develop

## Process

Execute following steps sequentially:

1. **Scope the feature**
   - Use `/c3-skill:c3-use` to understand current architecture
   - Identify which C3 layers (Context/Container/Component) are affected
   - Map dependencies and integration points

2. **Determine documentation impact**
   - Assess if changes require C3 documentation updates
   - If architectural changes needed → proceed to step 3
   - If implementation-only changes → skip to step 4

3. **Create ADR (if needed)**
   - Use `/c3-skill:c3` to draft Architecture Decision Record
   - Document the decision context, options considered, and chosen approach
   - Include trade-offs and consequences

4. **Create review diagram**
   - Build mermaid diagram summarizing the proposed changes
   - Generate mermaid.live link for stakeholder review
   - Format: `https://mermaid.live/edit#pako:<base64-encoded-diagram>`
   - Present diagram link and wait for approval

5. **Wait for ADR approval**
   - Present the ADR summary and diagram for review
   - Explicitly ask: "Is this approach approved? (yes/no)"
   - Do NOT proceed until explicit approval received

6. **Create implementation plan**
   - Use `/superpowers:write-plan` to break down into tasks
   - Eliminate superficial details (comments, trivial type annotations)
   - Focus on concrete, testable implementation steps
   - Plan file created at: `.plans/<feature-slug>.md`

7. **Convert plan to beads tickets**
   - Read the generated plan file
   - For each task, create bead with `bd create`:
     - `--title`: Clear, action-oriented title
     - `--type`: task, bug, or feature as appropriate
   - Append to each ticket:
     - Related C3 document references (if applicable)
     - Exact file paths to modify
     - Acceptance criteria
     - Dependencies on other tickets
   - Use `bd dep add` to establish dependencies between related tickets

## Success criteria

- Architecture understood via C3 scoping
- ADR created (if architectural changes needed)
- Mermaid diagram generated for review
- Explicit approval received before planning
- Implementation plan created without superficial details
- All tasks converted to beads tickets with:
  - C3 document references
  - Clear acceptance criteria
  - Proper dependency chains
  - Sufficient detail for independent implementation

## Error handling

If any step fails:
- Report error clearly with context
- Suggest corrective actions
- Wait for user input before proceeding

## Notes

- Each beads ticket should be implementable by an average developer without additional context
- Use `bd ready` to verify tickets are properly configured
- Tickets should be independent where possible, with explicit dependencies where not

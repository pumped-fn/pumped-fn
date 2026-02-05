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

7. **Create tasks from plan**
   - Read the generated plan file
   - For each task, create task with TaskCreate:
     - Clear, action-oriented title
     - Task type as appropriate (task, bug, or feature)
   - Include in each task:
     - Related C3 document references (if applicable)
     - Exact file paths to modify
     - Acceptance criteria
     - Dependencies on other tasks

## Success criteria

- Architecture understood via C3 scoping
- ADR created (if architectural changes needed)
- Mermaid diagram generated for review
- Explicit approval received before planning
- Implementation plan created without superficial details
- All tasks created with:
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

- Each task should be implementable by an average developer without additional context
- Tasks should be independent where possible, with explicit dependencies where not

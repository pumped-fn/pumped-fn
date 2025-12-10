# Pumped-fn Project Instructions

# Dependencies

When adding new dependencies to any package, use `catalog:` version specifier instead of hardcoded versions. Catalog versions are defined in `pnpm-workspace.yaml`. If a package is not in the catalog, add it there first.

# Prerequisites

This repo requires `c3-skill` and `superpowers` skill sets. If you encounter tool not found or skill not found related to c3 or superpowers, please have a look at ./troubleshooting.md

Diagrams mean a thousand words, mermaid chart is worth even more, because they are short; make and use diagrams to communicate, make comments, give feedback, and request reviews. On responding on getting feedbacks/conversational (not doc), use mermaid.live link

# Workflow

## To get started, acquiring knowledge

- start with /c3-skill:c3-use to grab the overall understanding

## As the more details exposed, if it's more of adding new things, or ammeding current functionalities

- use /c3-skill:c3 to craft ADR and follow the process
- use subagent-driven-development to work on tasks on beads (bd ready)

# Important prior to making a PR

- all tasks in the corresponding epics must be done
- ADR updated
- the package will have README.md, that contains diagram explaining how the library and main operation works, focus on that to reflect if changes are need to be added/updated
- open PR, PR must have docs, c3-audited, slops cleaned up
  - Excessive comments
  - Unnecessary type annotations
  - Verbose error handling
  - Redundant documentation

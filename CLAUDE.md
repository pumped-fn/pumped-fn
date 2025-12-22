# Pumped-fn Project Instructions

# Dependencies

When adding new dependencies to any package:
- **dependencies** and **devDependencies**: Use `catalog:` version specifier. Catalog versions are defined in `pnpm-workspace.yaml`. If a package is not in the catalog, add it there first.
- **peerDependencies**: Use explicit version ranges (e.g., `^19.0.0`). Peer dependencies are NOT managed by catalog since they define compatibility contracts with consumers.

# Prerequisites

This repo requires `c3-skill` and `superpowers` skill sets. If you encounter tool not found or skill not found related to c3 or superpowers, please have a look at ./troubleshooting.md

Diagrams mean a thousand words, mermaid chart is worth even more, because they are short; make and use diagrams to communicate, make comments, give feedback, and request reviews. On responding on getting feedbacks/conversational (not doc), use mermaid.live link

# Workflow

## To get started, acquiring knowledge

- start with /c3-skill:c3-use to grab the overall understanding

## As the more details exposed, if it's more of adding new things, or ammeding current functionalities

- use /c3-skill:c3 to craft ADR and follow the process
- use subagent-driven-development to work on tasks on beads (bd ready)

# Code Style (No Slop)

When generating code, DO NOT produce:
  - Comments - strictly NO inline comments or block comments
  - TSDoc is the ONLY exception: allowed on public interfaces to explain usage
  - Defensive try/catch or null checks in trusted/validated codepaths
  - Casts to `any` to bypass type issues (fix the types properly). Exception: `any` is acceptable in library boundary code where type variance or interoperability requires it (e.g., generic service methods, extension hooks)
  - Single-use variables declared then immediately used (inline them)
  - Style inconsistent with surrounding code

# Important prior to making a PR

- all tasks in the corresponding epics must be done
- ADR updated
- the package will have README.md, that contains diagram explaining how the library and main operation works, focus on that to reflect if changes are need to be added/updated
- open PR, PR must have docs, c3-audited, slops cleaned up

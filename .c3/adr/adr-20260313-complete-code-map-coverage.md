---
id: adr-20260313-complete-code-map-coverage
title: complete-code-map-coverage
type: adr
status: implemented
date: 2026-03-13
affects:
  - c3-0
  - c3-4
  - c3-5
  - c3-6
  - c3-7
  - c3-8
---

# complete-code-map-coverage

## Goal

Bring the lite-family C3 graph to full code-map coverage by assigning each real source
file to a single component owner and excluding repository/config assets that are outside
the architecture map.

## Work Breakdown

- Remove duplicate untracked component/container scaffolds so each container has one
  authoritative ownership model.
- Fill the devtools, HMR, devtools-server, OTel, and codemod container/component docs
  to match the actual package source layout.
- Expand `.c3/code-map.yaml` to map every supported `src/**` file and exclude package
  metadata, examples, generated artifacts, and repo-level operational files.
- Re-run `c3x check`, `c3x list`, `c3x coverage`, and representative `c3x lookup`
  commands until the graph validates cleanly at 100% coverage.

## Risks

- Over-excluding real runtime files would produce a misleading coverage result.
- Keeping duplicate scaffolds would fragment ownership and make future lookups
  ambiguous.
- Container docs can drift again if package entrypoints or source boundaries change
  without a matching code-map update.

## Outcome

Implemented with full code-map coverage, cleaned container ownership for devtools,
HMR, devtools-server, OTel, and codemod, and a green `c3x check` validation pass.

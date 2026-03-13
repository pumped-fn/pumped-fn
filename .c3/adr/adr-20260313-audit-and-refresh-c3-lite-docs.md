---
id: adr-20260313-audit-and-refresh-c3-lite-docs
title: Audit and Refresh Lite C3 Docs
type: adr
status: implemented
date: 2026-03-13
affects:
  - .c3/index.md
  - .c3/README.md
  - .c3/code-map.yaml
  - .c3/c3-2-lite/README.md
  - .c3/c3-2-lite/c3-201-scope.md
  - .c3/c3-2-lite/c3-202-atom.md
  - .c3/c3-2-lite/c3-203-flow.md
  - .c3/c3-2-lite/c3-204-tag.md
  - .c3/c3-2-lite/c3-205-preset.md
  - .c3/c3-3-lite-react/README.md
  - .c3/c3-3-lite-react/c3-301-hooks.md
  - .c3/c3-4-lite-devtools/README.md
  - .c3/c3-5-lite-hmr/README.md
  - .c3/c3-6-lite-devtools-server/README.md
  - .c3/c3-7-lite-extension-otel/README.md
  - README.md
---

# Audit and Refresh Lite C3 Docs

## Goal

Bring the C3 graph up to the current schema and sync the lite/lite-react architecture docs with the current runtime behavior so `c3x` becomes trustworthy again.

## Work Breakdown

1. Repair root C3 structure and index parsing so the graph can be validated
2. Upgrade the lite, lite-react, devtools, HMR, devtools-server, and OTel docs from legacy v3 metadata to the current C3 v4 entity shape
3. Correct semantic drift in the lite and lite-react docs against the current runtime, especially extension contracts, controller mutation semantics, and React hook behavior
4. Rebuild a minimal component code-map for lite and lite-react and exclude container-only package sources that still need component extraction
5. Verify with `c3x check`, `c3x list`, and `c3x lookup`

## Risks

- Updating the docs to match the current runtime can surface architectural gaps that should still be fixed in code later
- Container-only docs for devtools/HMR/OTel remain higher-level until component docs are extracted
- Code-map coverage remains intentionally partial; unmapped packages outside lite/lite-react are still outside this pass

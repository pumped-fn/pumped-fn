# Docs

## Purpose

`docs/` holds documentation-site source and site-level configuration.

## Structure

| Directory | Role |
| --- | --- |
| `.vitepress/` | VitePress configuration and documentation-site runtime. |

## Naming

Use short section directories when site content is added. Match package names only when the page is
the canonical docs entry for that package.

## Content Rules

Docs should explain shipped behavior and link to package READMEs for package-local contracts. Keep
examples aligned with compiled README and PATTERNS snippets.

## Boundaries

Do not use `docs/` for release notes, scratch research, or package-private design notes. Release
state belongs in Changesets; research belongs in `research/`.

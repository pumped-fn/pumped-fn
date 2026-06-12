# 07 - Scattered Env Config
## Smell
Product modules repeatedly parse `process.env` values near their use sites, each with its own fallback and numeric conversion behavior.
## Harm
Invalid values can silently fall through to defaults, zero can be treated as absent, and validation policy drifts across files.
## Provenance
| repo | file path | license | description |
|---|---|---|---|
| coder/code-server | [`src/node/cli.ts`](https://github.com/coder/code-server/blob/92a7dce46ffcd363798e5ef008991e8cc6426de5/src/node/cli.ts) | MIT | CLI configuration folds many environment values into parsed args, including port and timeout-style numeric settings. |
| msgbyte/tianji | [`src/server/utils/env.ts`](https://github.com/msgbyte/tianji/blob/b22f41c6896e2845a467c088d414dfcd277951d4/src/server/utils/env.ts) | Apache-2.0 | Server config parses ports, database, ClickHouse, AI, worker, and cleanup settings directly from environment values. |
## Transformation
`after.ts` centralizes validation in an `appConfig` tag with a `parse` function. Composition code creates the tagged value once, consumers use `tags.required(appConfig)`, and defaults such as log level live on a tag rather than in repeated env parsing branches.
## Lens coverage
inside-out: present. outside-in: present. effect-managed: absent because this pattern is validation and propagation only.
## Why 100% is natural
The only product branches are config validation and tag defaulting. Tests cover a valid config, every validation rejection path through `ParseError`, the absent default branch, the present override branch, and both scope-level atom and context-level flow visibility planes.

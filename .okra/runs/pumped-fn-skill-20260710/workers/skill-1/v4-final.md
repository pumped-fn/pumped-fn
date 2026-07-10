Applied the three requested edits under `skills/pumped-fn/` only.

- Edit 1 — `SKILL.md`, `references/review.md`

  Added:
  > Before the final gate run, diff each exported flow's return value against every prescribed shape in the spec; a field the spec also uses as a total is a count, not a list.

  > | Contract fidelity | Each exported flow's result matches the spec's prescribed shape literally; a field name that recurs across the spec (per-pass `printed`, dispatcher `{ passes, printed }` totals) keeps ONE type everywhere — an aggregate-named field (`printed`, `count`, totals) is a number unless the spec shows elements. Diff every export's return against the spec before the final gate run. |

  Byte delta: +526 bytes.

- Edit 2 — `SKILL.md`

  Added directly after the existing fn-edge/`params` trap:
  > - A foreign edge fails two ways: a domain "no" in its return AND a rejected promise. Catch at the exec site and convert both into the flow's declared fault carrying the domain id: `try { await ctx.exec({ fn: () => ops.dispatch(id), params: [], name: "ops.dispatch" }) } catch (error) { return ctx.fail({ code: "dispatch-failed", id, message: String(error) }) }`. A rejection that escapes raw loses the id and is untyped to callers.

  Byte delta: +465 bytes.

- Edit 3 — `SKILL.md`, `references/review.md`, `templates/workspace/package.json`

  Added:
  > One-time setup: install `@pumped-fn/lite-lint` as a devDependency and wire `"lint": "pumped-lite-lint --max-warnings 0 src bin tests"`; `--max-warnings 0` is mandatory because warn-tier rules count.

  > Run lint with `pumped-lite-lint` from the `@pumped-fn/lite-lint` package.

  Changed:
  > `"lint": "pumped-lite-lint --max-warnings 0 src bin tests"`

  > `"@pumped-fn/lite": "^4.0.0"`

  > `"@pumped-fn/lite-lint": "^1.0.0"`

  Byte delta: +182 bytes.

No deletions or rewrites occurred outside Edit 3’s requested `package.json` replacements. No verification commands were run.

questions_unanswered: none.
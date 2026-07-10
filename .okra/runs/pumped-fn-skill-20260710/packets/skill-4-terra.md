# Role: OKRA writer (progression worker) — skill v4 surgical patch (SKILL-4)

You are the OKRA writer applying a SMALL targeted patch to the pumped-fn skill. Write ONLY under skills/pumped-fn/. Additive edits only where specified — do not rewrite or restructure existing sections; the 8 passing eval behaviors depend on the current text. Your output is deterministically re-gated (VAL-4). Do NOT run npm install or any network command; do not create files under /tmp beyond nothing — no verification runs at all, the validator does that.

## Edit 1 (from .okra/runs/pumped-fn-skill-20260710/workers/fa-1/v4-brief.md — READ IT FIRST, follow its prescribed wording/placement)
E1 contract fidelity: add the new preference-tier row to references/review.md (spec-literal export shapes; a recurring spec field name keeps ONE type everywhere; an aggregate-named field like `printed`/`count`/`total` is a NUMBER unless the spec says otherwise) + the single prescribed sentence in SKILL.md's execution/testing area.

## Edit 2 (same brief)
E2 fn-edge failure duality: add the trap-corpus bullet right after the existing fn-edge/params bullet in SKILL.md: a foreign call fails TWO ways — a domain-level "no" in its return value AND a rejected promise; catch AT the exec site and convert both to `ctx.fail` with the domain identifier (`try { await ctx.exec({ fn: () => client.op(x), params: [], name: "client.op" }) } catch (err) { ctx.fail({ code: "...", id: x, message: ... }) }` — use the brief's exact micro-example); an escaped raw rejection loses the id and breaks failure attribution.

## Edit 3 (user-caught lint-tooling gap, ledger event da01c403)
The skill must make AG-1 achievable for a consumer who has ONLY the skill:
- skills/pumped-fn/templates/workspace/package.json: REMOVE the absolute-path lint script. Portable form: devDependencies gains "@pumped-fn/lite-lint": "^1.0.0"; deps "@pumped-fn/lite": "^4.0.0" (plain semver — harness-side tarball substitution is the harness's job, not the template's); scripts.lint = "pumped-lite-lint --max-warnings 0 src bin tests".
- SKILL.md build-workflow section (currently says run pnpm lint...): add the one-time setup line — install `@pumped-fn/lite-lint` as a devDependency and wire `"lint": "pumped-lite-lint --max-warnings 0 src bin tests"`; `--max-warnings 0` is mandatory (warn-tier rules count).
- references/review.md top: one sentence naming the runner (`pumped-lite-lint`, package `@pumped-fn/lite-lint`) so the rule table is actionable.

## Output (final message)
Per edit: file, exact lines added/changed (quote them), byte delta. Confirm zero deletions/rewrites outside Edit 3's package.json script replacement. questions_unanswered if any brief wording was inapplicable.

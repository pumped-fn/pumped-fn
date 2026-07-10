# DKR-2 architecture note — skills/pumped-fn/ shape + cold-eval harness for built code

worker: dkr-2 · run: pumped-fn-skill-20260710 · observed_at: 2026-07-10 (UTC)
Status: approach-level proposal backed by executed probes. Nothing here is ratified.

## 1. What the prior 10/10 harness actually did (precedent)

Source: `.okra/runs/content-architecture-20260709/`.

- Protocol (ratified in `frame/eval-set.v1.json`): "answering worker gets ONLY the content
  artifacts (no repo, no positioning context); a separate grader worker scores the transcript
  against pass_requires; pass = grader verdict 'pass'; score = passes/10".
- Execution evidence: `ledger.jsonl` metric-read records — B-0 baseline "7/10 ...
  read_method: two-worker protocol: answering worker (no keys, no repo) then strict grader";
  round records for eval-r1 (8/10) through r3. Answer transcripts live in
  `moves/b0|eval-r1|eval-r2|eval-r3/cold-answers.md`; each transcript header states its inputs
  ("Inputs: spec/SITEMAP.md + spec/nodes/*.md ...; no BRIEF, no repo, no keys").
- Model split (terminal-draft.v1.json learnings): "codex xhigh writer + fable
  challenger/grader split held single-llm-truth at zero conflicts".
- Key gap vs our task: that eval graded **prose answers**; isolation was prompt-level (worker
  given only artifact text). Grading built code needs filesystem-level workspaces, real deps,
  and deterministic gate commands — everything below is the new part.

## 2. Proposed skills/pumped-fn/ shape

Convention evidence:
- `.claude/skills/reverse-tornado-okr/`: SKILL.md (46.7KB, 630 lines) + `references/` (7 docs,
  1.3–30KB) + `contracts/` (JSON schemas) + `scripts/`. Works, but SKILL.md is oversized for a
  cold session that also has to build code in the same context window.
- External convention (`~/.codex/.tmp/plugins/plugins/*/skills/*/SKILL.md`, e.g.
  airtable-cli): YAML frontmatter with only `name` + `description` (description doubles as the
  trigger text), markdown body, references by relative path. This minimal frontmatter is the
  intersection both Claude Code and codex agents can consume — codex has no native skill
  loader, so the harness (and any codex user) consumes the skill by being pointed at
  `SKILL.md` as a plain file. Therefore: no Claude-only frontmatter keys, no reliance on
  auto-trigger; SKILL.md must open with "read this before writing pumped-fn code" framing that
  works as a plain instruction.

Proposed layout (repo root `skills/pumped-fn/` so it ships in the repo, not `.claude/`-bound):

```
skills/pumped-fn/
  SKILL.md              # <=15KB budget. Mental model (graph/scope/seam), primitive decision
                        # table (atom vs flow vs resource vs tag vs controller — when, one
                        # line each), the no-slop style walls, the build workflow
                        # (design -> code -> tests -> lint+typecheck loop), pointers into
                        # references/ by relative path.
  references/
    primitives.md       # exact current API signatures (config-object forms: atom({factory}),
                        # flow({parse, deps, factory}), tags.required, preset) + minimal
                        # correct snippets. Probe evidence below shows signature errors are
                        # the first failure mode of a cold session.
    testing.md          # scope-as-seam, presets/tags in createScope, ctx.exec, sdk-test use.
    extensions.md       # logging/observable/otel wiring at scope creation.
    review.md           # idiom rubric source of truth: anti-patterns + lint-rule map
                        # (pumped/no-module-mocks, no-naked-globals, no-shared-scope-factory,
                        # no-scope-argument). Doubles as the grader's rubric input (AG-3:
                        # same text, different model).
    worked-example.md   # ONE small end-to-end domain that is NOT invoice triage (AG-2),
                        # showing atoms + a flow + tests + an extension.
  templates/
    workspace/          # package.json + tsconfig.json a fresh project should start from
                        # (verified working versions below) — also reused by the eval harness.
```

Rationale for the split: the cold session always loads SKILL.md; it loads references only when
the task touches them. Everything the rubric grades must be stated in SKILL.md or review.md —
the prior run's learning applies directly: "content placement matters as much as presence".
Size budgets: SKILL.md <=15KB, each reference <=12KB, worked-example <=15KB.

## 3. Cold-eval harness pipeline (verified commands)

All commands below were executed on 2026-07-10 except the codex model calls (flag verification
only, per assignment).

0. **Build + pack (once per eval round).** `pnpm -r build` in the repo (AG-4: read-only w.r.t.
   source), then for each needed package:
   `cd pkg/core/lite && pnpm pack --pack-destination <eval>/tarballs` — verified: produced
   `pumped-fn-lite-4.0.0.tgz`, and `npm i <tarball>` in a fresh dir installed it with the
   local-only API present (`BoundDep` — see §5).
1. **Workspace setup (per task).** `mkdir <scratch>/eval-<task>` OUTSIDE the monorepo. Write
   `package.json` with `file:` refs to the tarballs plus devDeps
   `@typescript/native-preview`, `typescript`, `vitest` (and `@pumped-fn/lite-lint` tarball or
   npm 1.0.0). `npm i --no-audit --no-fund`. Copy `skills/pumped-fn/**` to
   `<workspace>/skill/`. Write `TASK.md` (novel-domain build task). Verified: a fresh dir with
   npm-installed `@pumped-fn/lite` imports (`atom`, `createScope`, ... enumerated at runtime),
   `npx tsgo --noEmit` exits 0 on correct code / 1 on a wrong `atom(() => ...)` call, and
   `npx vitest run` executes a scope-seam test green (exit 0).
2. **Cold author invocation (gpt-5.6-terra writes; AG-3).**
   ```
   cat author-prompt.md | codex exec - -m gpt-5.6-terra -C <workspace> \
     -s workspace-write --skip-git-repo-check --ignore-user-config --ephemeral \
     -o <workspace>/.eval/author-last.md
   ```
   Flags verified via `codex exec --help`: `-` reads prompt from stdin; `-C, --cd <DIR>` sets
   the working root; `-s workspace-write` sandboxes writes to the workspace;
   `--skip-git-repo-check` (workspace is not a git repo); `--ignore-user-config` (no
   `$CODEX_HOME/config.toml`, auth preserved); `--ephemeral` (no session persistence);
   `-o` captures the final message; `--json` available for event logs. Prompt = "read
   skill/SKILL.md (+ references as needed), implement TASK.md in src/ + tests/, make the gate
   commands pass". No repo path appears anywhere in the prompt.
3. **Gate script (deterministic, orchestrator-run, no LLM).** In the workspace:
   - lint: `npx pumped-lite-lint src tests` (bin of `@pumped-fn/lite-lint`; the repo-path
     form `node <repo>/pkg/tool/lint/dist/cli.mjs src` also works). Verified on an external
     scratch dir: clean file -> "0 diagnostics", exit 0; a `vi.mock` file ->
     `pumped/no-module-mocks` error, exit 1. Requirement: 0 diagnostics (AG-1).
   - typecheck: `npx tsgo --noEmit` (what invoice-triage uses; `@typescript/native-preview`
     is on npm, probe installed 7.0.0-dev.20260707.2). Requirement: exit 0.
   - tests: `npx vitest run`. Requirement: exit 0, >=1 test file.
   - entrypoint: `node --import tsx <entry from TASK.md>` smoke run, exit 0 (mirrors
     invoice-triage's `start` script shape).
   Write `{lint, typecheck, tests, entrypoint}` exit codes + outputs to `.eval/gates.json`.
4. **Rubric grading (gpt-5.6-sol grades; AG-3).**
   ```
   cat grader-prompt.md | codex exec - -m gpt-5.6-sol -C <workspace> \
     -s read-only --skip-git-repo-check --ignore-user-config --ephemeral \
     --output-schema rubric-verdict.schema.json -o <workspace>/.eval/verdict.json
   ```
   Grader sees: the code, `skill/references/review.md` as rubric, `TASK.md`, `gates.json`.
   Grader never sees the author transcript. `--output-schema <FILE>` (verified in help)
   forces a JSON verdict — machine-aggregatable.
5. **Aggregation (claude orchestrates).** Per task: hard-gate failures gate the score (any
   gate red = fail or hard cap, per ratified weighting); rubric JSON provides the idiom
   component. Suite score = weighted mean over ~10 tasks; ledger metric-read record cites
   `gates.json` + `verdict.json` paths, mirroring the content-architecture ledger format.

## 4. Isolation guarantees (honest statement)

Can't see: repo context via cwd (workspace is outside the monorepo, `-C` pins it), git history
(not a repo), user config/AGENTS.md (`--ignore-user-config`), prior sessions (`--ephemeral`),
grading keys (grader-only), author transcript (grader never receives it).
CAN still in principle see: the wider filesystem — `-s workspace-write` confines **writes**,
not reads. Mitigations: no repo path in any prompt; `file:` tarball deps mean node_modules
carries no repo path hints beyond package provenance. Hard read isolation would need an
external container/bwrap wrapper — flag for ratification whether prompt-level read isolation
(same level as the prior run's 10/10 protocol) is acceptable.

## 5. Deps strategy decision

| option | evidence | verdict |
|---|---|---|
| npm published versions | all needed packages published: `@pumped-fn/lite` 4.0.0, `lite-extension-logging` 0.3.0, `lite-extension-observable` 0.4.0, `sdk` 2.0.0, `sdk-test` 2.0.0, `lite-lint` 1.0.0 (`npm view` outputs recorded in progress) | works today, BUT drifted |
| pnpm pack local dist -> `file:` tarballs | pack + install verified; local `dist/index.d.mts` differs from npm 4.0.0 by 51 diff-lines — local adds `BoundDep`/`boundDepSymbol` in the `Dependency` unions, absent from published 4.0.0 at the same version number | **pick this** |
| `file:` refs into repo dist dirs | not probed as primary — leaks the repo path into the workspace (breaks isolation) | reject |

Decision: **pnpm pack local dist**. Reason: the skill must teach the current repo API; npm
4.0.0 is already behind local dist under the same version number, so npm-installed deps would
fail code written against skill content (or force the skill to teach a stale API). Next
action for CKR-1: a `scripts/pack-deps.sh` that rebuilds dist and packs the allowlisted
packages into `eval/tarballs/`.

## 6. Open risks / questions for the orchestrator

1. **Lint rule coverage outside the repo**: `pumped/no-module-mocks` fires externally, but a
   `Date.now()` inside an atom factory produced 0 diagnostics on the scratch file. Unknown
   whether `no-naked-globals` needs repo-local config, only fires in flow bodies, or has an
   adapter-atom allowance. AG-1 ("zero-lint-always") is only meaningful if the lint config the
   eval uses equals the repo's. Needs a targeted probe of the lint CLI's config discovery.
2. **Version-number aliasing**: local dist and npm both say 4.0.0 while APIs differ — eval
   reproducibility requires recording tarball sha256s in the run ledger, not versions.
3. **Read isolation is prompt-level, not enforced** (§4) — matches prior-run precedent, but
   the frame should ratify it explicitly.
4. **codex model ids** `gpt-5.6-terra` / `gpt-5.6-sol` were NOT exercised (assignment forbade
   live calls); `-m` accepts arbitrary strings, so availability is unverified.
5. **Entrypoint gate needs `tsx`** in workspace devDeps (invoice-triage pattern) — trivial,
   include in the workspace template.

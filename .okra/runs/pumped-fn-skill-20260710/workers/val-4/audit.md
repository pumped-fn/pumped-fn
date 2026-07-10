# val-4 audit — re-gate of skill v4 (surgical patch 0f45dc97)

Pinned inputs:
- lite tarball: pumped-fn-lite-4.0.0.tgz sha256 16001d130626e01b58d178c28f32250000dfb830b8df5620a02d690cefaee58a
- lint tarball: pumped-fn-lite-lint-1.0.0.tgz sha256 1f2945a7a8dedccd46babecf16866fc03995bbb93feb9ef3e36f604e5174b2f1; installed cli.mjs sha256 7ae4e6f7ff276490f80f7f49ddcced98331e9b628c188821844ece85c1d7ac79
- harness: suite/harness/instantiate.sh + workspace-template-v2, task T-1 (no extras)
- skill files under test (worktree @ 0f45dc97):
  - SKILL.md sha256 3023eb782ba03e411525434451219083cecfe651dee5b72b7783404ca5edb3e3 (changed vs v3: +5 lines)
  - references/review.md sha256 0b2bb4c641a3c32ed667a84ac8de12efcb541da845338d38bc922ebba629f003 (changed vs v3: +3 lines)
  - references/worked-example.md sha256 2d2f1343de761704e968bdab17ee01921612b6062424fd2f83e690f38e94c449 (byte-identical to v3-accepted)
  - templates/workspace/package.json sha256 a76e11754f5d01092a9897bcde1dec06eb2d6b6aeeeec2ea1ead150f3d0b6cfe (portable-ized: registry deps, pumped-lite-lint bin)

---

claim_id: P1
check: worked-example.md still passes lint --max-warnings 0, tsgo --noEmit, vitest run, tsx smoke (regression, T-1 shape via pinned harness)
replay: |
  Extracted the three fenced ```ts blocks verbatim (lines 8-55, 63-82, 88-109 per the
  doc's `## path` headings) to {src/garden.ts, bin/main.ts, tests/garden.test.ts};
  bash suite/harness/instantiate.sh T-1 <solution> <ws> (exit 0);
  cd <ws> && npx pumped-lite-lint --max-warnings 0 src bin tests
           && npx tsgo --noEmit && npx vitest run && npx tsx bin/main.ts
exit_code: lint=0, tsgo=0, vitest=0, smoke=0
value_vs_threshold: 4 of 4 gates zero vs required all-zero
source_of_truth: worked-example.md sha256 2d2f1343… (unchanged since v2); installed lite index.mjs sha256 f260d8480fbc08c3bd43bfcbd0cb26345f470ddc8b312e550aeaa1ac748d34d7
observed_at: 2026-07-10T08:12Z
decision: accepted
evidence: |
  lint: pumped-lite-lint: 3 files scanned, 0 diagnostics
  vitest: Tests 1 passed (1)
  tsx bin/main.ts stdout ends: { entries: 1, plot: 'herbs', watered: 300 }

---

claim_id: P2
check: new SKILL.md trap bullet's micro-example (try/ctx.exec/catch/ctx.fail) typechecks in the same workspace; tsgo exit 0
replay: |
  Bullet (SKILL.md line 74) contains one inline code fragment, statement-level, not
  self-contained (`ctx`, `ops`, `id` free). Probed by embedding the fragment VERBATIM
  (single line unmodified) inside a doc-pattern flow scaffold: `flow({ name, parse:
  typed<{id:string}>(), faults: typed<{code:"dispatch-failed"; id:string;
  message:string}>(), factory })` — shape taken from primitives.md's EmptyTank faults
  example and worked-example.md; `ops` stubbed as `{ dispatch: async (id: string) =>
  ({ accepted: true, id }) }`, `id` from `ctx.input.id`, success return after the try.
  Wrote src/probe-trap-fnedge.ts into the P1 workspace; npx tsgo --noEmit.
exit_code: 0
value_vs_threshold: 0 type errors vs required 0
source_of_truth: SKILL.md sha256 3023eb78… line 74; probe scaffolding disclosed above (fragment itself byte-verbatim)
observed_at: 2026-07-10T08:14Z
decision: accepted
evidence: tsgo --noEmit exit 0 with probe present alongside garden/main/test. Not marked not-applicable: the bullet does carry code, but note it is a fragment requiring scaffolding, not a standalone snippet.

---

claim_id: P3
check: templates/workspace works for a consumer with only the skill and npm (a: no absolute paths; b: registry install exit 0; c: npm run lint on minimal src/probe.ts exit 0; d: planted violation exits nonzero naming pumped/* rule; e: installed lint version + rule delta vs pinned)
replay: |
  (a) grep -rnE '/home/|/Users/|/tmp/' skills/pumped-fn/ -> exit 1, 0 hits.
  (b) cp templates/workspace/* /tmp/val4-portability (git rev-parse: "not a git
      repository"); npm install --no-audit --no-fund -> exit 0, 57 packages;
      npm ls: @pumped-fn/lite@4.0.0, @pumped-fn/lite-lint@1.0.0.
  (c) wrote src/probe.ts (one atom + createScope resolve/dispose); npm run lint ->
      exit 1. Verbatim failure:
        Error: ENOENT: no such file or directory, stat '/tmp/val4-portability/bin'
          at async collectFiles (.../lite-lint/dist/index.mjs:913:15)
      Cause: the template's lint script hardcodes `src bin tests` but the template
      ships no bin/ or tests/ directories and the CLI stats missing paths instead of
      skipping them. Characterization: after `mkdir bin tests` the same command exits 0
      ("1 files scanned, 0 diagnostics") — runner does execute from workspace-local
      devDeps once the paths exist.
  (d) planted Date.now() in a flow factory (src/bad.ts); npm run lint -> exit 1 with
      [error] pumped/no-ambient-io-outside-boundary and [warn] pumped/no-naked-globals
      ("2 files scanned, 2 diagnostics").
  (e) installed @pumped-fn/lite-lint version 1.0.0; cli.mjs sha256 7ae4e6f7… and
      index.mjs byte-identical to the pinned-tarball install (diff of sha256s empty);
      rule-id sets identical: 24 ids in dist === 24 ids in references/review.md
      (sorted diff empty). No upstream-currency delta.
exit_code: a=1(no hits), b=0, c=1 (REQUIRED 0), d=1(required nonzero), e=n/a(no delta)
value_vs_threshold: 4 of 5 sub-checks pass vs required 5 of 5
source_of_truth: templates/workspace/package.json sha256 a76e1175…; registry package @pumped-fn/lite-lint@1.0.0 (npm, 2026-07-10)
observed_at: 2026-07-10T08:16Z
decision: rejected (sub-check c: fresh-consumer `npm run lint` with only src/ present exits 1 with ENOENT on missing bin/tests paths; template ships neither directory nor a lint CLI tolerant of missing paths)
evidence: |
  Verbatim (c) output above. Cleanup done: /tmp/val4-portability removed.

---

Finding (non-rejection, upstream currency): none — published @pumped-fn/lite-lint@1.0.0 is byte-identical to the pinned local tarball (cli.mjs 7ae4e6f7…, index.mjs identical) and its 24 rule ids match references/review.md exactly.

## Verdict
2 accepted (P1, P2), 1 rejected (P3 — sub-check c, template lint script vs missing bin/tests dirs).

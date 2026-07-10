# val-2 audit — re-gate of revised pumped-fn skill (v2) after VAL-1 rejections

Pinned inputs (all replays):
- tarball: pumped-fn-lite-4.0.0.tgz sha256 16001d130626e01b58d178c28f32250000dfb830b8df5620a02d690cefaee58a
- lint cli: /home/lagz0ne/dev/pumped-fn/pkg/tool/lint/dist/cli.mjs sha256 7ae4e6f7ff276490f80f7f49ddcced98331e9b628c188821844ece85c1d7ac79
- harness: .okra/runs/pumped-fn-skill-20260710/workers/dkr-5/harness/instantiate.sh + workspace-template (PACK_TARBALL_LITE -> pinned tarball)
- skill files under test:
  - SKILL.md sha256 36cf47c205447df9ddf2a283f83bb61a2b58ce6ef94492468360263bc9413c23
  - references/primitives.md sha256 3e183199e701bc2edcba9ff77e355fa8a02d498533a1d9fb32fd7cca08272877
  - references/worked-example.md sha256 2d2f1343de761704e968bdab17ee01921612b6062424fd2f83e690f38e94c449
  - references/testing.md sha256 6b0aabfacaf1eb43315a046f0fcf6e99268a71f2b470b0d86986ec576d3106f5
  - references/extensions.md sha256 623f1f71ae772734159fe50bc1cd48c9192b3db997ec86b5a986eded389e1305
  - references/review.md sha256 199555b3998097a8151e6a91eb2029732556cbcd4b644570acf3276fb48588a6
  - templates/workspace/{package.json,tsconfig.json,vitest.config.ts} sha256 96f53cb1d4c048b2af9381e4ef4638e94ea4895215e17935a88ab31799555ad3 / f7dccfece836f593420b86713772e22bb779b1c2aec25ac4bdb895be5386a710 / 1b1d7f8654e3e8793fa50dc686cc97359160a5cac126cc1307541fdc538eeec4

---

claim_id: W1v2
check: worked-example.md code extracts to a template workspace and passes lint --max-warnings 0, tsgo --noEmit, vitest run, and tsx entrypoint smoke — all exit 0
replay: |
  Extracted the three fenced ```ts blocks verbatim (paths stated by the doc's `## `path`` headings)
  to /tmp/val2-w1-sol/{src/garden.ts,bin/main.ts,tests/garden.test.ts};
  bash .okra/runs/pumped-fn-skill-20260710/workers/dkr-5/harness/instantiate.sh /tmp/val2-w1-sol /tmp/val2-w1 (exit 0);
  cd /tmp/val2-w1 &&
    node /home/lagz0ne/dev/pumped-fn/pkg/tool/lint/dist/cli.mjs --max-warnings 0 src bin tests
    npx tsgo --noEmit
    npx vitest run
    npx tsx bin/main.ts
exit_code: lint=0, tsgo=0, vitest=0, tsx-smoke=0
value_vs_threshold: 4 of 4 gates zero vs required all-zero
source_of_truth: skills/pumped-fn/references/worked-example.md sha256 2d2f1343de761704e968bdab17ee01921612b6062424fd2f83e690f38e94c449
sha256: lint cli 7ae4e6f7…, tarball 16001d13…, template files as pinned above
observed_at: 2026-07-10T04:42Z
decision: accepted
evidence: |
  lint: pumped-lite-lint: 3 files scanned, 0 diagnostics
  vitest: Test Files 1 passed (1); Tests 1 passed (1)
  tsx bin/main.ts stdout:
    start water-bed
    start pump.deliver
    end pump.deliver true
    start record-watering
    end record-watering true
    end water-bed true
    { entries: 1, plot: 'herbs', watered: 300 }
  VAL-1 rejection causes are gone in v2: src/garden.ts:51 now supplies
  `params: []` in ctx.exec, and bin/main.ts defines an inline `Lite.Extension`
  instead of importing @pumped-fn/lite-extension-logging.

---

claim_id: W3v2
check: every self-contained ts snippet in SKILL.md and references/primitives.md typechecks (one probe file per snippet); npx tsgo --noEmit exit 0
replay: |
  Fresh workspace /tmp/val2-w3 via instantiate.sh (empty solution, exit 0).
  Snippet inventory: SKILL.md has 1 fenced block, fence-tagged ```text (architecture
  diagram) — skipped, not TS. primitives.md has 5 ```ts blocks -> src/p1..p5.ts, one per block.
  p2 (faults fragment) lacks its import line; prepended
  `import { flow, typed } from "@pumped-fn/lite"` (the doc's own earlier import) —
  only modification made.
  cd /tmp/val2-w3 && npx tsgo --noEmit
exit_code: 0
value_vs_threshold: 0 of 5 snippets fail vs required 0
source_of_truth: SKILL.md sha256 36cf47c2…, primitives.md sha256 3e183199…, lite dist in workspace from pinned tarball
sha256: as pinned above
observed_at: 2026-07-10T04:43Z
decision: accepted
evidence: |
  tsgo --noEmit exit 0; p1..p5 all pass.
  VAL-1 rejection causes are gone in v2: p1 now passes `params: []` to ctx.exec,
  and p5 no longer imports top-level `select` — it uses
  `scope.select(moisture, (value) => value.percent, { eq: Object.is })`.
  Skipped: 1 (SKILL.md text-fenced diagram — not code).

---

claim_id: W4
check: every self-contained ts snippet in references/testing.md, references/extensions.md, references/review.md typechecks (same procedure; marked-wrong ANTI-examples exempt)
replay: |
  Fresh workspace /tmp/val2-w4 via instantiate.sh (empty solution, exit 0).
  Snippet inventory:
    testing.md: 2 ```ts blocks -> tests/t1.test.ts (test file with vitest imports), src/t2.ts.
      t1 imports { hose, waterPlant } from "../src/garden.js" (cross-file dep the skill set
      defines in primitives.md block 1); supplied src/garden.ts as that block verbatim with
      `export` added to `const hose` and `const waterPlant` — only modification made.
    extensions.md: 3 ```ts blocks -> src/e1.ts, [e2 skipped], src/e3.ts.
      e2 skipped: single-line elliptical fragment
      `await ctx.exec({ fn: () => client.send(message), … })` — ctx/client/message undefined,
      top-level await fragment, not self-contained.
    review.md: 0 fenced blocks of any kind (grep -c '```' = 0) — nothing to probe;
      no ANTI-example exemption needed.
  cd /tmp/val2-w4 && npx tsgo --noEmit
exit_code: 1
value_vs_threshold: 1 of 4 probed snippets fails vs required 0
source_of_truth: testing.md sha256 6b0aabfa…, extensions.md sha256 623f1f71…, review.md sha256 199555b3…
sha256: as pinned above; scheduler probe tarball pumped-fn-lite-extension-scheduler-0.2.0.tgz sha256 0e3f0470fefcbf207056f27d021cf421e0f652b8fc968b66983de1f25668f4a3
observed_at: 2026-07-10T04:46Z
decision: rejected (typecheck failure — unsatisfiable import in extensions.md scheduler snippet)
evidence: |
  src/e3.ts(2,27): error TS2307: Cannot find module '@pumped-fn/lite-extension-scheduler' or its corresponding type declarations.
  src/e3.ts(15,7): error TS18046: 'registration' is of type 'unknown'.
  With e3 removed: npx tsgo --noEmit exit 0 (t1+garden dep, t2, e1 all pass; extensions.md
  markup is NOT marked as a wrong/anti example — it is presented as the normal scheduler usage).
  The import is unsatisfiable under the skill's own workspace: the pinned tarball set contains
  only pumped-fn-lite-4.0.0.tgz and templates/workspace/package.json declares only @pumped-fn/lite.
  Secondary probes (all deterministic, all failed):
    npm pack pkg/ext/scheduler -> pumped-fn-lite-extension-scheduler-0.2.0.tgz (sha256 0e3f0470…);
    npm install ./pumped-fn-lite-extension-scheduler-0.2.0.tgz -> exit 1:
      npm error Could not resolve dependency:
      npm error peer @pumped-fn/lite@"^3.1.0" from @pumped-fn/lite-extension-scheduler@0.2.0
      (workspace has @pumped-fn/lite@4.0.0)
    npm install --legacy-peer-deps … -> exit 1:
      npm error code EUNSUPPORTEDPROTOCOL
      npm error Unsupported URL Type "catalog:": catalog:
  So the snippet cannot typecheck in the pinned workspace, and even the repo's own scheduler
  package cannot currently satisfy it (lite ^3.1.0 peer + catalog: deps in the packed tarball).
  Same defect class as VAL-1 W1's @pumped-fn/lite-extension-logging import.

---

Summary: 2 accepted, 1 rejected — W4

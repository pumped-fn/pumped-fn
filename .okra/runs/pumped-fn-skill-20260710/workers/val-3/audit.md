# val-3 audit — re-gate of revised pumped-fn skill (v3)

Pinned inputs (all replays):
- lite tarball: pumped-fn-lite-4.0.0.tgz sha256 16001d130626e01b58d178c28f32250000dfb830b8df5620a02d690cefaee58a
- scheduler tarball (harness, repo-packed): pumped-fn-lite-extension-scheduler-0.2.0.tgz sha256 7b6f40c8e441bd71c74971003076032d8bac7350512f0e8bc8a17922d141fa62 (note: differs from val-2's pinned 0e3f0470… — harness tarball was rebuilt; contents verified deps={croner:10.0.1}, peers={@pumped-fn/lite:^3.1.0})
- lint tarball: pumped-fn-lite-lint-1.0.0.tgz sha256 1f2945a7a8dedccd46babecf16866fc03995bbb93feb9ef3e36f604e5174b2f1; lint cli /home/lagz0ne/dev/pumped-fn/pkg/tool/lint/dist/cli.mjs sha256 7ae4e6f7ff276490f80f7f49ddcced98331e9b628c188821844ece85c1d7ac79
- harness: .okra/runs/pumped-fn-skill-20260710/suite/harness/instantiate.sh + workspace-template-v2; T-1 (no extras) for V1, T-3 (scheduler + --legacy-peer-deps) for V2, matching suite/tasks/T-3/extra-deps.json
- skill files under test (current worktree content):
  - SKILL.md sha256 3764ab6989cc5fd5952b0a13ec05c55e2e4cf2f8d7176e340db0879438d3a1de (changed vs v2)
  - references/primitives.md sha256 3e183199e701bc2edcba9ff77e355fa8a02d498533a1d9fb32fd7cca08272877 (unchanged vs v2)
  - references/worked-example.md sha256 2d2f1343de761704e968bdab17ee01921612b6062424fd2f83e690f38e94c449 (unchanged vs v2)
  - references/testing.md sha256 6b0aabfacaf1eb43315a046f0fcf6e99268a71f2b470b0d86986ec576d3106f5 (unchanged vs v2)
  - references/extensions.md sha256 0c33aecf394219210cdb00bc27ffa7601a701e2b2a8945ee02ada2db3fd28407 (changed vs v2 — scheduler section rewritten)
  - references/review.md sha256 17c3dcb1586c689f74cc6ee545ffd0f7e83c85d324e1a67a3d084b85b84b1e5e (changed vs v2)

---

claim_id: V1
check: worked-example.md code extracts to a template workspace and passes lint --max-warnings 0, tsgo --noEmit, vitest run, and tsx entrypoint smoke — all exit 0 (regression)
replay: |
  Extracted the three fenced ```ts blocks verbatim (doc's `## path` headings) to
  {src/garden.ts, bin/main.ts, tests/garden.test.ts};
  bash suite/harness/instantiate.sh T-1 <solution> /tmp/val3-v1 (exit 0);
  cd /tmp/val3-v1 &&
    node /home/lagz0ne/dev/pumped-fn/pkg/tool/lint/dist/cli.mjs --max-warnings 0 src bin tests
    npx tsgo --noEmit
    npx vitest run
    npx tsx bin/main.ts
exit_code: lint=0, tsgo=0, vitest=0, tsx-smoke=0
value_vs_threshold: 4 of 4 gates zero vs required all-zero
source_of_truth: skills/pumped-fn/references/worked-example.md sha256 2d2f1343… (byte-identical to the v2-accepted file)
sha256: tarballs and lint cli as pinned above
observed_at: 2026-07-10T05:38Z
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

---

claim_id: V2
check: every self-contained ts snippet across SKILL.md, primitives.md, testing.md, extensions.md, review.md typechecks (one probe file per snippet; doc-supplied imports prepended where the doc's own earlier import applies; scheduler tarball installed per T-3 with --legacy-peer-deps); npx tsgo --noEmit exit 0
replay: |
  Fenced-block inventory (deterministic extractor over all five files):
    SKILL.md: 1 block, lang=text (architecture diagram) — skipped, not TS.
    primitives.md: 5 ts blocks -> src/p1..p5.ts. p2 (faults fragment) lacks its import
      line; prepended `import { flow, typed } from "@pumped-fn/lite"` (doc's own earlier
      import) — only modification.
    testing.md: 2 ts blocks -> tests/t1.test.ts, src/t2.ts. t1 imports
      { hose, waterPlant } from "../src/garden.js"; supplied src/garden.ts as
      primitives.md block 1 verbatim with `export` added to `const hose` and
      `const waterPlant` — only modification.
    extensions.md: 4 ts blocks -> src/e1.ts, [e2 skipped], src/e3.ts, src/e4.ts.
      e2 skipped: single-line elliptical fragment
      `await ctx.exec({ fn: () => client.send(message), params: [], name: "client.send", tags: [] })`
      — ctx/client/message undefined, not self-contained.
      e3 = scheduler.schedule usage; e4 = durableBackend (imports type Scheduler from
      "@pumped-fn/lite-extension-scheduler").
    review.md: 0 fenced blocks (tables only) — nothing to probe; no ANTI-example
      exemption needed anywhere (no marked-wrong snippets in any file).
  bash suite/harness/instantiate.sh T-3 <solution> /tmp/val3-v2 (exit 0; installs
  scheduler tarball with --legacy-peer-deps; node_modules/@pumped-fn/ contains
  lite, lite-extension-scheduler, lite-lint);
  cd /tmp/val3-v2 && npx tsgo --noEmit
exit_code: 0
value_vs_threshold: 0 of 10 probed snippets fail vs required 0 (11 probe files incl. helper garden.ts; 2 skipped: SKILL.md text diagram, extensions.md e2 elliptical)
source_of_truth: file sha256s as pinned above; scheduler tarball 7b6f40c8…
observed_at: 2026-07-10T05:39Z
decision: accepted
evidence: |
  tsgo --noEmit exit 0 with p1..p5, garden, t1, t2, e1, e3, e4 all present.
  VAL-2's W4 rejection cause is resolved: e3's
  `import { scheduler } from "@pumped-fn/lite-extension-scheduler"` now resolves
  because the workspace installs the scheduler tarball (T-3 pattern).

---

claim_id: V2-caveat
check: extensions.md scheduler install caveat is present and accurate (required because e3 fails without the tarball: reproduced TS2307 in the no-scheduler workspace /tmp/val3-v1, exit 1)
replay: |
  Caveat text (extensions.md line 34): "today the published scheduler package peers
  on Lite 3 and its npm tarball retains `catalog:` dependencies. In a cold Lite-4
  workspace, pnpm-pack the scheduler from this repository, then add that tarball
  with `--legacy-peer-deps`; a plain registry install does not resolve."
  Clause checks against the live registry (npm view / npm pack @pumped-fn/lite-extension-scheduler@0.2.0):
  1. "peers on Lite 3": peerDependencies = { '@pumped-fn/lite': '^3.1.0' } — TRUE.
  2. "plain registry install does not resolve": in a Lite-4 workspace,
     `npm install @pumped-fn/lite-extension-scheduler@0.2.0` exits 1 with
     "npm error code ERESOLVE / unable to resolve dependency tree / Found: @pumped-fn/lite@4.0.0" — TRUE.
  3. "its npm tarball retains `catalog:` dependencies": downloaded the published
     0.2.0 tarball; package.json deps = { croner: "10.0.1" }, peers = { @pumped-fn/lite: "^3.1.0" },
     devDeps all concrete; `grep -rn "catalog:"` over the entire extracted tarball ->
     NO_CATALOG_ANYWHERE_IN_PUBLISHED_TARBALL — FALSE.
  4. Consequence of (3): "pnpm-pack the scheduler from this repository" is not required —
     `npm install @pumped-fn/lite-extension-scheduler@0.2.0 --legacy-peer-deps` straight
     from the registry exits 0 and installs the package next to lite 4.
exit_code: plain-install=1 (ERESOLVE), legacy-peer-deps-registry-install=0, catalog-grep=no matches
value_vs_threshold: 2 of 3 factual clauses true vs required all-true
source_of_truth: extensions.md sha256 0c33aecf…; registry package @pumped-fn/lite-extension-scheduler@0.2.0 (npm pack, 2026-07-10)
sha256: published tarball inspected via npm pack in scratchpad
observed_at: 2026-07-10T05:41Z
decision: rejected (caveat present, operative instruction works, but one factual clause is false: the published tarball contains no `catalog:` specifiers, and the repo-pack step it justifies is unnecessary — registry install with --legacy-peer-deps alone succeeds)
evidence: |
  npm view @pumped-fn/lite-extension-scheduler: version 0.2.0,
    peerDependencies { '@pumped-fn/lite': '^3.1.0' }, dependencies { croner: '10.0.1' }
  grep -rn "catalog:" over extracted published tarball -> no matches
  registry install with --legacy-peer-deps exit=0; node_modules/@pumped-fn/{lite,lite-extension-scheduler}

---

claim_id: V3
check: the 10 claimed trap-corpus entries each appear in current content (presence-only grep; no quality judgment)
replay: grep -n over skills/pumped-fn/SKILL.md and references/*.md; one quoted evidence line per entry
exit_code: n/a (grep hits recorded per entry)
value_vs_threshold: 10 of 10 entries present vs required 10
source_of_truth: SKILL.md sha256 3764ab69… (Trap corpus section, lines 69–79); review.md sha256 17c3dcb1…
observed_at: 2026-07-10T05:42Z
decision: accepted
evidence: |
  1. params-on-fn-edges — SKILL.md:71 "Fn edges require `params` even at arity zero: … omitting it throws `params is not iterable`."
  2. isFault identity — SKILL.md:72 "The test is `error.flow === flow.name`; a deps handle or `controller(child, { name })` rename misclassifies it."
  3. prepare transparency — SKILL.md:73 "`prepare()` captures options once, but each `step.exec()` parses, resolves deps, and runs wrappers again."
  4. tags.all asymmetry — SKILL.md:74 "`tags.all(port)` on an atom collects every scope binding; on a flow it yields one value per context level."
  5. ctrl.set preference — SKILL.md:75 "Prefer `ctrl.set(wholeValue)` when replacing all state; that is readability, not stronger semantics." (also review.md:63)
  6. exported-scope-fn lint trap + filename allowance — SKILL.md:76 "exported scope-taking functions are flagged even in composition files. The filename allowlist is exact: `main`, `bootstrap`, `wire`, `adapter`, `composition`, `http`, `transport`, or `server`; `bin/monitor.ts` is not a root."
  7. module-state / unattributed-await / setTimeout traps — SKILL.md:77 "closed-over module containers trigger `no-module-state`. Wrap awaited port methods in named fn edges; `setTimeout` remains ambient IO, including `bin/`." (rule mapping also review.md:18 no-module-state, review.md:30 no-unattributed-await)
  8. atom-name rejection — SKILL.md:78 "Flows/resources accept `name`; `atom()` does not."
  9. wrapResolve naming (resolve observability) — SKILL.md:78 "For resolve observability, name a resource and use a named factory function expression for an atom. In `wrapExec`, use `ctx.name` and `ctx.parent?.name`; record after `await next()` for completion order."
  10. resource-watch bridge — SKILL.md:79 "Bridge atom state to a resource with an owner-bound subscription that releases/re-resolves itself; dependent re-establishment is lazy on the next use."

---

Summary: 3 accepted, 1 rejected. Rejected: V2-caveat (extensions.md line 34 clause "its npm tarball retains `catalog:` dependencies" is false for published 0.2.0, and the repo-pack prescription it justifies is unnecessary — a registry install with --legacy-peer-deps alone succeeds; peer-on-Lite-3 and ERESOLVE-on-plain-install clauses verified true). The e3 snippet itself is accepted: it typechecks with the tarball installed per the T-3 pattern.
Cleanup: /tmp/val3-v1 and /tmp/val3-v2 node_modules removed; /tmp/val3-caveat removed.

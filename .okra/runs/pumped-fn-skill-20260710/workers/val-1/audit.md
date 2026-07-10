# val-1 audit — skill worked example + templates + snippets

Pinned inputs (all replays):
- tarball: pumped-fn-lite-4.0.0.tgz sha256 16001d130626e01b58d178c28f32250000dfb830b8df5620a02d690cefaee58a
- lint cli: /home/lagz0ne/dev/pumped-fn/pkg/tool/lint/dist/cli.mjs sha256 7ae4e6f7ff276490f80f7f49ddcced98331e9b628c188821844ece85c1d7ac79
- workspace template: .okra/runs/pumped-fn-skill-20260710/workers/dkr-5/harness/workspace-template/ (PACK_TARBALL_LITE -> file:./pumped-fn-lite-4.0.0.tgz)

---

claim_id: W1
check: worked-example.md code is complete and correct in a template workspace (lint, tsgo, vitest exit codes)
replay: |
  W=/tmp/val1-w1; instantiate template + tarball; copy the three fenced blocks verbatim to
  src/garden.ts, bin/main.ts, tests/garden.test.ts (paths are stated in the doc — no path finding);
  npm install (exit 0); then:
  node /home/lagz0ne/dev/pumped-fn/pkg/tool/lint/dist/cli.mjs --max-warnings 0 src bin tests
  npx tsgo --noEmit
  npx vitest run
exit_code: lint=0, tsgo=1, vitest=1
value_vs_threshold: 2 of 3 gates nonzero vs required all-zero
source_of_truth: skills/pumped-fn/references/worked-example.md sha256 3984a4958ac3a26d3a9a228767d3d3aa71be2f364564e608f98000bfc0745bd8
observed_at: 2026-07-10T04:28-04:30Z
decision: rejected (typecheck failure + runtime failure)
evidence: |
  tsgo:
    bin/main.ts(2,25): error TS2307: Cannot find module '@pumped-fn/lite-extension-logging' or its corresponding type declarations.
    src/garden.ts(44,20): error TS2769: No overload matches this call.
      The last overload gave the following error.
        Property 'params' is missing in type '{ fn: () => Promise<void>; name: string; }' but required in type 'ExecFnOptions<void, []>'.
  vitest (exit 1, 1 failed / 1 total):
    AssertionError: promise rejected "TypeError: params is not iterable (cannot…" instead of resolving
    Caused by: TypeError: params is not iterable (cannot read property undefined)
  Notes: (1) bin/main.ts depends on @pumped-fn/lite-extension-logging which neither the skill
  template package.json nor the pinned tarball set provides — example is not complete under its
  own workspace. (2) ctx.exec({ fn, name }) without params is both a type error and a runtime
  crash against lite-4.0.0; this is the same defect the example teaches at src/garden.ts:51.
  lint passed (3 files scanned, 0 diagnostics).

---

claim_id: W2
check: skill templates produce a workspace where @pumped-fn/lite resolves
replay: |
  W=/tmp/val1-w2; copy skills/pumped-fn/templates/workspace/{package.json,tsconfig.json,vitest.config.ts};
  sed PACK_TARBALL_LITE -> file:./pumped-fn-lite-4.0.0.tgz; npm install; probe.ts:
    import { atom, createScope } from "@pumped-fn/lite"
    const a = atom({ factory: () => 42 })
    console.log("resolved:", await createScope().resolve(a))
  npx tsx probe.ts
exit_code: install=0, probe=0
value_vs_threshold: exit 0 vs required 0; stdout "resolved: 42"
source_of_truth: skills/pumped-fn/templates/workspace/* sha256 96f53cb1… / f7dccfec… / 1b1d7f86…
observed_at: 2026-07-10T04:29Z
decision: accepted
evidence: |
  install_exit=0
  resolved: 42
  probe_exit=0

---

claim_id: W3
check: every code snippet in SKILL.md and references/primitives.md typechecks
replay: |
  Snippet inventory: SKILL.md has 1 fenced block, fence-tagged ```text (architecture diagram) —
  skipped, not TS. primitives.md has 5 ```ts blocks -> /tmp/val1-w2/src/p1..p5.ts, one per block.
  p2 (faults fragment) lacks its import line; prepended `import { flow, typed } from "@pumped-fn/lite"`
  (the same doc's earlier import) — only modification made.
  cd /tmp/val1-w2 && npx tsgo --noEmit
exit_code: 1
value_vs_threshold: 2 of 5 snippets fail vs required 0
source_of_truth: SKILL.md sha256 eef5392f…, primitives.md sha256 8800b67b…, lite dist index.d.mts in workspace
observed_at: 2026-07-10T04:30Z
decision: rejected (typecheck failure)
evidence: |
  src/p1.ts(17,20): error TS2769: No overload matches this call.
    The last overload gave the following error.
      Property 'params' is missing in type '{ fn: () => Promise<void>; name: string; }' but required in type 'ExecFnOptions<void, []>'.
  src/p5.ts(1,49): error TS2305: Module '"@pumped-fn/lite"' has no exported member 'select'.
  Per snippet: p1 FAIL (ctx.exec({fn,name}) missing params — same defect as W1),
  p2 PASS, p3 PASS, p4 PASS,
  p5 FAIL (imports select top-level; lite-4.0.0 exposes select only as a scope method:
  index.d.mts:46 `select<T, S>(atom: Atom<T>, …): SelectHandle<S>` — p5 even calls scope.select,
  so the top-level import is both wrong and unused).
  Skipped: 1 (SKILL.md text-fenced diagram — not code).

---

Summary: 1 accepted, 2 rejected — W1, W3

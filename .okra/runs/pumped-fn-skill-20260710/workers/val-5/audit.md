# val-5 re-gate audit — skill v6 (routing map, params/tag-resolution teaching, DON'T-first restructure, config-only template)

Working dir: /home/lagz0ne/dev/pumped-fn/.claude/worktrees/pumped-fn-skill
Files under gate: skills/pumped-fn/SKILL.md, skills/pumped-fn/references/primitives.md, skills/pumped-fn/references/testing.md, skills/pumped-fn/templates/workspace/

## Q1 — snippet gates (typecheck all ts fenced snippets in the 3 touched files; lint the testing.md starter composition)

Probe workspace: harness workspace-template-v2 + tarballs (pumped-fn-lite-4.0.0.tgz, pumped-fn-lite-lint-1.0.0.tgz, pumped-fn-lite-extension-scheduler-0.2.0.tgz), `npm install --legacy-peer-deps` — succeeded (61 packages).

Snippet inventory:
- SKILL.md: 0 ts-fenced snippets (only one ```text``` diagram block at lines 10-14). Nothing to typecheck.
- references/primitives.md: 6 ts-fenced snippets at lines 5-43, 49-56, 60-73, 84-109, 125-131, 135-149.
- references/testing.md: 5 ts-fenced snippets at lines 5-25, 33-48, 69-81, 85-95, 99-116.

Skipped (elliptical, not self-contained, reason given):
- primitives.md:125-131 ("Untraceable"/"Traceable" `ctx.exec` pair) — uses undefined `ctx`, `billing`, `orderId`; prose-embedded illustrative fragment, not a standalone module.
- testing.md:5-25 (waterPlant preset test) — imports `../src/garden.js`, a file never defined anywhere in the docs (the closest analog, hose/waterPlant, lives in primitives.md, not restated here as garden.js); not mechanically derivable without inventing content.

Probed (9 self-contained snippets, one file each, doc-supplied imports kept, prepended where a snippet continues a prior import context in the same doc section):
- primitives.md:5-43 → probe-prim-1.ts (own imports)
- primitives.md:49-56 (checkTank) → probe-prim-2.ts (prepended `import { flow, typed } from "@pumped-fn/lite"`, matching the imports already established earlier in the same doc section)
- primitives.md:60-73 → probe-prim-3.ts (own imports)
- primitives.md:84-109 → probe-prim-4.ts (own imports)
- primitives.md:135-149 → probe-prim-6.ts (own imports)
- testing.md:33-48 (gate/fakePump) → probe-test-2.ts (no external imports needed)
- testing.md:69-81, 85-95, 99-116 ("Minimal starter composition") → src/app.ts, bin/main.ts, tests/app.test.ts placed at the exact doc-specified relative paths so the internal `../src/app.ts` imports resolve.

Command: `npx tsgo --noEmit` in the probe workspace (tsconfig: strict, include src/bin/tests).

Result: **0 diagnostics**, exit 0. All 9 probed snippets typecheck clean against the pinned lite tarball.

Lint of the extracted "Minimal starter composition" (claims to be complete):
Command: `npx pumped-lite-lint --max-warnings 0 src bin tests`
Result: `pumped-lite-lint: 9 files scanned, 0 diagnostics` (includes the 3 starter-composition files plus the other probes co-resident in the same workspace) — exit 0.

**Q1: ACCEPT.**

## Q2 — template after slimming (contents, no absolute paths, setup flow works end-to-end)

`ls -la skills/pumped-fn/templates/workspace/`:
```
package.json
tsconfig.json
vitest.config.ts
```
Exactly these 3 files — ONLY package.json, tsconfig.json, vitest.config.ts. Confirmed by directory listing (no other files/dirs).

`grep -rn '/home\|/Users\|/tmp\|/root' skills/pumped-fn/templates/workspace/` → no matches. Zero absolute paths.

End-to-end setup flow, run in `/tmp/q2-workspace-test` (fresh dir outside any repo, deleted after):
1. Copied the 3 template files in.
2. `npm install` (real registry, `^4.0.0`/`^1.0.0`/etc. ranges, no local tarballs) → `added 57 packages ... found 0 vulnerabilities`, exit 0.
3. `mkdir src bin tests`.
4. Dropped testing.md's "Minimal starter composition" code verbatim into `src/app.ts`, `bin/main.ts`, `tests/app.test.ts`.
5. `npm run lint` → `pumped-lite-lint: 3 files scanned, 0 diagnostics`, exit 0.
6. `npx tsgo --noEmit` → exit 0, no output.
7. `npm test` → `Test Files 1 passed (1)`, `Tests 1 passed (1)`, exit 0.
8. `npx tsx bin/main.ts` → printed `hello, world`, exit 0.

All 4 gate commands exited 0. This simultaneously proves the moved starter-composition code is real (it lints/typechecks/tests/runs standalone from a registry install) and that templates/workspace/ + the documented setup steps are sufficient — no missing config, no undocumented step needed.

**Q2: ACCEPT.**

## Q3 — API-teaching spot replay (probes run inside the Q2 workspace, before cleanup)

### (a) lazy required-tag failure

`src/probe-lazy-tag.ts`: an atom `needsTag` with `deps: { value: tags.required(unbound) }` where `unbound` has no binding anywhere.

Output of `npx tsx src/probe-lazy-tag.ts` (exit 0):
```
createScope() threw: false
first resolve() threw: true
resolve error message: Tag "probe.unbound" not found
message contains 'not found': true
```
`createScope()` does not throw; the first `scope.resolve(needsTag)` does, with a `not found` message — exactly as documented in SKILL.md line 32 / primitives.md line 119.

### (b) params visibility

`src/probe-params.ts`: an extension's `wrapExec` records `ctx.input`. One `ctx.exec` call closes over `orderId` with `params: []` (untraceable pattern from primitives.md:127); one threads it through `params: [orderId]` (traceable pattern from primitives.md:130).

Output of `npx tsx src/probe-params.ts` (exit 0):
```
recorded[0] (closure-only params:[]): []
recorded[1] (params:[orderId]): ["order-123"]
recorded values differ: true
orderId visible only in traceable call: true
```
Confirms: a closure-captured value is invisible to the extension (`ctx.input === []`), while the same value threaded through `params` is visible (`ctx.input === ["order-123"]`) — exactly as taught in primitives.md's "Params traceability" section.

Both probes typecheck clean (`npx tsgo --noEmit`, exit 0, 0 diagnostics) and run clean (`npx tsx`, exit 0).

**Q3: ACCEPT** (both sub-claims a and b).

## Q4 — routing presence (deterministic grep, evidence with line numbers)

SKILL.md References section: lines 16-22 (before line 40 as required), listing all 5 references files:
```
18:- Choosing/writing a primitive (atom, flow, resource, tag, controller) → [primitives.md](references/primitives.md)
19:- Writing or fixing a test → [testing.md](references/testing.md)
20:- Extensions, scheduler, request context → [extensions.md](references/extensions.md)
21:- Lint/typecheck/test loop, 24 exact lint mappings → [review.md](references/review.md)
22:- A full runnable composition (root + test) → [worked-example.md](references/worked-example.md)
```
`ls skills/pumped-fn/references/` confirms all 5 files exist: extensions.md, primitives.md, review.md, testing.md, worked-example.md.

Inline `references/` pointers elsewhere in the body (outside the References section, i.e. after line 23) — 6 found, well over the required 3:
```
26:...see [review.md](references/review.md) for the full preference table.
32:...Elaboration: [primitives.md](references/primitives.md).
36:Read [primitives.md](references/primitives.md) for the primitive decision table before writing a factory.
73:...Full decision table and resource-ownership semantics: [primitives.md](references/primitives.md).
77:...Deterministic races, recovery, and shutdown patterns: [testing.md](references/testing.md).
95:...[review.md](references/review.md) has the 24 lint mappings...; [worked-example.md](references/worked-example.md) is a runnable composition.
```

**Q4: ACCEPT.**

## Summary

4 accepted, 0 rejected.
Rejected ids: none.

# T-5 summary — recipe-archive export with live progress (worker pkr-t5)

## What the task examines

Generator-flow composition on the production surface: a parent generator flow
(`exportCollection`) composes a child generator flow (`exportRecipe`) via
`controller(childFlow)` + `execStream`, forwards child progress TRANSFORMED
(slug-prefixed mapped re-yield, not bare `yield*`), stays pull-driven (fetch issued only
on consumer demand), isolates per-child failures under an exact policy, and surfaces
abandonment as `{ ok: false, aborted: true }` observable from an installed extension.
Idioms: I-3, I-26, I-31, I-9/I-17 (fault form), I-20/I-21 (scope-seam substitution),
I-23, I-27, I-29. chal-2 H2-T5 amendments applied: fetch-issued defined at method entry,
abandonment gates the next side-effect AND the close result, checker binds to the
prescribed public modules, failure policy checked exactly.

## Checker check-list (harness/check-t5.mjs — pure node, JSON verdict, exit 0/1)

| ID | What it proves | Differentiator |
|---|---|---|
| decl-exports | exportRecipe/exportCollection are flows; archive/shareTarget are presettable atom handles | seam |
| b1-recipe-await-only | exec-only consumption; exact converted values written; one fetch | R1/R2 |
| b2-recipe-streamed-identical | streamed events in order; stream.result id; identical stored result | R2, D4 (child is production stream) |
| b3-collection-forwards-prefixed-in-order | exact slug-prefixed whole-sequence forwarding | T5-D4 |
| b4-collection-await-only | exec consumption of the collection still exports all | R2 |
| b5-pull-driven-no-prefetch | fetch log (entry-logged) == ["granola"] at recipe 1's final event; after break: log unchanged, result rejects /abort/i, closes == [{ok:false,aborted:true}] | T5-D1, T5-D2 |
| b6-mid-recipe-abandon-prevents-next-side-effect | break after `converted`: write log EMPTY, fetch log unchanged, close aborted | T5-D2 |
| b7-failed-fetch-isolated | one failed event w/ recoverable reason, export continues, summary + write-log exact | T5-D3 |
| b8-unknown-unit-isolated-with-code | UNIT_UNKNOWN recoverable from reason; fetched-then-failed sequence; continues | T5-D3 |

## Gate results

| Gate | Reference | Transplant | Fake |
|---|---|---|---|
| 1 lint --max-warnings 0 | 0 diagnostics (exit 0) | 0 diagnostics (exit 0, no exemption needed) | 0 diagnostics (exit 0, no exemption needed) |
| 2 tsgo --noEmit | exit 0 | n/a (checker-only deliverable) | n/a |
| 3 vitest run | 4/4 pass (exit 0) | n/a | n/a |
| 4 tsx bin/export.ts | exit 0, 3 exported | n/a | n/a |
| 5 check-t5.mjs | 9/9 pass (exit 0) | FAIL (5 checks: b3,b5,b6,b7,b8; exit 1) | FAIL (2 checks: b5,b6; exit 1) |

lint dist sha256 at gate time: 7ae4e6f7ff276490f80f7f49ddcced98331e9b628c188821844ece85c1d7ac79
(NOTE: differs from the sha observed at this run's start (6f61d622…) — main-checkout lint
dist is a shared mutable dependency across workers; sha recorded per AG-1 mitigation;
0 diagnostics under the version actually run). Lite tarball pinned: 16001d13… (dkr-5
harness tarball, not repacked).

Adversarial evidence of amendment strength: the FAKE implements prefixed forwarding and
failure isolation faithfully (7/9 checks green, lint-clean) and dies ONLY on the
instrumented laziness/abandonment checks — exactly the checks chal-2 demanded be
instrumented. The TRANSPLANT (importBatch shell: bare `yield*` + trailing done-counter
event, no failure policy) dies on 5 checks including untransplantability anchors b3/b7.

## API semantics verified before answer-key (ground-truth rule)

Probed in a real workspace (gates 3/5 double as probes): generator-flow pull semantics
(no advance past yield until pull), controller-handle `execStream` in a parent generator,
mid-child abandonment tears down the child stream without triggering the parent's catch
(cancellation unwinds via return/finally, so the failure-isolation catch does NOT swallow
abandonment — fetch log stayed ["granola"]), `stream.result` rejects "Flow stream
aborted", extension `wrapExec` + `ctx.onClose` observes `{ ok: false, aborted: true }`.
Matches README "Generator Flows" notes and examples/invoice-triage tests 413-459.

## Residual attack classes not closed (honest)

1. A solution could drive the child's iterator manually (not `for await`) and still pass
   b5/b6 if genuinely lazy — mechanism-equivalent, arguably legitimate; G6 grader-side
   quote verification still requires the controller-composition quote.
2. The checker does not verify the SOLUTION's own tests assert fetch-count/aborted-close
   (that is G3 manifest territory, suite-level).
3. No third adversarial for "non-flow exports with hand-built stream object" (dies at
   decl-exports + every exec by construction; not demonstrated).
4. Reason-string checks use `includes(...)` — magic-string embedding without real fault
   propagation would pass b7/b8's reason clause (but not their sequencing/summary/
   write-log clauses).

## Replay

```
bash workers/pkr-t5/harness/instantiate.sh workers/pkr-t5/reference-solution /tmp/<ws>
cd /tmp/<ws>
node /home/lagz0ne/dev/pumped-fn/pkg/tool/lint/dist/cli.mjs --max-warnings 0 src bin tests
npx tsgo --noEmit && npx vitest run && npx tsx bin/export.ts
node --import tsx check-t5.mjs
```

# SKILL v4 REVISION BRIEF (fa-1)

Decision target: minimal skill edits that flip EVAL-R1's two task failures (T-2, T-4)
without bloating the skill or regressing the 8 passes.

Headline correction to the EVAL-R1 framing: T-2 did NOT fail on resource
recognition-in-context. The cold model built the exact reference topology —
`resource({ ownership: "current" })` as a `drainPass` dep, outcome-bound
`ctx.onClose(result => result.ok ? flush : discard)`, claim-before-await, commit-then-
signal, changes-loop dispatcher. All five failed checks share ONE one-line defect: an
output-shape mismatch. Both failures are contract-fidelity misses at the edge of the
graph, not graph-mechanics gaps. v4 is therefore two additive lines-of-guidance, not a
mechanics rewrite.

---

## Failure 1 — T-2 (b2, b3, b4, b5, b7b)

### Root cause chain

1. **What the model built** (`workers/eval-r1/T-2-solution/src/holdshelf.ts:115-132`):
   `drainPass` returns `{ session, printed: holds.map(h => h.holdId) }` — an ARRAY of
   hold ids.
2. **What the checker asserts** (`results/T-2/gate-checker.log`): every failing error is
   the same comparison — `expected {"session":1,"printed":2}, got {"session":1,
   "printed":[1,2]}` (b2), `expected 1, got [1]` (b3), `expected 4, got "1,2,3,4"` (b4,
   arrays coerced), `expected 0, got []` (b5), `expected 2, got [1,3]` (b7b). The
   reference (`workers/pkr-t2/reference-solution/src/holdshelf.ts:143`) returns
   `printed: batch.length` — a COUNT.
3. **Why the model chose the array**: TASK.md R4 says drainPass "returns
   `{ session, printed }`" with no type. The disambiguator was elsewhere in the same
   spec: R8 gives the dispatcher "`{ passes, printed }` totals" — same field name,
   plainly numeric — and the model itself returned numeric totals there (b8 passed).
   It never reconciled the two uses of `printed`.
4. **Skill text gap**: nothing in SKILL.md or references/review.md asks the author to
   diff implemented export signatures against the spec's prescribed shapes, or to keep
   a recurring spec field name one consistent type. review.md's preference table covers
   every graph concern but has no contract-fidelity row.

### Prescribed edit (E1) — review.md, preference table, one new row (~2 lines)

Append to the `preference:` table in `skills/pumped-fn/references/review.md`:

```
| Contract fidelity | Each exported flow's result matches the spec's prescribed shape literally; a field name that recurs across the spec (per-pass `printed`, dispatcher `{ passes, printed }` totals) keeps ONE type everywhere — an aggregate-named field (`printed`, `count`, totals) is a number unless the spec shows elements. Diff every export's return against the spec before the final gate run. |
```

And one reinforcing sentence in SKILL.md "Execution and testing" (end of second
paragraph, ~1 line):

```
Before the final gate run, diff each exported flow's return value against every prescribed shape in the spec; a field the spec also uses as a total is a count, not a list.
```

Expected size: +3 lines total.

---

## Failure 2 — T-4 (b3-nested-failure-dual-entries)

### Root cause chain

1. **What the model built** (`workers/eval-r1/T-4-solution/src/telemetry.ts:67-79`):
   the foreign client call is a child FLOW (`dispatchPickup`) that awaits
   `client.dispatchPickup(id)` and converts only the domain "no" —
   `if (!result.accepted) return ctx.fail({ kind: "dispatch-rejected", scooterId })`.
   A REJECTED promise is never caught; it propagates raw.
2. **What the checker does** (`suite/tasks/T-4/check.mjs:66-70,178-190`): the injected
   client `Promise.reject(new Error("fleet-ops refused"))` for `s-dead`, then asserts
   `errorMentions(failure, "s-dead")` — the scooter id must be recoverable from the
   failure's message/fault/issues/cause chain. The raw rejection carries only
   "fleet-ops refused"; the model's sweep failure never names `s-dead`. Error:
   "sweep failure must carry the offending scooter id". The extension itself was
   correct — b1/b4/b5 (dual entries, resolve entries, ring) all passed.
3. **Reference shape** (`workers/pkr-t4/reference-solution/src/telemetry.ts:56-67`):
   `try { await ctx.exec({ fn: () => ops.dispatchPickup(scooterId), params: [...],
   name: "fleetops.dispatchPickup" }) } catch (error) { return ctx.fail({ code:
   "dispatch-failed", scooterId, message }) }` — ANY failure mode of the foreign edge
   (rejection or domain refusal) becomes the flow's typed fault carrying the domain id.
4. **Skill text gap**: I-26 (SKILL.md:43) and every fn-edge example
   (primitives.md:22, worked-example.md:51, extensions.md:27) show only happy-path
   `await ctx.exec({ fn, params, name })`. I-17 mandates typed faults for planned
   failure but never connects it to the fn-edge site. No sentence says: a foreign edge
   REJECTS as well as refuses — catch at the exec site and fail with the domain
   identifier. The trap corpus's fn-edge bullet (SKILL.md:71) covers only the `params`
   arity trap.

### Prescribed edit (E2) — SKILL.md trap corpus, one new bullet (~3 lines)

Insert into "Trap corpus" directly after the existing fn-edge/`params` bullet
(SKILL.md line 71):

```
- A foreign edge fails two ways: a domain "no" in its return AND a rejected promise. Catch at the exec site and convert both into the flow's declared fault carrying the domain id: `try { await ctx.exec({ fn: () => ops.dispatch(id), params: [], name: "ops.dispatch" }) } catch (error) { return ctx.fail({ code: "dispatch-failed", id, message: String(error) }) }`. A rejection that escapes raw loses the id and is untyped to callers.
```

Optionally mirror one clause in review.md's "Fault taxonomy" row (append: "foreign-edge
rejections are converted to the declared fault at the exec site, id attached").

Expected size: +2-4 lines total.

---

## No-regression argument

- Both edits are ADDITIVE — no existing idiom, trap, or reference sentence is changed
  or removed, so nothing an 8-pass solution relied on moves.
- E1 is process guidance (re-read the spec's shapes); it makes no API claim that could
  contradict library behavior, and no passing task's checker compares against a shape
  the guidance would flip (the passing tasks' result shapes were already spec-literal).
- E2 is a strict strengthening of I-17 + I-26, and matches the T-4 reference and the
  T-4 answer-key DO ("outcome from the wrapped result... ctx.fail carrying the scooter
  id"). Tasks that passed with happy-path fn edges (T-7, T-1, etc.) stay valid: adding
  a catch-and-fail rule cannot fail a checker that never rejects the edge; `ctx.fail`
  inside catch is already the taught planned-failure channel (lint-clean:
  `no-untyped-throw` / `no-swallowed-error` both point the same direction).
- Total growth: ~5-7 lines across SKILL.md and review.md — within "targeted patch".

## Residual (out of skill scope, flag to loop owner)

- T-2's TASK.md R4 is genuinely ambiguous prose (`{ session, printed }` untyped);
  tightening the task to `printed: count` is the other lever if suite edits are
  allowed. The answer key already knew this class ("residual gaming risk" notes) but
  the ambiguity cuts against honest solvers too.
- T-4's model also used a child flow instead of the taught fn edge for the foreign
  call — lint-clean and checker-tolerated; E2's example re-anchors the fn-edge shape
  without adding a rule.

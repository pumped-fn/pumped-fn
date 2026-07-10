# T-1 greenhouse control wiring — summary (worker pkr-t1)

Tier B executable rebuild of T-1 after two kills (chal-1 H-T1: 73.7% transplantable
survey; chal-2 H2-T1: vocabulary-fakeable + answer key demanded unsupported
atom-to-resource watch). Primitive selection is now graded purely by BEHAVIOR against a
prescribed public surface; the derived-status requirement uses the expressible mechanism
(watch in ATOM deps, verified by execution) instead of the killed atom-to-resource watch.

## What the task examines (idiom register IDs)

| Requirement | Primitive under test | Idioms |
|---|---|---|
| R1 shared connection + cleanup + preset seam | transport atom | I-1, I-20/21 |
| R2 per-deployment site config, loud absence | tag + tags.required | I-4 |
| R6/R7 per-operation work record, nested-shared / sibling-distinct | resource ownership "current" | register coverage-gap #1, decision table |
| R6/R8 sub-step composition + trace names | controller(childFlow) deps | I-3, I-26 |
| R5 driver chosen per scope | role tag (value-carrying) | I-5 |
| R4 reactive derived status | controller(atom, {resolve, watch}) in atom deps | I-11 |
| R9 foreign weather call | adapter atom + named fn-exec | I-1, I-26 |
| tests | scope as the only seam | I-20–I-23 |

## Checker (harness/check-t1.mjs — 13 atomic checks)

decl-exports; b1 preset-connection routing; b2 sequential siblings fresh record
(incl. standalone `recorded: 1` twice); b3 concurrent siblings distinct; b4 nested steps
share one record + child executions named vent.plan/vent.apply; n1 NO_PLAN with nothing
sent; b5 driver swap per scope (servo 34 vs stepper 30 from the same input); b6 status
derives from site+readings (two different sites); b7 status reacts after set+flush;
b8 dispose closes connection; t1 weather call named + substituted; n2 missing site
config rejects mentioning "site"; n3 missing driver rejects. Deterministic, pure node,
JSON verdict, exit 0/1 (AG-3).

## Gate results

| Run | lint --max-warnings 0 | tsgo --noEmit | vitest (8 tests) | smoke bin/main.ts | checker |
|---|---|---|---|---|---|
| reference | 0 | 0 | 0 | 0 | 0 (13/13 pass) |
| adversarial/transplant | 0 diagnostics (clean!) | clean | — | — | exit 1 — fails b2, b3 |
| adversarial/fake | 1 diagnostic: no-unattributed-await (the attack itself; exemption noted) | clean | — | — | exit 1 — fails b2, b3, b5, b6, b7, t1, n3 |

lint dist sha256 at gate time: 7ae4e6f7ff276490f80f7f49ddcced98331e9b628c188821844ece85c1d7ac79
(recorded in gates/reference-gates.log). Evidence: gates/reference-gates.log,
gates/checker-reference.json, adversarial/{transplant,fake}/verdict.json.

Replay:
```
bash workers/pkr-t1/harness/instantiate.sh workers/pkr-t1/reference-solution /tmp/ws-t1
cd /tmp/ws-t1 && node --import tsx check-t1.mjs
```

## Adversarial construction (per packet)

- transplant/ = the invoice-shell H-T1 sketched: every requirement mapped 1:1 to
  invoice-triage constructs (cleanup atom, config tag, watch-derived status, notifier-style
  driver tag, named fn-exec) — the ONE thing invoice-triage cannot supply, current-owned
  per-operation state, is mapped to a scope atom. It passes lint AND typecheck and 11/13
  behavior checks; only the ownership checks (b2, b3) kill it. This is the
  untransplantable core (AG-2).
- fake/ = right-vocabulary-wrong-wiring: `resource` declared but `ownership: "boundary"`,
  watch omitted, ventDriver tag exported-not-consumed, weather awaited outside a span.
  Fails 7/13.

## Residual attack classes not closed (honesty)

1. Behavioral twin: inline plan/apply logic + `ctx.exec({fn, name: "vent.plan"})` name
   spoofing reproduces all observables without `resource()` (same class T-7 recorded).
2. Uncached always-recompute `status` passes b7 without watch (review-only DON'T).
3. n2 grades loudness, not mechanism: a hand-thrown "site config missing" guard passes.
4. Only reference + 2 adversarials executed; no second-tier hand-rolled twin run (budget
   cut line, chal-3 material).

## API surprises worth feeding the skill

- fn-exec requires `params: []` at runtime (`ctx.exec({fn, name})` without params throws
  "params is not iterable") — PATTERNS.md's own snippet omits it.
- `atom()` accepts no `name` key (flows/resources do) — cold sessions copying flow style
  into atoms get TS2769.
- Exported frozen driver objects need explicit param types: `Object.freeze` breaks
  contextual typing of an annotated const, and unfrozen exported mutable containers trip
  `pumped/no-module-state`.

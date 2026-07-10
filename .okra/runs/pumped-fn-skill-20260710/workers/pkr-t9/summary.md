# T-9 summary — podcast transcript backfill with staged retry (Tier C)

worker pkr-t9 · run pumped-fn-skill-20260710 · 2026-07-10

## What the task examines

Idioms: I-30 (`prepare()` staged re-execution, primary), I-17 (typed faults + error-class
discrimination drives retry), I-27 (wrapExec extension ledger), I-26 (named foreign edge
`speech.transcribe`), I-4 (vendor + backoff as tags), I-20/I-21 (seam-only tests with
call-logging scripted vendor), I-22/R7 (zero-delay determinism). Domain kept from
dkr-3/dkr-3b T-9 (podcast archive transcription); prompt rebuilt so every chal-2 H2-T9
amendment is a machine-checked pass-gate.

## Checker check-list (harness/check-t9.mjs)

decl-exports · b1-vendor-call-log-per-retry-policy · b2-transcript-roundtrip-cross-context
· b3-error-class-stops-immediately · b4-exhaustion-counts-vendor-calls ·
b5-mixed-batch-isolation · b6-vendor-edge-traced-per-attempt ·
b7-attempt-ledger-matches-script · s1-prepare-staging-site-present

chal-2 amendment mapping: vendor call log ⇒ b1/b3/b4/b5 (checker-owned fake logs every
`transcribe` call; busy,busy,ok must be exactly 3 vendor calls, non-retryable exactly 1);
transcript persistence ⇒ b2 (round-trips checker-generated text across a later context on
the same scope); prepared-invocation identity ⇒ s1 + answer-key DO quote (see residuals);
error class ⇒ b3 (immediate stop, zero backoffs, nothing stored).

## Gate results (reference, gates/reference-gates.log)

| gate | command | exit |
|------|---------|------|
| lint | `node <main>/pkg/tool/lint/dist/cli.mjs --max-warnings 0 src bin tests` | 0 (0 diagnostics) |
| typecheck | `npx tsgo --noEmit` | 0 |
| tests | `npx vitest run` | 0 (5 passed) |
| smoke | `npx tsx bin/backfill.ts` | 0 |
| checker | `node --import tsx check-t9.mjs` | 0 (9/9 pass, gates/checker-reference.json) |

lint dist sha256 at gate time:
`7ae4e6f7ff276490f80f7f49ddcced98331e9b628c188821844ece85c1d7ac79` (recorded in log; note
this dist mtime churns across concurrent workers — dkr-5 flag stands).

Adversarial (AG-2):
- transplant (direct-exec retry shell, no staging/persistence/ledger): checker exit 1,
  9 checks failed incl. decl + s1 (adversarial/transplant/verdict.json). Lint: 1 warn
  `no-swallowed-error` — the warn IS the attack (retry-on-any-error swallows the class),
  exemption noted per AG-1.
- fake (chal-2's no-op backfill, upgraded: exports full surface, uses `.prepare(`, emits
  fake `speech.transcribe` fn edges, internally scripted busy/ok, stores canned text):
  checker exit 1, all 7 behavioral checks failed while decl + s1 PASS — exactly the
  gate-in-by-syntax vector H2-T9 killed, now closed by effect-bound checks
  (adversarial/fake/verdict.json). Fake lints clean (0 diagnostics).

Contribution metric: **admitted** — reference green on all 5 gates; both adversarials fail
the checker.

## API findings (teach-worthy, probe-verified against pinned tarball 4.0.0)

1. `prepare()` is runtime-transparent: it captures merged options once and returns
   `{flow, options, key, ready: Promise.resolve(), exec}`; every `exec()` is a full
   `ctx.exec` — parse, dep resolution, and wrapExec fire once PER attempt (probe:
   parseCount=3 across 3 execs of one staged step). There is no once-staged runtime
   signal to assert on. (Source: lite scope.ts createFlowHandle.prepare, L1120-1134.)
2. `isFault(flow, error)` matches `error.flow === (flow.name ?? "anonymous")`. Two silent
   breakages: passing the deps HANDLE instead of the flow (handle has no `.name`), and
   `controller(child, { name })` overrides — the fault is labeled with the override, so
   `isFault(childFlow, e)` returns false. Classify with the flow object and an un-renamed
   controller, then gate on `error.fault.code`. Typed faults DO propagate intact through
   `step.exec()` into the parent's try/catch.
3. Fn edges: `ctx.exec({ fn, params, name })` — in `wrapExec` the target is the raw
   function; the edge NAME surfaces as `ctx.name`. Ledgers/tracers must key on `ctx.name`.
4. `setTimeout` in bin/ still trips `no-ambient-io-outside-boundary` — even the
   composition root should take delays through the wired backoff, or resolve immediately.

## Residual attack classes (honest)

- **Prepared-invocation identity is review-gated, not machine-gated.** s1 only proves a
  `.prepare(` site exists in src. A solution that stages per-attempt inside the loop (my
  own fake does this), or hoists a direct-exec closure, passes s1; only the answer-key DO
  quote (single staging site outside the attempt loop) catches it. This is the strongest
  library-expressible floor — see finding 1.
- **Checker-aware hardcoding.** b2's transcript strings are fixed in the checker; a
  solver shown the checker could embed them. Threat model excludes checker access; noted.
- **Ledger via own counting, not pipeline.** A fake ledger that re-implements retry math
  keyed to REAL vendor outcomes would pass b7 — but only by actually calling the vendor
  per policy, which is the competence b1 measures; residual is cosmetic (I-27 idiom
  substituted), caught by the DO quote for wrapExec.
- No second-tier behavioral twin (correct effects, non-lite composition) attempted —
  budget cut line, same as dkr-5.

# Answer key — T-9 podcast transcript backfill with staged retry (Tier C)

Concept under test: `prepare()` staged-once re-execution (I-30) with retry gated on error
class (I-17), bound to real effects per chal-2 H2-T9 amendments (vendor call log,
transcript persistence, prepared-invocation identity, error-class gating).

## Differentiators → checker IDs

| ID | Kind | Differentiator | Checker check |
|----|------|----------------|---------------|
| T9-D1 | behavior | Attempts hit the checker-injected VENDOR exactly per retry policy: busy,busy,ok ⇒ exactly 3 vendor calls, each carrying the episodeId; 2 backoff waits | `b1-vendor-call-log-per-retry-policy` |
| T9-D2 | behavior/persistence | Transcript content round-trips: text produced by the checker's vendor (unknowable without calling it) readable via `getTranscript` from the same AND a later context on the same scope; unknown episode reads `null` | `b2-transcript-roundtrip-cross-context` |
| T9-D3 | behavior/negative | Retry gated on error CLASS: non-retryable code (`invalid-audio`) ⇒ vendor call log length 1, `attempts: 1`, code surfaced, zero backoffs, nothing stored | `b3-error-class-stops-immediately` |
| T9-D4 | behavior/negative | `maxAttempts` exhaustion ⇒ exactly maxAttempts vendor calls, failed entry `{attempts: 3, code: "vendor-busy"}`, nothing stored | `b4-exhaustion-counts-vendor-calls` |
| T9-D5 | behavior | Batch isolation: permanent failure of one episode does not stop siblings; per-episode vendor call log exact | `b5-mixed-batch-isolation` |
| T9-D6 | behavior | Every real vendor call is a traced execution named `speech.transcribe` (observer extension count == vendor call log length == 3) | `b6-vendor-edge-traced-per-attempt` |
| T9-D7 | behavior | `attemptLedger` counts from REAL pipeline observation: `speech.transcribe` = `{started: 3, succeeded: 1, failed: 2}` under busy,busy,ok — fabricated ledgers desync from the injected vendor script | `b7-attempt-ledger-matches-script` |
| T9-D8 | declaration + static proxy | Prescribed exports are real flows/tags/factory (`decl-exports`); a `.prepare(` staging site exists in `src/` (`s1-prepare-staging-site-present`) | `decl-exports`, `s1-prepare-staging-site-present` |

### T9-D8 honesty note (prepared-invocation identity)

Probed per assignment (PATTERNS.md L103-131; lite scope.ts `createFlowHandle.prepare`,
L1120-1134; runtime probe in workers/pkr-t9 lineage): `prepare()` captures merged options
once and returns `{flow, options, key, ready: Promise.resolve(), exec}` where every
`exec()` performs a FULL `ctx.exec` — child context, `parse`, dep resolution, and
`wrapExec` all fire once PER attempt (probe: parseCount=3 for 3 execs of one staged step).
`prepare()` is runtime-transparent BY DESIGN (PATTERNS: "no child ctx, no parse, no
wrapExec, no OTEL span" at staging; wrapExec must see one child execution per exec). There
is therefore NO library-observable once-staged runtime signal. The strongest
library-expressible proxy is the static staging-site scan (s1) plus the reviewer-verified
DO quote below; the residual (prepare-per-attempt inside the loop, or a hoisted direct-exec
closure) is recorded in summary.md and is graded by review quote, not machine.

## DO/DON'T design trace (reviewer-verified; sources: workers/dkr-1/idiom-register.md)

DOs — reviewer quotes each from the submission:
- DO stage the child invocation once per episode and re-execute the staged step in the
  retry loop: quote the single `transcribe.prepare({ input: { episodeId } })` site OUTSIDE
  the attempt loop and the `step.exec()` inside it (I-30). `preference` (machine floor: s1)
- DO compose the child flow through `controller(transcribeEpisode)` deps, never
  `ctx.exec({ flow: child })` inline. `lint:pumped/no-direct-flow-composition`
- DO declare `faults: typed<...>()` on the child and fail via `ctx.fail({ code, episodeId })`;
  no bare `throw new Error` in factories. `lint:pumped/no-untyped-throw` (I-17)
- DO classify caught child errors with `isFault(transcribeEpisode, error)` (the FLOW, not
  the deps handle) and gate retry on `error.fault.code`. `preference` (I-17; probe gotcha:
  passing the handle, or naming the controller, silently breaks `isFault`)
- DO obtain vendor and backoff via tags (`tags.required(speechVendor)` /
  `tags.required(backoff)`); wiring supplies concretes. `lint:pumped/no-implicit-tag-read`,
  `lint:pumped/no-ambient-io-outside-boundary` (I-4)
- DO name the vendor edge: `ctx.exec({ fn, params, name: "speech.transcribe" })`.
  `lint:pumped/no-unattributed-await` (I-26)
- DO implement `attemptLedger` as a `wrapExec` extension keyed on `ctx.name`, installed
  via `extensions: []`. `preference` (I-27; probe: fn-edge names surface as `ctx.name`,
  the wrapExec target is the raw fn)
- DO test only through `createScope({ tags, extensions })` + exec with a call-logging
  scripted vendor and instant backoff. `lint:pumped/no-module-mocks` (I-20, I-21)

DON'Ts:
- DON'T re-dispatch `transcribe.exec({ input })` from scratch per attempt where staging is
  required. `preference` (I-30; the fake/transplant path)
- DON'T swallow the caught child error (retry-on-anything). `lint:pumped/no-swallowed-error` (I-17)
- DON'T put timers/`setTimeout` in product code; delay comes only through the backoff tag.
  `lint:pumped/no-ambient-io-outside-boundary` (I-4, R7)
- DON'T let one episode's permanent failure abort the batch or store partial transcripts.
  `preference` (checker b3/b5)
- DON'T fabricate ledger counts outside pipeline observation. `preference` (checker b7 desyncs it)

## Replay

```
bash workers/pkr-t9/harness/instantiate-t9.sh workers/pkr-t9/reference-solution /tmp/ws-t9
cd /tmp/ws-t9
node <main>/pkg/tool/lint/dist/cli.mjs --max-warnings 0 src bin tests
npx tsgo --noEmit && npx vitest run && npx tsx bin/backfill.ts
node --import tsx check-t9.mjs
```

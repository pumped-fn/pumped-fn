# Task T-9: Podcast transcript backfill with staged retry

Build the transcript backfill worker for a podcast archive. Use `@pumped-fn/lite`
(provided in the workspace) for composition. Everything else is plain TypeScript — no
other runtime dependencies.

## Domain rules

The archive holds episodes whose audio was never transcribed. A third-party speech vendor
does the actual transcription; it is flaky under load.

- **R1 Vendor capability.** The speech vendor is a capability
  `{ transcribe: (request: { episodeId: string }) => Promise<{ text: string }> }` supplied
  at process wiring time — product code must not construct or import a concrete vendor.
  A vendor call either resolves with the transcript text or rejects with an `Error`
  carrying a string `code` property. `"vendor-busy"` means transient overload; any other
  code (for example `"invalid-audio"`) is a permanent verdict about that episode.
- **R2 Transcribe one episode.** `transcribeEpisode`: given `{ episodeId }`, performs the
  vendor call and, on success, stores the transcript so it can be read back later. The
  vendor call must appear in traces as a distinct execution named `speech.transcribe` —
  visible to any installed observer, one traced execution per real vendor call.
- **R3 Backfill with retry.** `backfill`: given
  `{ episodeIds: string[]; maxAttempts: number }`, transcribes every episode in order.
  Per episode, the transcription invocation is staged ONCE and the staged invocation is
  re-executed on retry — do not re-compose or re-dispatch the call from scratch on every
  attempt. Retry only on `"vendor-busy"`, up to `maxAttempts` total attempts. Any other
  error code fails that episode immediately with exactly one attempt. One episode's
  failure must not stop the rest of the batch. Returns
  `{ done: string[]; failed: { episodeId: string; attempts: number; code: string }[] }`.
- **R4 Backoff.** Between one failed busy attempt and the next attempt, wait via a delay
  source `(attempt: number) => Promise<void>` supplied at wiring time — never a literal
  timer in product code. Tests and the grader run with zero real delay.
- **R5 Read-back.** `getTranscript`: given `{ episodeId }`, returns `{ text }` for a
  stored transcript or `null` when none exists. Transcripts persist for the life of the
  process wiring: a transcript stored during one operation session must be readable from
  a later session on the same wiring.
- **R6 Attempt ledger.** Ship `attemptLedger`, a factory returning
  `{ extension, counts }`: `extension` observes executions when installed at wiring time;
  `counts()` returns, per operation name,
  `{ started: number; succeeded: number; failed: number }`. Under a vendor scripted to
  reply busy, busy, ok, `counts()["speech.transcribe"]` must read
  `{ started: 3, succeeded: 1, failed: 2 }`.
- **R7 Determinism.** No clocks, timers, randomness, or environment reads in product code
  or tests.

## Deliverables (fixed paths — the grader imports these)

- `src/transcripts.ts` — exports the flows `transcribeEpisode`, `backfill`,
  `getTranscript`, the two wiring points `speechVendor` and `backoff`, and the
  `attemptLedger` factory. The grading harness composes deployments and executes exactly
  like this:

  ```ts
  import { attemptLedger, backfill, backoff, getTranscript, speechVendor } from "./src/transcripts.ts"

  const ledger = attemptLedger()
  const scope = createScope({
    tags: [speechVendor(myVendor), backoff(async () => {})],
    extensions: [ledger.extension],
  })
  const session = scope.createContext()
  const outcome = await session.exec({
    flow: backfill,
    input: { episodeIds: ["e1"], maxAttempts: 5 },
  })
  ```

  The harness supplies its own scripted vendor (which logs every call it receives) and
  its own instant backoff — same flows, different `createScope` wiring only.
- `tests/` — vitest tests proving, with a scripted fake vendor that keeps a call log:
  busy, busy, ok succeeds with exactly 3 vendor calls; a non-busy error code fails
  immediately with exactly 1 vendor call and `attempts: 1`; `maxAttempts` exhaustion
  lands in `failed` with the right count; ledger numbers match the script; zero real
  delays anywhere — swapping only wiring, never patching modules.
- `bin/backfill.ts` — runnable demo (`npx tsx bin/backfill.ts`): wires a canned
  locally-defined vendor that is busy once per episode then succeeds, runs a small
  backfill, prints the result and the ledger as JSON to stdout.

## Gates your submission must pass

1. `node <lint-cli> --max-warnings 0 src bin tests` — zero diagnostics.
2. `tsgo --noEmit` (strict).
3. `vitest run` — your tests pass.
4. `npx tsx bin/backfill.ts` — prints a completed backfill result and ledger.
5. The behavioral grading harness (real execution of your exports against R1–R7 with a
   call-logging scripted vendor, an observer extension, and a source-level staging-site
   scan for R3).

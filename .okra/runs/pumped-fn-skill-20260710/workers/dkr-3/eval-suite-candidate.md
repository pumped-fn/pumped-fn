# Cold-Build Eval Suite — CANDIDATE (DKR-3)

run: pumped-fn-skill-20260710 / worker dkr-3
status: CANDIDATE — pending human ratification (denominator freeze). Nothing here is final until ratified.
upstream: builds on accepted DKR-1 idiom register `.okra/runs/pumped-fn-skill-20260710/workers/dkr-1/idiom-register.md` (sha256 32b6c2f0ceb7455f404b92bbcf69be4fd2215bba57ae7cf152224f2a21dd6b3f) — primitive decision table, idioms I-1..I-32, rubric dims R1-R8, AG-2 coverage guidance (register sec.3-4).
scope constraint honored: React and Hono adapter surfaces excluded; tasks cover core lite + testing + extensions + scheduler only.

Tier ladder: (A) primitive-choice reasoning · (B) build code + entrypoint · (C) build code + tests · (D) build code + tests + extension.
Distribution: A×1, B×1, C×6, D×2 (weighted toward C/D per objective).

Conventions for every build task (B/C/D) — included verbatim in each cold prompt's preamble:

> You are given a workspace with `@pumped-fn/lite` (and where stated, `@pumped-fn/lite-extensions`, `@pumped-fn/lite-scheduler`, `@pumped-fn/lite-sdk-test`) installed, TypeScript strict, vitest, and the pumped lint tool configured. Deliverables: source under `src/`, a runnable entrypoint under `bin/` where stated, tests under `tests/` where stated. Your code must pass `lint` with zero diagnostics of any severity, `tsc --noEmit`, and `vitest run`. Do not install additional dependencies.

Task prompts never name idioms, I-numbers, or pumped-fn pattern vocabulary ("port flow", "signal-after-commit", ...). The "Target idioms" block per task is the grader's answer-key skeleton and is never shown to the cold session.

---

## 1. Task set

### T-1 — Community greenhouse controller: design the graph (Tier A)

Domain: hydroponic greenhouse automation.

**Prompt (verbatim, cold session receives this + the skill only):**

> You are designing (not implementing) a controller for a community greenhouse using `@pumped-fn/lite`. Requirements:
> 1. A serial connection to the sensor bus that must be opened once per process and closed on shutdown.
> 2. The target humidity band, configurable per deployment site.
> 3. Current sensor readings, refreshed by an ingest process; several features react when readings change.
> 4. A "vent adjustment" operation: takes a requested vent angle, validates it, writes to the actuator, records an audit row — invoked per request from a CLI.
> 5. A misting run that must acquire a water-line lease before starting and release it whether the run succeeds or fails; if the run failed, the lease release must mark the line "needs inspection".
> 6. A grower-notification capability where each site plugs in its own delivery mechanism (SMS at one site, a wall display at another); tests need to capture notifications.
> 7. A nightly soil-report job.
> 8. Something that says "the greenhouse is in a safe state" — true only when readings are fresh AND no misting run is active.
>
> For each requirement 1-8, state which pumped-fn construct you would use, one sentence on why that one and not its nearest alternative, and what its dependencies are. Then sketch the whole graph as a dependency list (`node <- deps`). Also state where in the codebase `createScope` may be called, and why. Deliverable: a single markdown file `DESIGN.md`. No implementation code.

**Target idioms (answer key, hidden):** decision table (all rows); I-1, I-2, I-4, I-5, I-11, I-12; resource for req 5 (register sec.3 gap 1: lease with onClose result-dependent behavior); port flow for req 6; derived watch-controller atom for req 8. Dimensions: R1, R2 only.

**AG-2 note:** No queue, no triage, no documents, no LLM classification, no reminder cadence — none of the invoice-triage feature set maps onto these 8 requirements. Req 5 (result-dependent lease release) is a `resource()` requirement that invoice-triage never exercises (register sec.3 gap 1), so transplanting the example yields a wrong answer (tx-as-atom or lease-inside-flow). Similarity self-check: the only shared shape is "an audit row inside the same operation" (I-8), which is a general invariant, not a domain replay.

---

### T-2 — Library hold-shelf pipeline (Tier C)

Domain: public-library reservation holds.

**Prompt:**

> Build a hold-shelf pipeline for a library. When a reserved book is returned, a hold record must be created and eventually a pickup slip printed. Requirements:
> - `POST`-shaped intake (call it a `recordReturn` operation exposed from your code; no HTTP needed): given `{ isbn, copyId }`, atomically insert a `holds` row (status `pending`) plus a `hold_events` row in the same database transaction. Use the provided in-memory SQL database handle (a `Database` type exporting `transaction` and query helpers is scaffolded for you in `src/database.ts` — wire it into the graph; do not import it directly from feature files).
> - A long-running dispatcher drains ALL pending holds whenever new ones appear, marks each `slip_printed`, and asks a slip-printer capability to print. It must not poll on a timer, must not lose a hold even if 100 arrive in one burst while it is busy, and must not act on a hold whose insert has not committed.
> - Duplicate `recordReturn` for the same `copyId` while a hold is pending must not create a second hold, even when two calls race.
> - A `stop` operation that lets the dispatcher finish its current drain and exit cleanly; the entrypoint (`bin/daemon.ts`) starts the dispatcher, handles SIGINT via stop, and exits 0.
> Deliverables: `src/`, `bin/daemon.ts`, and tests that prove: burst of N returns yields N printed slips exactly once; the duplicate race; that no slip is printed for an uncommitted hold when the transaction fails; clean shutdown mid-burst. Tests must be deterministic — no sleeps, no retries-until-green — and must exercise your real code, swapping only infrastructure.

**Target idioms:** I-6, I-7, I-8, I-10 (primary); I-1..I-4, I-20..I-23, I-32. Dimensions: R1, R2, R3, R4, R5, R6.

**AG-2 note:** Same structural family as invoice-triage's ingest queue (I-6/I-7 must be sampled somewhere — this is the designated task for it) but zero domain overlap: no classification step, no external model, no reminder/notification cadence, no document parsing. A session replaying invoice-triage's `intakeLines`/stdin adapter, classify child-flow, or triage generator gets structure the prompt never asked for (R1/R2 deductions); the duplicate-race requirement (claim-then-insert on `copyId`) and finish-current-drain shutdown must be derived, not copied. Highest residual similarity in the suite — flagged for the challenger to attack first; mitigation is the answer key requiring different atomicity keys and a printed-exactly-once invariant absent from the example.

---

### T-3 — Observatory imaging windows (Tier C)

Domain: robotic telescope scheduling.

**Prompt:**

> Build the job layer for a robotic telescope using `@pumped-fn/lite` and the scheduler extension. Requirements:
> - An `captureFrame` operation that asks a camera capability for a frame and appends it to a nightly manifest (in-memory state is fine).
> - A recurring capture job every 10 minutes. A capture can take longer than 10 minutes on long exposures: a new capture must never start while one is running, and missed slots must NOT be made up afterwards (a stale frame is worthless).
> - A recurring `uploadManifest` job every hour; if the process was suspended (laptop-lid scenario) and wakes up hours later, the missed uploads SHOULD run, in order.
> - Where "now" is needed (frame timestamps), it must be swappable in tests.
> - Entrypoint `bin/observatory.ts` wires everything and runs.
> Deliverables: `src/`, `bin/observatory.ts`, and tests that drive both jobs deterministically — prove the no-overlap behavior with a slow capture, prove exactly the catch-up difference between the two jobs, and assert manifest contents with a fixed clock. Real time (sleeps, setInterval, Date.now in tests) is a failure.

**Target idioms:** I-12 (primary: overlap + catchUp policy divergence between the two jobs, manual backend in tests); I-4 (clock tag), I-22, I-25. Dimensions: R1, R2, R3, R4, R6, R7.

**AG-2 note:** Invoice-triage has two scheduled jobs but with a single policy shape; here the task's core is choosing OPPOSITE `overlap`/`catchUp` values per job from stated domain physics (stale frame vs. must-upload). Copying the example's job config verbatim fails half the requirements. No documents, no queue, no notifier.

---

### T-4 — Scooter-fleet telemetry daemon (Tier D)

Domain: shared e-scooter fleet operations.

**Prompt:**

> Build a telemetry daemon for an e-scooter fleet. Requirements:
> - A `reportPosition` operation: input arrives as an untrusted JSON line and is one of two wire shapes — `{ "kind": "gps", "scooterId": string, "lat": number, "lng": number }` or `{ "kind": "cell", "scooterId": string, "cellId": string }`. Reject malformed lines with a structured error naming the offending field; store accepted positions.
> - A `lowBatterySweep` operation that, for every scooter under 15% battery, calls a fleet-ops HTTP client's `dispatchPickup(scooterId)` (client is scaffolded in `src/fleetops-client.ts`; treat it as a foreign SDK).
> - Every run of every operation, and every call to the fleet-ops client, must be visible in structured logs/traces without any log statement appearing inside the business logic — install the library's observability at the process boundary. Each fleet-ops call must carry a human-readable name in the trace.
> - Additionally, ship a small custom extension `auditTrail` that records, for every executed operation, `{ name, ok, durationMs }` into an in-memory ring buffer of the last 100 entries, exposed for the entrypoint to dump on shutdown.
> - `bin/daemon.ts`: wires everything, reads JSON lines from stdin, shuts down cleanly on stdin end (in-flight sweep finishes; audit trail dumped; exit 0).
> Deliverables: `src/`, `bin/daemon.ts`, tests proving: both wire shapes parse and a malformed line yields the structured error (not a crash); the sweep dispatches exactly the right scooters with the client swapped out; the auditTrail extension records entries with correct `ok` for a succeeding and a deliberately failing operation; clean shutdown. Deterministic tests only.

**Target idioms:** I-25, I-26, I-27 (primary, incl. custom wrapExec extension with onClose result); I-9, I-17 (zod union at boundary — register sec.3 thin-spot 5), I-10, I-1, I-20, I-21. Dimensions: all R1-R8.

**AG-2 note:** Superficially "daemon reading stdin lines" echoes invoice-triage's intake, but the graded core — a hand-written extension using wrapExec + close-result, and boundary-mapped structured parse errors — is exactly what the example does NOT hand-roll (it consumes prebuilt extensions; register I-27 evidence for custom extensions is PATTERNS-only). Transplanting invoice-triage gives no auditTrail and no error taxonomy. No queue/signal machinery is required or rewarded here.

---

### T-5 — Recipe-archive import with live progress (Tier C)

Domain: home-cooking recipe archive migration.

**Prompt:**

> Build an importer that migrates a legacy recipe archive. Requirements:
> - `importRecipe`: given `{ slug }`, fetches the legacy record via a scaffolded `LegacyArchive` client, converts units, stores the result, and while running reports progress as typed events: `{ stage: "fetched" } | { stage: "converted" } | { stage: "stored", id: string }` — a caller must be able to either just await the final stored id, or consume the progress events as they happen, from the same operation (no duplicate implementations, no callback parameters).
> - `importCollection`: given `{ slugs: string[] }`, imports each recipe sequentially, forwarding every child progress event upward prefixed with the slug, and returns `{ imported: number, failedSlugs: string[] }`. A failed recipe must not abort the collection.
> - If a consumer abandons the progress stream mid-import, the run must stop doing work and its outcome must reflect that it was aborted, observably.
> - `bin/import.ts <slug...>` runs a collection import printing progress lines.
> Deliverables: `src/`, `bin/import.ts`, tests proving: awaiting-only and streaming consumption of `importRecipe` both work and yield identical stored results; `importCollection` forwards prefixed child events in order and survives one failing slug; the abandonment behavior with an assertion on the reported outcome. Deterministic tests.

**Target idioms:** generator flows + `yield*` child-stream composition + `stream.result` (decision-table row 3), I-3 (controller(childFlow)), I-23 (abandonment `{ ok:false, aborted:true }`), I-17, I-31. Dimensions: R1, R2, R3, R4, R5, R6.

**AG-2 note:** Invoice-triage's `importBatch` is the same MECHANISM (that is the point — streaming composition must be sampled) but the graded requirements diverge: per-child failure isolation with `failedSlugs` (the example aborts differently), event prefixing (requires transforming, not just `yield*`-ing, the child stream), and dual-consumption equivalence tests. A verbatim `importBatch` transplant fails the failure-isolation and prefixing tests. Domain shares nothing with invoicing.

---

### T-6 — Gallery climate watch (Tier C)

Domain: museum conservation monitoring.

**Prompt:**

> Build the state core for a museum gallery climate monitor. Requirements:
> - Per-gallery latest readings `{ galleryId, tempC, rh }` held in process state, updated by an `ingestReading` operation.
> - A derived value `atRisk: string[]` — gallery ids whose humidity is outside 40-55% — that recomputes automatically whenever readings change, with NO manual subscription or event-emitter code, and does not recompute when a new reading leaves the at-risk set unchanged (prove this).
> - A monitor loop that wakes when `atRisk` changes and asks a conservator-alert capability to send one alert per newly at-risk gallery (implementation supplied at wiring time; tests capture alerts). Rapid reading bursts may coalesce wakeups — that must be safe: no missed newly-at-risk gallery, no duplicate alert for a gallery already alerted.
> - The readings state must survive periods with zero observers.
> - `bin/monitor.ts` wires and runs it.
> Deliverables: `src/`, `bin/monitor.ts`, tests proving: derived recomputation and the no-recompute-on-equal case; burst coalescing safety (drive many updates, assert exact alert set); alert capability swapped in tests. Deterministic.

**Target idioms:** I-11 (primary: `controller(dep,{resolve,watch,eq})` derived atom, incl. `eq` to suppress equal recomputes — register sec.3 gaps 5 partially), I-6 applied to state-view (conflation-safe diffing), I-31, I-32 (`keepAlive`), I-5, I-20..I-22. Dimensions: R1, R2, R3, R5, R6.

**AG-2 note:** Invoice-triage's only derived atom (`drained`) is a boolean of counters; here the derived value is a computed collection with a custom `eq`, and the coalescing-safety requirement forces diff-against-last-alerted state rather than the example's drain-a-table loop. Transplanting the ingest-queue pattern (DB rows + drain) is the wrong primitive family for a state view and loses R1 points. No shared domain.

---

### T-7 — Chess-club pairing engine (Tier C)

Domain: chess tournament round pairing.

**Prompt:**

> Build the pairing engine for a chess club's tournament nights. Requirements:
> - `generateRound`: given `{ tournamentId }`, computes pairings for the next round from current standings and writes them. ALL writes for one call — the round row, each pairing row, and a standings-version bump — must go through a single unit-of-work object that: is created fresh for each `generateRound` execution and shared by that execution's whole call tree (a `writePairing` sub-operation must see the same one); commits when the execution finishes successfully; rolls back when the execution fails; and additionally appends to `pairing_audit` whether it committed or rolled back. The unit-of-work must not be constructible or reachable outside an execution, and must never leak between two concurrent `generateRound` calls.
> - Pairing rule (keep it simple): sort by score desc, pair adjacent; odd player out gets a bye. A tournament with zero registered players must fail with a structured domain error and leave no partial writes.
> - `bin/pair.ts <tournamentId>` runs one round against the scaffolded in-memory store.
> Deliverables: `src/`, `bin/pair.ts`, tests proving: commit path (all rows present, audit says committed); rollback path (force a failure mid-tree, zero partial writes, audit says rolled back); two concurrent `generateRound` calls get distinct units of work; the zero-player error. Deterministic.

**Target idioms:** `resource()` primary — ownership `boundary`, `onClose(result => commit/rollback)` (register sec.3 gap 1, decision-table row 4); I-3 (child op shares boundary resource), I-17, I-8, I-20, I-23. Dimensions: R1, R2, R3, R4, R6.

**AG-2 note:** This is the designated resource-centric task. Invoice-triage NEVER uses `resource()` (it calls `db.transaction` inline — register sec.3 gap 1), so this task is structurally unanswerable by transplanting the example: copying invoice-triage's tx style fails the "shared by the whole call tree, unreachable outside an execution" and "concurrent calls get distinct units" requirements. Domain disjoint from invoicing.

---

### T-8 — Summit weather alerts, multi-channel (Tier C)

Domain: mountain-hut weather-station alerting.

**Prompt:**

> Build the alert fan-out for a mountain weather station. Requirements:
> - An `issueAlert` operation: given `{ severity: "watch" | "warning", text: string }`, delivers the alert through EVERY registered delivery channel. Channels are registered at process wiring time — one deployment registers radio + siren, another registers only radio, a third registers radio + siren + valley-SMS. Feature code must not know or enumerate concrete channels; adding a channel at a deployment must require touching only that deployment's wiring.
> - Each channel returns `{ delivered: boolean }`; `issueAlert` returns `{ attempted: number, delivered: number }` and must attempt all channels even if one throws (a throwing channel counts as not delivered, and the failure must remain observable in traces, not swallowed silently).
> - An optional "quiet hours" setting: if configured at wiring time, `warning`s still go out but `watch`es are suppressed during quiet hours; if not configured, everything goes out. Feature code must handle absence without defaults sprinkled inline.
> - A test-focused requirement: with three fake channels registered, prove fan-out count, the one-throwing-channel accounting, and both quiet-hours configurations — swapping only wiring, never patching modules.
> - `bin/alert.ts <severity> <text...>` wires two console-backed channels and runs.
> Deliverables: `src/`, `bin/alert.ts`, tests as above. Deterministic.

**Target idioms:** port multiplicity primary — `tags.all` fan-out over a channel port, `tags.optional` for quiet hours (register sec.3 gap 4); I-5, I-4, I-17 (observable-not-swallowed), I-26, I-20, I-21. Dimensions: R1, R2, R3, R6, R7, R8.

**AG-2 note:** Designated port-multiplicity task. Invoice-triage uses exactly one notifier bound via a single required tag; `tags.all` role fan-out and `tags.optional` appear nowhere in the example (register sec.3 gap 4). A transplant produces a single-notifier design that structurally cannot satisfy "every registered channel" + per-deployment channel sets. Domain disjoint.

---

### T-9 — Podcast transcript backfill with retry (Tier D)

Domain: podcast archive transcription.

**Prompt:**

> Build a transcript backfill worker for a podcast archive. Requirements:
> - `transcribeEpisode`: given `{ episodeId }`, calls a scaffolded flaky `SpeechVendor` client (fails transiently ~x% of calls with `VendorBusy`), stores the transcript on success.
> - `backfill`: given `{ episodeIds: string[], maxAttempts: number }`, runs `transcribeEpisode` for every episode with retry: an episode's invocation should be staged ONCE and re-executed up to `maxAttempts` times on `VendorBusy` only (any other error fails that episode immediately); returns `{ done: string[], failed: { episodeId: string, attempts: number }[] }`. Between retry attempts, back off by a delay obtained from a swappable source (tests must run instantly).
> - Ship a custom extension `attemptLedger` that observes executions and counts, per operation name, `{ started, succeeded, failed }`, exposed to the entrypoint; the vendor call itself must appear in traces under the name `speech.transcribe`.
> - `bin/backfill.ts <episodeId...>` runs a backfill and prints the ledger.
> Deliverables: `src/`, `bin/backfill.ts`, tests proving: a script of vendor responses (busy, busy, ok) succeeds in 3 attempts; a non-busy error fails immediately with attempts=1; maxAttempts exhaustion lands in `failed` with the right count; ledger numbers match; zero real delays in tests. Deterministic.

**Target idioms:** `prepare()` staged re-execution primary (I-30, register sec.3 gap 3); I-17 (error-class discrimination drives retry), custom extension (I-27), I-26 named foreign edge, I-4 (swappable backoff/clock), I-21 (scripted vendor fake), I-20, I-22. Dimensions: R1, R2, R3, R4, R6, R7, R8.

**AG-2 note:** Designated prepare/retry task. Invoice-triage never uses `prepare()`/`step.ready` (register sec.3 gap 3) and has no retry anywhere; its scripted-model test fake is the nearest neighbor, but the graded core — stage-once-re-exec semantics and error-class-gated retry — cannot be pattern-matched from it. Domain disjoint.

---

### T-10 — Field-log CLI for birdwatchers (Tier B)

Domain: birding trip logs.

**Prompt:**

> Build a small CLI that ingests birdwatching field logs. Requirements:
> - Input: newline-delimited JSON on stdin, two accepted shapes: `{ "type": "sighting", "species": string, "count": number (int >= 1), "at": ISO datetime string }` and `{ "type": "note", "text": string (non-empty) }`. Anything else — unknown type, wrong field types, count 0, empty text — must produce, on stderr, a one-line machine-readable rejection `{ "line": n, "error": <structured reason naming the field> }` and continue; it must never throw across the boundary or stop the run.
> - Valid records pass to an `appendEntry` operation that appends to an in-memory trip log; internal handoff of already-validated records must not pay a second validation.
> - `sighting` entries get a sequence number and a normalized `{ species, count, at }` record; the current date for defaulting a missing `at` must come from a swappable source, not read ambiently.
> - On stdin end, print a summary `{ accepted, rejected, speciesCount }` to stdout and exit 0 (exit 1 only if zero lines were accepted).
> - Deliverables: `src/` and `bin/fieldlog.ts`. No tests required for this task — but the code must be structured so that the operations and the log state are testable without touching stdin/stdout (the graders will check the structure, not run your tests).

**Target idioms:** I-9 primary (zod union at boundary, `typed<T>()` internal, ParseError→protocol mapping — register thin-spot 5); I-1 (stdin as transport adapter), I-4 (clock tag), I-2, I-17. Dimensions: R1, R2, R6, R8 (no R3 — tier B).

**AG-2 note:** Shares "lines on stdin" with invoice-triage's intake, but the graded core is the parse/typed split and per-line structured rejection protocol — invoice-triage parses one union at a store flow and never emits a rejection protocol. A transplant of the example's stdin adapter alone earns nothing on R8; the summary/exit-code contract is novel. Domain disjoint.

---

### Task-set coverage matrix (assignment checklist)

| Required coverage | Task |
|---|---|
| resource-centric | T-7 (primary), T-1 req 5 |
| port multiplicity (tags.optional/tags.all) | T-8 (primary), T-1 req 6 |
| prepare/retry | T-9 |
| state-backed queue + signal (I-6/I-7) | T-2 |
| scheduler + manual backend (I-12) | T-3 |
| graceful shutdown (I-10) | T-2, T-4 |
| derived state (I-11) | T-6, T-1 req 8 |
| parse-at-boundary (I-9) | T-10 (primary), T-4 |
| observability (I-25/I-26) | T-4 (primary), T-3, T-9 |
| streaming/generator flows | T-5 |
| custom extension (I-27) | T-4, T-9 |

Domains: greenhouse, library, observatory, scooter fleet, recipes, museum, chess, weather station, podcasts, birding — mutually distinct, none billing/invoicing/triage-adjacent.

---

## 2. Rubric scoring sheet

Per-dimension score ∈ {0, 0.5, 1}: 1 = requirement met with quoted evidence; 0.5 = met with a material deviation the grader names; 0 = missed or counter-evidence. Every non-zero score REQUIRES at least one verbatim quote (file + line range from the solution); every 0 on an applicable dimension requires either a quote of the offending code or the statement "absent: searched <files>". Unquoted scores are invalid and re-graded (AG-3 audit hook).

| Dim | Weight | Grader must QUOTE to award | Tier applicability |
|---|---|---|---|
| R1 Primitive selection | 20 | The declaration site of each primitive named in the task's answer key (e.g. the `resource(...)` for T-7's unit-of-work, the `tags.all` dep for T-8) showing the right construct chosen; for 0: the wrong-primitive declaration (e.g. tx-as-atom) | A, B, C, D |
| R2 Graph visibility & boundary ownership | 18 | The composition root's `createScope`/`createContext` call; one feature-file dep declaration proving effects arrive via deps (no ambient import); for 0: a helper accepting scope/ctx or ambient IO in a factory | A, B, C, D |
| R3 Testability through the seam | 15 | One test's `createScope({ presets/tags/extensions })` block showing infra swapped at the seam; the determinism device (gate/manual backend/scripted fake); for 0: `vi.mock`, sleep, or internal reach | C, D |
| R4 Lifecycle & failure honesty | 12 | The close/cleanup/commit-rollback site tied to the execution result (e.g. `onClose(result => ...)`, stop-flow + loop-exit, `ctx.close({ ok })` in tests) matching the task's lifecycle requirement | B, C, D (where answer key lists R4) |
| R5 State & streaming correctness | 10 | The line placing must-not-drop work in state (or pull-driven generator) and the wake/consume site; for coalescing tasks, the diff-against-committed-state logic | C, D (where listed) |
| R6 Style & residual lint-class judgment | 8 | Gate G1 already forces 0 diagnostics; points here grade review-only style: no comments, no handle suffixes, destructured deps, no ceremony/facades (I-13..I-19 review-only residue). Quote one representative factory signature; for deductions quote the offending line | B, C, D |
| R7 Observability integration | 9 | The root `extensions: [...]` install; one named foreign edge (`ctx.exec({ fn, name })` or equivalent); for 0: inline log call inside business logic or anonymous foreign await | B, C, D (where listed) |
| R8 Input & error taxonomy | 8 | The boundary parse (zod at wire, `typed` internal); one domain-error class with structured fields and its throw site; the boundary error mapping | B, C, D (where listed) |
| **Total** | **100** | | |

Applicability rule: a task's answer key lists its applicable dimensions (sec.1). Non-applicable weights are dropped and the task score renormalizes over applicable weight (formula below) — a tier-A task is graded on R1+R2 (38 points) renormalized to 1.0.

### Hard gates (pass/fail multipliers, not points)

| Gate | Check (deterministic script) | Applies to |
|---|---|---|
| G1 lint-zero | pumped lint CLI over `src/ bin/ tests/`, zero diagnostics INCLUDING warn-tier (AG-1) | B, C, D |
| G2 typecheck | `tsc --noEmit` exit 0 | B, C, D |
| G3 tests-green | `vitest run` exit 0, at least the task's demanded proofs present as test cases (script counts test names against a per-task manifest) | C, D |
| G4 entrypoint-runs | scripted smoke: run the bin with canned input, exit code + stdout contract per task | B, C, D |
| G5 format (tier A only) | `DESIGN.md` exists, covers all 8 requirements (script greps req coverage) | A |

**Gate semantics (proposed):** any applicable gate failure ⇒ that task's score = 0. Rationale: AG-1 makes G1 non-negotiable; a single all-or-nothing rule removes grader discretion (AG-3, AG-5) and matches "hard gates" in the objective. Alternative for the human to consider: G4-only failure caps the task at 40% instead of 0 (an entrypoint wiring slip is less diagnostic of skill quality than lint/type/test failure). Ratify one; default proposal is the strict zero.

### Per-task score formula

```
gate(t)      = 1 if all applicable gates pass, else 0        (or 0.4 G4-only, if alternative ratified)
rubric(t)    = Σ over applicable dims d of weight(d) × score(d)  /  Σ applicable weight(d)
task_score(t) = gate(t) × rubric(t)                            ∈ [0, 1]
```

### Suite aggregation

Tier multipliers weight harder tasks: A = 0.5, B = 0.75, C = 1.0, D = 1.25.

```
suite_% = 100 × Σ_t ( tier_mult(t) × task_score(t) )  /  Σ_t tier_mult(t)
```

For this task set: Σ tier_mult = 0.5 + 0.75 + 6×1.0 + 2×1.25 = 9.75. **Pass criterion: suite_% >= 85.**

Sensitivity note for ratification: with strict gates, 85% tolerates roughly one fully-zeroed C task (−10.3 pts) only if nearly everything else is near-perfect — i.e. the gate rule is the dominant term. That is intentional (AG-1) but the human should ratify it knowingly.

---

## 3. Grading protocol (AG-3)

```
[cold writer: gpt-5.6-terra]          [deterministic]            [grader: gpt-5.6-sol]        [orchestrator: claude]
skill + task prompt only   ──solution──▶ gate script ──gates+solution──▶ rubric grading ──JSON──▶ evidence spot-replay
isolated workspace                      (no LLM)                  evidence quotes              + aggregation
```

1. **Cold session (writer):** fresh gpt-5.6-terra session per task. Receives ONLY: the skill (skills/pumped-fn/), the task prompt, and the pre-provisioned workspace (deps installed, lint/tsc/vitest configured, task scaffold files). No register, no answer keys, no invoice-triage source, no network installs. One session per task, fixed turn/time budget (propose: 40 turns), workspace snapshot taken at end regardless of the session's own claims.
2. **Gate script (deterministic, no LLM):** runs G1-G5 per the table, emits `gates.json` `{ task, g1: {pass, diagnostics}, g2: {...}, g3: {pass, testNames}, g4: {pass, exitCode, stdoutSample} }`. Any applicable failure zeroes the task; rubric grading still runs (for learning signal) but is marked `gated_out: true`.
3. **Rubric grader (gpt-5.6-sol):** receives per task: (a) the full solution file tree with line-numbered contents, (b) the task prompt, (c) that task's answer-key block (target idioms + applicable dims) from this document, (d) the rubric scoring sheet (sec.2), (e) the register excerpt for ONLY the task's target I-numbers (grounds judgment without leaking suite-wide expectations), (f) `gates.json`. It does NOT receive the writer's conversation, other tasks' solutions, or invoice-triage source (prevents "looks like the example" grading — AG-2 hygiene on the grader side too). Output: machine-parseable JSON only:

```json
{ "task": "T-7", "gated_out": false,
  "dimensions": [
    { "dim": "R1", "score": 1, "evidence": [ { "file": "src/pairing.ts", "lines": "14-22", "quote": "export const roundTx = resource((ctx) => ..." } ], "rationale": "unit-of-work is a boundary resource, not an atom" } ],
  "flags": [] }
```

4. **Spot-replay (orchestrator/validator, claude):** for every dimension score, mechanically verify each quote exists verbatim at file:lines in the solution snapshot (a script, not judgment). Any fabricated/mislocated quote ⇒ that dimension is re-graded once with the discrepancy named; a second fabrication ⇒ dimension scored 0 and the incident logged (AG-3, AG-5). Orchestrator then computes task and suite scores from the formulas — the grader never self-aggregates.
5. **Roles are fixed and disjoint** (writer ≠ grader ≠ aggregator, three different models) and no role sees material that would let it grade its own output. All artifacts (workspace snapshots, gates.json, grader JSON, replay log) are retained under the run directory for audit.

---

## 4. Ratification sheet (the two-minute table)

| # | Title | Tier | Domain | Primary coverage | Tier mult |
|---|---|---|---|---|---|
| T-1 | Greenhouse controller design | A | hydroponics | primitive choice (R1/R2) | 0.5 |
| T-2 | Library hold-shelf pipeline | C | library holds | queue+signal, shutdown (I-6/7/8/10) | 1.0 |
| T-3 | Observatory imaging windows | C | telescope jobs | scheduler overlap/catchUp (I-12) | 1.0 |
| T-4 | Scooter-fleet telemetry daemon | D | e-scooter fleet | observability + custom extension (I-25/26/27), parse (I-9) | 1.25 |
| T-5 | Recipe import, live progress | C | recipe archive | generator flows, abandonment (I-23) | 1.0 |
| T-6 | Gallery climate watch | C | museum sensors | derived state + eq, conflation (I-11/31/32) | 1.0 |
| T-7 | Chess pairing engine | C | tournament pairing | resource boundary tx (gap 1) | 1.0 |
| T-8 | Summit weather alerts | C | weather station | tags.all/optional fan-out (gap 4) | 1.0 |
| T-9 | Podcast transcript backfill | D | podcast archive | prepare/retry + extension (gap 3, I-30) | 1.25 |
| T-10 | Birding field-log CLI | B | birding logs | parse-at-boundary (I-9), taxonomy (I-17) | 0.75 |

Weights: R1 20 · R2 18 · R3 15 · R4 12 · R5 10 · R6 8 · R7 9 · R8 8 (=100), renormalized per task over applicable dims.
Gates: lint-0-incl-warn, typecheck, tests-green, entrypoint-runs — **any applicable gate fail ⇒ task = 0** (alt: G4-only fail ⇒ ×0.4 — pick one).
Formula: task = gate × Σ(w·s)/Σw; suite_% = 100 × Σ(tier_mult × task)/9.75; **pass ⇒ suite_% ≥ 85**.
Roles: terra writes cold (skill+prompt only) → script gates → sol grades with mandatory verbatim quotes → claude replays quotes + aggregates.

Decisions requested from the human: (1) ratify/edit task set (esp. T-2's flagged similarity exposure), (2) ratify weights, (3) pick gate semantics (strict-zero vs G4-cap-0.4), (4) ratify tier multipliers + 85% formula, (5) confirm ~40-turn cold-session budget.

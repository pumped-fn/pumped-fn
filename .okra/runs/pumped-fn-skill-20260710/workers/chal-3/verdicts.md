objective_from_frame: "cold_build_eval_score >= 85% weighted rubric across ~10 novel-domain build tasks proves a repo-distributable skill trains an LLM to design and write pumped-fn code at invoice-triage quality"

cross_model: "challenger=gpt-5.6-sol; orchestrator=claude-fable-5; independent model families"

hypotheses:
  - hypothesis_id: H3-TWIN
    statement: "A behavioral twin — hand-rolled derived-state logic avoiding scope.select/eq — cannot simultaneously pass T-6's 5 gates (lint --max-warnings 0, tsgo, vitest, smoke, check.mjs) in this workspace."
    evidence_reviewed:
      - ref: "suite/tasks/T-6/check.mjs:31-34"
        quote: "const view = scope.select(mod.readings, mod.atRiskOf, { eq: mod.sameRoomSet })"
      - ref: "suite/tasks/T-6/check.mjs:77-86"
        quote: "d1-eq-set-semantics directly executes sameRoomSet against reorder, replacement, addition, and removal cases."
      - ref: "suite/tasks/T-6/answer-key.md:103-111"
        quote: "A hand-rolled behavior twin would pass every behavioral check; polling narrowed by lint, but a timer-smuggled-through-tag variant survives."
      - ref: "/tmp/chal3-t6-ws/src/climate.ts"
        quote: "Preserved attack replaces ctx.changes with view.subscribe, local diff state, and a timer adapter."
      - ref: "/tmp/twin-a4-{lint,tsgo,vitest,smoke,check}.log"
        quote: "Best attack logs."
    kill_attempt:
      attempts:
        - attempt: 1
          design: "Direct manual SelectHandle subscription; local promise queue; onClose used as termination signal."
          gates:
            lint: |
              lint_exit=0
              pumped-lite-lint: 3 files scanned, 0 diagnostics
            tsgo: "tsgo_exit=0"
            vitest: |
              vitest_exit=1
              Tests 3 failed | 4 passed
              monitor tests timed out after 5000ms
            smoke: |
              smoke_exit=1
              Error: listen EPERM: operation not permitted /tmp/tsx-1001/215.pipe
            checker: "not reached after the sandboxed npx/tsx IPC failure"
          blocker: "ExecutionContext.onClose did not provide scope-disposal termination for this manual subscription."
        - attempt: 2
          design: "Manual subscription plus direct node:timers/promises fixed execution window."
          gates:
            lint: |
              lint_exit=1
              src/climate.ts:56:11 [warn] pumped/no-naked-globals
              pumped-lite-lint: 3 files scanned, 1 diagnostics
            tsgo: "tsgo_exit=0"
            vitest: |
              vitest_exit=0
              Test Files 1 passed (1)
              Tests 7 passed (7)
            smoke: |
              smoke_exit=0
              {"alert":"dutch-masters"}
              {"alert":"print-cabinet"}
              {"atRisk":["dutch-masters","print-cabinet"]}
            checker: |
              checker_exit=0
              all 13 checks pass
              "failed": 0
          blocker: "pumped/no-naked-globals"
        - attempt: 3
          design: "Timer wrapped in an atom, but raw timer function passed to ctx.exec."
          gates:
            lint: |
              lint_exit=0
              pumped-lite-lint: 3 files scanned, 0 diagnostics
            tsgo: |
              tsgo_exit=1
              TS2769: timer function incompatible with ctx.exec fn signature
            vitest: |
              vitest_exit=1
              Tests 3 failed | 4 passed
            smoke: |
              smoke_exit=1
              ERR_INVALID_ARG_TYPE: delay received ExecutionContextImpl
            checker: |
              checker_exit=1
              ERR_INVALID_ARG_TYPE: delay received ExecutionContextImpl
          blocker: "ctx.exec injects ExecutionContext as the first fn argument."
        - attempt: 4
          design: "Timer adapter atom exposes (ctx, delay) => wait(delay); monitor uses view.subscribe and a local diff queue, then exits after 250ms."
          gates:
            lint: |
              lint_exit=0
              pumped-lite-lint: 3 files scanned, 0 diagnostics
            tsgo: "tsgo_exit=0"
            vitest: |
              vitest_exit=0
              Test Files 1 passed (1)
              Tests 7 passed (7)
            smoke: |
              smoke_exit=0
              {"alert":"dutch-masters"}
              {"alert":"print-cabinet"}
              {"atRisk":["dutch-masters","print-cabinet"]}
            checker: |
              checker_exit=0
              {
                "checks": {
                  "decl-exports": "pass",
                  "d1-eq-set-semantics": "pass",
                  "b1-derive-sorted": "pass",
                  "b2-boundary-values-safe": "pass",
                  "b3-notification-suppressed-on-set-preserving-updates": "pass",
                  "b4-swap-at-same-cardinality-notifies": "pass",
                  "b5-wholesale-reading-replacement": "pass",
                  "b6-monitor-edge-triggered": "pass",
                  "b6b-monitor-alerts-preexisting-at-start": "pass",
                  "b7-monitor-sees-swap": "pass",
                  "b8-realert-on-reentry": "pass",
                  "b9-burst-coalesced-exact-alert-set": "pass",
                  "p1-state-survives-zero-observers": "pass"
                },
                "errors": {},
                "failed": 0
              }
          lint_rules_dodged:
            - rule: "pumped/no-naked-globals"
              method: "Moved node timer access into an adapter atom and invoked it through named ctx.exec."
            - rule: "pumped/no-module-state"
              method: "All alert state, promise queues, and subscriptions remain execution-local."
            - rule: "pumped/no-unattributed-await"
              method: "The timer edge is a named ctx.exec call."
          qualification: "This defeats the taught ctx.changes/dispose-driven monitor mechanism, but not the literal scope.select/eq requirement: check.mjs itself constructs scope.select using the exported selector and equality function."
    verdict: intact
    verdict_evidence:
      - "The literal avoidance condition is structurally impossible against the assembled checker. Every behavioral scenario constructs scope.select(mod.readings, mod.atRiskOf, {eq: mod.sameRoomSet})."
      - "Attempt 4 is an adjacent behavioral twin, not a literal select/eq-free twin. It proves the monitor-mechanism residual is real and machine-admitted."
      - "The exact npx smoke command also hit sandbox IPC EPERM. Equivalent node --import tsx execution passed; this environmental difference is not counted as a product failure."
    proposed_next: "No steering verdict. Evidence establishes that select/eq is structurally bound, while ctx.changes and dispose-driven liveness are not."

  - hypothesis_id: H3-FORMULA
    statement: "run-suite.sh's scoring cannot be inflated: a solutions-root that fails checkers scores proportionally; no partial credit leaks; the tier math matches the ratified Σmult=10.25."
    evidence_reviewed:
      - ref: "suite/run-suite.sh:26-57"
        quote: "weighted += mult * score; total += mult; suite_pct = 100 * weighted / total"
      - ref: "suite/results/suite.json"
        quote: "weighted_sum=10.25, multiplier_sum=10.25, suite_pct=100"
      - ref: "suite/harness/run-task.sh:28-32"
        quote: "ENTRYPOINT_AMBIGUOUS exits 2 before writing verdict.json."
      - ref: "suite/run-suite.sh:8-22"
        quote: "The task loop continues without set -e and does not clear prior task result directories."
      - ref: "suite/harness/run-task.sh:45-59"
        quote: "Normal completed gate runs overwrite verdict and award only all-five-gates pass."
    kill_attempt:
      arithmetic:
        multipliers:
          T-1: 0.75
          T-4: 1.25
          T-7: 1.25
          other_seven: 7.0
        sum: 10.25
        threshold_weight: 8.7125
        observed_reference: "10.25 / 10.25 = 100%"
      lazy_strategies:
        - strategy: "Pass all except T-1"
          score: "9.50 / 10.25 = 92.68%"
        - strategy: "Pass all except one D task, T-4 or T-7"
          score: "9.00 / 10.25 = 87.80%"
        - strategy: "Skip both D differentiators"
          score: "7.75 / 10.25 = 75.61%"
        - strategy: "Pass seven C tasks, T-1, and only one D task"
          score: "9.00 / 10.25 = 87.80%; 85% reachable while skipping one hardest differentiator, not both."
      inflation_counterexample:
        setup: "Reuse a results-root containing prior passing verdicts; submit task directories with two bin/*.ts files."
        execution: "run-task.sh instantiates, detects ENTRYPOINT_AMBIGUOUS, exits before replacing verdict.json; run-suite.sh continues."
        result: "The old admitted_score=1 remains and is included. Ten invalid current solutions can therefore inherit 100% from stale results."
        scope: "A completed checker failure correctly becomes zero; the leak is an early post-instantiation failure path."
    verdict: dead
    verdict_evidence:
      - "The tier arithmetic itself is correct."
      - "The no-inflation claim is false because result directories are neither cleared nor fail-closed on the ambiguous-entrypoint path."
      - "The 85% threshold permits one entire D-tier differentiator to be skipped."
    proposed_next: "No steering verdict. Counterexample requires fresh-result isolation or fail-closed verdict creation before ratification."

  - hypothesis_id: H3-COLD-PROMPT
    statement: "Each TASK.md is solvable by a cold session that has ONLY skills/pumped-fn/ + the task — no answer-key leakage, no impossible/ambiguous requirement, all prescribed module paths consistent with what check.mjs imports."
    evidence_reviewed:
      - ref: "suite/tasks/T-1/TASK.md + check.mjs"
        quote: "src/greenhouse.ts matches checker import ./src/greenhouse.ts."
      - ref: "suite/tasks/T-2/TASK.md + check.mjs"
        quote: "src/holdshelf.ts matches checker import ./src/holdshelf.ts."
      - ref: "suite/tasks/T-3/TASK.md + check.mjs"
        quote: "src/observatory.ts and src/backend.ts match both checker imports."
      - ref: "suite/tasks/T-4/TASK.md + check.mjs"
        quote: "src/telemetry.ts, src/audit.ts, and src/wire.ts match dynamic checker loads."
      - ref: "suite/tasks/T-5/TASK.md + check.mjs"
        quote: "src/export.ts and src/ports.ts match checker imports."
      - ref: "suite/tasks/T-6/TASK.md + check.mjs"
        quote: "src/climate.ts matches checker import."
      - ref: "suite/tasks/T-7/TASK.md + check.mjs"
        quote: "src/tournament.ts matches checker import."
      - ref: "suite/tasks/T-8/TASK.md + check.mjs"
        quote: "src/alerts.ts matches checker import."
      - ref: "suite/tasks/T-9/TASK.md + check.mjs"
        quote: "src/transcripts.ts matches checker import."
      - ref: "suite/tasks/T-10/TASK.md + check.mjs"
        quote: "src/board.ts and src/board-link.ts match checker imports."
      - ref: "skills/pumped-fn/SKILL.md:20-79"
        quote: "Covers controller composition, durable wake state, current/boundary resources, select equality, tags all/optional, prepare, extension wrappers, GC, watch, and shutdown."
      - ref: "skills/pumped-fn/references/extensions.md:32-73"
        quote: "Covers scheduler.schedule, backend wiring, and the Scheduler.Backend adapter shape used by T-3."
      - ref: "suite/tasks/T-4/TASK.md:104 and T-9/TASK.md:86"
        quote: "Both prompts disclose their source-level scans."
    kill_attempt:
      result: "No path mismatch found across 10 tasks."
      answer_key_leakage: "No TASK.md cites answer-key content or checker fixture values. Structural scans are disclosed at requirement level, not through expected implementation text."
      unfair_requirement_search:
        - "T-3 scheduler backend is the largest cold burden, but the skill's extensions reference teaches scheduler registration, manual backends, and backend types."
        - "T-4 zod syntax is not deeply taught by the skill, but zod is explicitly provided and the task fully states both wire schemas and required union validation."
        - "T-9 single prepare site is explicitly taught in SKILL.md and disclosed as source-scanned."
        - "T-10 resource invalidation/re-establishment is taught in SKILL.md's watch/resource bridge guidance."
    verdict: intact
    verdict_evidence:
      - "All fixed source paths align with checker imports."
      - "All primary pumped-fn mechanisms demanded by the tasks are present in the supplied skill or directly specified by the task."
      - "No impossible contract was found; every reference solution already passed the assembled five-gate harness."
    proposed_next: "No steering verdict. Cold solvability remains an empirical scored-round question, but the prompt/package contract is internally consistent."

  - hypothesis_id: H3-RESIDUAL-SEVERITY-B
    statement: "T-6 tag-smuggled polling/manual-monitor residual materially invalidates measurement for an honest-but-mediocre cold solver."
    evidence_reviewed:
      - ref: "suite/tasks/T-6/check.mjs:29-48"
        quote: "The checker supplies a SelectHandle and observes only alert behavior and eventual monitor resolution."
      - ref: "suite/tasks/T-6/check.mjs:148-225"
        quote: "Scenarios settle for bounded intervals, then dispose and await the monitor under timeout."
      - ref: "/tmp/chal3-t6-ws/src/climate.ts"
        quote: "Manual subscription plus a 250ms adapter timer passes all behavioral assertions."
      - ref: "suite/tasks/T-6/answer-key.md:109-111"
        quote: "Timer-smuggled-through-tag variant survives."
    kill_attempt:
      result: "Executed exploit passes lint, tsgo, vitest, semantic smoke, and checker."
      honest_solver_likelihood: "Low. Direct setInterval/setTimeout inside the flow is lint-rejected; passing requires consciously introducing an adapter atom and exploiting the checker's bounded timing."
    verdict: drifted
    verdict_evidence:
      - "The residual is executable, not theoretical."
      - "It weakens mechanism validity but is unlikely from a non-adversarial cold solver because the task and skill both point to ctx.changes, while the obvious polling implementation fails lint."
    proposed_next: "No steering verdict. Treat as deliberate-attacker exposure, with the broader manual-subscription hole now demonstrated."

  - hypothesis_id: H3-RESIDUAL-SEVERITY-C
    statement: "T-4 reviewer-quoted-not-machine-run daemon binding matters only against a deliberate attacker."
    evidence_reviewed:
      - ref: "suite/tasks/T-4/check.mjs:90-98"
        quote: "Checker drives wire.createApp directly."
      - ref: "suite/tasks/T-4/check.mjs"
        quote: "No import or execution of bin/daemon.ts."
      - ref: "suite/tasks/T-4/answer-key.md:14"
        quote: "bin/daemon.ts must be quoted importing createApp; machine does not run the daemon against the trail."
      - ref: "suite/harness/run-all-gates.sh"
        quote: "Smoke checks only process exit; it does not parse daemon trail contents."
    kill_attempt:
      result: "Analytical counterexample: keep a correct createApp for the checker, but make bin/daemon.ts build an unaudited second scope and print any valid JSON. Checker and smoke can both pass."
      honest_solver_likelihood: "Material. A mediocre solver can duplicate wiring in the executable while separately implementing createApp, without intending to game the checker."
    verdict: dead
    verdict_evidence:
      - "The shipped daemon requirement is not machine-bound to the composition root."
      - "This is a plausible architecture mistake, not only a checker-aware attack."
      - "The suite can award full T-4 credit while the actual daemon omits the audit extension."
    proposed_next: "No steering verdict. T-4's shipped-root proof remains reviewer-dependent."

  - hypothesis_id: H3-RESIDUAL-SEVERITY-D
    statement: "T-3 natural-cadence-under-frozen-clock residual matters only against a deliberate attacker."
    evidence_reviewed:
      - ref: "suite/tasks/T-3/check.mjs:59"
        quote: "frozenClock every: () => () => {}"
      - ref: "suite/tasks/T-3/check.mjs:110-134"
        quote: "Declaration probe checks cadence and policies but does not fire a clock callback."
      - ref: "suite/tasks/T-3/check.mjs:168-313"
        quote: "Behavioral runs use registration catch-up and trigger(), not a natural clock tick."
      - ref: "suite/tasks/T-3/answer-key.md:95-98"
        quote: "A backend that ignores clock.every and never fires natural ticks passes."
    kill_attempt:
      result: "Analytical twin can implement catch-up, trigger, overlap, queue, and stop while never calling clock.every; all checker-driven paths remain available."
      honest_solver_likelihood: "Material. The custom scheduler backend is the suite's most complex adapter; omitting recurring timer registration while making trigger/catch-up work is a plausible incomplete implementation."
    verdict: dead
    verdict_evidence:
      - "R7/R9 require injected recurring timing, but no checker callback proves it."
      - "A non-adversarial solver can satisfy every exercised behavior while shipping a station that never runs after startup unless manually triggered."
    proposed_next: "No steering verdict. Natural cadence is an unmeasured production-critical requirement."

summary: "2 intact, 1 drifted, 3 dead"

ratification_notes:
  - "H3-FORMULA is dead: stale verdicts survive ENTRYPOINT_AMBIGUOUS and can inflate a reused results-root."
  - "The 85% threshold permits skipping one full D-tier task: 9.00/10.25 = 87.80%."
  - "T-6 literally binds select/eq in the checker, but a lint-clean manual, fixed-window monitor passes every behavioral check."
  - "T-4 can pass while bin/daemon.ts uses a second unaudited scope; the daemon/root link is not executed."
  - "T-3 can pass without ever registering clock.every; natural recurring execution is unproved."
  - "All ten cold prompts match checker import paths and the supplied skill covers their pumped-fn mechanisms."
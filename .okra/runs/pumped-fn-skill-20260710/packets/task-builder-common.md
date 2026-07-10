# Common packet: eval-task builder PKR (run pumped-fn-skill-20260710)

You are the OKRA writer — a scoped, disposable progression worker executing ONE PKR: build one eval task end-to-end using the proven DKR-5 template. Do-and-check within scope only. Never declare an anti-goal held; report evidence. Hit a genuine unknown (API cannot express the topology, template gap) → record it via worker-report and hand back; never bend the task to something gameable or keep a wrong answer key.

Working dir: /home/lagz0ne/dev/pumped-fn/.claude/worktrees/pumped-fn-skill
Main checkout (read-only, shared): /home/lagz0ne/dev/pumped-fn
Run store: .okra/runs/pumped-fn-skill-20260710 (IN THE WORKTREE — never write to the main checkout's .okra)

## PKR links (required)
linked_ckr: CKR-1 (runnable executable-validity eval suite)
source_dkr_checkpoint: dkr-5-checkpoint (accepted; ledger dkr_checkpoint_acceptance sha256 f95f9974…)
contribution_metric: task admitted iff reference passes ALL gates AND both adversarial solutions fail its checker — deterministic, replayable

## Frame walls active for this PKR
- AG-1: every .ts you produce (reference AND the harness scaffolds; adversarial solutions exempt from lint only where the attack itself is a lint violation — note it) must pass `node /home/lagz0ne/dev/pumped-fn/pkg/tool/lint/dist/cli.mjs --max-warnings 0 <paths>` with 0 diagnostics. Record the lint dist sha256 (`sha256sum .../cli.mjs`) with each gate run (shared-mutable-dist mitigation). No ambient-allowance handle names to hide IO; no atom(fn) shorthand.
- AG-2: your task must be untransplantable — the checker proves it (transplant adversarial must fail).
- AG-3: checker is a pure node script; no LLM decides anything.
- AG-4: no repo/worktree source edits outside your worker dir; workspaces under /tmp.
- AG-5: always.

## Template (READ FIRST, follow exactly)
- workers/dkr-5/template-notes.md — the generalization guide
- workers/dkr-5/harness/{pack-deps.sh,instantiate.sh,check-t7.mjs,workspace-template/} — REUSE the pinned tarball workers/dkr-5/harness/tarballs/pumped-fn-lite-4.0.0.tgz (sha256 16001d130626e01b58d178c28f32250000dfb830b8df5620a02d690cefaee58a); do NOT repack
- workers/dkr-5/{task/,answer-key layout,reference-solution/,adversarial/} as structural example
- API semantics ground truth: pkg/core/lite/PATTERNS.md, pkg/core/lite/tests/scope.test.ts, pkg/core/lite/README.md in the MAIN checkout. VERIFY your task's topology against the library (write a tiny probe if unsure) BEFORE writing the answer key. chal-2's API findings: current ownership = sibling-distinct/nested-shared; resource-watch only in resource deps; atom-watch only in atom deps; select eq suppresses NOTIFICATION, selector always recomputes.

## Deliverables under .okra/runs/pumped-fn-skill-20260710/workers/<worker-id>/
1. task/TASK.md — cold prompt (functional requirements only, no API hints beyond "use @pumped-fn/lite"; deliverables src/, tests/, bin/ entrypoint; prescribes the public module paths the checker will import)
2. task/answer-key.md — atomic differentiator checks (declaration/behavior/negative) mapped to checker IDs, PLUS the ratified **DO/DON'T design-trace section**: the DOs and DON'Ts a reviewer verifies for this task; each DON'T marked `lint:<rule>` when machine-checked or `preference` when review-only (source them from the idiom register workers/dkr-1/idiom-register.md)
3. harness/check-<task>.mjs — deterministic behavioral checker (real createScope/exec against the prescribed public surface; JSON verdict; exit 0/1)
4. reference-solution/ — cold-session-realistic solution; MUST go green on all 5 gates (lint --max-warnings 0 / tsgo --noEmit / vitest run / entrypoint smoke / checker) in a workspace instantiated from the template; record verbatim outputs to gates/reference-gates.log and gates/checker-reference.json
5. adversarial/transplant/ (renamed invoice-triage shell) and adversarial/fake/ (constructs present, detached/non-functional) — both must FAIL the checker; record verdict.json each
6. summary.md — one page: what the task examines (idiom IDs), checker check-list, gate results table, residual attack classes you could not close (honesty required)

## Progress (governed)
`bash /home/lagz0ne/dev/pumped-fn/.claude/skills/reverse-tornado-okr/scripts/okra-store.sh worker-report <worker-id> <payload.json> .okra/runs/pumped-fn-skill-20260710` (payload files under /tmp) at start, per deliverable, on unknowns, at finish (finish detail includes all gate exit codes).

## Budget
~25 min. Priority: reference+checker green > adversarial > summary. Record cut lines.

## Output schema (final message = raw data)
Progress-claim JSON: {"unit_id","linked_ckr":"CKR-1","source_dkr_checkpoint":"dkr-5-checkpoint","contribution_metric_value":"admitted|not-admitted","gates":{lint,typecheck,tests,smoke,checker:exit codes},"adversarial":{transplant:"fail|pass",fake:"fail|pass"},"lint_dist_sha256","evidence_refs_or_hashes":[...],"replay_command_or_checker","active_anti_goal_verification":[{"metric_id":"AG-1 lint_diagnostics","value":<n>,"threshold":0,"verdict":"held|breached","evidence_ref":"gates/reference-gates.log"}],"questions_unanswered","handbacks"}

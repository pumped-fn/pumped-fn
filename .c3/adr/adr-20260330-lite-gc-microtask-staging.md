---
id: adr-20260330-lite-gc-microtask-staging
title: Stage Lite GC Timer Scheduling Through Microtasks
type: adr
status: implemented
date: 2026-03-30
affects: [packages/lite/src/scope.ts, packages/lite/tests/scope.test.ts]
---

# Stage Lite GC Timer Scheduling Through Microtasks

## Goal

Preserve the existing grace-period-based atom GC semantics while making last-unsubscribe scheduling cheaper and more stable under rapid unsubscribe/resubscribe churn.

## Work Breakdown

1. Keep grace-period timers as the actual GC boundary so React and other UI integrations still get the same resubscribe window
2. Insert a microtask staging step before starting the timer so synchronous unsubscribe/resubscribe churn can cancel GC without repeatedly creating and clearing timers
3. Track pending/queued GC state on the atom entry so duplicate timer setup is skipped on hot listener-removal paths
4. Verify with scope GC tests and downstream packages that resolve atoms during extension initialization

## Risks

- GC sequencing is part of the lite runtime contract; changing scheduling order can surface in subtle integration tests
- Pending/queued state must be reset correctly or atoms can get stuck unreleased or be released too aggressively
- Performance-driven refactors in this path must not regress downstream observers such as `lite-react`, `lite-ui`, or OTel extensions

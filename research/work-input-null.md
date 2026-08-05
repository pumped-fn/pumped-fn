# Work input null hypothesis

H0 says every required `AdmitWorkInput` field is load-bearing and cannot be defaulted without losing traceability or fail-closed behavior.

The tests call the current public defaults directly:

- `branchId = record.currentBranchId`
- `policy = "all"`

Only public tags, flows, records, and the `createScope` seam are used.

## Findings

### Resume identity

A work item is admitted on `main`, parked, and woken to `ready`. The persisted record is then reopened with `currentBranchId` set to `alternate`. Reapplying the candidate default resolves the resumed input to `alternate`.

The runtime compares that effective value with the stored `main` value and throws `Work resumable resume contract changed`. It does not rebind the work. The stored work and its admission event remain on `main`.

This default survives if it is resolved before every admission and the effective branch is stored.

### Dedup and idempotence

A ready work item resumed with omitted candidate fields behaves exactly like one resumed with explicit `branchId: "main"` and `policy: "all"`. Comparison is based on effective values once defaults are resolved.

An `id` default does not have an equivalent safe rule. A stable constant collapses two distinct calls into one identity and the second call fails as a duplicate. Generating a fresh value has the opposite problem: a retry no longer deduplicates. The generic input does not provide a stable, universal identity key.

### Join and fail-fast

`session.join` currently has its own required policy. It does not read `WorkRecord.policy` automatically.

The test models an orchestrator that carries its parent work policy into `session.join`. A defaulted `all` policy leaves a sibling running after another child fails. The join remains pending until that sibling completes. An explicit `fail-fast` policy aborts the sibling and returns failed plus cancelled settlements.

The observable behavior is different. Defaulting to `all` silently chooses continued execution when the caller omitted a failure policy.

### Role attribution

The selected agent can be `reviewer` while a defaulted work role is stored as `default-role`. The result and agent event say `reviewer`; the durable work record says `default-role`.

`session.run` can select arbitrary turn flows, so there is no universal role value to derive from the turn.

### Wake, continuations, and events

The wake boundary compares the stored effective branch and policy. A scheduler that changes the defaulted branch is rejected and the work stays waiting. This supports the branch default rather than H0.

Provider continuations have no dependency on these four work fields, so they add no counterexample. Admission events record the effective branch. They do not record whether it was explicit or defaulted, but they do preserve where execution occurred.

## Verdict

| Field | Verdict | Invariant |
|---|---|---|
| `id` | default-unsafe | Stable work identity, retry deduplication, and idempotence require caller intent. |
| `branchId` | default-safe | Resolving `record.currentBranchId` at admission, storing it, and comparing it on resume preserves branch lineage and fails closed after a branch switch. |
| `role` | default-unsafe | A guessed role can disagree with the selected turn and corrupt durable attribution. |
| `policy` | default-unsafe | `"all"` silently replaces a missing failure decision and can keep siblings running where fail-fast cancellation was required. |

H0 is not fully upheld. Three fields remain load-bearing. The proposed `branchId` rule survived the tested resume, dedup, event, and wake boundaries.

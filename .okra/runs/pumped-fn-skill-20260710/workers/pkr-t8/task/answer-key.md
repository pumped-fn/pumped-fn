# T-8 answer key — atomic differentiators, each mapped to a deterministic checker assertion

Grading is EXECUTABLE: `harness/check-t8.mjs` (run inside the instantiated workspace via
`node --import tsx check-t8.mjs`) prints `{checks: {id: pass|fail}, errors, failed}` and
exits non-zero on any fail. No LLM judges behavior. A differentiator is "present" iff
every checker ID mapped to it passes. chal-2 H2-T8 amendments are implemented: every fake
channel keeps a call log; per-channel SIDE-EFFECT evidence is asserted on every delivery
check (never totals alone); failure visibility is proven from the failing channel's call
log AND the returned accounting AND the observed failed traced execution together; wiring
difference is proven by running the same flow under different `createScope` tag sets
(2 channels / 3 channels / quiet-present / quiet-absent / zero channels).

## Expected topology (VERIFIED against the library by probe — not assumed)

- `channel = tag<Channel>({ label })` carrying a plain capability spec `{ name, send }`;
  `quietHours = tag<QuietWindow>({ label })`. Deployments register by repeating the
  `channel(...)` binding in `createScope({ tags })`.
- **Registry atom is load-bearing:** `atom({ deps: { channels: tags.all(channel) } })`.
  In ATOM deps, `tags.all` collects via `tag.collect` over the scope's raw tags array
  (src/scope.ts:1081) and returns EVERY binding in registration order. In FLOW deps,
  `tags.all` collects via `collectFromHierarchy` (src/scope.ts:1226-1239) — context data
  is a Map keyed by `tag.key`, so it yields at most ONE binding per context-chain level:
  a flow declaring `tags.all(channel)` directly sees 1 channel, not 3 (probe:
  flow-direct=`["radio"]`, atom-registry=`["radio","siren","sms"]`). PATTERNS.md L303's
  "tags.all an array of handles" wording does not surface this; the checker does.
- Channels must NOT be flow-valued tags: a tag carrying a flow rejects in atom deps
  ("Flow deps require an ExecutionContext", tests/role-tags.test.ts:187-197), and a tag
  carrying an ARRAY of flows type-projects (`Lite.Projected`) but fails at runtime
  (`h.exec is not a function` — projectTagValue does not recurse arrays; probe verified).
- `issueAlert = flow({ deps: { channels: registry, quiet: tags.optional(quietHours) } })`;
  absent binding + no default ⇒ `quiet === undefined` (tests/role-tags.test.ts:28-43).
- Per-channel delivery as a named foreign edge:
  `ctx.exec({ fn: () => entry.send(ctx.input), params: [], name: \`channel.${entry.name}\` })`
  — `params` is REQUIRED (`Lite.ExecFnOptions` d.mts:233-238; README's fn-exec snippet
  omits it and throws "params is not iterable"). Extensions observe the edge name via the
  third `wrapExec` argument's `ctx.name` (probe verified).
- Isolation via `Promise.allSettled` over the named execs — no catch clause (lint
  `no-swallowed-error` fires on catch blocks that neither rethrow nor reference the
  error), rejected edges stay visible to `wrapExec` because the exec itself rejects.

## Differentiators → atomic checks

| Diff | Claim | Kind | Checker IDs |
|---|---|---|---|
| D1 | Port multiplicity: every registered channel receives the alert (per-channel call-log evidence, not totals); deployments differ only in `createScope` wiring | declaration + behavior | `decl-exports`, `b1-fanout-three-channels-side-effects`, `b2-fanout-two-channels-wiring-only`, `b11-repeat-alerts-ordered-per-channel` |
| D2 | Optional quiet-hours policy consumed through declared optionality: present ⇒ watch suppressed with ZERO channel side effects, warning passes, watch outside window passes; absent ⇒ same flow delivers everything | behavior + negative | `b6-quiet-hours-suppresses-watch`, `b7-quiet-hours-warning-still-delivers`, `b8-quiet-hours-watch-outside-window`, `b9-optional-absent-delivers-always` |
| D3 | Per-channel failure isolation with correct accounting: throwing channel's call log proves the attempt, siblings' logs prove continuation, `{attempted, delivered}` proves the count | behavior + negative | `b3-declining-channel-accounting`, `b4-throwing-channel-isolation` |
| D4 | Failure visibility: the failing attempt surfaces as exactly ONE failed traced execution named after the channel, while `issueAlert` still resolves with correct accounting (call log + accounting + trace together — chal-2 amendment) | behavior | `b5-failure-observable-in-traces` |
| D5 | No hardcoded channels: zero registrations ⇒ `{attempted: 0, delivered: 0, suppressed: false}` | negative | `b10-zero-channels-registered` |

## DO / DON'T design trace (ratified section — sourced from workers/dkr-1/idiom-register.md)

DOs a reviewer verifies:
- DO make multi-implementation capabilities port tags bound at composition roots; the
  deployment's `createScope({ tags })` is the only place channels are named (I-5, I-2).
- DO collect registration multiplicity in an atom's deps (`tags.all` over scope bindings)
  and hand the registry to the flow as a plain dep — the graph carries the fan-out set.
- DO consume the optional policy with `tags.optional(...)` in deps; absence is a declared
  `undefined`, not an inline default or a required-with-dummy-default (I-4).
- DO run each foreign `send` as `ctx.exec({ fn, params, name })` — one named, taggable
  edge per channel attempt (I-26).
- DO isolate channel failures with `Promise.allSettled` on the edge promises so the edge
  rejection stays visible to extensions while the operation resolves (I-27 observability
  contract).
- DO test only through `createScope({ tags, extensions })` + exported flow; fakes are
  call-logging channel specs; both quiet wirings are separate scopes (I-20, I-21).

DON'Ts:
- DON'T bind one required notifier and call it fan-out — `lint:review-only` (structural;
  the checker kills it: b1/b2/b4/b10).
- DON'T enumerate or import concrete channels in feature code — `preference` (I-5;
  checker kills hardcoding via b2/b10).
- DON'T read clocks/env for quiet hours — `lint:pumped/no-naked-globals` (I-1; `hour` is
  caller input).
- DON'T catch-and-drop a channel error — `lint:pumped/no-swallowed-error` (I-17).
- DON'T await `send` bare without a named edge — `lint:pumped/no-unattributed-await`
  (I-26; also fails b5).
- DON'T compose the per-channel work as hidden same-file `ctx.exec({ flow })` —
  `lint:pumped/no-direct-flow-composition` (I-3).
- DON'T keep a module-level channel list or mutable registry —
  `lint:pumped/no-module-state` (I-16; also fails b2/b9 cross-scope bleed).
- DON'T name handles with type suffixes (`channelTag`, `issueAlertFlow`) —
  `lint:pumped/no-definition-handle-suffix` (I-13).
- DON'T mock modules or patch internals in tests — `lint:pumped/no-module-mocks` (I-20).

## Why the known attacks fail (executed proofs in adversarial/*/verdict.json)

- **Transplant** (invoice-triage shell: single `tags.required` notifier with default,
  one `notifier.send` edge): fails 8/12 — attempted is always 1 (`b1`,`b2`,`b3`,`b4`),
  unregistered-fake logs empty, trace name carries no channel name (`b5`), zero-channel
  default still fires (`b10`), quiet-configured deliveries reach one channel only
  (`b7`), absent-quiet case reaches one channel (`b9`).
- **Fake** (chal-2 H2-T8 differentiator-faking attack, verbatim: resolves and iterates
  `tags.all`, emits named synthetic `channel.<name>` edges, returns
  `{attempted: n, delivered: n}` without ever calling `send`): fails 9/12 — every
  call-log assertion (`b1`,`b2`,`b7`,`b8`,`b9`,`b11`), declining/throwing accounting
  (`b3`,`b4`), and no failed traced exec (`b5`). Correct totals + correct trace names +
  correct quiet branching were NOT enough — the amendment (side-effect evidence) is what
  kills it.

## Residual gaming risk (recorded, not hidden)

- A solver could skip the registry atom and hand-roll multiplicity by requiring wiring to
  pass ONE binding carrying an array of channel specs (`channel([...])` with
  `tags.required`). The checker's prescribed wiring (repeated `channel({...})` bindings)
  makes that shape fail b1/b2 outright, so the surface is closed — but only because
  TASK.md pins the registration call shape.
- Sequential (ordered) delivery vs concurrent is not discriminated; a channel that stalls
  forever would hang `issueAlert` either way. No check forces concurrency — R4 "not
  delay" is enforced only as "not prevent". Chal-3 could attack with a slow-but-finite
  channel plus a completion-order probe if concurrency should be mandatory.
- `attempted` could be computed as `channels.length` rather than from actual attempts;
  with per-channel call logs asserted alongside, the discrepancy window is only "logged
  but not counted" mismatches, which b3/b4 pin. A channel double-invoked would be caught
  by the exact-log-equality (`[alert]`) checks.

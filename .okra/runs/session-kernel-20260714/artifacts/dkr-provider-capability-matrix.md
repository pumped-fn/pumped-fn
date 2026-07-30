# DKR-MIGRATION-1 provider capability matrix

Decision target: choose the first-PR provider bridge that keeps `Model` and `complete` stable while the accepted session kernel gains streaming, cancellation settlement, steering, continuation, overlap, and shared physical-resource lifetime.

The result is mixed. Public Lite composition already supports root-owned Claude, Codex ACP, and pi-ai resources. The current adapters do not expose one common rich-attempt contract. The first PR needs a provider-neutral scalar fallback plus narrow native upgrades.

## Classification

- `native`: the current adapter directly exposes the behavior, with source or deterministic test evidence.
- `fallback`: the stable scalar `Model` path can supply the behavior without claiming transport-native support.
- `unsupported`: the current adapter blocks the behavior.
- `implementation-required`: the current adapter has no usable or proven form of the behavior, even if its lower layer appears capable.

| Required capability | Claude | Codex | pi-ai |
| --- | --- | --- | --- |
| Simple `Model` compatibility | `native` — `claudeTurn` is a `Model`; the stable module path is tested ([source](../../../../pkg/sdk/claude/src/index.ts#L238), [test](../../../../pkg/sdk/claude/tests/claude.test.ts#L25)). | `native` — both CLI and ACP turns keep the `Model` tag and `complete` graph ([source](../../../../pkg/sdk/codex/src/index.ts#L92), [test](../../../../pkg/sdk/codex/tests/codex.test.ts#L68)). | `native` — `piTurn` is a `Model` and maps native tool calls to `ModelResponse` ([source](../../../../pkg/sdk/pi/src/index.ts#L74), [test](../../../../pkg/sdk/pi/tests/pi.test.ts#L71)). |
| Streaming | `implementation-required` — the CLI uses stream-json, but the adapter ignores every event except `result` and returns one string ([source](../../../../pkg/sdk/claude/src/index.ts#L180)). | `implementation-required` — ACP receives text chunks, stores them in an array, and returns only `chunks.join("")` after prompt settlement ([source](../../../../pkg/sdk/codex/src/index.ts#L158), [source](../../../../pkg/sdk/codex/src/index.ts#L283)). The simple CLI path is scalar. | `implementation-required` — the injected collection has stream methods, but `piTurn` calls only `complete` or `completeSimple` ([source](../../../../pkg/sdk/pi/src/index.ts#L102), [test double](../../../../pkg/sdk/pi/tests/pi.test.ts#L49)). |
| Abort observation and settlement | `native` for destructive cancellation — the adapter observes `AbortSignal`, sends `SIGINT`, rejects the prompt, and context close waits for child exit ([source](../../../../pkg/sdk/claude/src/index.ts#L191), [test](../../../../pkg/sdk/claude/tests/claude.test.ts#L122)). This cannot be treated as cancellation isolation. | `native` on ACP — abort sends `session/cancel`, waits for the cancel send in `finally`, then removes correlation state ([source](../../../../pkg/sdk/codex/src/index.ts#L263), [test](../../../../pkg/sdk/codex/tests/codex.acp.test.ts#L96)). The scalar CLI also passes `AbortSignal` to `runCli` ([source](../../../../pkg/sdk/codex/src/index.ts#L67)). | `native` at the adapter boundary — the signal is passed to the selected pi-ai call and an `aborted` result fails the attempt ([source](../../../../pkg/sdk/pi/src/index.ts#L101)). A deterministic abort-settlement test is still required. |
| Steering acknowledgement | `fallback` — abort, join the destructive process close, then restart at a new epoch. There is no steering event or acknowledgement API. | `fallback` — cancel the ACP prompt, await prompt settlement, then restart at a new epoch. The current adapter has no steering API. | `fallback` — abort the call, await settlement, then start a new call. The current adapter has no steering API. |
| Continuation | `native` while the process remains healthy — one child accepts sequential prompts through a serialized queue ([source](../../../../pkg/sdk/claude/src/index.ts#L113), [test](../../../../pkg/sdk/claude/tests/claude.test.ts#L82)). Abort closes that path. | `fallback` — every ACP call creates `session/new`, while the stable request carries the full transcript ([source](../../../../pkg/sdk/codex/src/index.ts#L253), [core request](../../../../pkg/sdk/core/src/index.ts#L962)). The simple CLI is also ephemeral. | `fallback` — every call rebuilds provider context from the full `ModelRequest.messages` transcript ([source](../../../../pkg/sdk/pi/src/index.ts#L95)). |
| Overlapping attempts | `unsupported` on one `claudeSession` — `tail` serializes prompts and abort marks the process closing ([source](../../../../pkg/sdk/claude/src/index.ts#L108), [source](../../../../pkg/sdk/claude/src/index.ts#L191)). | `implementation-required` — ACP has per-session maps and no adapter mutex, but no deterministic test proves two unique sessions overlap or that cancel A leaves B live ([source](../../../../pkg/sdk/codex/src/index.ts#L137)). Do not infer this from ACP. | `implementation-required` — calls have per-call signal input and no adapter queue, but no deterministic overlap and independent-cancel test exists ([source](../../../../pkg/sdk/pi/src/index.ts#L74)). |
| Root-pre-resolved shared transport lifetime | `native` through public composition — `claudeSession` is exported and boundary-owned ([source](../../../../pkg/sdk/claude/src/index.ts#L79)). The replay proves session A close does not clean the root value used by session B ([probe](../replay/dkr-provider-capabilities.sh#L51)). | `native` through public composition — `acp` is exported and boundary-owned ([source](../../../../pkg/sdk/codex/src/index.ts#L115)). The replay proves the same identity and one root cleanup ([probe](../replay/dkr-provider-capabilities.sh#L51)). | `native` through public composition — `models` is exported and boundary-owned ([source](../../../../pkg/sdk/pi/src/index.ts#L57)). The replay proves the same identity and one root cleanup ([probe](../replay/dkr-provider-capabilities.sh#L51)). |
| Provider-neutral fallback | `fallback` — retain `claudeTurn -> ModelResponse`; map a scalar result to one final session event. | `fallback` — retain both `codexTurn` and `codexAcpTurn`; map either scalar result to one final session event. | `fallback` — retain `piTurn`; map its scalar result to one final session event. |

## Root lifetime proof

The public path is enough:

```text
host root context --pre-resolves--> boundary provider resource
       |                                  |
       +--> session A context ------------+-- same identity
       |       close: no provider cleanup |
       +--> session B context ------------+-- still live
       |
       +--> host root close ------------------ one provider cleanup
```

`scope.createContext({ parent: root })` is public. Boundary resources walk to their parent owner and reuse an existing entry ([Lite owner selection](../../../../pkg/core/lite/src/scope.ts#L1916), [Lite lookup](../../../../pkg/core/lite/src/scope.ts#L1922)). Context close cleans only locally owned resources ([Lite close](../../../../pkg/core/lite/src/scope.ts#L2410)).

The saved replay presets each real exported resource handle with a cleanup-tracked double. For Claude, Codex ACP, and pi-ai it proves:

```json
{"sameIdentity":true,"sessionACloseKeptSessionBLive":true,"rootCleanupCount":1}
```

This proves ownership and public composition. It does not prove real transport overlap or cancellation isolation.

## Exact first-PR adapter requirements

### Common bridge

1. Keep `Model`, `model`, `complete`, and every current provider `turn` export compatible ([core seam](../../../../pkg/sdk/core/src/index.ts#L1145)). Add the rich attempt path beside that seam.
2. Pre-resolve physical provider resources in a host root context. Create session contexts with that root as parent. Session finish and close must not release the physical provider resource; host root close owns its cleanup.
3. Define one provider-neutral attempt stream. A scalar `Model` emits one final event. Native adapters may emit deltas before the same final value.
4. Put abort ownership in each work attempt. Steering acknowledges only after the old provider call settles; then the kernel may start a new epoch. Transcript replay is the default continuation fallback.
5. Add deterministic cases for stream final-value parity, consumer stop, abort settlement, cancel isolation, continuation, and overlap. Use provider doubles only.
6. Keep MCP, automatic tool collection, and native Claude tools absent. The current managed paths explicitly pass no MCP servers and disable Claude tools ([Codex](../../../../pkg/sdk/codex/src/index.ts#L255), [Claude](../../../../pkg/sdk/claude/src/index.ts#L272)).

### Claude

1. Keep the existing scalar `claude`, `claudeTurn`, and `claudeRun` behavior.
2. Do not use one root-pre-resolved `claudeSession` process for independent overlapping logical sessions. Its queue is serial and its abort is process-wide. The rich path needs a root-owned manager that gives each logical session an isolated process lease, then joins every lease at host close.
3. Convert useful stream-json events into attempt deltas instead of dropping all non-result events. Preserve the final `result` mapping for `Model` callers.
4. Treat abort as destructive for that lease. Wait for process exit before steering acknowledgement or reuse. Restart with transcript replay after abort.

### Codex

1. Keep the simple CLI model as a scalar fallback and keep the current ACP model export.
2. Root-own one ACP process and connection. Store a distinct ACP session id per logical session or branch instead of calling `session/new` for every round.
3. Route `session/update` chunks to the matching active attempt stream instead of only buffering strings. Keep final joined content for scalar callers.
4. On abort, send `session/cancel`, await prompt settlement, then remove attempt state and acknowledge steering.
5. Prove two unique ACP sessions overlap and cancel A without changing B. Do not claim overlap before that test passes.

### pi-ai

1. Keep `piTurn` and its current native tool-call mapping.
2. Root-own the `models` collection. Use `stream` or `streamSimple` for the rich path and map its events plus final message to the provider-neutral attempt stream.
3. Keep transcript replay as continuation. Give overlapping attempts separate abort controllers.
4. Add deterministic stream, abort-settlement, and overlap/cancel-isolation tests against an injected `MutableModels` double.

## DKR checkpoint

- Questions answered: all three provider resource handles are public and root-pre-resolvable; simple `Model` compatibility can remain; current native/fallback gaps are classified for every required capability; MCP is not needed.
- Questions unanswered: the public names of the rich attempt stream and root provider manager; the exact Claude stream-json delta variants; real ACP overlap behavior; pi-ai event normalization. These are implementation and conformance details, not reasons to change the accepted session kernel.
- Confidence update: `0.62 -> 0.86`. Public-Lite replay and 28 focused mocked tests remove the shared-lifetime and compatibility unknowns. Streaming and overlap stay explicitly unproven where tests are absent.
- Risk and anti-goal implications: root cleanup is safe, but Claude process-wide abort can still harm another session if one physical process is shared; Codex ACP and pi-ai overlap need executable isolation cases; all richer work must remain declared flow or resource edges; MCP remains out of scope.
- Candidate CKR: provider parity reaches `1.0` only when the eight-row matrix is replayed against all three adapters and every `implementation-required` row has a deterministic conformance case.
- Candidate PKRs: common scalar-to-attempt bridge; Claude lease manager and stream mapper; ACP logical-session and stream mapper; pi-ai stream mapper; provider conformance suite.
- Stale flag: source line evidence and hashes must be refreshed after any provider or Lite lifecycle edit.

Replay command:

```bash
bash .okra/runs/session-kernel-20260714/replay/dkr-provider-capabilities.sh
```

The replay uses no integration tests, credentials, paid calls, or MCP process.

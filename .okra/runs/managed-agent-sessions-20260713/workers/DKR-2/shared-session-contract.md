# DKR-2: smallest shared managed-session contract

## Decision target

Define the smallest contract shared by Claude and Codex that keeps provider execution visible in the pumped-fn graph and keeps the current model consumer seam.

## Decision

Share behavior, not a new public session object.

The existing `model` tag and `complete` flow remain the only provider-neutral public seam. Each managed provider keeps its transport state in its own boundary-owned resource and exposes a declared prompt flow. Its model implementor flow depends on that prompt flow through a controller edge.

```text
consumer flow
    |
    v
model.complete -- required model tag --> provider turn flow
                                           |
                                           v declared controller dependency
                                      provider prompt flow
                                           |
                                           v declared dependency
                                  provider boundary resource
                                           |
                                           v
                                  child process + protocol
```

Do not add a shared `ManagedSession` interface, facade, session factory, normalized wire-event API, MCP surface, or tool registry in this milestone. The two protocols do not yet prove a useful common object beyond lifecycle behavior.

## Contract proposal

The conformance contract is behavioral:

1. Consumers continue to bind a `Model` implementor with the existing `model` tag and call the existing `complete` flow. `ModelRequest` and `ModelResponse` do not change.
2. Each provider turn is a flow. It formats and parses the provider boundary and declares its prompt flow as a controller dependency.
3. Each prompt operation is a flow. It owns one prompt transaction, accepts the context abort signal through a declared tag dependency, and depends on a provider-specific boundary resource.
4. Each long-lived child process or connection is created by a boundary-owned resource. Spawn, streams, working directory, environment, config, and authority inputs are declared dependencies. The resource registers cleanup before returning usable state.
5. Abort requests provider cancellation. Prompt settlement removes request correlation state. Context or scope close settles cleanup and leaves zero live child or transport resources.
6. Provider wire events remain provider-private. Existing pumped-fn events may record stable lifecycle facts, but no new common event union is introduced until a consumer requires it.
7. Sequential single-prompt behavior is the minimum shared promise. Multi-turn continuity, overlapping prompts, reconnect, resume, and dynamic roots are not part of this contract until provider probes prove them.

The provider resource may return provider-specific state. It must not return methods that let product flows execute hidden child flows. All pumped-fn work still enters through declared flows and `ctx.exec`/controller edges.

## Conformance cases

| Case | Direct read | Wall reduced |
|---|---|---|
| Existing consumer seam | Bind each provider with `model(...)`; the same agent graph returns a `ModelResponse` | AG-4 |
| Narrow substitution | Preset only the provider prompt flow; no process starts | AG-1, AG-13 |
| Missing config | Scope resolution fails for the required provider config tag | AG-1 |
| Graph trace | Trace includes `model.complete`, provider turn, and provider prompt before the boundary resource | AG-1, AG-13 |
| Abort | Abort reaches provider cancellation and the prompt settles | AG-2 |
| Close during prompt | Context/scope close kills or closes the child and settles pending work | AG-2 |
| Close after prompt | Process, pipes/socket, listeners, and request maps read zero after close | AG-2 |
| Double close | Repeated close is safe and does not repeat external work | AG-2 |
| No premature surface | Changed exports and paths contain no MCP, tool registry, or automatic tool collection | AG-5 |

Tests must create scopes through public APIs. Adapter atoms may fake the process/global they directly wrap. A generic conformance helper belongs in tests; it is not a runtime provider facade.

## Evidence

- `pkg/sdk/core/src/index.ts:1145-1152` proves the current provider-neutral `model` tag and `complete` port.
- `pkg/sdk/claude/src/index.ts:36-73` proves Claude currently has an explicit run flow, controller edge, turn flow, and stable model binding.
- `pkg/sdk/codex/src/index.ts:106-206` proves Codex ACP already uses a boundary resource, cleanup, prompt flow, controller edge, and stable model binding.
- `pkg/sdk/claude/tests/claude.test.ts:12-51` and `pkg/sdk/codex/tests/codex.test.ts:26-82` prove provider effects and model tags are replaceable at the scope seam.
- `pkg/core/lite/src/resource.ts:3-52` and `pkg/core/lite/src/scope.ts:2400-2436` prove resources are execution-boundary dependencies with awaited cleanup.
- `.okra/runs/managed-agent-sessions-20260713/drafts/dkr-1-checkpoint-accepted.json` limits Claude evidence to a candidate stream-json transport and leaves multi-turn, interrupt acknowledgement, and cleanup unanswered.

Replay: `.okra/runs/managed-agent-sessions-20260713/workers/DKR-2/replay.sh`.

Evidence hashes are recorded in the checkpoint and checked by the replay script.

## Questions answered

- No new core public interface is required to share lifecycle conformance.
- The stable `model` consumer seam can remain unchanged.
- A provider-specific boundary resource plus declared prompt flow is sufficient to keep process effects visible and substitutable.
- Codex ACP is the closest shipped reference shape, but its raw connection and request maps are not a proposed shared API.
- Common wire-event normalization, tools, and MCP are outside the smallest contract.

## Questions unanswered

- Whether Claude stream-json supports reliable multi-turn use, cancellation acknowledgement, and prompt correlation in one process.
- Whether one Claude process can safely handle overlapping prompts.
- Whether Codex ACP cleanup must await process exit rather than only call `kill()`.
- Which exact process/transport counters can prove zero live resources on every supported platform.
- Whether provider configuration should migrate to namespaces; DKR-L1 owns the mechanical authoring rule and migration scope.

These unknowns do not change the minimum contract, but they block a provider-ready or lifecycle-held claim.

## Risk implications

- AG-1 and AG-13: the proposal keeps provider turns and prompts as declared graph edges. A future facade that directly starts a process or invokes a hidden flow would violate the contract.
- AG-2: scope cleanup is the ownership point, but current Codex code only calls `child.kill()` and current Claude code is one-shot. Zero-live-resource proof remains unfunded implementation evidence.
- AG-4: no change to `model`, `complete`, `ModelRequest`, or `ModelResponse` is proposed.
- AG-5: no tool, MCP, or automatic collection surface is proposed.
- AG-7 and AG-INDEPENDENCE: this worker supplies evidence and a candidate decision only. Independent replay is still required.
- AG-LEVEL: candidate implementation work stays below the accepted DKR and CKR gates; it is not promoted here.

## Candidate contributions and progression

Candidate CKRs:

- CKR-1: `shared_session_conformance_pass_rate == 1` over the nine cases above for both managed providers.
- CKR-3: `codex_provider_ready == 1` only after lifecycle and authority reads hold.
- CKR-4: `public_provider_switch_example_count >= 1` using the unchanged model tag and one agent graph.

Candidate PKRs:

- PKR-2A: add a test-only managed-provider conformance harness with graph trace, substitution, abort, close, and zero-resource reads.
- PKR-2B: tighten Codex ACP cleanup and prove process exit, transport disposal, listener removal, and request-map cleanup.
- PKR-2C: add Claude's boundary resource and prompt flow over the accepted transport candidate, preserving the current Claude model binding.
- PKR-2D: update the canonical provider-switch example and docs only after both providers pass conformance.

Candidate CKRs and candidate PKRs are not promoted until the orchestrator accepts the supporting DKR learning checkpoint.

## Confidence

Confidence: `0.84` that this is the smallest useful shared contract. Confidence is lower for lifecycle implementation details because Claude cancellation and both providers' process-exit proofs remain open.

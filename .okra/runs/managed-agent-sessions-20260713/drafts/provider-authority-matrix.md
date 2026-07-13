# Provider authority matrix

| Authority | Claude stream-json | Codex ACP | Required managed-session rule |
| --- | --- | --- | --- |
| Working root | Spawn `cwd`; CLI exposes `--add-dir` | `session/new.cwd` plus `additionalDirectories` | Root and additional roots come from required tags and are absolute |
| Tools | `--tools`, allowlist, denylist | ACP permission requests; MCP list is separate | This milestone sends an empty tool/MCP set; automatic tools remain deferred |
| Permission mode | Explicit CLI mode; direct spawn preserved `dontAsk` | Client permission callback; shipped default is deny | Provider namespace carries a required permission policy; no grant default |
| Credentials | Global or token environment | Spawned ACP/Codex environment | Credentials are explicit config tags and never session input |
| Cancellation | Parent `SIGINT`; Claude emitted cancellation result and exited cleanly | Mandatory `session/cancel`; shipped adapter wires `AbortSignal` | Cancellation is part of the session handle and must resolve before cleanup passes |
| Cleanup | Closing stdin exits; cancellation left no live PID | Scope cleanup kills child but does not currently await exit | Scope disposal must await transport close and child exit |
| Session identity | Stream events carry one session ID across two turns | ACP returns session ID | Identity is provider-owned output, never caller-selected authority |
| Extra roots | `--add-dir` | Protocol `additionalDirectories` | Explicit array only; omitted means none |

Decision: use a provider-specific scope-owned session resource behind shared lifecycle flows. Do not put config, roots, permission defaults, or process creation inside a facade. Claude uses structured stream-json over a spawned process. Codex uses ACP. Both keep MCP/tool lists empty in this milestone.

Current gaps:

- Claude is still one-shot through `runCli`; it needs a scope-owned streaming process resource.
- Codex ACP does not pass `additionalDirectories` and uses only coarse `grant | deny` permission config.
- Codex cleanup kills the child without awaiting exit.
- Codex ACP 1.1.0 fails the real smoke with `gpt-5.6-sol`; npm registry latest is 1.1.2, which needs an isolated compatibility PKR and replay.

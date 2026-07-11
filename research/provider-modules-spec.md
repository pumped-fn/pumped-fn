# Spec packet: provider modules (claude, codex, pi) + composition lint rules

You are implementing in the pumped-fn repo, worktree `/home/lagz0ne/dev/pumped-fn/.claude/worktrees/feat+pi` (branch for this feature). Work only in this tree. pnpm workspace; read root `CLAUDE.md` and obey it fully (no comments, no `any`, no type suffixes on handles, no factory ceremony).

## Goal

Three provider modules for `@pumped-fn/sdk`'s `Model` seam, plus lint rules that enforce the composition pattern they demonstrate.

1. **`@pumped-fn/sdk-claude`** (rework existing `pkg/sdk/claude`): drives `claude -p` per round. Auth: either a long-lived token supplied via config tag (env `CLAUDE_CODE_OAUTH_TOKEN` passed to the subprocess) or reuse of the machine's global auth (`~/.claude`, no refresh logic in our code — the CLI handles it). No OAuth flows, no token refresh implementation.
2. **`@pumped-fn/sdk-codex`** (rework existing `pkg/sdk/codex`): same auth story (env key or global `~/.codex/auth.json`), driving `codex exec`. Additionally an **ACP mode**: a second `Model` implementation that talks Agent Client Protocol over stdio to a codex ACP server, using the official TS ACP client library.
3. **`@pumped-fn/sdk-pi`** (new `pkg/sdk/pi`): in-process integration with `@earendil-works/pi-ai` — no subprocess. Native tool calling: `ModelRequest.tools/skills/subagents` become native tool declarations (`load_skill`, `call_subagent` pseudo-tools); assistant tool calls map back to `ModelResponse.toolCalls/skillCalls/subagentCalls`. Validate `provider/modelId` against pi-ai's model catalog; expose a way to list supported models.
4. **Lint rules** in `pkg/tool/lint` enforcing the composition style used above (see "Composition pattern" and "Lint" sections).

## Composition pattern (binding — this is the point of the exercise)

Modules associate by reference. A provider package exposes:
- module-level handle definitions (`flow`/`atom`/`resource` created ONCE at module top level),
- config as a `tag<T>()`, declared via `deps: { config: tags.required(...) }` (or `tags.optional` with defaults),
- a tagged registration export, e.g. `export const pi = model(turn)`.

FORBIDDEN: exported functions that construct and return handles (`export function claude(options) { return model(flow({...})) }`). Options captured in closures are invisible edges; per-call flows break preset substitution and memoization. The existing `claudeHarness`/`codexHarness`/`claude()`/`codex()` factory shapes in `pkg/sdk/core` + wrappers are the anti-pattern being retired — migrate them: core keeps only reference-level building blocks (`cliWorker` stays a factory only if it remains a generic low-level constructor used at module level by provider packages; prefer converting provider harnesses to module-level flows + config tags).

Observability is inherited, not reinvented: every provider is a `Model` resolved through the existing `complete` flow (`step({workflow:true, kind:"llm"})`). Provider-internal effects (subprocess run, ACP session, pi-ai call) must be visible edges: use `step(...)` tags on flows for durable/span attribution, record through the `events` resource where the agent runtime does, and thread `abortSignal` tag where long-running. No bespoke logger, no console.

## Auth facts (verified 2026-07-10)

Claude CLI (v2.1.206):
- Long-lived token: `claude setup-token` prints a 1-year OAuth token; passed as env `CLAUDE_CODE_OAUTH_TOKEN` to `claude -p`. No refresh within the year. Alternatives: `ANTHROPIC_API_KEY` (Console key), `ANTHROPIC_AUTH_TOKEN` (bearer/gateway).
- Precedence: cloud-provider envs → `ANTHROPIC_AUTH_TOKEN` → `ANTHROPIC_API_KEY` → `apiKeyHelper` → `CLAUDE_CODE_OAUTH_TOKEN` → stored subscription OAuth.
- Global auth reuse: on Linux, stored OAuth lives at `~/.claude/.credentials.json` (0600, auto-refreshed by the CLI) plus state file `~/.claude.json`. Under env isolation (bubblewrap), either bind a writable HOME containing both, or set `CLAUDE_CONFIG_DIR` to a bound dir, or simplest: inject the token env. `--bare` does NOT read `CLAUDE_CODE_OAUTH_TOKEN` (API key / apiKeyHelper only) — the module must not combine bare mode with oauth-token config.
- Config tag design: `claudeConfig` supports `{ auth: { kind: "token", env?: name } | { kind: "global" } }` → token kind passes env through to the subprocess; global kind binds HOME/`CLAUDE_CONFIG_DIR` through the isolate. Never write auth files.

Codex CLI (v0.144.1):
- `CODEX_API_KEY` env is the supported single-run key for `codex exec` (only exec). `OPENAI_API_KEY` is a login-time input (`codex login --with-api-key` via stdin), not read at runtime.
- Global auth: `$CODEX_HOME/auth.json` (default `~/.codex/auth.json`; contains tokens, auto-refreshed during use). `--ignore-user-config` skips config.toml but auth still uses `CODEX_HOME` — so global-auth reuse under isolation = bind `~/.codex` (writable) or set `CODEX_HOME`.
- Config tag design mirrors claude: `{ auth: { kind: "api-key", env?: name } | { kind: "global" } }`.

## ACP facts (verified 2026-07-10)

- Codex has NO native ACP subcommand. Adapter: `@zed-industries/codex-acp` (npm, v0.16.0, Rust binary, bin `codex-acp`, run via `npx @zed-industries/codex-acp`), speaks ACP JSON-RPC 2.0 over stdio, reuses `~/.codex` auth. (Symmetry note: `@zed-industries/claude-code-acp` exists for claude — out of scope now, but keep the ACP client generic enough to point at either binary via config.)
- TS client library: `@agentclientprotocol/sdk` (v1.2.1 — the current official lib; do NOT use the stale `@zed-industries/agent-client-protocol`). Usage: `spawn` the adapter, wrap stdin/stdout in `ClientSideConnection` (you implement the Client interface for `session/update` and `session/request_permission`), then `initialize` → `newSession` → `prompt`; agent streams `session/update` notifications; prompt resolves with a stop reason; `session/cancel` for aborts.
- ACP Model shape: a `resource` owning the spawned adapter process + `ClientSideConnection` (lifecycle: dispose kills process), and a module-level `Model` flow depending on it: one `ModelRequest` round = one `session/prompt`; accumulate `session/update` content into `ModelResponse.content`; auto-grant or deny `session/request_permission` per config tag (this is a controlled edge — record it via `events`). Wire `abortSignal` tag → `session/cancel`. Exact request/response type names must be taken from the `@agentclientprotocol/sdk` typings at implementation time — verify from `node_modules` typings, do not guess.

## pi-ai API facts (verified 2026-07-10 against pi repo HEAD, @earendil-works/pi-ai@0.80.6)

A full clone of the pi repo is available for reference at `/tmp/claude-1001/-home-lagz0ne-dev-pumped-fn/29157e00-c9ca-46c6-90cc-ce2497e9d9d0/scratchpad/pi` (source of truth: `packages/ai/src/types.ts`, `models.ts`, `providers/all.ts`).

- Use the NEW surface: `builtinModels(options?) : MutableModels` from `@earendil-works/pi-ai/providers/all` (or `createModels` + per-provider factories from `@earendil-works/pi-ai/providers/<id>` for lean deps). Do NOT use `@earendil-works/pi-ai/compat` (`getModel`/`complete` globals — deprecated; note the pi repo's own sdk examples still use it, ignore them).
- Calls: `models.complete(model, context, options?): Promise<AssistantMessage>`; streaming via `models.stream(...)` returning `AsyncIterable<AssistantMessageEvent>` with `.result()`. Unified reasoning-level variants: `completeSimple`/`streamSimple` with `SimpleStreamOptions { reasoning?: "minimal"|"low"|"medium"|"high"|"xhigh"|"max" }`. Post-invocation errors do NOT throw — they surface as `stopReason: "error" | "aborted"` + `errorMessage` on the result; map that to a thrown domain error in our flow.
- `Context = { systemPrompt?: string; messages: Message[]; tools?: Tool[] }`. `Message = UserMessage | AssistantMessage | ToolResultMessage`; tool results are TOP-LEVEL messages `{ role: "toolResult", toolCallId, toolName, content: [{type:"text",...}], isError, timestamp }`. Every message requires `timestamp` (Unix ms) — take timestamps from an injected clock edge, not naked `Date.now()` (lint rule `no-naked-globals`).
- Tools: `{ name, description, parameters: TSchema }` (TypeBox, re-exported from root as `Type`). Tool calls come back as `ToolCall { type:"toolCall", id, name, arguments }` blocks in `AssistantMessage.content`, `stopReason: "toolUse"`. `validateToolCall(tools, toolCall)` exported. Use exported `StringEnum` helper (NOT `Type.Enum`) for enum params (Google compat).
- Auth precedence at request time: `options.apiKey` → `CredentialStore` passed to `builtinModels({credentials})` → ambient env (anthropic: `ANTHROPIC_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`); per-call `options.env` beats process.env. For this module: config tag carries `{ apiKeyEnv?: string }` resolved through an adapter edge; NO OAuth flows (pi-ai exposes them; out of scope).
- Catalog: `models.getModel(provider, id)` sync, `undefined` when unsupported → throw domain error listing `models.getModels(provider).map(m => m.id)`. Typed static access also available: `getBuiltinModel/getBuiltinModels/getBuiltinProviders` from `providers/all`. `getSupportedThinkingLevels(model)` / `clampThinkingLevel(model, level)` for thinking validation. Expose a module-level flow (or resource-backed accessor) to list supported models — that is the "supported models" deliverable.
- Usage/cost: `AssistantMessage.usage` has token counts + `cost.total` — record onto the `events` buffer with the model round.
- Packaging: ESM-only, `engines.node >= 22.19.0`, `typebox@1.1.38` dep. Add via catalog per repo dependency rules (`pnpm-workspace.yaml` catalog first).

pi module shape (binding): module-level `piConfig = tag<PiConfig>` (`{ provider, modelId, thinking?, apiKeyEnv? }`), a module-level `resource` owning the `Models` collection (`builtinModels()` — lazy, disposed with scope), and one module-level `Model` flow `deps: { models: <resource>, config: tags.required(piConfig) }` doing request→Context mapping, one `complete`/`completeSimple` call, response→`ModelResponse` mapping. Export `export const pi = model(<flow>)`. Mapping rules: `instructions`→`systemPrompt`; our `Message[]`→pi messages; `tools` Capabilities → pi Tools with permissive object schemas; `skills` → one `load_skill` tool (StringEnum of skill names); `subagents` → one `call_subagent` tool (name + prompt input); returned ToolCall blocks split back into `toolCalls`/`skillCalls`/`subagentCalls` on `ModelResponse`; text blocks joined → `content`; `stop` = stopReason `"stop"` with no calls.

## Lint rules (new; additive only)

Add to `pkg/tool/lint` (README table + rules in `src/index.ts`, mirroring existing rule structure):
- `pumped/no-handle-factory` (error): an exported function whose body creates and returns (directly or via wrapper like `model(...)`) an `atom`/`flow`/`resource`/`material`/`tag` handle. Composition roots (`createScope` call sites) and the documented core constructors (`agent`, `tool`, `skill`, `sub`, `session`, `guard`, `material`, `channel`, `schedule`, `cliWorker`) are allowlisted by config, not by loosening the rule.
- `pumped/config-via-tags` (warn to start): provider-module flows reading configuration from closure variables defined at module level that are parameters of an enclosing function — i.e. options-closure detection complementing `no-handle-factory`.
Design the exact AST detection conservatively (syntactic, documented false negatives) in the style of existing rules like `no-handle-spread` / `no-unattributed-await`.

## Anti-goals (binding)

- NO loosening of any existing lint rule: no rule deletions, no severity downgrades, no new allowlist entries for existing rules to make new code pass. New code conforms to the existing rules.
- NO bespoke observability: reuse `step`, `events`, suspense/workflow extension composition. If a provider needs logging, it is an event/edge, not a `console.log`.
- NO OAuth/refresh implementations. Token in via tag/env passthrough, or global auth reuse. Nothing writes auth files.
- NO test slop: use vitest `expectTypeOf` for type assertions (it evaluates its argument — assert against real values), no never-executed scaffolding, terse test names, no hand-rolled type gymnastics.
- NO module mocks anywhere (`vi.mock` is lint-rejected): the scope is the only seam. An adapter's own unit test may fake the global it wraps (subprocess boundary) below the seam.

## Testing (binding)

- Unit: scope-seam tests with preset substitution (see `pkg/sdk/test` `modelStub` for the reference non-CLI Model).
- Integration: THIS machine has authed `claude` and `codex` CLIs. Write integration tests that actually invoke them (small, cheap prompts; generous timeouts; marked/isolated so they can be filtered, e.g. separate `*.integration.test.ts` + vitest config include). They must run and pass locally as part of your verification. pi integration runs only if a supported provider key is present in env; skip cleanly otherwise (skip must be visible, not silent green).
- Gates you must run and report exit codes for: workspace build first (dist staleness!), then `pnpm -r typecheck`, `pnpm -r test`, root `pnpm lint`.

## Deliverables

- Code + tests per above; `pkg/sdk/README.md` and each package README updated; root `README.md` diagram if the lane shape changed.
- A short CHANGES summary listing every migrated/removed export (the factory retirement is a breaking change to `@pumped-fn/sdk` 2.x — flag it, do not silently alias).

# DKR-MIGRATION-1 — Public session-kernel API and migration contract

## Candidate decision

Ship one major SDK migration. Remove the legacy `Agent` facade, thin material-backed session, and the temporary `currentAgent`/`currentTool` path. Do not keep either execution loop as a compatibility runtime.

Add four public subpaths to `@pumped-fn/sdk`:

```text
@pumped-fn/sdk             stable workflow, material, CLI, eval, and Model base
@pumped-fn/sdk/agent       role, tool, skill, subagent, turn, and attempt ports
@pumped-fn/sdk/session     durable record, runtime resource, work, branch, event, and finish
@pumped-fn/sdk/validation  Standard Schema validation engine
@pumped-fn/sdk/sandbox     session-mediated sandbox port flows
```

Module namespaces group tag meaning without facade objects:

```ts
import * as agent from "@pumped-fn/sdk/agent"
import * as session from "@pumped-fn/sdk/session"
import * as validation from "@pumped-fn/sdk/validation"
import * as sandbox from "@pumped-fn/sdk/sandbox"
import * as claude from "@pumped-fn/sdk-claude"
```

`agent.turn`, `session.finish`, and `sandbox.exec` below are imported flow definitions, not methods on runtime values. Consumers execute the definitions through `ctx.exec` or `ctx.execStream`.

This is candidate learning. It does not accept itself or authorize product edits.

## Package exports

`@pumped-fn/sdk` adds these resolvable export entries:

```json
{
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.mts", "default": "./dist/index.mjs" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    },
    "./agent": {
      "import": { "types": "./dist/agent.d.mts", "default": "./dist/agent.mjs" },
      "require": { "types": "./dist/agent.d.cts", "default": "./dist/agent.cjs" }
    },
    "./session": {
      "import": { "types": "./dist/session.d.mts", "default": "./dist/session.mjs" },
      "require": { "types": "./dist/session.d.cts", "default": "./dist/session.cjs" }
    },
    "./validation": {
      "import": { "types": "./dist/validation.d.mts", "default": "./dist/validation.mjs" },
      "require": { "types": "./dist/validation.d.cts", "default": "./dist/validation.cjs" }
    },
    "./sandbox": {
      "import": { "types": "./dist/sandbox.d.mts", "default": "./dist/sandbox.mjs" },
      "require": { "types": "./dist/sandbox.d.cts", "default": "./dist/sandbox.cjs" }
    }
  }
}
```

The matching `tsdown.config.ts` entry is:

```ts
export default defineConfig({
  entry: {
    index: "src/index.ts",
    agent: "src/agent.ts",
    session: "src/session.ts",
    validation: "src/validation.ts",
    sandbox: "src/sandbox.ts",
  },
  dts: true,
  format: ["cjs", "esm"],
  clean: true,
})
```

Packed-package conformance must import and require every entry, resolve both declaration paths, and assert that the root does not duplicate the four subpath exports.

The root does not re-export the new subpaths. One concept gets one canonical import path. Internal source may share private helpers, but public declarations and runtime state are not duplicated.

Runtime dependency changes:

```text
@standard-schema/spec -> catalog dependency of @pumped-fn/sdk
zod                   -> development dependency only
valibot               -> development dependency only
@valibot/to-json-schema -> development dependency only
```

Zod and Valibot prove the engine in tests and docs. Neither becomes a runtime dependency.

## Exact validation API

File: `pkg/sdk/core/src/validation.ts`, public as `@pumped-fn/sdk/validation`.

```ts
import type { StandardSchemaV1 } from "@standard-schema/spec"
import type { Lite } from "@pumped-fn/lite"

type MaybePromise<T> = T | Promise<T>

export type JsonSchema = boolean | Readonly<Record<string, unknown>>

export interface Engine {
  readonly id: string
  validate<const Schema extends StandardSchemaV1>(
    schema: Schema,
    input: unknown,
  ): MaybePromise<StandardSchemaV1.Result<StandardSchemaV1.InferOutput<Schema>>>
  jsonSchema(schema: StandardSchemaV1): JsonSchema
  schemaDigest(schema: StandardSchemaV1): string
}

export interface StandardOptions<Schema extends StandardSchemaV1> {
  readonly id: string
  readonly toJsonSchema: (schema: Schema) => JsonSchema
}

export const engine: Lite.Tag<Engine>

export function standard<Schema extends StandardSchemaV1>(
  options: StandardOptions<Schema>,
): Engine
```

`standard()` delegates validation to `schema["~standard"].validate`, converts through the supplied library adapter, canonicalizes the JSON value, and returns a deterministic digest. It does not inspect whether the schema came from Zod or Valibot.

```ts
import * as z from "zod"
import * as validation from "@pumped-fn/sdk/validation"

validation.engine(validation.standard<z.ZodType>({
  id: "zod@4",
  toJsonSchema: (schema) => z.toJSONSchema(schema),
}))
```

```ts
import * as v from "valibot"
import { toJsonSchema } from "@valibot/to-json-schema"
import * as validation from "@pumped-fn/sdk/validation"

validation.engine(validation.standard<v.GenericSchema>({
  id: "valibot@1",
  toJsonSchema,
}))
```

## Exact session API

File: `pkg/sdk/core/src/session.ts`, public as `@pumped-fn/sdk/session`.

### Durable records

```ts
import type { Lite } from "@pumped-fn/lite"

export type SessionId = string
export type WorkId = string
export type BranchId = string
export type InvocationId = string

export interface AuthorityInput {
  readonly tenant: string
  readonly roots: readonly string[]
  readonly permissions: readonly string[]
  readonly tools: readonly string[]
  readonly sandbox: SandboxAuthority
}

export interface Authority extends AuthorityInput {
  readonly fingerprint: `sha256:${string}`
}

export interface SandboxAuthority {
  readonly roots: readonly string[]
  readonly commands: readonly string[]
  readonly write: boolean
  readonly network: boolean
}

export interface AuthorityConstraints {
  readonly roots?: readonly string[]
  readonly permissions?: readonly string[]
  readonly tools?: readonly string[]
  readonly sandbox?: Partial<SandboxAuthority>
}

export function narrowAuthority(
  parent: Authority,
  constraints: AuthorityConstraints,
): Authority

export function authorityFingerprint(
  input: AuthorityInput,
): `sha256:${string}`

export function createAuthority(input: AuthorityInput): Authority

export class AuthorityEscalationError extends Error {
  readonly field: "roots" | "permissions" | "tools" | "sandbox"

  constructor(field: AuthorityEscalationError["field"]) {
    super(`Authority constraint expands ${field}`)
    this.name = "AuthorityEscalationError"
    this.field = field
  }
}

export interface BranchRecord {
  readonly id: BranchId
  readonly parentId?: BranchId
  readonly version: number
  readonly createdBy: WorkId
  readonly authorityFingerprint: string
  readonly evidence: readonly EvidenceRef[]
}

export interface WorkRecord {
  readonly id: WorkId
  readonly parentId?: WorkId
  readonly branchId: BranchId
  readonly role: string
  readonly status: "scheduled" | "ready" | "working" | "waiting" | "completed" | "failed" | "cancelled"
  readonly policy: "all" | "fail-fast"
  readonly attempt: number
  readonly continuation?: Lite.JsonValue
}

export interface AttemptRecord {
  readonly workId: WorkId
  readonly attempt: number
  readonly snapshotEpoch: number
  readonly status: "working" | "waiting" | "completed" | "failed" | "cancelled"
  readonly startedAt: string
  readonly settledAt?: string
}

export interface InvocationRecord {
  readonly id: InvocationId
  readonly workId: WorkId
  readonly attempt: number
  readonly kind: "model" | "tool" | "database" | "sandbox" | "artifact" | "memory" | "adapter"
  readonly status: "working" | "completed" | "failed" | "cancelled" | "quarantined"
  readonly idempotencyKey: string
}

export interface ArtifactRef {
  readonly id: string
  readonly version: number
  readonly digest: string
  readonly mediaType: string
  readonly authorityFingerprint: string
  readonly workId: WorkId
  readonly branchId: BranchId
}

export interface MemoryRef {
  readonly id: string
  readonly version: number
  readonly status: "candidate" | "accepted" | "rejected"
  readonly source: "session" | "human" | "policy" | "import"
  readonly evidence: readonly EvidenceRef[]
  readonly authorityFingerprint: string
}

export interface ScheduleIntent {
  readonly id: string
  readonly workId: WorkId
  readonly dueAt: string
  readonly priority: number
  readonly expectedSessionVersion: number
}

export interface EvidenceRef {
  readonly id: string
  readonly kind: string
  readonly digest?: string
}

export interface SessionRecord {
  readonly id: SessionId
  readonly version: number
  readonly schemaVersion: number
  readonly status: "open" | "finishing" | "finished" | "abandoned"
  readonly authorityFingerprint: string
  readonly authorityConstraints: AuthorityInput
  readonly currentBranchId: BranchId
  readonly branches: readonly BranchRecord[]
  readonly work: readonly WorkRecord[]
  readonly attempts: readonly AttemptRecord[]
  readonly invocations: readonly InvocationRecord[]
  readonly artifacts: readonly ArtifactRef[]
  readonly memory: readonly MemoryRef[]
  readonly schedules: readonly ScheduleIntent[]
  readonly providerContinuations: Readonly<Record<string, string>>
  readonly nextEventSequence: number
}
```

`createAuthority()` is the only initial constructor. It performs these exact steps:

1. Require `tenant` and every array item to be a non-empty Unicode scalar string. Reject unpaired surrogates. Normalize every string to NFC. Do not trim, case-fold, resolve paths, or read the filesystem.
2. For `roots`, `permissions`, `tools`, `sandbox.roots`, and `sandbox.commands`, remove duplicates after NFC normalization and sort by unsigned lexicographic comparison of each string's UTF-8 bytes. Require every sandbox root to occur in the normalized top-level roots.
3. Encode this flat fixed-order tuple with ECMAScript `JSON.stringify`, with no replacer or whitespace:

```json
["pumped-fn.authority.v1","tenant-a",["/workspace"],["database:read"],["inspect_schema"],["/workspace"],[],true,false]
```

The tuple has nine elements. One-based positions 8 and 9, which are zero-based indices 7 and 8, contain the actual normalized `sandbox.write` and `sandbox.network` booleans. They are never constants or strings. The first seven positions are version, tenant, roots, permissions, tools, sandbox roots, and sandbox commands.

4. UTF-8 encode that JSON with the standard replacement-free scalar encoding. Hash the bytes with SHA-256. Encode all 32 digest bytes as 64 lowercase hexadecimal characters and prefix `sha256:`. The fingerprint format is exactly `sha256:<64 lowercase hex>`.
5. Return a frozen `Authority` containing the normalized fields and that fingerprint. `authorityFingerprint(input)` runs the same normalization and encoding but returns only the digest. The SDK uses one bundled deterministic SHA-256 implementation with standard empty-string and `abc` test vectors; it does not read ambient crypto state or a filesystem path.

The canonical vector above has these four boolean variants. Each digest is over the exact compact JSON bytes shown by the tuple rule:

| `write` | `network` | SHA-256 hex |
|---|---|---|
| `false` | `false` | `9855f73a43990385da93c5f51a6cb939fbe68f1c11191bf834c6ff100604d998` |
| `false` | `true` | `463a4bd8672960ac187808ccd9f5531ac40bc209c8577d4ba11d9909cd32d0f3` |
| `true` | `false` | `095d04fe2d1ed64b205070df5382f91aadcbc7b458566e029f73b874f61bd527` |
| `true` | `true` | `536001c48fa5d228c4a54e0e840b96b7c86e5eff6e53d56042141eb53d5fc869` |

The conformance test recomputes all four and requires four unique digests, proving that neither boolean is omitted or hardcoded.

Despite its historical field name, `SessionRecord.authorityConstraints` stores the complete normalized `AuthorityInput` body: tenant, roots, permissions, tools, sandbox roots, sandbox commands, write, and network. It is not a partial narrowing delta.

`narrowAuthority()` applies the subset rules to the parent's normalized fields, then calls `createAuthority()` for the child. `loadAndBind()` calls `createAuthority()` on the supplied authority body, compares the recomputed digest with both the supplied fingerprint and `SessionRecord.authorityFingerprint`, and compares the complete normalized body with `SessionRecord.authorityConstraints`. All digest comparisons require exact length and use a full-byte XOR accumulator. Any mismatch rejects before returning bindings or resolving `session`, provider, role, tool, sandbox, database, scheduler, memory, or artifact resources.

### Live runtime and registries

The runtime value exposes semantic state methods only. None performs an external effect.

```ts
export interface ActiveAttempt {
  readonly record: AttemptRecord
  readonly signal: AbortSignal
  readonly settled: Promise<AttemptSettlement>
}

export interface AttemptSettlement {
  readonly status: "completed" | "failed" | "cancelled"
  readonly result?: Lite.JsonValue
  readonly error?: Lite.JsonValue
}

export interface AdmitWorkInput {
  readonly id: WorkId
  readonly parentId?: WorkId
  readonly branchId: BranchId
  readonly role: string
  readonly policy: "all" | "fail-fast"
  readonly authority?: AuthorityConstraints
}

export interface ToolIdentity {
  readonly id: string
  readonly version: string
  readonly schemaDigest: string
  readonly validationEngine: string
  readonly readiness: string
  readonly flow: string
}

export interface ToolPermit {
  readonly identity: ToolIdentity
  readonly authorityFingerprint: string
  readonly epoch: number
}

export interface ControlEvent {
  readonly id: string
  readonly workId: WorkId
  readonly attempt?: number
  readonly expectedEpoch: number
  readonly sequence: number
  readonly mode: "queue" | "interrupt" | "cancel" | "input"
  readonly source: "human" | "parent" | "scheduler" | "policy"
  readonly payload: Lite.JsonValue
}

export interface SessionEvent {
  readonly sessionId: SessionId
  readonly workId: WorkId
  readonly attempt: number
  readonly invocationId?: InvocationId
  readonly branchId: BranchId
  readonly sequence: number
  readonly snapshotEpoch: number
  readonly type: string
  readonly agentName?: string
  readonly targetName?: string
  readonly round?: number
  readonly payload?: Lite.JsonValue
  readonly observedAt: string
}

export interface WorkRegistry {
  admit(input: AdmitWorkInput): ActiveAttempt
  settle(workId: WorkId, attempt: number, settlement: AttemptSettlement): void
  children(workId: WorkId): readonly WorkRecord[]
  active(): readonly ActiveAttempt[]
  cancel(workId: WorkId, reason: unknown): void
}

export interface ToolRegistry {
  permit(identity: ToolIdentity): ToolPermit
  authorize(identity: ToolIdentity, epoch: number): ToolPermit
  revoke(epoch: number): void
}

export interface BranchRegistry {
  current(): BranchRecord
  fork(input: { id: BranchId; parentId: BranchId; workId: WorkId }): BranchRecord
  record(branch: BranchRecord): void
}

export interface ControlRegistry {
  enqueue(event: ControlEvent): void
  drain(workId: WorkId, afterSequence: number): readonly ControlEvent[]
  fence(workId: WorkId, attempt: number, epoch: number): void
  accepts(workId: WorkId, attempt: number, epoch: number): boolean
}

export interface SessionRuntime {
  readonly record: SessionRecord
  readonly authority: Authority
  readonly status: "open" | "finishing" | "finished"
  readonly work: WorkRegistry
  readonly tools: ToolRegistry
  readonly branches: BranchRegistry
  readonly controls: ControlRegistry
  snapshot(status: SessionRecord["status"]): SessionRecord
  beginFinish(): Promise<void>
  completeFinish(version: number): void
}
```

`beginFinish()` is joinable owned-state coordination: reject admission, fence and cancel attempts, and await settlement. It performs no store, database, filesystem, model, sandbox, or scheduler operation.

### Session tags and flows

```ts
export type Load = Lite.Flow<SessionRecord, { id: SessionId }>
export type Commit = Lite.Flow<{ version: number }, {
  record: SessionRecord
  expectedVersion: number
}>
export type PublishArtifact = Lite.Flow<ArtifactRef, PublishArtifactInput>
export type RecallMemory = Lite.Flow<readonly MemoryRef[], RecallMemoryInput>
export type CommitMemory = Lite.Flow<MemoryRef, CommitMemoryInput>
export type AcceptMemory = Lite.Flow<MemoryRef, AcceptMemoryInput>
export type Wake = Lite.Flow<WorkRecord, WakeInput>

export interface PublishArtifactInput {
  readonly workId: WorkId
  readonly branchId: BranchId
  readonly mediaType: string
  readonly content: Uint8Array
}

export interface RecallMemoryInput {
  readonly workId: WorkId
  readonly query: string
  readonly limit: number
}

export interface CommitMemoryInput {
  readonly workId: WorkId
  readonly branchId: BranchId
  readonly value: Lite.JsonValue
  readonly evidence: readonly EvidenceRef[]
}

export interface AcceptMemoryInput {
  readonly id: string
  readonly workId: WorkId
  readonly evidence: readonly EvidenceRef[]
}

export interface WaitWorkInput {
  readonly work: AdmitWorkInput
  readonly intent: Omit<ScheduleIntent, "workId">
}

export interface WakeInput {
  readonly id: string
}

export interface ForkBranchInput {
  readonly id: BranchId
  readonly parentId: BranchId
  readonly workId: WorkId
  readonly authority: AuthorityConstraints
}

export interface JoinWorkInput {
  readonly workIds: readonly WorkId[]
  readonly policy: "all" | "fail-fast"
}

export interface MergeBranchesInput {
  readonly targetId: BranchId
  readonly sourceIds: readonly BranchId[]
  readonly workId: WorkId
}

export const authority: Lite.Tag<Authority>
export const record: Lite.Tag<SessionRecord>

export const current: Readonly<{
  work: Lite.Tag<WorkRecord>
  attempt: Lite.Tag<AttemptRecord>
  branch: Lite.Tag<BranchRecord>
  epoch: Lite.Tag<number>
}>

export const store: Readonly<{
  load: Lite.Tag<Load>
  commit: Lite.Tag<Commit>
}>

export const artifacts: Readonly<{
  publish: Lite.Tag<PublishArtifact>
}>

export const memory: Readonly<{
  recall: Lite.Tag<RecallMemory>
  commit: Lite.Tag<CommitMemory>
  accept: Lite.Tag<AcceptMemory>
}>

export const scheduler: Readonly<{
  wake: Lite.Tag<Wake>
}>

export const session: Lite.Resource<SessionRuntime>
export const load: Load
export const commit: Commit
export const publishArtifact: PublishArtifact
export const recallMemory: RecallMemory
export const commitMemory: CommitMemory
export const acceptMemory: AcceptMemory
export const wake: Wake
export const finish: Lite.Flow<SessionRecord, void>
export const steer: Lite.Flow<void, ControlEvent>
export const wait: Lite.Flow<WorkRecord, WaitWorkInput>
export const fork: Lite.Flow<BranchRecord, ForkBranchInput>
export const join: Lite.Flow<readonly AttemptSettlement[], JoinWorkInput>
export const merge: Lite.Flow<BranchRecord, MergeBranchesInput>
export const events: Lite.Flow<void, { workId: WorkId }, never, SessionEvent>

export interface ResumeInput {
  readonly id: SessionId
  readonly authority: Authority
}

export interface SessionBindings {
  readonly record: SessionRecord
  readonly authority: Authority
  readonly tags: readonly Lite.Tagged<any>[]
}

export const loadAndBind: Lite.Flow<SessionBindings, ResumeInput>

export interface RunInput<Input> {
  readonly work: AdmitWorkInput
  readonly input: Input
}

export interface RunOptions<Output, Input, Fault, Yield> {
  readonly name: string
  readonly turn: Lite.Flow<Output, Input, Fault, Yield>
}

export function run<Output, Input, Fault = never, Yield = never>(
  options: RunOptions<Output, Input, Fault, Yield>,
): Lite.Flow<Output, RunInput<Input>, Fault, Yield | SessionEvent>
```

`loadAndBind` depends on `store.load`. It rejects an authority fingerprint mismatch and returns the exact `authority(...)` and `record(...)` bindings needed by a new child context. It never mutates an existing context. `narrowAuthority` is pure and fail-closed: roots, permissions, tools, sandbox roots, and sandbox commands must be set subsets; `write` and `network` may change from `true` to `false` but never from `false` to `true`; omitted fields inherit. Tenant cannot change. Unknown sandbox fields are rejected by input validation. The fingerprint is recomputed from the canonical narrowed structure.

`run()` creates the one outer work flow. It depends on `session` and a controller for `options.turn`, narrows any supplied work authority before admission, and carries `current.work`, `current.attempt`, `current.branch`, and `current.epoch` into the child invocation. It does not implement a second turn loop.

`fork()` requires an explicit narrowing delta. Subagent dispatch does the same. Missing constraints inherit unchanged authority; supplied constraints can only reduce it. Authority is rebound before child role or tool resolution, so denied roots and cross-tenant changes fail before tool advertisement.

`wait()` admits `input.work`, settles and releases its live attempt, records status `waiting`, and persists the supplied schedule intent in the same runtime snapshot. `wake({ id })` accepts only the persisted intent id, verifies its stored expected session version against the freshly loaded record, consumes it once, and creates the next attempt. It cannot construct a new work id or schedule intent after resume.

`finish` depends on `session` and a controller for `commit`. It awaits `beginFinish()`, builds a pure finished snapshot, calls `commit`, then calls `completeFinish()`.

## Exact agent API

File: `pkg/sdk/core/src/agent.ts`, public as `@pumped-fn/sdk/agent`.

### Provider attempt port

Keep the existing scalar `Model` port in the root package. Add a separate rich attempt port:

```ts
import type { StandardSchemaV1 } from "@standard-schema/spec"
import type { Lite } from "@pumped-fn/lite"
import type { Message, Model, ModelRequest, ModelResponse } from "@pumped-fn/sdk"
import type { RunInput, SessionEvent, ToolIdentity } from "@pumped-fn/sdk/session"
import type { JsonSchema } from "@pumped-fn/sdk/validation"

export type ModelEvent =
  | { readonly type: "content_delta"; readonly content: string }
  | { readonly type: "reasoning_delta"; readonly content: string }
  | { readonly type: "provider_status"; readonly status: string }

export type Attempt = Lite.Flow<ModelResponse, ModelRequest, never, ModelEvent>

export const attempt: Lite.Tag<Attempt>
export const invoke: Lite.Flow<ModelResponse, ModelRequest, never, ModelEvent>

export function fromModel(provider: Model): Attempt
```

`fromModel()` is a scalar adapter that yields no deltas and calls one declared model flow. It is not a second agent loop.

### Tool resource

```ts
export interface ToolSnapshot {
  readonly identity: ToolIdentity
  readonly name: string
  readonly description: string
  readonly inputSchema: JsonSchema
  readonly authorityFingerprint: string
  readonly permitEpoch: number
  readonly branchId: string
  readonly snapshotEpoch: number
}

export interface ResolvedTool<Output, Input, Fault = never, Yield = never> {
  readonly snapshot: ToolSnapshot
  readonly schema: StandardSchemaV1
  readonly flow: Lite.Flow<Output, Input, Fault, Yield>
}

export interface ToolOptions<
  Output,
  Schema extends StandardSchemaV1,
  Fault = never,
  Yield = never,
  D extends Record<string, Lite.ResourceDependency> = Record<string, never>,
> {
  readonly name: string
  readonly version: string
  readonly description: string
  readonly input: Schema
  readonly flow: Lite.Flow<Output, StandardSchemaV1.InferOutput<Schema>, Fault, Yield>
  readonly deps?: D
}

export function tool<
  Output,
  const Schema extends StandardSchemaV1,
  Fault = never,
  Yield = never,
  const D extends Record<string, Lite.ResourceDependency> = Record<string, never>,
>(options: ToolOptions<Output, Schema, Fault, Yield, D>): Lite.Resource<
  ResolvedTool<Output, StandardSchemaV1.InferOutput<Schema>, Fault, Yield>
>

export class ToolInputError extends Error {
  readonly tool: string
  readonly issues: readonly StandardSchemaV1.Issue[]

  constructor(tool: string, issues: readonly StandardSchemaV1.Issue[]) {
    super(`Invalid input for tool ${tool}`)
    this.name = "ToolInputError"
    this.tool = tool
    this.issues = issues
  }
}
```

`tool()` creates a current-owned resource. Its dependencies are `session.session`, `validation.engine`, and the explicit readiness dependencies in `deps`. It returns the original inert flow definition, not a context-bound `FlowHandle`. Dispatch validates through the engine and executes `ctx.exec({ flow: selected.flow })` from the active turn context.

### Skills and subagents

```ts
export interface SkillOptions<D extends Record<string, Lite.ResourceDependency>> {
  readonly name: string
  readonly version: string
  readonly description: string
  readonly content: string | Lite.Flow<string, void>
  readonly deps?: D
}

export interface ResolvedSkill {
  readonly name: string
  readonly version: string
  readonly description: string
  readonly content: Lite.Flow<string, void>
}

export function skill<const D extends Record<string, Lite.ResourceDependency>>(
  options: SkillOptions<D>,
): Lite.Resource<ResolvedSkill>

export interface SubagentOptions<Output, Input, Fault, Yield> {
  readonly name: string
  readonly version: string
  readonly description: string
  readonly role: Lite.Resource<Role>
  readonly turn: Lite.Flow<Output, Input, Fault, Yield>
}

export interface SubagentDefinition<Output, Input, Fault, Yield> {
  readonly name: string
  readonly version: string
  readonly description: string
  readonly role: Lite.Resource<Role>
  readonly turn: Lite.Flow<Output, Input, Fault, Yield>
  readonly run: Lite.Flow<Output, RunInput<Input>, Fault, Yield | SessionEvent>
}

export function subagent<Output, Input, Fault = never, Yield = never>(
  options: SubagentOptions<Output, Input, Fault, Yield>,
): SubagentDefinition<Output, Input, Fault, Yield>
```

Literal skill content is lifted into a pure named flow. Effectful skill loading stays a declared flow. A selected subagent creates child work before executing its inert turn definition.

### Role resource and turn flow

```ts
export interface Role {
  readonly name: string
  readonly version: string
  readonly description?: string
  readonly instructions: string
  readonly maxRounds: number
  readonly tools: readonly AnyResolvedTool[]
  readonly skills: readonly ResolvedSkill[]
  readonly subagents: readonly AnySubagentDefinition[]
}

export type AnyResolvedTool = ResolvedTool<any, any, any, any>
export type AnySubagentDefinition = SubagentDefinition<any, any, any, any>

export interface RoleOptions<
  Tools extends Record<string, Lite.Resource<AnyResolvedTool>>,
  Skills extends Record<string, Lite.Resource<ResolvedSkill>>,
  Subagents extends Record<string, AnySubagentDefinition>,
> {
  readonly name: string
  readonly version: string
  readonly description?: string
  readonly instructions?: string
  readonly maxRounds?: number
  readonly tools?: Tools
  readonly skills?: Skills
  readonly subagents?: Subagents
}

export function role<
  const Tools extends Record<string, Lite.Resource<AnyResolvedTool>> = Record<string, never>,
  const Skills extends Record<string, Lite.Resource<ResolvedSkill>> = Record<string, never>,
  const Subagents extends Record<string, AnySubagentDefinition> = Record<string, never>,
>(options: RoleOptions<Tools, Skills, Subagents>): Lite.Resource<Role>

export interface TurnInput {
  readonly prompt?: string
  readonly messages?: readonly Message[]
  readonly metadata?: Lite.JsonValue
}

export interface ToolResult {
  readonly name: string
  readonly callId?: string
  readonly input: unknown
  readonly output: unknown
}

export interface SkillResult {
  readonly name: string
  readonly callId?: string
  readonly content: string
}

export interface SubagentResult {
  readonly name: string
  readonly workId: string
  readonly input: TurnInput
  readonly output: TurnResult
}

export interface TurnResult {
  readonly role: string
  readonly content: string
  readonly messages: readonly Message[]
  readonly rounds: number
  readonly toolResults: readonly ToolResult[]
  readonly skillResults: readonly SkillResult[]
  readonly subagentResults: readonly SubagentResult[]
  readonly events: readonly SessionEvent[]
}

export interface TurnOptions {
  readonly name: string
  readonly role: Lite.Resource<Role>
}

export function turn(
  options: TurnOptions,
): Lite.Flow<TurnResult, TurnInput, never, SessionEvent>
```

`subagent()` keeps `options.turn` unchanged and creates `run` once with `session.run({ name: options.name, turn: options.turn })`; both are inert flow definitions. `role()` creates a current-owned resource with static dependencies on `session.session` and the supplied tool and skill resources. Subagent metadata contains only inert child role-resource, turn-flow, and run-flow definitions; resolving the parent role does not resolve any child definition. After model selection, dispatch executes `selected.run` with `{ work, input }`. Its outer session flow admits the child `WorkRecord` and binds narrowed authority before the inner turn controller resolves `selected.role` or its tools. A failed admission produces zero child role, tool, model, or backend resolutions. The agent `turn()` remains the only model-round and dispatch loop. The role value has no `.turn`, `.exec`, or executable registry method.

## Exact sandbox API

File: `pkg/sdk/core/src/sandbox.ts`, public as `@pumped-fn/sdk/sandbox`.

```ts
export interface Policy {
  readonly roots: readonly string[]
  readonly write: boolean
  readonly network: boolean
  readonly commands: readonly string[]
  readonly timeoutMs: number
  readonly maxOutputBytes: number
}

export interface ReadInput { readonly path: string }
export interface WriteInput { readonly path: string; readonly content: string }
export interface ExecInput { readonly command: string; readonly args?: readonly string[] }
export interface ExecResult { readonly stdout: string; readonly stderr: string; readonly exitCode: number }
export type ExecEvent = { readonly type: "stdout" | "stderr"; readonly content: string }

export type Read = Lite.Flow<string, ReadInput>
export type Write = Lite.Flow<void, WriteInput>
export type Run = Lite.Flow<ExecResult, ExecInput, never, ExecEvent>

export const policy: Lite.Tag<Policy>
export const impl: Readonly<{
  read: Lite.Tag<Read>
  write: Lite.Tag<Write>
  run: Lite.Tag<Run>
}>

export const read: Read
export const write: Write
export const exec: Run
```

Each port flow depends on `session.session`, validates the session-issued permit against `policy`, and invokes the required implementor flow. The model sees domain tools that wrap these ports. It does not receive a physical sandbox method bag.

## Database-analysis public use

```ts
import assert from "node:assert/strict"
import { createScope, flow, tag, tags, typed, type Lite } from "@pumped-fn/lite"
import * as z from "zod"
import * as agent from "@pumped-fn/sdk/agent"
import * as session from "@pumped-fn/sdk/session"
import * as validation from "@pumped-fn/sdk/validation"
import * as claude from "@pumped-fn/sdk-claude"
import {
  branchId,
  acceptMemoryImpl,
  commitMemoryImpl,
  commitSession,
  loadSession,
  publishArtifactImpl,
  prompt,
  readOnlyExplain,
  readSchema,
  readiness,
  sessionId,
  sql,
  wakeImpl,
  workId,
} from "./database-fixture.js"

interface SchemaInput { readonly schema: string }
interface SchemaResult { readonly tables: readonly string[] }
interface PlanInput { readonly sql: string; readonly parameters: readonly unknown[] }
interface PlanResult { readonly plan: string; readonly applied: false }
interface DatabaseReadiness { readonly fingerprint: string }

const boundAuthority = session.createAuthority({
  tenant: "tenant-a",
  roots: [process.cwd()],
  permissions: ["database:read"],
  tools: ["inspect_schema", "explain_query"],
  sandbox: {
    roots: [process.cwd()],
    commands: [],
    write: false,
    network: false,
  },
})

const proposalSchema = z.string().transform((content, ctx) => {
  try {
    return JSON.parse(content) as unknown
  } catch {
    ctx.addIssue({ code: "custom", message: "Expected a JSON proposal" })
    return z.NEVER
  }
}).pipe(z.object({
  applied: z.literal(false),
  recommendations: z.array(z.string()),
}))

const validator = validation.standard<z.ZodType>({
  id: "zod@4",
  toJsonSchema: (schema) => z.toJSONSchema(schema),
})

const database = {
  inspect: tag<Lite.Flow<SchemaResult, SchemaInput>>({ label: "database.inspect" }),
  explain: tag<Lite.Flow<PlanResult, PlanInput>>({ label: "database.explain" }),
  ready: tag<DatabaseReadiness>({ label: "database.ready" }),
}

const inspectSchema = flow({
  name: "database.inspectSchema",
  parse: typed<SchemaInput>(),
  deps: { impl: tags.required(database.inspect) },
  factory: (ctx, { impl }) => impl.exec({ input: ctx.input }),
})

const inspect = agent.tool({
  name: "inspect_schema",
  version: "1",
  description: "Inspect the allowed database schema.",
  input: z.object({ schema: z.string() }),
  flow: inspectSchema,
  deps: { ready: tags.required(database.ready) },
})

const explainQuery = flow({
  name: "database.explainQuery",
  parse: typed<PlanInput>(),
  deps: { impl: tags.required(database.explain) },
  factory: (ctx, { impl }) => impl.exec({ input: ctx.input }),
})

const explain = agent.tool({
  name: "explain_query",
  version: "1",
  description: "Explain a read-only query without applying DDL.",
  input: z.object({ sql: z.string(), parameters: z.array(z.unknown()) }),
  flow: explainQuery,
  deps: { ready: tags.required(database.ready) },
})

const analyst = agent.role({
  name: "database-analyst",
  version: "1",
  instructions: "Inspect and explain. Return proposals with applied=false.",
  tools: { inspect, explain },
})

const analyzeTurn = agent.turn({
  name: "database.analyze.turn",
  role: analyst,
})

export const analyze = session.run({
  name: "database.analyze",
  turn: analyzeTurn,
})

const scope = createScope({
  tags: [
    session.store.load(loadSession),
    session.store.commit(commitSession),
    session.artifacts.publish(publishArtifactImpl),
    session.memory.commit(commitMemoryImpl),
    session.memory.accept(acceptMemoryImpl),
    session.scheduler.wake(wakeImpl),
    validation.engine(validator),
    claude.claudeConfig({
      auth: { kind: "global" },
      cwd: process.cwd(),
      roots: [],
      permission: "deny",
      shutdownTimeoutMs: 1_000,
    }),
    claude.claudeAttemptBinding,
    database.inspect(readSchema),
    database.explain(readOnlyExplain),
    database.ready(readiness),
  ],
})

const host = scope.createContext()
await host.resolve(claude.claudeLeases)

const bootstrap = scope.createContext({ parent: host })
const bindings = await bootstrap.exec({
  flow: session.loadAndBind,
  input: { id: sessionId, authority: boundAuthority },
})
await bootstrap.close()

const owner = scope.createContext({ parent: host, tags: [...bindings.tags] })
await owner.resolve(session.session)

try {
  const observed: session.SessionEvent[] = []
  const stream = owner.execStream({
    flow: analyze,
    input: {
      work: {
        id: workId,
        branchId,
        role: "database-analyst",
        policy: "fail-fast",
      },
      input: { prompt: `${prompt}\nSQL: ${sql}` },
    },
  })
  for await (const event of stream) observed.push(event)
  const result = await stream.result
  assert(observed.length > 0)
  const proposal = await validator.validate(proposalSchema, result.content)
  assert(!("issues" in proposal))
  assert.equal(proposal.value.applied, false)

  const artifact = await owner.exec({
    flow: session.publishArtifact,
    input: {
      workId,
      branchId,
      mediaType: "application/json",
      content: new TextEncoder().encode(result.content),
    },
  })
  assert(artifact.digest.length > 0)

  const forked = await owner.exec({
    flow: session.fork,
    input: {
      id: `${branchId}.index-review`,
      parentId: branchId,
      workId,
      authority: { permissions: ["database:read"] },
    },
  })
  const childRuns = [
    owner.exec({
      flow: analyze,
      input: {
        work: {
          id: `${workId}.schema`,
          parentId: workId,
          branchId: forked.id,
          role: "database-analyst",
          policy: "all",
          authority: { permissions: ["database:read"] },
        },
        input: { prompt: "Check indexes from the observed schema." },
      },
    }),
    owner.exec({
      flow: analyze,
      input: {
        work: {
          id: `${workId}.plan`,
          parentId: workId,
          branchId: forked.id,
          role: "database-analyst",
          policy: "all",
          authority: { permissions: ["database:read"] },
        },
        input: { prompt: `Explain without applying: ${sql}` },
      },
    }),
  ]

  const settlements = await owner.exec({
    flow: session.join,
    input: {
      workIds: [`${workId}.schema`, `${workId}.plan`],
      policy: "all",
    },
  })
  assert(settlements.every((settlement) => settlement.status === "completed"))
  const childResults = await Promise.all(childRuns)
  assert.equal(childResults.length, 2)

  const merged = await owner.exec({
    flow: session.merge,
    input: {
      targetId: branchId,
      sourceIds: [forked.id],
      workId,
    },
  })
  assert.equal(merged.id, branchId)

  await owner.exec({
    flow: session.steer,
    input: {
      id: `${workId}.control.1`,
      workId,
      expectedEpoch: 1,
      sequence: 1,
      mode: "queue",
      source: "human",
      payload: { instruction: "Compare both child results." },
    },
  })
  const memory = await owner.exec({
    flow: session.commitMemory,
    input: {
      workId,
      branchId: merged.id,
      value: { kind: "database-analysis", applied: proposal.value.applied },
      evidence: [{ id: artifact.id, kind: "artifact", digest: artifact.digest }],
    },
  })
  assert.equal(memory.status, "candidate")
  const accepted = await owner.exec({
    flow: session.acceptMemory,
    input: {
      id: memory.id,
      workId,
      evidence: [{ id: artifact.id, kind: "artifact", digest: artifact.digest }],
    },
  })
  assert.equal(accepted.status, "accepted")
  const waited = await owner.exec({
    flow: session.wait,
    input: {
      work: {
        id: `${workId}.deferred`,
        parentId: workId,
        branchId: merged.id,
        role: "database-analyst",
        policy: "all",
        authority: { permissions: ["database:read"] },
      },
      intent: {
        id: `${workId}.wake.1`,
        dueAt: new Date(0).toISOString(),
        priority: 0,
        expectedSessionVersion: bindings.record.version + 1,
      },
    },
  })
  assert.equal(waited.status, "waiting")

  const runtime = await owner.resolve(session.session)
  const checkpoint = runtime.snapshot("open")
  const committed = await owner.exec({
    flow: session.commit,
    input: { record: checkpoint, expectedVersion: bindings.record.version },
  })
  assert.equal(committed.version, bindings.record.version + 1)
} finally {
  await owner.close()
}

const wakeBootstrap = scope.createContext({ parent: host })
const wakeBindings = await wakeBootstrap.exec({
  flow: session.loadAndBind,
  input: { id: sessionId, authority: boundAuthority },
})
await wakeBootstrap.close()

const resumed = scope.createContext({ parent: host, tags: [...wakeBindings.tags] })
await resumed.resolve(session.session)
try {
  const awoken = await resumed.exec({
    flow: session.wake,
    input: { id: `${workId}.wake.1` },
  })
  assert.equal(awoken.id, waited.id)
  assert.equal(awoken.attempt, waited.attempt + 1)
  await resumed.exec({ flow: session.finish })
} finally {
  await resumed.close()
  await host.close()
  await scope.dispose()
}
```

The fixture module supplies typed inert adapter flows and values; it does not create a scope. The acceptance test also asserts no DDL or write call, no database client held while either model attempt runs, the two child work items overlap, queued steering is fenced by epoch, waiting work owns no live provider or database lease, memory stays a candidate until the host-side acceptance call, session close leaves the root lease manager live, and host close joins it once. Tests replace store, model attempt, database ports, validation engine, memory, scheduler, and clock through `createScope({ presets, tags, extensions })` only.

## Symbol migration map

### Root symbols kept

| Symbol | Decision | Required change |
|---|---|---|
| `model`, `complete`, `Model` | Keep | Scalar provider seam remains. |
| `ModelRequest`, `ModelResponse`, `Message`, `ToolCall`, `SkillCall`, `SubCall`, `Capability` | Keep | `Capability` gains optional JSON Schema; providers accept the expanded value. |
| `step`, `workflowRun`, `workflow`, `runtime`, `abortSignal` | Keep | Attempt and session flows continue using normal tags and steps. |
| `workflowExtension`, `extension`, `RemoteRunner`, `WorkerRegistry`, `workerRegistry` | Keep | No session-specific hidden routing added. |
| `material`, `derivedMaterial`, patch/read material APIs and types | Keep | They no longer claim to be semantic sessions. |
| `guard`, CLI helpers, workflow inspection | Keep | Unrelated stable primitives. |
| Eval checks `includes`, `used`, `loaded`, `delegated`, `summary` | Keep | Read the new `TurnResult` supplied by suite. |
| `channel`, `schedule`, `http` | Keep symbol, break options | Replace `{ agent }` with `{ turn }`; each adapter executes that flow directly. |
| `suite`, `runEval`, `Suite`, `SuiteOptions` | Keep symbol, break options | Replace agent fields with a turn flow; no legacy execution loop. |

The eval helpers `used`, `loaded`, and `delegated` keep reading `toolResults`, `skillResults`, and `subagentResults`. `summary()` keeps its event rendering because `SessionEvent` retains optional compatibility fields `agentName`, `targetName`, and `round`; emitters fill them for role, tool, skill, and subagent events. `TurnResult.agentName` becomes `role`. Type-level fixtures compile every retained helper and run `summary()` against events with and without compatibility fields.

### Root symbols removed in the major

| Symbol | Replacement |
|---|---|
| `Agent`, `AgentOptions`, `agent()` | `Role`, `RoleOptions`, `role()` from `@pumped-fn/sdk/agent` plus a separate `turn()` flow. |
| `agent.turn` | Exported turn definition created by `turn({ role })`. |
| root `Tool`, `ToolOptions`, `tool()` | Resource-backed `tool()` from `@pumped-fn/sdk/agent`. |
| root `Skill`, `SkillOptions`, `skill()` | Resource-backed `skill()` from `@pumped-fn/sdk/agent`. |
| `Sub`, `SubOptions`, `sub()` | Resource-backed `subagent()` plus child `WorkRecord`. |
| `TurnInput`, `TurnResult`, `ToolResult`, `SkillResult`, `SubResult` | Names from `@pumped-fn/sdk/agent`; `SubResult` becomes `SubagentResult`. |
| `SessionState`, `SessionOptions`, root `session()` | `SessionRecord`, `SessionRuntime`, and `session.session` from `@pumped-fn/sdk/session`. |
| `send()` | `session.run({ turn })` plus explicit `session.finish`. |
| `EventType`, `Event`, `EventBuffer`, root `events` | `SessionEvent` and `session.events`. |
| `Sandbox`, `SandboxExecResult`, root `sandbox` | `@pumped-fn/sdk/sandbox` port-flow contracts. |

### Temporary managed-tools symbols never shipped

| Symbol/shape | Decision | Salvage |
|---|---|---|
| `currentTool()` | Do not merge | Keep Standard Schema inference, JSON Schema publication, validation errors, readiness-before-model tests. |
| `CurrentTool` with `FlowHandle` | Reject | Replace with inert `Lite.Flow` definition executed in the attempt context. |
| `currentAgent()` | Do not merge | Keep static record dependencies and duplicate-name checks in `role()`. |
| temporary `turn()` loop | Reject | There is one new session-aware turn loop only. |
| `validation.engine`, `validation.standard` object | Reshape | Move to the validation subpath as `engine` and `standard`. |
| Zod and Valibot fixtures | Keep | Use as dev-only conformance cases. |
| prompt-only provider tool tests | Refine | Assert structured snapshot identity, pre-model failure, validation, and dispatch identity. |

### No runtime compatibility bridge

The PR includes a migration table, type-level before/after fixtures, and release notes. It does not export `legacyAgent`, recreate `.turn`, overload `send`, or route old and new inputs through two loops.

The retained adapter symbols are declaration bridges only:

```ts
channel({ turn: analyze })
schedule({ turn: analyze })
http({ turn: analyze })
suite({ turn: analyze, cases })
```

All four execute the same supplied flow.

## Provider package impact

### Claude

Keep the existing public names `claudeConfig`, `engine`, `clock`, `claudeSession`, `claudeRun`, `claudeTurn`, and `claude`. Add exactly:

```ts
export const claudeLeases: Lite.Resource<ClaudeLeaseManager>
export const claudeAttempt: agent.Attempt
export const claudeAttemptBinding: Lite.Tagged<agent.Attempt>
```

`claudeLeases` is root-owned and gives each logical session an isolated process lease. `claudeAttempt` is the canonical provider execution flow and yields normalized deltas. The scalar `claudeTurn` drains that same flow. `claudeSession` remains for scalar compatibility but is not shared across overlapping logical sessions. Abort destroys and joins only the selected lease. Host-root close joins every remaining lease. There is one execution path per lease and no serial-process claim for rich overlapping sessions.

### Codex

Keep the exact existing names `codexConfig`, `environment`, `clock`, `codexRun`, `codexTurn`, `codex`, `codexAcpConfig`, `acp`, `codexAcpPrompt`, `codexAcpTurn`, and `codexAcp`. Add `codexAttempt`, `codexAttemptBinding`, `codexAcpAttempt`, and `codexAcpAttemptBinding`. ACP notification chunks yield normalized deltas instead of only entering a boundary buffer. Scalar Model wrappers drain the same attempt flow. `mcpServers` remains empty.

### Pi

Keep the exact existing names `piConfig`, `models`, `supportedModels`, `piTurn`, and `pi`. Add `piAttempt` and `piAttemptBinding`. The rich path uses injected `stream` or `streamSimple`; the scalar `piTurn` drains the same normalization path. This does not claim Pi Coding Agent harness parity.

### Just Bash

Replace the root `Sandbox` method-bag binding with `sandbox.impl.read`, `sandbox.impl.write`, and `sandbox.impl.run` flow implementors plus explicit engine/workspace resources. Long-running commands stream and observe the attempt cancellation signal.

### Test SDK

Keep `modelStub`. Add:

```ts
attemptStub(eventsAndResult)
sessionStoreStub(records)
sessionHarness({ authority, record, tags, presets, extensions })
```

`sessionHarness` returns test-owned scope/context handles. It does not create a shared production scope or bypass `createScope`.

Every SDK provider package changes its `@pumped-fn/sdk` peer range to `^3.0.0`.
`@pumped-fn/sdk` and all five SDK provider/test packages change their `@pumped-fn/lite` peer range from stale `^3.1.0` to the current published major `^5.0.0`. Workspace development dependencies remain `workspace:*`.

Every binding uses the shared tag; providers do not export a competing `attempt` tag:

```ts
export const claudeAttemptBinding = agent.attempt(claudeAttempt)
export const codexAttemptBinding = agent.attempt(codexAttempt)
export const codexAcpAttemptBinding = agent.attempt(codexAcpAttempt)
export const piAttemptBinding = agent.attempt(piAttempt)
```

## Changeset and compatibility policy

One changeset marks these packages major because their peer range and agent/session/sandbox surfaces change:

```text
@pumped-fn/sdk
@pumped-fn/sdk-claude
@pumped-fn/sdk-codex
@pumped-fn/sdk-pi
@pumped-fn/sdk-just-bash
@pumped-fn/sdk-test
```

The changeset says:

```text
Replace the Agent facade and material session with resource-backed role, tool,
session, work, and attempt primitives. Existing Model providers remain usable.
Migrate agent(), agent.turn, session(), send(), and Sandbox imports using the
package migration table. This release intentionally has no legacy execution loop.
```

Do not publish, release, merge, or tag in this goal.

## First-PR boundary

Allowed product paths after checkpoint acceptance:

```text
pkg/sdk/core/src/{index,agent,session,validation,sandbox}.ts
pkg/sdk/core/{package.json,tsdown.config.ts,README.md,PATTERNS.md,tests/**}
pkg/sdk/{claude,codex,pi,bash,test}/{src,tests,README.md,package.json,CHANGELOG.md}
pkg/framework/pumped/tests/agent.test.ts
pnpm-workspace.yaml
pnpm-lock.yaml
.changeset/<one-session-kernel-major>.md
```

Required public proof:

```text
pkg/sdk/core/tests/session-kernel.test.ts
pkg/sdk/core/tests/database-analysis.test.ts
provider parity tests for Claude and Codex
Zod and Valibot validation tests
packed import, require, and declaration-resolution tests for all five SDK entries
workspace consumer compile audit, including pkg/framework/pumped/tests/agent.test.ts
deterministic sandbox read/write/exec policy and cancellation tests
deterministic scheduler wake, stale-version, and no-live-lease waiting tests
deterministic memory recall, candidate commit, acceptance, and authority tests
deterministic pi stream/final parity, abort settlement, overlap, and cancellation-isolation tests
deterministic just-bash streaming, output limit, abort settlement, and session-isolation tests
Claude and Codex overlap, cancel-A-keeps-B-live, consumer-stop, continuation, and final-value parity tests
README diagram and exact migration table
provider README examples using module namespaces
```

No Lite file, automatic discovery, native Claude tool, shared scope factory, database DDL apply, release workflow, or unrelated lint code belongs in this PR. The existing `pkg/sdk/mcp` package and its published surface remain byte-for-byte unchanged; AG-MCP forbids a new MCP dependency, export, automatic collection path, or native Claude tool in this migration.

### Workspace consumer audit

| Consumer | Imported surface | Migration |
|---|---|---|
| `pkg/sdk/{claude,codex,pi,bash,test}` source and tests | Stable Model symbols plus removed agent, event, and Sandbox symbols | Included in the SDK package boundary and migrated to the canonical subpaths. |
| `pkg/framework/pumped/tests/agent.test.ts` | Removed root `agent()` and `tool()` | Included as a test-only consumer edit; build a role and turn from `@pumped-fn/sdk/agent`. No `@pumped-fn/pumped` release entry because its public/runtime contract does not change. |
| `examples/invoice-triage` | Stable `Model`, `complete`, `step`, `inspect`, and workflow symbols | Compile unchanged; its package gate proves root compatibility. |
| `pkg/tool/lint/tests/scanner.test.ts` | Text fixtures for stable `model` and `step` imports | No semantic migration; scanner tests remain green. |
| `pkg/sdk/mcp` | No runtime dependency or source import of `@pumped-fn/sdk` | Leave unchanged and outside the changeset. |

The audit command is `rg -n 'from ["'"']@pumped-fn/sdk(?:/[^"'"']+)?["'"']' --glob '*.{ts,tsx,mts,cts}' .`. Every match is classified in the table or lies inside an already listed SDK package.

### Shipped-surface conformance

| Surface | Deterministic proof required before PR readiness |
|---|---|
| Package subpaths | Build, pack, and import plus require all five entries; compile their `.d.mts` and `.d.cts` declarations under NodeNext. |
| Declaration API | Compile one fixture containing every declaration block in this contract with `strict`, `exactOptionalPropertyTypes`, and no `skipLibCheck`. |
| Session lifecycle | Two sessions share root resources; finish is joinable; no dependency is used after close; lifecycle hooks perform no business effect. |
| Authority | Resume fingerprint mismatch, cross-tenant change, root expansion, permission expansion, and tool expansion all fail before role or tool resolution; a narrower fork succeeds. |
| Tools and turn | Missing readiness blocks the first model call, advertised and dispatched identities match, and one turn loop owns all rounds. |
| Sandbox and bash | Read, write, exec, policy denial, stream backpressure, output cap, abort settlement, and cancel-A-keeps-B-live. |
| Scheduler | Persisted intent, stale session version, wake idempotency, and wait with zero live model, database, or sandbox leases. |
| Memory and artifacts | Governed recall, candidate commit, explicit acceptance outside model authority, branch evidence, authority mismatch, and immutable artifact digest. |
| Claude | Isolated process leases, normalized deltas, scalar final parity, continuation, overlap, destructive cancel of A, B remains live, and host join. |
| Codex | ACP correlation, normalized deltas, scalar final parity, continuation, overlap, cancel A, B remains live, and connection join. |
| Pi | `stream` or `streamSimple` deltas, scalar final parity, abort settlement, overlap, cancel A, and B remains live. |
| Eval and test SDK | Retained result-inspection helpers compile and pass; attempt, store, and session harness doubles use the public scope seam. |
| Workspace | Focused tests, typechecks, builds, root verify, root lint, consumer import audit, packed export audit, and baseline comparison. |

These cases cover every current SDK package. None may be deferred to shrink the PR.

## Implementation PKRs after acceptance

| Candidate PKR | Direct contribution |
|---|---|
| `PKR-API-BASE` | Split public entries, add validation/session record types, tags, and port flows. |
| `PKR-SESSION-RUNTIME` | Implement the current-owned runtime, work/control/branch registries, run/wait/join/merge/finish, and lifecycle conformance. |
| `PKR-AGENT` | Implement readiness-only tools, roles, skills, subagents, the one turn loop, and immutable snapshots. |
| `PKR-DATABASE` | Add the database-analysis test and public example with parallel child work, steering, files, memory acceptance, and `applied: false`. |
| `PKR-PROVIDERS` | Move Claude/Codex/Pi to one attempt execution path and prove scalar/stream/cancel parity. |
| `PKR-SANDBOX` | Replace the method bag in sdk-just-bash with explicit port flows and cancellation. |
| `PKR-MIGRATION` | Update adapters, eval/test SDK, docs, package exports, peers, lockfile, and one major changeset; prove removed exports. |

Candidate PKRs remain unpromoted until this checkpoint receives independent review and orchestrator acceptance.

## Replay and source evidence

- `pkg/sdk/core/src/index.ts:953-1039,1089-1289,1376-1497` — current Model seam, Agent facade, thin session, adapters, and event buffer.
- `pkg/core/lite/src/scope.ts:992-995,1107-1134,1564-1605` — context-bound handles and dependency-before-factory ordering.
- `.worktrees/managed-tools/pkg/sdk/core/src/index.ts` at `61f7189` — temporary Standard Schema and current-agent implementation.
- `pkg/sdk/claude/src/index.ts:79-247` and `pkg/sdk/codex/src/index.ts:115-294` — current provider resource and flow boundaries.
- `pkg/sdk/pi/src/index.ts` and `pkg/sdk/bash/src/index.ts` — scalar pi-ai and method-bag sandbox adapters.
- `.okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md` and `dkr-session-checkpoint-accepted.json` — accepted semantic contract and validator/reviewer provenance.

Replay the public DKR shape after the candidate checkpoint is written:

```bash
python3 .agents/skills/reverse-tornado-okr/scripts/okra-verify-artifact.py \
  .okra/runs/session-kernel-20260714/artifacts/dkr-migration-contract.md \
  --contract .agents/skills/reverse-tornado-okr/contracts/executable-dkr-checkpoint.v1.json
```

The checker proves artifact completeness only. Independent review must verify TypeScript coherence, package exports, the no-duplicate-loop decision, and every active wall.

## Migration wall custody

The revision checkpoint carries all 16 active walls: lifecycle use, lifecycle effect, lifecycle join, active turn, tool readiness, tool snapshot, authority, implicit binding, hidden edge, scope seam, MCP, breaking change, regression, independence, level, and storage. Every value remains `null`, every verdict remains `pending`, and downstream advancement remains blocked. Content evidence uses SHA-256 values only; source labels, Git refs, headings, and pending record names are not evidence hashes.

## Executable DKR Checkpoint Contract

Objective: `executable_dkr_checkpoint_contract_acceptance_rate >= 0.90`.

Tripwires: `unsupported_checkpoint_acceptance_count == 0`; `superficial_checkpoint_acceptance_count == 0`; `tautological_checkpoint_acceptance_count == 0`; `false_positive_checkpoint_acceptance_count == 0`; `single_llm_truth_acceptance_count == 0`; `fabricated_conclusion_acceptance_count == 0`.

A checkpoint carries `checkpoint_id`, `conclusion_id`, `decision_target`, `source_of_truth`, `read_method`, `observed_at`, `recorded_at`, `max_age`, `freshness_status`, `confidence`, `evidence_refs_or_hashes`, `replay_command_or_checker`, `questions_answered`, `questions_unanswered`, `decision`, `flag_if_missing_or_stale`, `reviewer_audit_status`, `active_anti_goals`, `active_anti_goal_verification`, and `wall_gate`.

An empty result is a valid non-accepted decision only with a replayable probe trace. Superficial, tautological, false-positive, fabricated, unsupported, and single-LLM-truth checkpoints are rejected. Missing, stale, wrong-source, non-replayable, or contradicted evidence fails closed and opens a blocking flag.

### Worked Executable DKR Checkpoint Trace

The writer's `metric_read` for `unexpected_breaking_change_count` is not accepted. Source `sha256:e96b5a1328a9eb673959dfe80ad23c42e568395cf936b90a6b665c5059d3deb2` proves the current surface, while this contract explicitly proposes a major change. The candidate checkpoint records the migration as intentional, sets the wall value to unknown, and rejects downstream advancement pending independent API and changeset review.

```json
{
  "checkpoint_id": "checkpoint.DKR-MIGRATION-1.round-6",
  "conclusion_id": "revised-major-resource-native-sdk-all-current-packages",
  "metric_read": {
    "metric_id": "unexpected_breaking_change_count",
    "value": null,
    "evidence_ref": "sha256:e96b5a1328a9eb673959dfe80ad23c42e568395cf936b90a6b665c5059d3deb2"
  },
  "decision": "candidate_pending_independent_review",
  "active_anti_goals": ["AG-BREAKING"],
  "active_anti_goal_verification": [{
    "anti_goal_id": "AG-BREAKING",
    "metric_id": "unexpected_breaking_change_count",
    "source_of_truth": "Type contracts, packed exports, changeset, and migration guide",
    "read_method": "Compare public declarations against main and classify every difference",
    "observed_at": "2026-07-14T08:23:33Z",
    "recorded_at": "2026-07-14T08:23:33Z",
    "max_age": "10m",
    "freshness_status": "pending",
    "value": null,
    "threshold": 0,
    "comparator": "==",
    "verdict": "pending",
    "evidence_ref": "sha256:e96b5a1328a9eb673959dfe80ad23c42e568395cf936b90a6b665c5059d3deb2",
    "replay_command_or_checker": "pending packed declaration and migration audit",
    "verification_record_ref": "workers/DKR-MIGRATION-API/progress.jsonl#pending"
  }],
  "wall_gate": {
    "verdict": "blocked",
    "downstream_advance": "blocked"
  }
}
```

CKRs are measurable contribution context, not worker work.

DKRs are discovery-worker scopes; PKRs are progression-worker execution units; there is no CKR worker.

Candidate CKRs and candidate PKRs are not promoted until the orchestrator accepts the supporting DKR learning checkpoint.

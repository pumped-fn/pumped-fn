import { controller, flow, isStreamingExec, resource, tag, tags, typed, type Lite } from "@pumped-fn/lite"
import { sha256 as digestSha256 } from "./internal/digest.js"

export type SessionId = string
export type WorkId = string
export type BranchId = string
export type InvocationId = string

/** Defines the filesystem, command, write, and network authority available inside a sandbox. */
export interface SandboxAuthority {
  readonly roots: readonly string[]
  readonly commands: readonly string[]
  readonly write: boolean
  readonly network: boolean
}

/** Defines the tenant, resources, permissions, tools, and sandbox limits bound to a session. */
export interface AuthorityInput {
  readonly tenant: string
  readonly roots: readonly string[]
  readonly permissions: readonly string[]
  readonly tools: readonly string[]
  readonly sandbox: SandboxAuthority
}

/** Represents normalized session authority with its stable content fingerprint. */
export interface Authority extends AuthorityInput {
  readonly fingerprint: `sha256:${string}`
}

/** Narrows the authority inherited by child work without granting new capabilities. */
export interface AuthorityConstraints {
  readonly roots?: readonly string[]
  readonly permissions?: readonly string[]
  readonly tools?: readonly string[]
  readonly sandbox?: Partial<SandboxAuthority>
}

export class AuthorityEscalationError extends Error {
  readonly field: "roots" | "permissions" | "tools" | "sandbox"

  constructor(field: AuthorityEscalationError["field"]) {
    super(`Authority constraint expands ${field}`)
    this.name = "AuthorityEscalationError"
    this.field = field
  }
}

export class AuthorityBindingError extends Error {
  readonly kind = "authority-binding"
  readonly op = "loadAndBind"

  constructor(
    readonly entity: SessionId,
    readonly reason: "supplied-fingerprint" | "stored-fingerprint" | "stored-constraints",
  ) {
    super(reason === "supplied-fingerprint"
      ? "Supplied authority fingerprint does not match its normalized body"
      : reason === "stored-fingerprint"
        ? "Session authority fingerprint does not match the supplied authority"
        : "Session authority constraints do not match the supplied authority")
    this.name = "AuthorityBindingError"
  }
}

export class BoundaryMismatchError extends Error {
  readonly kind = "boundary-mismatch"

  constructor(
    readonly op: "artifact.publish" | "memory.commit" | "memory.accept" | "memory.recall" | "scheduler.wake",
    readonly entity: string,
  ) {
    super(`${entity} does not match its ${op} boundary`)
    this.name = "BoundaryMismatchError"
  }
}

/** Identifies evidence attached to a branch, memory entry, or decision. */
export interface EvidenceRef {
  readonly id: string
  readonly kind: string
  readonly digest?: string
}

/** Records a versioned session branch and the authority under which it was created. */
export interface BranchRecord {
  readonly id: BranchId
  readonly parentId?: BranchId
  readonly version: number
  readonly createdBy: WorkId
  readonly authorityFingerprint: string
  readonly authority: Authority
  readonly evidence: readonly EvidenceRef[]
}

/** Records the lifecycle, lineage, policy, and authority of one unit of session work. */
export interface WorkRecord {
  readonly id: WorkId
  readonly parentId?: WorkId
  readonly branchId: BranchId
  readonly role: string
  readonly status: "scheduled" | "ready" | "working" | "waiting" | "completed" | "failed" | "cancelled"
  readonly policy: "all" | "fail-fast"
  readonly attempt: number
  readonly continuation?: Lite.JsonValue
  readonly authority: Authority
}

/** Records one execution attempt for a unit of work. */
export interface AttemptRecord {
  readonly workId: WorkId
  readonly attempt: number
  readonly snapshotEpoch: number
  readonly status: "working" | "waiting" | "completed" | "failed" | "cancelled"
  readonly startedAt: string
  readonly settledAt?: string
}

/** Records one external or adapter invocation made by a work attempt. */
export interface InvocationRecord {
  readonly id: InvocationId
  readonly workId: WorkId
  readonly attempt: number
  readonly kind: "model" | "tool" | "skill" | "subagent" | "database" | "sandbox" | "artifact" | "memory" | "adapter"
  readonly status: "working" | "completed" | "failed" | "cancelled" | "quarantined"
  readonly idempotencyKey: string
}

/** Identifies a versioned artifact published by session work. */
export interface ArtifactRef {
  readonly id: string
  readonly version: number
  readonly digest: string
  readonly mediaType: string
  readonly authorityFingerprint: string
  readonly workId: WorkId
  readonly branchId: BranchId
}

/** Identifies a versioned memory entry and its acceptance state. */
export interface MemoryRef {
  readonly id: string
  readonly version: number
  readonly status: "candidate" | "accepted" | "rejected"
  readonly source: "session" | "human" | "policy" | "import"
  readonly evidence: readonly EvidenceRef[]
  readonly authorityFingerprint: string
}

/** Describes when and with what priority scheduled work should resume. */
export interface ScheduleIntent {
  readonly id: string
  readonly workId: WorkId
  readonly dueAt: string
  readonly priority: number
  readonly expectedSessionVersion: number
}

/** Captures the durable, versioned state of a session. */
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

/** Exposes a running attempt, its cancellation signal, and eventual settlement. */
export interface ActiveAttempt {
  readonly record: AttemptRecord
  readonly signal: AbortSignal
  readonly settled: Promise<AttemptSettlement>
}

/** Describes the terminal outcome of a work attempt. */
export interface AttemptSettlement {
  readonly status: "completed" | "failed" | "cancelled"
  readonly result?: Lite.JsonValue
  readonly error?: Lite.JsonValue
}

/** Supplies the identity, lineage, policy, and authority constraints for admitted work. */
export interface AdmitWorkInput {
  readonly id: WorkId
  readonly parentId?: WorkId
  readonly branchId: BranchId
  readonly role: string
  readonly policy: "all" | "fail-fast"
  readonly authority?: AuthorityConstraints
}

/** Identifies the exact tool contract, validation engine, readiness edge, and flow. */
export interface ToolIdentity {
  readonly id: string
  readonly version: string
  readonly schemaDigest: string
  readonly validationEngine: string
  readonly readiness: string
  readonly flow: string
}

/** Proves that a tool identity is authorized for a session epoch. */
export interface ToolPermit {
  readonly identity: ToolIdentity
  readonly authorityFingerprint: string
  readonly epoch: number
}

/** Carries an ordered steering action addressed to a work attempt. */
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

/** Represents an ordered observation emitted by session work. */
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

/** Projects session activation data for observation extensions. */
export interface ObservationProjection {
  readonly sessionId: SessionId
  readonly activationId: string
  readonly workId: WorkId
  readonly parentWorkId?: WorkId
  readonly channel?: string
  readonly role: string
  readonly tool?: string
}

export type SessionEventInput = Omit<SessionEvent, "sessionId" | "sequence" | "observedAt">

/** Manages admission, settlement, cancellation, and lookup of session work. */
export interface WorkRegistry {
  admit(input: AdmitWorkInput): ActiveAttempt
  settle(workId: WorkId, attempt: number, settlement: AttemptSettlement): void
  children(workId: WorkId): readonly WorkRecord[]
  active(): readonly ActiveAttempt[]
  cancel(workId: WorkId, reason: unknown): void
}

/** Issues, verifies, and revokes tool permits for session epochs. */
export interface ToolRegistry {
  permit(identity: ToolIdentity, authority?: Authority, epoch?: number): ToolPermit
  authorize(identity: ToolIdentity, epoch: number, authorityFingerprint: string): ToolPermit
  revoke(epoch: number): void
}

/** Manages the current branch and records authority-constrained forks. */
export interface BranchRegistry {
  current(): BranchRecord
  fork(input: { id: BranchId; parentId: BranchId; workId: WorkId; authority: AuthorityConstraints }): BranchRecord
}

/** Tracks invocation start and terminal settlement by invocation identity. */
export interface InvocationRegistry {
  start(record: Omit<InvocationRecord, "status">): InvocationRecord
  settle(id: InvocationId, status: Extract<InvocationRecord["status"], "completed" | "failed" | "cancelled" | "quarantined">): InvocationRecord
}

/** Records artifacts published within the session boundary. */
export interface ArtifactRegistry {
  record(value: ArtifactRef): ArtifactRef
}

/** Stores opaque provider continuation tokens by provider key. */
export interface ProviderContinuationRegistry {
  get(key: string): string | undefined
  set(key: string, value: string): void
  delete(key: string): void
}

/** Queues, drains, and fences ordered steering events for active work. */
export interface ControlRegistry {
  enqueue(event: ControlEvent): void
  drain(workId: WorkId, afterSequence: number): readonly ControlEvent[]
  fence(workId: WorkId, attempt: number, epoch: number): void
  accepts(workId: WorkId, attempt: number, epoch: number): boolean
}

/** Provides the live authority, registries, events, and lifecycle of a session. */
export interface SessionRuntime {
  readonly record: SessionRecord
  readonly authority: Authority
  readonly status: "open" | "finishing" | "finished" | "abandoned"
  readonly work: WorkRegistry
  readonly tools: ToolRegistry
  readonly branches: BranchRegistry
  readonly controls: ControlRegistry
  readonly invocations: InvocationRegistry
  readonly artifacts: ArtifactRegistry
  readonly continuations: ProviderContinuationRegistry
  snapshot(status: SessionRecord["status"]): SessionRecord
  deactivate(): Promise<void>
  beginFinish(): Promise<void>
  completeFinish(version: number): void
  finishWith(commit: (record: SessionRecord, expectedVersion: number) => Promise<number>): Promise<SessionRecord>
  eventsFor(workId: WorkId): readonly SessionEvent[]
  emit(input: SessionEventInput): SessionEvent
  park(input: WaitWorkInput): WorkRecord
  previewWake(id: string): WorkRecord
  wake(id: string, authoritative: WorkRecord): WorkRecord
  merge(input: MergeBranchesInput): BranchRecord
  settlement(workId: WorkId): AttemptSettlement
}

/** Supplies timestamps for deterministic session operations. */
export interface Clock {
  now(): string
}

/** Supplies artifact content and ownership for publication. */
export interface PublishArtifactInput {
  readonly workId: WorkId
  readonly branchId: BranchId
  readonly mediaType: string
  readonly content: Uint8Array
}

/** Defines a bounded memory query on behalf of session work. */
export interface RecallMemoryInput {
  readonly workId: WorkId
  readonly query: string
  readonly limit: number
}

/** Supplies an evidence-backed memory value for a session branch. */
export interface CommitMemoryInput {
  readonly workId: WorkId
  readonly branchId: BranchId
  readonly value: Lite.JsonValue
  readonly evidence: readonly EvidenceRef[]
}

/** Identifies the evidence used to accept a candidate memory entry. */
export interface AcceptMemoryInput {
  readonly id: string
  readonly workId: WorkId
  readonly evidence: readonly EvidenceRef[]
}

/** Couples newly admitted work with the schedule intent that delays it. */
export interface WaitWorkInput {
  readonly work: AdmitWorkInput
  readonly intent: Omit<ScheduleIntent, "workId">
}

/** Identifies scheduled work to wake. */
export interface WakeInput {
  readonly id: string
}

/** Defines an authority-constrained fork from an existing session branch. */
export interface ForkBranchInput {
  readonly id: BranchId
  readonly parentId: BranchId
  readonly workId: WorkId
  readonly authority: AuthorityConstraints
}

/** Selects work units and the failure policy used when joining them. */
export interface JoinWorkInput {
  readonly workIds: readonly WorkId[]
  readonly policy: "all" | "fail-fast"
}

/** Defines a version-checked merge of source branches into a target branch. */
export interface MergeBranchesInput {
  readonly targetId: BranchId
  readonly sourceIds: readonly BranchId[]
  readonly workId: WorkId
  readonly expectedTargetVersion: number
}

/** Supplies the session identity and authority required to resume it. */
export interface ResumeInput {
  readonly id: SessionId
  readonly authority: Authority
}

/** Bundles a session record, its verified authority, and execution tags. */
export interface SessionBindings {
  readonly record: SessionRecord
  readonly authority: Authority
  readonly tags: readonly Lite.Tagged<any>[]
}

/** Couples admitted work metadata with the input for a session turn. */
export interface RunInput<Input> {
  readonly work: AdmitWorkInput
  readonly input: Input
}

/** Selects the flow that executes a session turn. */
export interface TurnSelection {
  readonly flow: Lite.AnyFlow
}

export type Load = Lite.Flow<SessionRecord, { id: SessionId }>
export type Commit = Lite.Flow<{ version: number }, { record: SessionRecord; expectedVersion: number }>
export type PublishArtifact = Lite.Flow<ArtifactRef, PublishArtifactInput>
export type RecallMemory = Lite.Flow<readonly MemoryRef[], RecallMemoryInput>
export type CommitMemory = Lite.Flow<MemoryRef, CommitMemoryInput>
export type AcceptMemory = Lite.Flow<MemoryRef, AcceptMemoryInput>
export type Wake = Lite.Flow<WorkRecord, WakeInput>

function normalized(value: string): string {
  if (value.length === 0) throw new TypeError("Authority strings must not be empty")
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++index)
      if (!Number.isFinite(next) || next < 0xdc00 || next > 0xdfff) {
        throw new TypeError("Authority strings must contain Unicode scalar values")
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError("Authority strings must contain Unicode scalar values")
    }
  }
  return value.normalize("NFC")
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${label} must be an object`)
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const allowed = new Set(keys)
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${label} contains unknown key ${key}`)
  }
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`)
  return value
}

function stringValues(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new TypeError(`${label} must be an array of strings`)
  }
  return value
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean`)
  return value
}

function checkedAuthority(input: unknown): AuthorityInput {
  const value = objectValue(input, "Authority")
  exactKeys(value, ["tenant", "roots", "permissions", "tools", "sandbox", "fingerprint"], "Authority")
  const sandbox = objectValue(value["sandbox"], "Authority sandbox")
  exactKeys(sandbox, ["roots", "commands", "write", "network"], "Authority sandbox")
  if ("fingerprint" in value) stringValue(value["fingerprint"], "Authority fingerprint")
  return {
    tenant: stringValue(value["tenant"], "Authority tenant"),
    roots: stringValues(value["roots"], "Authority roots"),
    permissions: stringValues(value["permissions"], "Authority permissions"),
    tools: stringValues(value["tools"], "Authority tools"),
    sandbox: {
      roots: stringValues(sandbox["roots"], "Authority sandbox roots"),
      commands: stringValues(sandbox["commands"], "Authority sandbox commands"),
      write: booleanValue(sandbox["write"], "Authority sandbox write"),
      network: booleanValue(sandbox["network"], "Authority sandbox network"),
    },
  }
}

function optionalStringValues(value: unknown, label: string): readonly string[] | undefined {
  return value === undefined ? undefined : stringValues(value, label)
}

function checkedConstraints(input: unknown): AuthorityConstraints {
  const value = objectValue(input, "Authority constraints")
  exactKeys(value, ["roots", "permissions", "tools", "sandbox"], "Authority constraints")
  const sandboxValue = value["sandbox"]
  const sandbox = sandboxValue === undefined ? undefined : objectValue(sandboxValue, "Authority constraints sandbox")
  if (sandbox) exactKeys(sandbox, ["roots", "commands", "write", "network"], "Authority constraints sandbox")
  const write = sandbox?.["write"]
  const network = sandbox?.["network"]
  if (write !== undefined) booleanValue(write, "Authority constraints sandbox write")
  if (network !== undefined) booleanValue(network, "Authority constraints sandbox network")
  const roots = optionalStringValues(value["roots"], "Authority constraints roots")
  const permissions = optionalStringValues(value["permissions"], "Authority constraints permissions")
  const tools = optionalStringValues(value["tools"], "Authority constraints tools")
  const sandboxRoots = optionalStringValues(sandbox?.["roots"], "Authority constraints sandbox roots")
  const commands = optionalStringValues(sandbox?.["commands"], "Authority constraints sandbox commands")
  return {
    ...(roots === undefined ? {} : { roots }),
    ...(permissions === undefined ? {} : { permissions }),
    ...(tools === undefined ? {} : { tools }),
    ...(sandbox === undefined ? {} : { sandbox: {
      ...(sandboxRoots === undefined ? {} : { roots: sandboxRoots }),
      ...(commands === undefined ? {} : { commands }),
      ...(write === undefined ? {} : { write: booleanValue(write, "Authority constraints sandbox write") }),
      ...(network === undefined ? {} : { network: booleanValue(network, "Authority constraints sandbox network") }),
    } }),
  }
}

function compareUtf8(left: string, right: string): number {
  const leftBytes = new TextEncoder().encode(left)
  const rightBytes = new TextEncoder().encode(right)
  const length = Math.min(leftBytes.length, rightBytes.length)
  for (let index = 0; index < length; index++) {
    const difference = leftBytes[index]! - rightBytes[index]!
    if (difference !== 0) return difference
  }
  return leftBytes.length - rightBytes.length
}

function normalizedSet(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map(normalized))].sort(compareUtf8))
}

function normalizeAuthority(input: AuthorityInput): AuthorityInput {
  const checked = checkedAuthority(input)
  const roots = normalizedSet(checked.roots)
  const sandboxRoots = normalizedSet(checked.sandbox.roots)
  if (sandboxRoots.some((root) => !roots.includes(root))) {
    throw new AuthorityEscalationError("sandbox")
  }
  return Object.freeze({
    tenant: normalized(checked.tenant),
    roots,
    permissions: normalizedSet(checked.permissions),
    tools: normalizedSet(checked.tools),
    sandbox: Object.freeze({
      roots: sandboxRoots,
      commands: normalizedSet(checked.sandbox.commands),
      write: checked.sandbox.write,
      network: checked.sandbox.network,
    }),
  })
}

function canonicalAuthority(input: AuthorityInput): string {
  return JSON.stringify([
    "pumped-fn.authority.v1",
    input.tenant,
    input.roots,
    input.permissions,
    input.tools,
    input.sandbox.roots,
    input.sandbox.commands,
    input.sandbox.write,
    input.sandbox.network,
  ])
}

function constantEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return difference === 0
}

function sameAuthority(left: AuthorityInput, right: AuthorityInput): boolean {
  return constantEqual(canonicalAuthority(normalizeAuthority(left)), canonicalAuthority(normalizeAuthority(right)))
}

export function authorityFingerprint(input: AuthorityInput): `sha256:${string}` {
  const value = normalizeAuthority(input)
  return `sha256:${digestSha256(new TextEncoder().encode(canonicalAuthority(value)))}`
}

export function createAuthority(input: AuthorityInput): Authority {
  const value = normalizeAuthority(input)
  return Object.freeze({ ...value, fingerprint: authorityFingerprint(value) })
}

function subset(candidate: readonly string[], parent: readonly string[]): boolean {
  return candidate.every((value) => parent.includes(value))
}

export function narrowAuthority(parent: Authority, constraints: AuthorityConstraints): Authority {
  const narrowed = checkedConstraints(constraints)
  const normalizedParent = createAuthority(parent)
  if (!constantEqual(normalizedParent.fingerprint, parent.fingerprint)) throw new TypeError("Authority fingerprint is invalid")
  const roots = narrowed.roots ? normalizedSet(narrowed.roots) : normalizedParent.roots
  const permissions = narrowed.permissions ? normalizedSet(narrowed.permissions) : normalizedParent.permissions
  const tools = narrowed.tools ? normalizedSet(narrowed.tools) : normalizedParent.tools
  const sandboxRoots = narrowed.sandbox?.roots ? normalizedSet(narrowed.sandbox.roots) : normalizedParent.sandbox.roots
  const commands = narrowed.sandbox?.commands ? normalizedSet(narrowed.sandbox.commands) : normalizedParent.sandbox.commands
  const write = narrowed.sandbox?.write ?? normalizedParent.sandbox.write
  const network = narrowed.sandbox?.network ?? normalizedParent.sandbox.network

  if (!subset(roots, normalizedParent.roots)) throw new AuthorityEscalationError("roots")
  if (!subset(permissions, normalizedParent.permissions)) throw new AuthorityEscalationError("permissions")
  if (!subset(tools, normalizedParent.tools)) throw new AuthorityEscalationError("tools")
  if (!subset(sandboxRoots, normalizedParent.sandbox.roots) || !subset(commands, normalizedParent.sandbox.commands)) {
    throw new AuthorityEscalationError("sandbox")
  }
  if (write && !normalizedParent.sandbox.write) throw new AuthorityEscalationError("sandbox")
  if (network && !normalizedParent.sandbox.network) throw new AuthorityEscalationError("sandbox")

  return createAuthority({
    tenant: normalizedParent.tenant,
    roots,
    permissions,
    tools,
    sandbox: { roots: sandboxRoots, commands, write, network },
  })
}

function deferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
  readonly reject: (reason: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  return {
    promise: new Promise<T>((done, fail) => {
      resolve = done
      reject = fail
    }),
    resolve,
    reject,
  }
}

function jsonError(error: unknown): Lite.JsonValue {
  if (error instanceof Error) return { name: error.name, message: error.message }
  if (error === undefined) return null
  return error as Lite.JsonValue
}

function sameToolIdentity(left: ToolIdentity, right: ToolIdentity): boolean {
  return left.id === right.id
    && left.version === right.version
    && left.schemaDigest === right.schemaDigest
    && left.validationEngine === right.validationEngine
    && left.readiness === right.readiness
    && left.flow === right.flow
}

function toolPermitKey(identity: ToolIdentity, authorityFingerprint: string, epoch: number): string {
  return JSON.stringify([
    identity.id,
    identity.version,
    identity.schemaDigest,
    identity.validationEngine,
    identity.readiness,
    identity.flow,
    authorityFingerprint,
    epoch,
  ])
}

function upsertVersioned<T extends { readonly id: string; readonly version: number }>(
  values: readonly T[],
  value: T,
): readonly T[] {
  const existing = values.find((item) => item.id === value.id)
  if (existing && value.version <= existing.version) throw new Error(`${value.id} version must increase`)
  return Object.freeze([...values.filter((item) => item.id !== value.id), Object.freeze(value)])
}

function normalizeEvidence(values: readonly EvidenceRef[]): readonly EvidenceRef[] {
  return Object.freeze(values.map((value) => Object.freeze({
    id: normalized(value.id),
    kind: normalized(value.kind),
    ...(value.digest === undefined ? {} : { digest: normalized(value.digest) }),
  })))
}

function sameEvidence(left: readonly EvidenceRef[], right: readonly EvidenceRef[]): boolean {
  return left.length === right.length && left.every((value, index) => {
    const expected = right[index]!
    return value.id === expected.id && value.kind === expected.kind && value.digest === expected.digest
  })
}

function validatedAuthority(value: Authority, label: string): Authority {
  const canonical = createAuthority(value)
  if (!constantEqual(canonical.fingerprint, value.fingerprint)) throw new TypeError(`${label} fingerprint is invalid`)
  return canonical
}

function assertAuthorityWithin(value: Authority, parent: Authority, label: string): void {
  if (value.tenant !== parent.tenant) throw new TypeError(`${label} tenant exceeds its parent`)
  let narrowed: Authority
  try {
    narrowed = narrowAuthority(parent, {
      roots: value.roots,
      permissions: value.permissions,
      tools: value.tools,
      sandbox: value.sandbox,
    })
  } catch {
    throw new TypeError(`${label} exceeds its parent`)
  }
  if (!sameAuthority(narrowed, value)) throw new TypeError(`${label} exceeds its parent`)
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string, label: string): Map<string, T> {
  const result = new Map<string, T>()
  for (const value of values) {
    const id = key(value)
    if (result.has(id)) throw new TypeError(`Session record has duplicate ${label} ${id}`)
    result.set(id, value)
  }
  return result
}

function assertAcyclic<T>(values: ReadonlyMap<string, T>, parent: (value: T) => string | undefined, label: string): void {
  for (const [id, value] of values) {
    const seen = new Set([id])
    let parentId = parent(value)
    while (parentId !== undefined) {
      if (seen.has(parentId)) throw new TypeError(`Session record has cyclic ${label} lineage at ${id}`)
      seen.add(parentId)
      const parentValue = values.get(parentId)
      if (!parentValue) throw new TypeError(`Session record ${label} ${id} has missing parent ${parentId}`)
      parentId = parent(parentValue)
    }
  }
}

function validateSessionRecord(input: SessionRecord, supplied: Authority): SessionRecord {
  const authority = validatedAuthority(supplied, "Session authority")
  const stored = createAuthority(input.authorityConstraints)
  if (
    !constantEqual(authority.fingerprint, input.authorityFingerprint)
    || !constantEqual(stored.fingerprint, input.authorityFingerprint)
    || !sameAuthority(authority, stored)
  ) throw new TypeError("Session record authority does not match its bound authority")

  const branches = Object.freeze(input.branches.map((branch) => {
    const branchAuthority = validatedAuthority(branch.authority, `Branch ${branch.id} authority`)
    if (!constantEqual(branchAuthority.fingerprint, branch.authorityFingerprint)) {
      throw new TypeError(`Branch ${branch.id} authority fingerprint is invalid`)
    }
    return Object.freeze({ ...branch, authority: branchAuthority, evidence: normalizeEvidence(branch.evidence) })
  }))
  const work = Object.freeze(input.work.map((value) => Object.freeze({
    ...value,
    authority: validatedAuthority(value.authority, `Work ${value.id} authority`),
  })))
  const branchById = uniqueBy(branches, (value) => value.id, "branch")
  const workById = uniqueBy(work, (value) => value.id, "work")
  if (!branchById.has(input.currentBranchId)) throw new TypeError(`Current branch ${input.currentBranchId} does not exist`)
  assertAcyclic(branchById, (value) => value.parentId, "branch")
  assertAcyclic(workById, (value) => value.parentId, "work")
  const roots = branches.filter((value) => value.parentId === undefined)
  if (roots.length !== 1) throw new TypeError("Session record must have exactly one root branch")

  for (const branch of branches) {
    if (branch.parentId === undefined) {
      if (!sameAuthority(branch.authority, authority)) throw new TypeError(`Root branch ${branch.id} authority does not match the session`)
      continue
    }
    const parent = branchById.get(branch.parentId)!
    const creator = workById.get(branch.createdBy)
    if (!creator || creator.branchId !== parent.id) throw new TypeError(`Branch ${branch.id} creator is not on parent branch ${parent.id}`)
    assertAuthorityWithin(branch.authority, creator.authority, `Branch ${branch.id} authority`)
  }

  for (const value of work) {
    const branch = branchById.get(value.branchId)
    if (!branch) throw new TypeError(`Work ${value.id} branch ${value.branchId} does not exist`)
    const parent = value.parentId === undefined ? undefined : workById.get(value.parentId)
    if (value.parentId !== undefined && (!parent || parent.branchId !== value.branchId)) {
      throw new TypeError(`Work ${value.id} parent is not on branch ${value.branchId}`)
    }
    assertAuthorityWithin(value.authority, parent?.authority ?? branch.authority, `Work ${value.id} authority`)
  }

  const attempts = Object.freeze(input.attempts.map((value) => Object.freeze({ ...value })))
  uniqueBy(attempts, (value) => `${value.workId}:${value.attempt}`, "attempt")
  for (const value of attempts) {
    if (!workById.has(value.workId)) throw new TypeError(`Attempt ${value.workId}:${value.attempt} has missing work`)
  }
  const invocations = Object.freeze(input.invocations.map((value) => Object.freeze({ ...value })))
  uniqueBy(invocations, (value) => value.id, "invocation")
  uniqueBy(invocations, (value) => value.idempotencyKey, "invocation idempotency key")
  for (const value of invocations) {
    if (!attempts.some((attempt) => attempt.workId === value.workId && attempt.attempt === value.attempt)) {
      throw new TypeError(`Invocation ${value.id} has missing attempt`)
    }
  }

  const artifacts = Object.freeze(input.artifacts.map((value) => Object.freeze({ ...value })))
  uniqueBy(artifacts, (value) => value.id, "artifact")
  for (const value of artifacts) {
    const owner = workById.get(value.workId)
    if (!owner || owner.branchId !== value.branchId || owner.authority.fingerprint !== value.authorityFingerprint) {
      throw new TypeError(`Artifact ${value.id} has invalid ownership`)
    }
  }
  const validMemoryAuthorities = new Set<string>([
    authority.fingerprint,
    ...branches.map((value) => value.authority.fingerprint),
    ...work.map((value) => value.authority.fingerprint),
  ])
  const memory = Object.freeze(input.memory.map((value) => Object.freeze({
    ...value,
    evidence: normalizeEvidence(value.evidence),
  })))
  uniqueBy(memory, (value) => value.id, "memory")
  for (const value of memory) {
    if (!validMemoryAuthorities.has(value.authorityFingerprint)) throw new TypeError(`Memory ${value.id} has invalid authority`)
  }
  const schedules = Object.freeze(input.schedules.map((value) => Object.freeze({ ...value })))
  uniqueBy(schedules, (value) => value.id, "schedule")
  for (const value of schedules) {
    if (!workById.has(value.workId)) throw new TypeError(`Schedule ${value.id} has missing work`)
  }

  return Object.freeze({
    ...input,
    authorityFingerprint: authority.fingerprint,
    authorityConstraints: authority,
    branches,
    work,
    attempts,
    invocations,
    artifacts,
    memory,
    schedules,
    providerContinuations: Object.freeze({ ...input.providerContinuations }),
  })
}

const memoryWriters = new WeakMap<SessionRuntime, (value: MemoryRef) => MemoryRef>()

function recordMemory(runtime: SessionRuntime, value: MemoryRef): MemoryRef {
  const write = memoryWriters.get(runtime)
  if (!write) throw new TypeError("Session memory writer is unavailable")
  return write(value)
}

function isSettled(status: WorkRecord["status"]): boolean {
  return status === "completed" || status === "failed" || status === "cancelled"
}

class Runtime implements SessionRuntime {
  #record: SessionRecord
  #status: SessionRuntime["status"]
  #activation: "active" | "deactivating" | "deactivated" = "active"
  #deactivation: Promise<void> | undefined
  #finish: Promise<void> | undefined
  #completion: Promise<SessionRecord> | undefined
  #completionReady = false
  #active = new Map<string, {
    readonly value: ActiveAttempt
    readonly controller: AbortController
    readonly resolve: (value: AttemptSettlement) => void
    readonly reject: (reason: unknown) => void
  }>()
  #permits = new Map<string, ToolPermit>()
  #controls: ControlEvent[] = []
  #fences = new Map<string, { attempt: number; epoch: number }>()
  #events: SessionEvent[] = []

  readonly work: WorkRegistry
  readonly tools: ToolRegistry
  readonly branches: BranchRegistry
  readonly controls: ControlRegistry
  readonly invocations: InvocationRegistry
  readonly artifacts: ArtifactRegistry
  readonly continuations: ProviderContinuationRegistry

  constructor(record: SessionRecord, readonly authority: Authority, private readonly clock: Clock) {
    this.#record = validateSessionRecord(record, authority)
    this.#status = record.status

    this.work = Object.freeze({
      admit: (input: AdmitWorkInput) => this.admit(input),
      settle: (workId: WorkId, attempt: number, settlement: AttemptSettlement) => this.settle(workId, attempt, settlement),
      children: (workId: WorkId) => this.#record.work.filter((item) => item.parentId === workId),
      active: () => [...this.#active.values()].map((entry) => entry.value),
      cancel: (workId: WorkId, reason: unknown) => {
        for (const entry of this.#active.values()) {
          if (entry.value.record.workId === workId) entry.controller.abort(reason)
        }
      },
    })

    this.tools = Object.freeze({
      permit: (identity: ToolIdentity, authority: Authority = this.authority, epoch = this.#record.nextEventSequence) => {
        this.assertOpenMutation()
        const permitted = validatedAuthority(authority, "Tool permit authority")
        assertAuthorityWithin(permitted, this.authority, "Tool permit authority")
        const permit = Object.freeze({
          identity,
          authorityFingerprint: permitted.fingerprint,
          epoch,
        })
        this.#permits.set(toolPermitKey(identity, permit.authorityFingerprint, permit.epoch), permit)
        return permit
      },
      authorize: (identity: ToolIdentity, epoch: number, authorityFingerprint: string) => {
        const permit = this.#permits.get(toolPermitKey(identity, authorityFingerprint, epoch))
        if (!permit || !sameToolIdentity(permit.identity, identity)) {
          throw new Error(`Tool ${identity.id} is not authorized for epoch ${epoch}`)
        }
        return permit
      },
      revoke: (epoch: number) => {
        this.assertOpenMutation()
        for (const [key, permit] of this.#permits) {
          if (permit.epoch === epoch) this.#permits.delete(key)
        }
      },
    })

    this.branches = Object.freeze({
      current: () => this.branch(this.#record.currentBranchId),
      fork: (input: { id: BranchId; parentId: BranchId; workId: WorkId; authority: AuthorityConstraints }) => {
        this.assertOpenMutation()
        const parent = this.branch(input.parentId)
        const creator = this.workRecord(input.workId)
        if (creator.branchId !== parent.id) throw new Error(`Work ${creator.id} is not on branch ${parent.id}`)
        if (this.#record.branches.some((item) => item.id === input.id)) throw new Error(`Branch ${input.id} already exists`)
        const child = narrowAuthority(creator.authority, input.authority)
        const branch = Object.freeze({
          id: input.id,
          parentId: input.parentId,
          version: 0,
          createdBy: input.workId,
          authorityFingerprint: child.fingerprint,
          authority: child,
          evidence: Object.freeze([]),
        })
        this.#record = Object.freeze({ ...this.#record, branches: Object.freeze([...this.#record.branches, branch]) })
        return branch
      },
    })

    this.controls = Object.freeze({
      enqueue: (event: ControlEvent) => {
        this.assertOpenMutation()
        const work = this.workRecord(event.workId)
        const attempt = event.attempt ?? work.attempt
        if (!this.controls.accepts(work.id, attempt, event.expectedEpoch)) return
        if (this.#controls.some((value) => value.workId === event.workId && value.sequence === event.sequence)) return
        this.#controls.push(Object.freeze({ ...event, attempt }))
        this.#controls.sort((left, right) => left.sequence - right.sequence)
        if (event.mode === "cancel" || event.mode === "interrupt") this.work.cancel(event.workId, event.payload)
      },
      drain: (workId: WorkId, afterSequence: number) => {
        const fence = this.#fences.get(workId)
        return this.#controls.filter((event) => event.workId === workId
          && event.sequence > afterSequence
          && (!fence || (event.attempt === fence.attempt && event.expectedEpoch === fence.epoch)))
      },
      fence: (workId: WorkId, attempt: number, epoch: number) => {
        this.assertOpenMutation()
        this.#fences.set(workId, { attempt, epoch })
        this.#controls = this.#controls.filter((event) => event.workId !== workId
          || (event.attempt === attempt && event.expectedEpoch === epoch))
      },
      accepts: (workId: WorkId, attempt: number, epoch: number) => {
        const fence = this.#fences.get(workId)
        return !fence || (fence.attempt === attempt && fence.epoch === epoch)
      },
    })

    this.invocations = Object.freeze({
      start: (record: Omit<InvocationRecord, "status">) => {
        this.assertOpenMutation()
        if (this.#record.invocations.some((item) => item.id === record.id)) {
          throw new Error(`Invocation ${record.id} already exists`)
        }
        const work = this.workRecord(record.workId)
        const key = this.attemptKey(record.workId, record.attempt)
        if (work.attempt !== record.attempt || work.status !== "working" || !this.#active.has(key)) {
          throw new Error(`Attempt ${key} is not active`)
        }
        if (this.#record.invocations.some((item) => item.idempotencyKey === record.idempotencyKey)) {
          throw new Error(`Invocation idempotency key ${record.idempotencyKey} already exists`)
        }
        const started = Object.freeze({
          id: record.id,
          workId: record.workId,
          attempt: record.attempt,
          kind: record.kind,
          status: "working" as const,
          idempotencyKey: record.idempotencyKey,
        })
        this.#record = Object.freeze({
          ...this.#record,
          invocations: Object.freeze([...this.#record.invocations, started]),
        })
        return started
      },
      settle: (
        id: InvocationId,
        status: Extract<InvocationRecord["status"], "completed" | "failed" | "cancelled" | "quarantined">,
      ) => {
        const existing = this.#record.invocations.find((item) => item.id === id)
        if (!existing) throw new Error(`Invocation ${id} does not exist`)
        if (existing.status !== "working") throw new Error(`Invocation ${id} is already ${existing.status}`)
        const settled = Object.freeze({ ...existing, status })
        this.#record = Object.freeze({
          ...this.#record,
          invocations: Object.freeze(this.#record.invocations.map((item) => item.id === id ? settled : item)),
        })
        return settled
      },
    })

    this.artifacts = Object.freeze({ record: (value: ArtifactRef) => {
      this.assertOpenMutation()
      this.#record = Object.freeze({
        ...this.#record,
        artifacts: upsertVersioned(this.#record.artifacts, value),
      })
      return value
    } })

    memoryWriters.set(this, (value: MemoryRef) => {
      this.assertOpenMutation()
      this.#record = Object.freeze({
        ...this.#record,
        memory: upsertVersioned(this.#record.memory, value),
      })
      return value
    })

    this.continuations = Object.freeze({
      get: (key: string) => this.#record.providerContinuations[key],
      set: (key: string, value: string) => {
        this.assertOpenMutation()
        this.#record = Object.freeze({
          ...this.#record,
          providerContinuations: Object.freeze({ ...this.#record.providerContinuations, [key]: value }),
        })
      },
      delete: (key: string) => {
        this.assertOpenMutation()
        const next = { ...this.#record.providerContinuations }
        delete next[key]
        this.#record = Object.freeze({ ...this.#record, providerContinuations: Object.freeze(next) })
      },
    })
  }

  get record(): SessionRecord {
    return this.#record
  }

  get status(): SessionRuntime["status"] {
    return this.#status
  }

  snapshot(status: SessionRecord["status"]): SessionRecord {
    return Object.freeze({ ...this.#record, status })
  }

  deactivate(): Promise<void> {
    if (this.#deactivation) return this.#deactivation
    this.#activation = "deactivating"
    const active = [...this.#active.values()]
    const result = deferred<void>()
    this.#deactivation = result.promise
    const settlement = this.#completion?.then(() => undefined) ?? (() => {
      const reason = new DOMException("Session deactivated", "AbortError")
      for (const entry of active) entry.controller.abort(reason)
      return this.joinAttempts(active)
    })()
    settlement.then(
      () => {
        this.#activation = "deactivated"
        result.resolve(undefined)
      },
      (error) => {
        this.#activation = "deactivated"
        result.reject(error)
      },
    )
    return this.#deactivation
  }

  beginFinish(): Promise<void> {
    if (this.#finish) return this.#finish
    this.assertActive()
    this.assertOpenMutation()
    this.#status = "finishing"
    this.#record = this.snapshot("finishing")
    const active = [...this.#active.values()]
    for (const entry of active) entry.controller.abort()
    this.#finish = this.joinAttempts(active)
    return this.#finish
  }

  completeFinish(version: number): void {
    if (!this.#completionReady) throw new Error("Session completion is not authorized")
    if (version !== this.#record.version + 1) throw new Error("Session completion version must increase by one")
    this.#completionReady = false
    this.#status = "finished"
    this.#record = Object.freeze({ ...this.#record, status: "finished", version })
  }

  finishWith(commit: (record: SessionRecord, expectedVersion: number) => Promise<number>): Promise<SessionRecord> {
    if (this.#completion) return this.#completion
    if (this.#activation !== "active") {
      return Promise.reject(new Error(`Session activation is ${this.#activation}`))
    }
    const live = this.#record.invocations.find(
      (invocation) => invocation.status === "working" || invocation.status === "quarantined",
    )
    if (live) return Promise.reject(new Error(`Invocation ${live.id} is still ${live.status}`))
    const completion = this.finishNow(commit)
    this.#completion = completion
    void completion.catch(() => {
      if (this.#completion === completion) this.#completion = undefined
    })
    return completion
  }

  eventsFor(workId: WorkId): readonly SessionEvent[] {
    return this.#events.filter((event) => event.workId === workId)
  }

  emit(input: SessionEventInput): SessionEvent {
    this.assertOpenMutation()
    this.assertEventLineage(input)
    return this.#emit(input)
  }

  #emit(input: SessionEventInput): SessionEvent {
    const event = Object.freeze({
      sessionId: this.#record.id,
      sequence: this.#record.nextEventSequence,
      ...input,
      observedAt: this.clock.now(),
    })
    this.#events.push(event)
    this.#record = Object.freeze({ ...this.#record, nextEventSequence: this.#record.nextEventSequence + 1 })
    return event
  }

  park(input: WaitWorkInput): WorkRecord {
    this.assertOpenMutation()
    if (this.#record.schedules.some((item) => item.id === input.intent.id)) {
      throw new Error(`Schedule ${input.intent.id} already exists`)
    }
    const active = this.admit(input.work)
    const work = this.workRecord(input.work.id)
    const waiting = Object.freeze({ ...work, status: "waiting" as const })
    const attempt = Object.freeze({ ...active.record, status: "waiting" as const, settledAt: this.clock.now() })
    this.#record = Object.freeze({
      ...this.#record,
      work: Object.freeze(this.#record.work.map((item) => item.id === waiting.id ? waiting : item)),
      attempts: Object.freeze(this.#record.attempts.map(
        (item) => item.workId === attempt.workId && item.attempt === attempt.attempt ? attempt : item,
      )),
      schedules: Object.freeze([...this.#record.schedules, Object.freeze({ ...input.intent, workId: waiting.id })]),
    })
    const key = this.attemptKey(waiting.id, waiting.attempt)
    this.#active.get(key)!.resolve({ status: "completed" })
    this.#active.delete(key)
    this.emit({
      workId: waiting.id,
      attempt: waiting.attempt,
      branchId: waiting.branchId,
      snapshotEpoch: attempt.snapshotEpoch,
      type: "work.waiting",
    })
    return waiting
  }

  previewWake(id: string): WorkRecord {
    this.assertOpenMutation()
    const intent = this.#record.schedules.find((item) => item.id === id)
    if (!intent) throw new Error(`Schedule ${id} does not exist`)
    if (intent.expectedSessionVersion !== this.#record.version) throw new Error(`Schedule ${id} has a stale session version`)
    const work = this.workRecord(intent.workId)
    if (work.status !== "waiting") throw new Error(`Work ${work.id} is not waiting`)
    return Object.freeze({ ...work, status: "ready" as const, attempt: work.attempt + 1 })
  }

  wake(id: string, authoritative: WorkRecord): WorkRecord {
    const ready = this.previewWake(id)
    if (!sameWakeRecord(ready, authoritative)) throw new BoundaryMismatchError("scheduler.wake", id)
    this.#record = Object.freeze({
      ...this.#record,
      work: Object.freeze(this.#record.work.map((item) => item.id === ready.id ? ready : item)),
      schedules: Object.freeze(this.#record.schedules.filter((item) => item.id !== id)),
    })
    this.emit({
      workId: ready.id,
      attempt: ready.attempt,
      branchId: ready.branchId,
      snapshotEpoch: this.#record.nextEventSequence,
      type: "work.woken",
    })
    return ready
  }

  merge(input: MergeBranchesInput): BranchRecord {
    this.assertOpenMutation()
    const target = this.branch(input.targetId)
    if (target.version !== input.expectedTargetVersion) {
      throw new Error(`Branch ${target.id} version conflict`)
    }
    const sources = input.sourceIds.map((id) => this.branch(id))
    for (const source of sources) {
      if (source.parentId !== target.id || source.createdBy !== input.workId) {
        throw new Error(`Branch ${source.id} is unrelated to merge work ${input.workId}`)
      }
      const work = this.#record.work.filter((item) => item.branchId === source.id)
      if (work.length === 0 || work.some((item) => !isSettled(item.status))) {
        throw new Error(`Branch ${source.id} has unsettled work`)
      }
    }
    const evidence = new Map(target.evidence.map((item) => [`${item.kind}:${item.id}:${item.digest ?? ""}`, item]))
    for (const source of sources) {
      for (const item of source.evidence) evidence.set(`${item.kind}:${item.id}:${item.digest ?? ""}`, item)
    }
    return this.recordMergedBranch(target, Object.freeze([...evidence.values()]))
  }

  settlement(workId: WorkId): AttemptSettlement {
    const work = this.workRecord(workId)
    if (work.status === "completed") return { status: "completed" }
    if (work.status === "cancelled") return { status: "cancelled" }
    if (work.status === "failed") return { status: "failed" }
    throw new Error(`Work ${workId} is not settled`)
  }

  private admit(input: AdmitWorkInput): ActiveAttempt {
    this.assertActive()
    if (this.#status !== "open") throw new Error(`Session ${this.#record.id} does not admit work while ${this.#status}`)
    const existing = this.#record.work.find((item) => item.id === input.id)
    if (existing) {
      if (existing.status !== "ready") throw new Error(`Work ${input.id} already exists`)
      return this.resume(existing, input)
    }
    const branch = this.branch(input.branchId)
    const parent = input.parentId === undefined ? undefined : this.workRecord(input.parentId)
    if (parent && parent.branchId !== branch.id) throw new Error(`Work ${parent.id} is not on branch ${branch.id}`)
    const authority = narrowAuthority(parent?.authority ?? branch.authority, input.authority ?? {})

    const work = Object.freeze({ ...input, status: "working" as const, attempt: 1, authority })
    const attempt = Object.freeze({
      workId: work.id,
      attempt: work.attempt,
      snapshotEpoch: this.#record.nextEventSequence,
      status: "working" as const,
      startedAt: this.clock.now(),
    })
    const controller = new AbortController()
    const settlement = deferred<AttemptSettlement>()
    const value = Object.freeze({ record: attempt, signal: controller.signal, settled: settlement.promise })
    this.#active.set(this.attemptKey(work.id, work.attempt), {
      value,
      controller,
      resolve: settlement.resolve,
      reject: settlement.reject,
    })
    this.#record = Object.freeze({
      ...this.#record,
      work: Object.freeze([...this.#record.work, work]),
      attempts: Object.freeze([...this.#record.attempts, attempt]),
    })
    this.controls.fence(work.id, work.attempt, attempt.snapshotEpoch)
    this.emit({
      workId: work.id,
      attempt: work.attempt,
      branchId: work.branchId,
      snapshotEpoch: attempt.snapshotEpoch,
      type: "work.admitted",
    })
    return value
  }

  private resume(existing: WorkRecord, input: AdmitWorkInput): ActiveAttempt {
    if (
      existing.branchId !== input.branchId
      || existing.role !== input.role
      || existing.policy !== input.policy
      || existing.parentId !== input.parentId
    ) {
      throw new Error(`Work ${input.id} resume contract changed`)
    }
    const authority = narrowAuthority(existing.authority, input.authority ?? {})
    const work = Object.freeze({ ...existing, status: "working" as const, authority })
    const attempt = Object.freeze({
      workId: work.id,
      attempt: work.attempt,
      snapshotEpoch: this.#record.nextEventSequence,
      status: "working" as const,
      startedAt: this.clock.now(),
    })
    const controller = new AbortController()
    const settlement = deferred<AttemptSettlement>()
    const value = Object.freeze({ record: attempt, signal: controller.signal, settled: settlement.promise })
    this.#active.set(this.attemptKey(work.id, work.attempt), {
      value,
      controller,
      resolve: settlement.resolve,
      reject: settlement.reject,
    })
    this.#record = Object.freeze({
      ...this.#record,
      work: Object.freeze(this.#record.work.map((item) => item.id === work.id ? work : item)),
      attempts: Object.freeze([...this.#record.attempts, attempt]),
    })
    this.controls.fence(work.id, work.attempt, attempt.snapshotEpoch)
    this.emit({
      workId: work.id,
      attempt: work.attempt,
      branchId: work.branchId,
      snapshotEpoch: attempt.snapshotEpoch,
      type: "work.resumed",
    })
    return value
  }

  private async finishNow(
    commit: (record: SessionRecord, expectedVersion: number) => Promise<number>,
  ): Promise<SessionRecord> {
    let started = false
    try {
      const joining = this.beginFinish()
      started = this.#status === "finishing"
      await joining
      const expectedVersion = this.#record.version
      const version = await commit(this.snapshot("finished"), expectedVersion)
      this.#completionReady = true
      try {
        this.completeFinish(version)
      } finally {
        this.#completionReady = false
      }
      return this.#record
    } catch (error) {
      this.#completionReady = false
      if (started) {
        this.#finish = undefined
        this.#status = "open"
        this.#record = this.snapshot("open")
      }
      throw error
    }
  }

  private async joinAttempts(active: readonly {
    readonly value: ActiveAttempt
  }[]): Promise<void> {
    const results = await Promise.allSettled(active.map((entry) => entry.value.settled))
    const errors = results.flatMap((result) => result.status === "rejected" ? [result.reason] : [])
    if (errors.length === 1) throw errors[0]
    if (errors.length > 1) throw new AggregateError(errors, "session deactivation settlement failed")
  }

  private assertActive(): void {
    if (this.#activation !== "active") throw new Error(`Session activation is ${this.#activation}`)
  }

  private settle(workId: WorkId, attemptNumber: number, settlement: AttemptSettlement): void {
    const key = this.attemptKey(workId, attemptNumber)
    const active = this.#active.get(key)
    if (!active) throw new Error(`Attempt ${key} is not active`)
    const work = this.workRecord(workId)
    const status = settlement.status === "completed" ? "completed" : settlement.status
    const settledWork = Object.freeze({ ...work, status })
    let settledAt: string
    try {
      settledAt = this.clock.now()
    } catch (error) {
      this.#active.delete(key)
      active.reject(error)
      throw error
    }
    const settledAttempt = Object.freeze({ ...active.value.record, status, settledAt })
    this.#record = Object.freeze({
      ...this.#record,
      work: Object.freeze(this.#record.work.map((item) => item.id === workId ? settledWork : item)),
      attempts: Object.freeze(this.#record.attempts.map(
        (item) => item.workId === workId && item.attempt === attemptNumber ? settledAttempt : item,
      )),
    })
    this.#active.delete(key)
    active.resolve(settlement)
    this.#emit({
      workId: settledWork.id,
      attempt: settledWork.attempt,
      branchId: settledWork.branchId,
      snapshotEpoch: active.value.record.snapshotEpoch,
      type: `work.${status}`,
      ...(settlement.result === undefined && settlement.error === undefined ? {} : { payload: {
        ...(settlement.result === undefined ? {} : { result: settlement.result }),
        ...(settlement.error === undefined ? {} : { error: settlement.error }),
      } }),
    })
  }

  private branch(id: BranchId): BranchRecord {
    const branch = this.#record.branches.find((item) => item.id === id)
    if (!branch) throw new Error(`Branch ${id} does not exist`)
    return branch
  }

  private recordMergedBranch(target: BranchRecord, evidence: readonly EvidenceRef[]): BranchRecord {
    const merged = Object.freeze({
      id: target.id,
      ...(target.parentId === undefined ? {} : { parentId: target.parentId }),
      version: target.version + 1,
      createdBy: target.createdBy,
      authorityFingerprint: target.authorityFingerprint,
      authority: target.authority,
      evidence,
    })
    this.#record = Object.freeze({
      ...this.#record,
      branches: Object.freeze(this.#record.branches.map((branch) => branch.id === target.id ? merged : branch)),
    })
    return merged
  }

  private workRecord(id: WorkId): WorkRecord {
    const work = this.#record.work.find((item) => item.id === id)
    if (!work) throw new Error(`Work ${id} does not exist`)
    return work
  }

  private attemptKey(workId: WorkId, attempt: number): string {
    return `${workId}:${attempt}`
  }

  private assertEventLineage(input: SessionEventInput): void {
    this.branch(input.branchId)
    if (input.workId === "unbound" && input.attempt === 0) return
    const work = this.workRecord(input.workId)
    if (work.branchId !== input.branchId) throw new Error(`Work ${work.id} is not on branch ${input.branchId}`)
    if (work.attempt !== input.attempt) throw new Error(`Attempt ${input.workId}:${input.attempt} is not current`)
    const attempt = this.#record.attempts.find((item) => item.workId === input.workId && item.attempt === input.attempt)
    if (attempt) {
      if (attempt.snapshotEpoch !== input.snapshotEpoch) {
        throw new Error(`Attempt ${input.workId}:${input.attempt} snapshot epoch does not match`)
      }
    } else if (input.type !== "work.woken" || work.status !== "ready" || input.snapshotEpoch !== this.#record.nextEventSequence) {
      throw new Error(`Attempt ${input.workId}:${input.attempt} does not exist`)
    }
    if (input.invocationId !== undefined) {
      const invocation = this.#record.invocations.find((item) => item.id === input.invocationId)
      if (!invocation || invocation.workId !== input.workId || invocation.attempt !== input.attempt) {
        throw new Error(`Invocation ${input.invocationId} does not belong to attempt ${input.workId}:${input.attempt}`)
      }
    }
  }

  private assertOpenMutation(): void {
    if (this.#activation !== "active") throw new Error(`Session activation is ${this.#activation}`)
    if (this.#status !== "open") throw new Error(`Session ${this.#record.id} is ${this.#status}`)
  }
}

export const authority = tag<Authority>({ label: "sdk.session.authority" })
export const record = tag<SessionRecord>({ label: "sdk.session.record" })
export const clock = tag<Clock>({ label: "sdk.session.clock" })

export const current = {
  session: tag<SessionRuntime>({ label: "sdk.session.current.session" }),
  work: tag<WorkRecord>({ label: "sdk.session.current.work" }),
  attempt: tag<AttemptRecord>({ label: "sdk.session.current.attempt" }),
  branch: tag<BranchRecord>({ label: "sdk.session.current.branch" }),
  authority: tag<Authority>({ label: "sdk.session.current.authority" }),
  epoch: tag<number>({ label: "sdk.session.current.epoch" }),
}

export const observation = {
  current: tag<ObservationProjection>({ label: "sdk.session.observation.current" }),
  channel: tag<string>({ label: "sdk.session.observation.channel" }),
}

export const execution = {
  turn: tag<TurnSelection>({ label: "sdk.session.execution.turn" }),
}

const selectedTurn = tag<Lite.AnyFlow>({ label: "sdk.session.execution.selectedTurn" })

export const store = {
  load: tag<Load>({ label: "sdk.session.store.load" }),
  commit: tag<Commit>({ label: "sdk.session.store.commit" }),
}

export const artifacts = {
  publish: tag<PublishArtifact>({ label: "sdk.session.artifacts.publish" }),
}

export const memory = {
  recall: tag<RecallMemory>({ label: "sdk.session.memory.recall" }),
  commit: tag<CommitMemory>({ label: "sdk.session.memory.commit" }),
  accept: tag<AcceptMemory>({ label: "sdk.session.memory.accept" }),
}

export const scheduler = {
  wake: tag<Wake>({ label: "sdk.session.scheduler.wake" }),
}

export const session = resource({
  name: "sdk.session",
  ownership: "current",
  deps: {
    authority: tags.required(authority),
    record: tags.required(record),
    clock: tags.required(clock),
  },
  factory: (ctx, { record, authority, clock }) => {
    const runtime = new Runtime(record, authority, clock)
    ctx.cleanup((target) => target.deactivate(), runtime)
    return runtime
  },
})

export const load: Load = flow({
  name: "sdk.session.load",
  parse: typed<{ id: SessionId }>(),
  deps: { impl: tags.required(store.load) },
  factory: (ctx, { impl }) => impl.exec({ input: ctx.input }),
})

export const commit: Commit = flow({
  name: "sdk.session.commit",
  parse: typed<{ record: SessionRecord; expectedVersion: number }>(),
  deps: { impl: tags.required(store.commit) },
  factory: (ctx, { impl }) => impl.exec({ input: ctx.input }),
})

const publish = flow({
  name: "sdk.session.artifacts.dispatch",
  parse: typed<PublishArtifactInput>(),
  deps: { impl: tags.required(artifacts.publish) },
  factory: (ctx, { impl }) => impl.exec({ input: ctx.input }),
})

const recall = flow({
  name: "sdk.session.memory.recall.dispatch",
  parse: typed<RecallMemoryInput>(),
  deps: { impl: tags.required(memory.recall) },
  factory: (ctx, { impl }) => impl.exec({ input: ctx.input }),
})

const writeMemory = flow({
  name: "sdk.session.memory.commit.dispatch",
  parse: typed<CommitMemoryInput>(),
  deps: { impl: tags.required(memory.commit) },
  factory: (ctx, { impl }) => impl.exec({ input: ctx.input }),
})

const accept = flow({
  name: "sdk.session.memory.accept.dispatch",
  parse: typed<AcceptMemoryInput>(),
  deps: { impl: tags.required(memory.accept) },
  factory: (ctx, { impl }) => impl.exec({ input: ctx.input }),
})

export const publishArtifact: PublishArtifact = flow({
  name: "sdk.session.artifacts.publish",
  parse: typed<PublishArtifactInput>(),
  deps: { session, impl: controller(publish) },
  factory: async (ctx, { session, impl }) => {
    assertOpenBoundary(session, "artifact.publish")
    const work = boundaryWork(session, ctx.input.workId, "artifact.publish")
    if (work.branchId !== ctx.input.branchId) throw new BoundaryMismatchError("artifact.publish", work.id)
    const branch = branchFrom(session, ctx.input.branchId)
    const value = await impl.exec({
      input: ctx.input,
      tags: [
        current.session(session),
        current.work(work),
        current.branch(branch),
        current.authority(work.authority),
      ],
    })
    if (
      value.workId !== ctx.input.workId
      || value.branchId !== ctx.input.branchId
      || value.mediaType !== ctx.input.mediaType
      || value.authorityFingerprint !== work.authority.fingerprint
    ) throw new BoundaryMismatchError("artifact.publish", value.id)
    return session.artifacts.record(value)
  },
})

export const recallMemory: RecallMemory = flow({
  name: "sdk.session.memory.recall",
  parse: typed<RecallMemoryInput>(),
  deps: { session, impl: controller(recall) },
  factory: async (ctx, { session, impl }) => {
    assertOpenBoundary(session, "memory.recall")
    if (!Number.isSafeInteger(ctx.input.limit) || ctx.input.limit <= 0) {
      throw new BoundaryMismatchError("memory.recall", ctx.input.workId)
    }
    const work = workFrom(session, ctx.input.workId)
    const branch = branchFrom(session, work.branchId)
    const values = await impl.exec({
      input: ctx.input,
      tags: [
        current.session(session),
        current.work(work),
        current.branch(branch),
        current.authority(work.authority),
      ],
    })
    if (
      values.length > ctx.input.limit
      || values.some((value) => value.authorityFingerprint !== work.authority.fingerprint)
    ) throw new BoundaryMismatchError("memory.recall", ctx.input.workId)
    return Object.freeze([...values])
  },
})

export const commitMemory: CommitMemory = flow({
  name: "sdk.session.memory.commit",
  parse: typed<CommitMemoryInput>(),
  deps: { session, impl: controller(writeMemory) },
  factory: async (ctx, { session, impl }) => {
    assertOpenBoundary(session, "memory.commit")
    const work = boundaryWork(session, ctx.input.workId, "memory.commit")
    if (work.branchId !== ctx.input.branchId) throw new BoundaryMismatchError("memory.commit", work.id)
    const branch = branchFrom(session, ctx.input.branchId)
    const evidence = normalizeEvidence(ctx.input.evidence)
    const value = await impl.exec({
      input: { ...ctx.input, evidence },
      tags: [
        current.session(session),
        current.work(work),
        current.branch(branch),
        current.authority(work.authority),
      ],
    })
    if (
      value.status !== "candidate"
      || value.source !== "session"
      || value.authorityFingerprint !== work.authority.fingerprint
      || !sameEvidence(normalizeEvidence(value.evidence), evidence)
    ) {
      throw new BoundaryMismatchError("memory.commit", value.id)
    }
    return recordMemory(session, Object.freeze({ ...value, evidence }))
  },
})

export const acceptMemory: AcceptMemory = flow({
  name: "sdk.session.memory.accept",
  parse: typed<AcceptMemoryInput>(),
  deps: { session, impl: controller(accept) },
  factory: async (ctx, { session, impl }) => {
    assertOpenBoundary(session, "memory.accept")
    const work = boundaryWork(session, ctx.input.workId, "memory.accept")
    const branch = branchFrom(session, work.branchId)
    const candidate = session.record.memory.find((value) => value.id === ctx.input.id)
    if (!candidate || candidate.status !== "candidate") throw new BoundaryMismatchError("memory.accept", ctx.input.id)
    if (candidate.authorityFingerprint !== work.authority.fingerprint) {
      throw new BoundaryMismatchError("memory.accept", candidate.id)
    }
    const evidence = normalizeEvidence(ctx.input.evidence)
    if (!sameEvidence(candidate.evidence, evidence)) throw new BoundaryMismatchError("memory.accept", candidate.id)
    const value = await impl.exec({
      input: { ...ctx.input, evidence },
      tags: [
        current.session(session),
        current.work(work),
        current.branch(branch),
        current.authority(work.authority),
      ],
    })
    if (
      value.id !== candidate.id
      || value.status !== "accepted"
      || (value.source !== "human" && value.source !== "policy")
      || value.version <= candidate.version
      || value.authorityFingerprint !== candidate.authorityFingerprint
      || !sameEvidence(normalizeEvidence(value.evidence), evidence)
    ) {
      throw new BoundaryMismatchError("memory.accept", value.id)
    }
    return recordMemory(session, Object.freeze({ ...value, evidence }))
  },
})

export const loadAndBind = flow({
  name: "sdk.session.loadAndBind",
  parse: typed<ResumeInput>(),
  deps: { load: controller(load) },
  factory: async (ctx, { load }) => {
    const loaded = await load.exec({ input: { id: ctx.input.id } })
    const supplied = createAuthority(ctx.input.authority)
    if (!constantEqual(supplied.fingerprint, ctx.input.authority.fingerprint)) {
      throw new AuthorityBindingError(ctx.input.id, "supplied-fingerprint")
    }
    if (!constantEqual(supplied.fingerprint, loaded.authorityFingerprint)) {
      throw new AuthorityBindingError(ctx.input.id, "stored-fingerprint")
    }
    if (!sameAuthority(supplied, loaded.authorityConstraints)) {
      throw new AuthorityBindingError(ctx.input.id, "stored-constraints")
    }
    const validated = validateSessionRecord(loaded, supplied)
    return Object.freeze({
      record: validated,
      authority: supplied,
      tags: Object.freeze([authority(supplied), record(validated)]),
    }) satisfies SessionBindings
  },
})

export const steer = flow({
  name: "sdk.session.steer",
  parse: typed<ControlEvent>(),
  deps: { session },
  factory: (ctx, { session }) => session.controls.enqueue(ctx.input),
})

export const wait = flow({
  name: "sdk.session.wait",
  parse: typed<WaitWorkInput>(),
  deps: { session },
  factory: (ctx, { session }) => session.park(ctx.input),
})

export const wake = flow({
  name: "sdk.session.wake",
  parse: typed<WakeInput>(),
  deps: { session, impl: tags.required(scheduler.wake) },
  factory: async (ctx, { session, impl }) => {
    const expected = session.previewWake(ctx.input.id)
    const authoritative = await impl.exec({ input: ctx.input })
    if (!sameWakeRecord(expected, authoritative)) throw new BoundaryMismatchError("scheduler.wake", ctx.input.id)
    return session.wake(ctx.input.id, authoritative)
  },
})

export const fork = flow({
  name: "sdk.session.fork",
  parse: typed<ForkBranchInput>(),
  deps: { session },
  factory: (ctx, { session }) => session.branches.fork(ctx.input),
})

export const join = flow({
  name: "sdk.session.join",
  parse: typed<JoinWorkInput>(),
  deps: { session },
  factory: async (ctx, { session }) => {
    const active = new Map(session.work.active().map((attempt) => [attempt.record.workId, attempt]))
    const pending = new Map(ctx.input.workIds.map((workId) => [
      workId,
      (active.get(workId)?.settled ?? Promise.resolve(session.settlement(workId))).then(
        (settlement) => ({ workId, settlement }),
      ),
    ]))
    if (ctx.input.policy === "all") {
      return Object.freeze((await Promise.all(pending.values())).map((result) => result.settlement))
    }
    const settlements: AttemptSettlement[] = []
    while (pending.size > 0) {
      const result = await Promise.race(pending.values())
      pending.delete(result.workId)
      settlements.push(result.settlement)
      if (result.settlement.status !== "completed") {
        for (const workId of pending.keys()) session.work.cancel(workId, result.settlement)
        const cancelled = await Promise.all(pending.values())
        return Object.freeze([result.settlement, ...cancelled.map((value) => value.settlement)])
      }
    }
    return Object.freeze(settlements)
  },
})

export const merge = flow({
  name: "sdk.session.merge",
  parse: typed<MergeBranchesInput>(),
  deps: { session },
  factory: (ctx, { session }) => session.merge(ctx.input),
})

export const events = flow({
  name: "sdk.session.events",
  parse: typed<{ workId: WorkId }>(),
  deps: { session },
  factory: async function* (ctx, { session }) {
    for (const event of session.eventsFor(ctx.input.workId)) yield event
  },
})

export const finish = flow({
  name: "sdk.session.finish",
  deps: { session, commit: controller(commit) },
  factory: (_ctx, { session, commit }) => session.finishWith(
    async (record, expectedVersion) => (await commit.exec({ input: { record, expectedVersion } })).version,
  ),
})

const dispatch = flow({
  name: "sdk.session.dispatch",
  deps: { turn: tags.required(selectedTurn) },
  factory: async function* (ctx, { turn }) {
    if (!isStreamingExec(turn.flow)) return turn.exec({ rawInput: ctx.input })
    const stream = turn.execStream({ rawInput: ctx.input })
    for await (const value of stream) yield value
    return stream.result
  },
})

export const run = flow({
  name: "sdk.session.run",
  parse: typed<RunInput<unknown>>(),
  deps: {
    session,
    selection: tags.required(execution.turn),
    dispatch: controller(dispatch),
    channel: tags.optional(observation.channel),
  },
  factory: async function* (ctx, { session, selection, dispatch, channel }) {
    const active = session.work.admit(ctx.input.work)
    const work = session.record.work.find((item) => item.id === active.record.workId)!
    const branch = session.record.branches.find((item) => item.id === work.branchId)!
    const signal = AbortSignal.any([active.signal, ctx.signal])
    const invocation = {
      rawInput: ctx.input.input,
      signal,
      tags: [
        selectedTurn(selection.flow),
        current.session(session),
        current.work(work),
        current.attempt(active.record),
        current.branch(branch),
        current.authority(work.authority),
        current.epoch(active.record.snapshotEpoch),
        observation.current(Object.freeze({
          sessionId: session.record.id,
          activationId: `${session.record.id}:${work.id}:${work.attempt}`,
          workId: work.id,
          ...(work.parentId === undefined ? {} : { parentWorkId: work.parentId }),
          ...(channel === undefined ? {} : { channel }),
          role: work.role,
        })),
      ],
    }
    let settled = false
    try {
      const prepared = dispatch.prepare(invocation)
      await prepared.ready
      signal.throwIfAborted()
      yield session.emit({
        workId: work.id,
        attempt: work.attempt,
        branchId: work.branchId,
        snapshotEpoch: active.record.snapshotEpoch,
        type: "work.started",
      })
      signal.throwIfAborted()
      const stream = prepared.execStream()
      for await (const value of stream) yield value
      const output = await stream.result
      signal.throwIfAborted()
      session.work.settle(work.id, work.attempt, { status: "completed" })
      settled = true
      return output
    } catch (error) {
      settleOpenInvocations(session, work.id, work.attempt, signal.aborted ? "cancelled" : "failed")
      session.work.settle(work.id, work.attempt, {
        status: signal.aborted ? "cancelled" : "failed",
        error: jsonError(error),
      })
      settled = true
      throw error
    } finally {
      if (!settled) {
        settleOpenInvocations(session, work.id, work.attempt, "cancelled")
        session.work.cancel(work.id, new DOMException("Work stream closed", "AbortError"))
        session.work.settle(work.id, work.attempt, { status: "cancelled" })
      }
    }
  },
})

function branchFrom(runtime: SessionRuntime, id: BranchId): BranchRecord {
  const branch = runtime.record.branches.find((value) => value.id === id)
  if (!branch) throw new Error(`Branch ${id} does not exist`)
  return branch
}

function settleOpenInvocations(
  runtime: SessionRuntime,
  workId: WorkId,
  attempt: number,
  status: "failed" | "cancelled",
): void {
  for (const invocation of runtime.record.invocations) {
    if (invocation.workId === workId && invocation.attempt === attempt && invocation.status === "working") {
      runtime.invocations.settle(invocation.id, status)
    }
  }
}

function workFrom(runtime: SessionRuntime, id: WorkId): WorkRecord {
  const work = runtime.record.work.find((value) => value.id === id)
  if (!work) throw new BoundaryMismatchError("memory.recall", id)
  return work
}

function boundaryWork(runtime: SessionRuntime, id: WorkId, op: BoundaryMismatchError["op"]): WorkRecord {
  const work = runtime.record.work.find((value) => value.id === id)
  if (!work) throw new BoundaryMismatchError(op, id)
  return work
}

function assertOpenBoundary(runtime: SessionRuntime, op: BoundaryMismatchError["op"]): void {
  if (runtime.status !== "open") throw new BoundaryMismatchError(op, runtime.record.id)
}

function sameWakeRecord(expected: WorkRecord, value: WorkRecord): boolean {
  const candidate = objectValue(value, "Wake work")
  exactKeys(candidate, ["id", "parentId", "branchId", "role", "status", "policy", "attempt", "continuation", "authority"], "Wake work")
  return value.id === expected.id
    && value.parentId === expected.parentId
    && value.branchId === expected.branchId
    && value.role === expected.role
    && value.status === expected.status
    && value.policy === expected.policy
    && value.attempt === expected.attempt
    && JSON.stringify(value.continuation) === JSON.stringify(expected.continuation)
    && sameAuthority(value.authority, expected.authority)
    && constantEqual(value.authority.fingerprint, expected.authority.fingerprint)
}

import type { StandardSchemaV1 } from "@standard-schema/spec"
import { controller, flow, isStreamingExec, resource, tag, tags, typed, type Lite } from "@pumped-fn/lite"
import type { Capability, LoadedSkill, Message, ModelRequest, ModelResponse } from "./index.js"
import { model } from "./model.js"
import * as session from "./session.js"
import * as validation from "./validation.js"

export type ModelEvent =
  | { readonly type: "content_delta"; readonly content: string }
  | { readonly type: "reasoning_delta"; readonly content: string }
  | { readonly type: "provider_status"; readonly status: string }

export type Attempt = Lite.Flow<ModelResponse, ModelRequest, never, ModelEvent>

/** Configures the identity, instructions, and turn limit of an agent role. */
export interface RoleConfig {
  readonly name: string
  readonly version: string
  readonly description?: string
  readonly instructions?: string
  readonly maxRounds?: number
}

/** Configures a versioned tool and the schema used to validate its input. */
export interface ToolConfig {
  readonly version: string
  readonly description: string
  readonly input: StandardSchemaV1
}

/** Configures the public identity and description of a skill. */
export interface SkillConfig {
  readonly name: string
  readonly version: string
  readonly description: string
}

/** Configures the public identity and description of a subagent. */
export interface SubagentConfig {
  readonly name: string
  readonly version: string
  readonly description: string
}

type Tool = Lite.AnyFlow
type Skill = Lite.Flow<string, void>
type Subagent = Lite.Flow<TurnResult, session.RunInput<TurnInput>, never, session.SessionEvent>

export const config = {
  role: tag<RoleConfig>({ label: "agent.config.role" }),
  tool: tag<ToolConfig>({ label: "agent.config.tool" }),
  skill: tag<SkillConfig>({ label: "agent.config.skill" }),
  subagent: tag<SubagentConfig>({ label: "agent.config.subagent" }),
}

export const impl = {
  attempt: tag<Attempt>({ label: "agent.impl.attempt" }),
  tool: tag<Tool>({ label: "agent.impl.tool" }),
  skill: tag<Skill>({ label: "agent.impl.skill" }),
  subagent: tag<Subagent>({ label: "agent.impl.subagent" }),
}

export const invoke = flow({
  name: "agent.invoke",
  parse: typed<ModelRequest>(),
  deps: { impl: tags.required(impl.attempt) },
  factory: async function* (ctx, { impl }): AsyncGenerator<ModelEvent, ModelResponse, unknown> {
    if (!isStreamingExec(impl.flow as unknown as Lite.ExecTarget)) return impl.exec({ input: ctx.input })
    const stream = impl.execStream({ input: ctx.input })
    for await (const event of stream) yield event
    return stream.result
  },
})

export const fromModel: Attempt = flow({
  name: "agent.from-model",
  parse: typed<ModelRequest>(),
  deps: { provider: tags.required(model) },
  factory: (ctx, { provider }) => provider.exec({ input: ctx.input }),
})

/** Captures the authority-bound tool contract visible to one turn. */
export interface ToolSnapshot {
  readonly identity: session.ToolIdentity
  readonly name: string
  readonly description: string
  readonly inputSchema: validation.JsonSchema
  readonly authorityFingerprint: string
  readonly permitEpoch: number
  readonly branchId: string
  readonly snapshotEpoch: number
}

/** Couples a permitted tool snapshot with its validation schema and executable flow. */
export interface ResolvedTool<Output, Input, Fault = never, Yield = never> {
  readonly snapshot: ToolSnapshot
  readonly schema: StandardSchemaV1
  readonly flow: Lite.FlowHandle<Output, Input, Yield>
}

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

/** Couples resolved skill metadata with the flow that loads its content. */
export interface ResolvedSkill {
  readonly name: string
  readonly version: string
  readonly description: string
  readonly content: Lite.FlowHandle<string, void>
}

/** Couples resolved subagent metadata with its session-bound turn flow. */
export interface ResolvedSubagent {
  readonly name: string
  readonly version: string
  readonly description: string
  readonly run: Lite.FlowHandle<TurnResult, session.RunInput<TurnInput>, session.SessionEvent>
}

/** Represents the fully resolved role, tools, skills, and subagents used by a turn. */
export interface Role {
  readonly name: string
  readonly version: string
  readonly description?: string
  readonly instructions: string
  readonly maxRounds: number
  readonly tools: readonly AnyResolvedTool[]
  readonly skills: readonly ResolvedSkill[]
  readonly subagents: readonly ResolvedSubagent[]
}

export type AnyResolvedTool = ResolvedTool<any, any, any, any>

export const role = resource({
  name: "agent.role",
  ownership: "current",
  deps: {
    config: tags.required(config.role),
    runtime: session.session,
    engine: tags.required(validation.engine),
    authority: tags.optional(session.current.authority),
    branch: tags.optional(session.current.branch),
    epoch: tags.optional(session.current.epoch),
    tools: tags.all(impl.tool),
    skills: tags.all(impl.skill),
    subagents: tags.all(impl.subagent),
  },
  factory: (_ctx, { config: value, runtime, engine, authority: boundAuthority, branch, epoch: boundEpoch, tools: toolFlows, skills: skillFlows, subagents: subagentFlows }) => {
    const authority = boundAuthority ?? runtime.authority
    const epoch = boundEpoch ?? runtime.record.nextEventSequence
    const tools = toolFlows
      .map((tool) => resolveTool(tool, runtime, engine, authority, branch ?? runtime.branches.current(), epoch))
      .filter((tool) => authority.tools.includes(tool.snapshot.identity.id))
    const skills = skillFlows.map(resolveSkill)
    const subagents = subagentFlows.map(resolveSubagent)
    assertUnique([...tools, ...skills, ...subagents])
    return Object.freeze({
      name: value.name,
      version: value.version,
      ...(value.description === undefined ? {} : { description: value.description }),
      instructions: value.instructions ?? "",
      maxRounds: value.maxRounds ?? 4,
      tools,
      skills,
      subagents,
    })
  },
})

/** Supplies prompt, message history, and metadata to an agent turn. */
export interface TurnInput {
  readonly prompt?: string
  readonly messages?: readonly Message[]
  readonly metadata?: Lite.JsonValue
}

/** Records one tool call input and output returned during a turn. */
export interface ToolResult {
  readonly name: string
  readonly callId?: string
  readonly input: unknown
  readonly output: unknown
}

/** Records skill content loaded during a turn. */
export interface SkillResult {
  readonly name: string
  readonly callId?: string
  readonly content: string
}

/** Records the child work identity, input, and result of a subagent turn. */
export interface SubagentResult {
  readonly name: string
  readonly workId: string
  readonly input: TurnInput
  readonly output: TurnResult
}

/** Collects the content, messages, calls, and session events produced by a turn. */
export interface TurnResult {
  readonly role: string
  readonly content: string
  readonly messages: readonly Message[]
  readonly rounds: number
  readonly toolResults: readonly ToolResult[]
  readonly skillResults: readonly SkillResult[]
  readonly subagentResults: readonly SubagentResult[]
  readonly events: readonly session.SessionEvent[]
}

export const turn: Lite.Flow<TurnResult, TurnInput, never, session.SessionEvent> = flow({
    name: "agent.turn",
    parse: typed<TurnInput>(),
    deps: {
      role,
      invoke: controller(invoke),
      runtime: session.session,
      validate: controller(validation.validate),
      work: tags.optional(session.current.work),
      attempt: tags.optional(session.current.attempt),
      branch: tags.optional(session.current.branch),
      epoch: tags.optional(session.current.epoch),
      projection: tags.optional(session.observation.current),
    },
    factory: async function* (ctx, { role, invoke, runtime, validate, work, attempt, branch, epoch, projection }): AsyncGenerator<session.SessionEvent, TurnResult, unknown> {
      const messages = initialMessages(ctx.input)
      const loadedSkills: LoadedSkill[] = []
      const skillResults: SkillResult[] = []
      const toolResults: ToolResult[] = []
      const subagentResults: SubagentResult[] = []
      const events: session.SessionEvent[] = []
      let content = ""
      let rounds = 0
      let controlSequence = -1
      const activeInvocations = new Set<string>()
      const signal = ctx.signal
      const bound: BoundSession = {
        work,
        attempt,
        branch: branch ?? runtime.branches.current(),
        epoch: epoch ?? attempt?.snapshotEpoch ?? 0,
      }
      const toolAuthority = bound.work?.authority ?? runtime.authority
      const tools = role.tools.flatMap((tool) => bindTool(tool, runtime, bound, toolAuthority))

      try {
        const roleStarted = sessionEvent(bound, runtime, "agent_role_start", role.name, 0, undefined, role.name)
        events.push(roleStarted)
        yield roleStarted
        signal?.throwIfAborted()

        for (let round = 0; round < role.maxRounds; round++) {
          rounds = round + 1
          if (bound.work) {
            for (const control of runtime.controls.drain(bound.work.id, controlSequence)) {
              controlSequence = control.sequence
              const controlled = sessionEvent(
                bound,
                runtime,
                "agent_control",
                role.name,
                round,
                control,
                control.source,
              )
              events.push(controlled)
              yield controlled
              signal?.throwIfAborted()
              if (control.mode === "queue" || control.mode === "input") {
                messages.push({ role: "user", name: "steering", content: stringify(control.payload) })
              }
            }
          }
          const invocation = beginInvocation(bound, runtime, activeInvocations, "model", role.name, round)
          const started = sessionEvent(
            bound,
            runtime,
            "agent_model_start",
            role.name,
            round,
            undefined,
            role.name,
            invocation.id,
          )
          events.push(started)
          yield started
          let response: ModelResponse
          try {
            signal?.throwIfAborted()
            const stream = invoke.execStream({
              input: {
                agentName: role.name,
                instructions: role.instructions,
                messages,
                tools: tools.map(toolCapability),
                skills: role.skills.map(skillCapability),
                loadedSkills,
                subagents: role.subagents.map(subagentCapability),
                round,
              },
            })
            for await (const delta of stream) {
              const event = sessionEvent(
                bound,
                runtime,
                `model.${delta.type}`,
                role.name,
                round,
                delta,
                role.name,
                invocation.id,
              )
              events.push(event)
              yield event
              signal?.throwIfAborted()
            }
            response = await stream.result
            signal?.throwIfAborted()
            settleInvocation(runtime, activeInvocations, invocation.id, "completed")
          } catch (error) {
            settleInvocation(runtime, activeInvocations, invocation.id, isAbort(error) ? "cancelled" : "failed")
            throw error
          }
          content = response.content
          if (content) messages.push({ role: "assistant", content })

          for (const call of response.skillCalls ?? []) {
            const selected = findByName(role.skills, call.name, "skill")
            const selectedInvocation = beginInvocation(bound, runtime, activeInvocations, "skill", selected.name, round)
            const selectedStarted = sessionEvent(
              bound, runtime, "agent_skill_start", role.name, round, call, selected.name, selectedInvocation.id,
            )
            events.push(selectedStarted)
            yield selectedStarted
            let loaded: string
            try {
              signal?.throwIfAborted()
              loaded = await selected.content.exec()
              signal?.throwIfAborted()
              settleInvocation(runtime, activeInvocations, selectedInvocation.id, "completed")
            } catch (error) {
              settleInvocation(runtime, activeInvocations, selectedInvocation.id, isAbort(error) ? "cancelled" : "failed")
              throw error
            }
            skillResults.push({ name: selected.name, ...(call.id === undefined ? {} : { callId: call.id }), content: loaded })
            loadedSkills.push({ name: selected.name, description: selected.description, content: loaded })
            messages.push({ role: "skill", name: selected.name, content: loaded, ...(call.id === undefined ? {} : { id: call.id }) })
            const selectedEnded = sessionEvent(
              bound, runtime, "agent_skill_end", role.name, round, loaded, selected.name, selectedInvocation.id,
            )
            events.push(selectedEnded)
            yield selectedEnded
            signal?.throwIfAborted()
          }

          for (const call of response.toolCalls ?? []) {
            const selected = findByName(tools, call.name, "tool")
            const selectedInvocation = beginInvocation(bound, runtime, activeInvocations, "tool", selected.snapshot.name, round)
            const selectedStarted = sessionEvent(
              bound, runtime, "agent_tool_start", role.name, round, call.input, selected.snapshot.name, selectedInvocation.id,
            )
            events.push(selectedStarted)
            yield selectedStarted
            let output: unknown
            try {
              signal?.throwIfAborted()
              if (
                selected.snapshot.authorityFingerprint !== toolAuthority.fingerprint
                || selected.snapshot.permitEpoch !== bound.epoch
                || !toolAuthority.tools.includes(selected.snapshot.identity.id)
              ) throw new session.AuthorityEscalationError("tools")
              runtime.tools.authorize(
                selected.snapshot.identity,
                selected.snapshot.permitEpoch,
                selected.snapshot.authorityFingerprint,
              )
              const parsed = await validate.exec({ input: { schema: selected.schema, input: call.input } })
              if (parsed.issues) throw new ToolInputError(selected.snapshot.name, parsed.issues)
              signal?.throwIfAborted()
              output = await selected.flow.exec({
                rawInput: parsed.value,
                tags: projection === undefined
                  ? []
                  : [session.observation.current({ ...projection, tool: selected.snapshot.name })],
              })
              signal?.throwIfAborted()
              settleInvocation(runtime, activeInvocations, selectedInvocation.id, "completed")
            } catch (error) {
              settleInvocation(runtime, activeInvocations, selectedInvocation.id, isAbort(error) ? "cancelled" : "failed")
              throw error
            }
            toolResults.push({ name: selected.snapshot.name, ...(call.id === undefined ? {} : { callId: call.id }), input: call.input, output })
            messages.push({ role: "tool", name: selected.snapshot.name, content: stringify(output), ...(call.id === undefined ? {} : { id: call.id, input: call.input }) })
            const selectedEnded = sessionEvent(
              bound, runtime, "agent_tool_end", role.name, round, output, selected.snapshot.name, selectedInvocation.id,
            )
            events.push(selectedEnded)
            yield selectedEnded
            signal?.throwIfAborted()
          }

          for (const call of response.subagentCalls ?? []) {
            const selected = findByName(role.subagents, call.name, "subagent")
            const parent = bound.work
            const branch = bound.branch
            const workId = call.id ?? `${parent?.id ?? "work"}.${selected.name}.${round}`
            const selectedInvocation = beginInvocation(bound, runtime, activeInvocations, "subagent", selected.name, round)
            const selectedStarted = sessionEvent(
              bound, runtime, "agent_subagent_start", role.name, round, call.input, selected.name, selectedInvocation.id,
            )
            events.push(selectedStarted)
            yield selectedStarted
            let output: TurnResult
            try {
              signal?.throwIfAborted()
              output = await selected.run.exec({
                input: {
                  work: {
                    id: workId,
                    ...(parent === undefined ? {} : { parentId: parent.id }),
                    branchId: branch.id,
                    role: selected.name,
                    policy: "all",
                  },
                  input: call.input,
                },
              })
              signal?.throwIfAborted()
              settleInvocation(runtime, activeInvocations, selectedInvocation.id, "completed")
            } catch (error) {
              settleInvocation(runtime, activeInvocations, selectedInvocation.id, isAbort(error) ? "cancelled" : "failed")
              throw error
            }
            subagentResults.push({ name: selected.name, workId, input: call.input, output })
            messages.push({ role: "subagent", name: selected.name, content: output.content, ...(call.id === undefined ? {} : { id: call.id, input: call.input }) })
            const selectedEnded = sessionEvent(
              bound, runtime, "agent_subagent_end", role.name, round, output, selected.name, selectedInvocation.id,
            )
            events.push(selectedEnded)
            yield selectedEnded
            signal?.throwIfAborted()
          }

          const ended = sessionEvent(
            bound,
            runtime,
            "agent_model_end",
            role.name,
            round,
            response,
            role.name,
            invocation.id,
          )
          events.push(ended)
          yield ended
          signal?.throwIfAborted()
          const queued = bound.work
            ? runtime.controls.drain(bound.work.id, controlSequence).some(
                (control) => control.mode === "queue" || control.mode === "input",
              )
            : false
          if ((response.stop === true || noCalls(response)) && !queued) break
        }

        const roleEnded = sessionEvent(bound, runtime, "agent_role_end", role.name, rounds, undefined, role.name)
        events.push(roleEnded)
        yield roleEnded

        return {
          role: role.name,
          content,
          messages,
          rounds,
          toolResults,
          skillResults,
          subagentResults,
          events,
        }
      } finally {
        for (const id of activeInvocations) runtime.invocations.settle(id, "cancelled")
      }
    },
  })

function resolveTool(
  flow: Lite.FlowHandle<any, any, any>,
  runtime: session.SessionRuntime,
  engine: validation.Engine,
  authority: session.Authority,
  branch: session.BranchRecord,
  epoch: number,
): AnyResolvedTool {
  const value = config.tool.find(flow.flow)
  const name = flow.flow.name
  if (!value || !name) throw new Error("Agent tool requires a name and agent.config.tool metadata")
  const identity: session.ToolIdentity = {
    id: name,
    version: value.version,
    schemaDigest: engine.schemaDigest(value.input),
    validationEngine: engine.id,
    readiness: "ready",
    flow: name,
  }
  const permit = authority.tools.includes(identity.id)
    ? runtime.tools.permit(identity, authority, epoch)
    : undefined
  return Object.freeze({
    snapshot: Object.freeze({
      identity,
      name,
      description: value.description,
      inputSchema: engine.jsonSchema(value.input),
      authorityFingerprint: permit?.authorityFingerprint ?? authority.fingerprint,
      permitEpoch: permit?.epoch ?? epoch,
      branchId: branch.id,
      snapshotEpoch: epoch,
    }),
    schema: value.input,
    flow,
  })
}

function resolveSkill(content: Lite.FlowHandle<string, void>): ResolvedSkill {
  const value = config.skill.find(content.flow)
  if (!value) throw new Error("Agent skill requires agent.config.skill metadata")
  return Object.freeze({ ...value, content })
}

function resolveSubagent(run: Lite.FlowHandle<TurnResult, session.RunInput<TurnInput>, session.SessionEvent>): ResolvedSubagent {
  const value = config.subagent.find(run.flow)
  if (!value) throw new Error("Agent subagent requires agent.config.subagent metadata")
  return Object.freeze({ ...value, run })
}

function initialMessages(input: TurnInput): Message[] {
  return [...(input.messages ?? []), ...(input.prompt === undefined ? [] : [{ role: "user" as const, content: input.prompt }])]
}

function noCalls(response: ModelResponse): boolean {
  return (response.skillCalls?.length ?? 0) === 0
    && (response.toolCalls?.length ?? 0) === 0
    && (response.subagentCalls?.length ?? 0) === 0
}

function toolCapability(value: AnyResolvedTool): Capability {
  return {
    name: value.snapshot.name,
    description: value.snapshot.description,
    inputSchema: value.snapshot.inputSchema,
  }
}

function bindTool(
  tool: AnyResolvedTool,
  runtime: session.SessionRuntime,
  bound: BoundSession,
  authority: session.Authority,
): readonly AnyResolvedTool[] {
  if (!authority.tools.includes(tool.snapshot.identity.id)) return []
  const permit = runtime.tools.permit(tool.snapshot.identity, authority, bound.epoch)
  return [Object.freeze({
    ...tool,
    snapshot: Object.freeze({
      ...tool.snapshot,
      authorityFingerprint: permit.authorityFingerprint,
      permitEpoch: permit.epoch,
      branchId: bound.branch.id,
      snapshotEpoch: bound.epoch,
    }),
  })]
}

function skillCapability(value: ResolvedSkill): Capability {
  return { name: value.name, description: value.description }
}

function subagentCapability(value: ResolvedSubagent): Capability {
  return { name: value.name, description: value.description }
}

interface BoundSession {
  readonly work?: session.WorkRecord
  readonly attempt?: session.AttemptRecord
  readonly branch: session.BranchRecord
  readonly epoch: number
}

function sessionEvent(
  bound: BoundSession,
  runtime: session.SessionRuntime,
  type: string,
  agentName: string,
  round: number,
  payload?: unknown,
  targetName?: string,
  invocationId?: string,
): session.SessionEvent {
  return runtime.emit({
    workId: bound.work?.id ?? "unbound",
    attempt: bound.attempt?.attempt ?? 0,
    branchId: bound.branch.id,
    snapshotEpoch: bound.epoch,
    type,
    agentName,
    round,
    ...(targetName === undefined ? {} : { targetName }),
    ...(invocationId === undefined ? {} : { invocationId }),
    ...(payload === undefined ? {} : { payload: json(payload) }),
  })
}

function beginInvocation(
  bound: BoundSession,
  runtime: session.SessionRuntime,
  active: Set<string>,
  kind: session.InvocationRecord["kind"],
  targetName: string,
  round: number,
): session.InvocationRecord {
  const id = `${bound.work?.id ?? "unbound"}:${bound.attempt?.attempt ?? 0}:${kind}:${targetName}:${round}:${runtime.record.nextEventSequence}`
  const invocation = runtime.invocations.start({
    id,
    workId: bound.work?.id ?? "unbound",
    attempt: bound.attempt?.attempt ?? 0,
    kind,
    idempotencyKey: id,
  })
  active.add(invocation.id)
  return invocation
}

function settleInvocation(
  runtime: session.SessionRuntime,
  active: Set<string>,
  id: string,
  status: "completed" | "failed" | "cancelled",
): void {
  runtime.invocations.settle(id, status)
  active.delete(id)
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError"
}

function assertUnique(values: readonly { readonly name?: string; readonly snapshot?: ToolSnapshot }[]): void {
  const seen = new Set<string>()
  for (const value of values) {
    const name = value.name ?? value.snapshot?.name
    if (!name) continue
    if (seen.has(name)) throw new Error(`Duplicate role capability ${name}`)
    seen.add(name)
  }
}

function findByName<T>(values: readonly T[], name: string, kind: string): T {
  const found = values.find((value) => capabilityName(value) === name)
  if (!found) throw new Error(`Agent ${kind} "${name}" not found`)
  return found
}

function capabilityName(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined
  if ("name" in value && typeof value.name === "string") return value.name
  if ("snapshot" in value && typeof value.snapshot === "object" && value.snapshot !== null && "name" in value.snapshot) {
    return typeof value.snapshot.name === "string" ? value.snapshot.name : undefined
  }
  return undefined
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value
  return JSON.stringify(json(value))
}

function json(value: unknown, seen = new WeakSet<object>()): Lite.JsonValue {
  if (value === null) return null
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value
  if (value === undefined || typeof value === "bigint" || typeof value === "symbol" || typeof value === "function") return String(value)
  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]"
    seen.add(value)
    if (Array.isArray(value)) return value.map((item) => json(item, seen))
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, json(item, seen)]))
  }
  return String(value)
}

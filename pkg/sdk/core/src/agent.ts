import type { StandardSchemaV1 } from "@standard-schema/spec"
import { controller, flow, isStreamingExec, resource, tag, tags, typed, type Lite } from "@pumped-fn/lite"
import { abortSignal, type Capability, type LoadedSkill, type Message, type Model, type ModelRequest, type ModelResponse } from "./index.js"
import * as session from "./session.js"
import * as validation from "./validation.js"

export type ModelEvent =
  | { readonly type: "content_delta"; readonly content: string }
  | { readonly type: "reasoning_delta"; readonly content: string }
  | { readonly type: "provider_status"; readonly status: string }

export type Attempt = Lite.Flow<ModelResponse, ModelRequest, never, ModelEvent>

export const attempt = tag<Attempt>({ label: "agent.attempt" })

export const invoke = flow({
  name: "agent.invoke",
  parse: typed<ModelRequest>(),
  deps: { impl: tags.required(attempt) },
  factory: async function* (ctx, { impl }): AsyncGenerator<ModelEvent, ModelResponse, unknown> {
    if (!isStreamingExec(impl.flow as unknown as Lite.ExecTarget)) return impl.exec({ input: ctx.input })
    const stream = impl.execStream({ input: ctx.input })
    for await (const event of stream) yield event
    return stream.result
  },
})

export function fromModel(provider: Model): Attempt {
  return flow({
    name: provider.name,
    parse: typed<ModelRequest>(),
    deps: { provider: controller(provider) },
    factory: (ctx, { provider }) => provider.exec({ input: ctx.input }),
  })
}

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
  readonly deps?: D & {
    readonly runtime?: never
    readonly engine?: never
    readonly authority?: never
    readonly branch?: never
    readonly epoch?: never
  }
}

export function tool<
  Output,
  const Schema extends StandardSchemaV1,
  Fault = never,
  Yield = never,
  const D extends Record<string, Lite.ResourceDependency> = Record<string, never>,
>(options: ToolOptions<Output, Schema, Fault, Yield, D>): Lite.Resource<
  ResolvedTool<Output, StandardSchemaV1.InferOutput<Schema>, Fault, Yield>
> {
  return resource({
    name: options.name,
    ownership: "current",
    deps: {
      ...options.deps,
      runtime: session.session,
      engine: tags.required(validation.engine),
      authority: tags.optional(session.current.authority),
      branch: tags.optional(session.current.branch),
      epoch: tags.optional(session.current.epoch),
    },
    factory: (_ctx, deps) => {
      const identity: session.ToolIdentity = {
        id: options.name,
        version: options.version,
        schemaDigest: deps.engine.schemaDigest(options.input),
        validationEngine: deps.engine.id,
        readiness: "ready",
        flow: options.flow.name ?? options.name,
      }
      const authority = deps.authority ?? deps.runtime.authority
      const epoch = deps.epoch ?? deps.runtime.record.nextEventSequence
      const permit = authority.tools.includes(identity.id)
        ? deps.runtime.tools.permit(identity, authority, epoch)
        : undefined
      return Object.freeze({
        snapshot: Object.freeze({
          identity,
          name: options.name,
          description: options.description,
          inputSchema: deps.engine.jsonSchema(options.input),
          authorityFingerprint: permit?.authorityFingerprint ?? authority.fingerprint,
          permitEpoch: permit?.epoch ?? epoch,
          branchId: (deps.branch ?? deps.runtime.branches.current()).id,
          snapshotEpoch: epoch,
        }),
        schema: options.input,
        flow: options.flow,
      })
    },
  })
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

export interface SkillOptions<D extends Record<string, Lite.ResourceDependency>> {
  readonly name: string
  readonly version: string
  readonly description: string
  readonly content: string | Lite.Flow<string, void>
  readonly deps?: D & { readonly runtime?: never }
}

export interface ResolvedSkill {
  readonly name: string
  readonly version: string
  readonly description: string
  readonly content: Lite.Flow<string, void>
}

export function skill<const D extends Record<string, Lite.ResourceDependency> = Record<string, never>>(
  options: SkillOptions<D>,
): Lite.Resource<ResolvedSkill> {
  const content = typeof options.content === "string"
    ? flow({ name: `${options.name}.content`, factory: () => options.content as string })
    : options.content
  return resource({
    name: options.name,
    ownership: "current",
    deps: { ...options.deps, runtime: session.session },
    factory: () => Object.freeze({
      name: options.name,
      version: options.version,
      description: options.description,
      content,
    }),
  })
}

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
  readonly run: Lite.Flow<Output, session.RunInput<Input>, Fault, Yield | session.SessionEvent>
}

export function subagent<Output, Input, Fault = never, Yield = never>(
  options: SubagentOptions<Output, Input, Fault, Yield>,
): SubagentDefinition<Output, Input, Fault, Yield> {
  return Object.freeze({ ...options, run: session.run({ name: options.name, turn: options.turn }) })
}

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
>(options: RoleOptions<Tools, Skills, Subagents>): Lite.Resource<Role> {
  const toolEntries = Object.entries(options.tools ?? {})
  const skillEntries = Object.entries(options.skills ?? {})
  const deps = Object.fromEntries([
    ...toolEntries.map(([name, dependency]) => [`tool:${name}`, dependency]),
    ...skillEntries.map(([name, dependency]) => [`skill:${name}`, dependency]),
    ["runtime", session.session],
    ["authority", tags.optional(session.current.authority)],
  ]) as Record<string, Lite.ResourceDependency>
  return resource({
    name: options.name,
    ownership: "current",
    deps,
    factory: (_ctx, resolved) => {
      const authority = (resolved["authority"] as session.Authority | undefined)
        ?? (resolved["runtime"] as session.SessionRuntime).authority
      const tools = toolEntries
        .map(([name]) => resolved[`tool:${name}`] as AnyResolvedTool)
        .filter((tool) => authority.tools.includes(tool.snapshot.identity.id))
      const skills = skillEntries.map(([name]) => resolved[`skill:${name}`] as ResolvedSkill)
      const subagents = Object.values(options.subagents ?? {})
      assertUnique([...tools, ...skills, ...subagents])
      return Object.freeze({
        name: options.name,
        version: options.version,
        ...(options.description === undefined ? {} : { description: options.description }),
        instructions: options.instructions ?? "",
        maxRounds: options.maxRounds ?? 4,
        tools,
        skills,
        subagents,
      })
    },
  })
}

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
  readonly events: readonly session.SessionEvent[]
}

export interface TurnOptions {
  readonly name: string
  readonly role: Lite.Resource<Role>
}

export function turn(options: TurnOptions): Lite.Flow<TurnResult, TurnInput, never, session.SessionEvent> {
  return flow({
    name: options.name,
    parse: typed<TurnInput>(),
    deps: {
      role: options.role,
      invoke: controller(invoke),
      runtime: session.session,
      engine: tags.required(validation.engine),
      work: tags.optional(session.current.work),
      attempt: tags.optional(session.current.attempt),
      branch: tags.optional(session.current.branch),
      epoch: tags.optional(session.current.epoch),
      signal: tags.optional(abortSignal),
    },
    factory: async function* (ctx, deps): AsyncGenerator<session.SessionEvent, TurnResult, unknown> {
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
      const bound: BoundSession = {
        work: deps.work,
        attempt: deps.attempt,
        branch: deps.branch ?? deps.runtime.branches.current(),
        epoch: deps.epoch ?? deps.attempt?.snapshotEpoch ?? 0,
      }
      const toolAuthority = bound.work?.authority ?? deps.runtime.authority
      const tools = deps.role.tools.flatMap((tool) => bindTool(tool, deps.runtime, bound, toolAuthority))

      try {
        const roleStarted = sessionEvent(bound, deps.runtime, "agent_role_start", deps.role.name, 0, undefined, deps.role.name)
        events.push(roleStarted)
        yield roleStarted
        deps.signal?.throwIfAborted()

        for (let round = 0; round < deps.role.maxRounds; round++) {
          rounds = round + 1
          if (bound.work) {
            for (const control of deps.runtime.controls.drain(bound.work.id, controlSequence)) {
              controlSequence = control.sequence
              const controlled = sessionEvent(
                bound,
                deps.runtime,
                "agent_control",
                deps.role.name,
                round,
                control,
                control.source,
              )
              events.push(controlled)
              yield controlled
              deps.signal?.throwIfAborted()
              if (control.mode === "queue" || control.mode === "input") {
                messages.push({ role: "user", name: "steering", content: stringify(control.payload) })
              }
            }
          }
          const invocation = beginInvocation(bound, deps.runtime, activeInvocations, "model", deps.role.name, round)
          const started = sessionEvent(
            bound,
            deps.runtime,
            "agent_model_start",
            deps.role.name,
            round,
            undefined,
            deps.role.name,
            invocation.id,
          )
          events.push(started)
          yield started
          let response: ModelResponse
          try {
            deps.signal?.throwIfAborted()
            const stream = deps.invoke.execStream({
              input: {
                agentName: deps.role.name,
                instructions: deps.role.instructions,
                messages,
                tools: tools.map(toolCapability),
                skills: deps.role.skills.map(skillCapability),
                loadedSkills,
                subagents: deps.role.subagents.map(subagentCapability),
                round,
              },
            })
            for await (const delta of stream) {
              const event = sessionEvent(
                bound,
                deps.runtime,
                `model.${delta.type}`,
                deps.role.name,
                round,
                delta,
                deps.role.name,
                invocation.id,
              )
              events.push(event)
              yield event
              deps.signal?.throwIfAborted()
            }
            response = await stream.result
            deps.signal?.throwIfAborted()
            settleInvocation(deps.runtime, activeInvocations, invocation.id, "completed")
          } catch (error) {
            settleInvocation(deps.runtime, activeInvocations, invocation.id, isAbort(error) ? "cancelled" : "failed")
            throw error
          }
          content = response.content
          if (content) messages.push({ role: "assistant", content })

          for (const call of response.skillCalls ?? []) {
            const selected = findByName(deps.role.skills, call.name, "skill")
            const selectedInvocation = beginInvocation(bound, deps.runtime, activeInvocations, "skill", selected.name, round)
            const selectedStarted = sessionEvent(
              bound, deps.runtime, "agent_skill_start", deps.role.name, round, call, selected.name, selectedInvocation.id,
            )
            events.push(selectedStarted)
            yield selectedStarted
            let loaded: string
            try {
              deps.signal?.throwIfAborted()
              loaded = await ctx.exec({ flow: selected.content })
              deps.signal?.throwIfAborted()
              settleInvocation(deps.runtime, activeInvocations, selectedInvocation.id, "completed")
            } catch (error) {
              settleInvocation(deps.runtime, activeInvocations, selectedInvocation.id, isAbort(error) ? "cancelled" : "failed")
              throw error
            }
            skillResults.push({ name: selected.name, ...(call.id === undefined ? {} : { callId: call.id }), content: loaded })
            loadedSkills.push({ name: selected.name, description: selected.description, content: loaded })
            messages.push({ role: "skill", name: selected.name, content: loaded, ...(call.id === undefined ? {} : { id: call.id }) })
            const selectedEnded = sessionEvent(
              bound, deps.runtime, "agent_skill_end", deps.role.name, round, loaded, selected.name, selectedInvocation.id,
            )
            events.push(selectedEnded)
            yield selectedEnded
            deps.signal?.throwIfAborted()
          }

          for (const call of response.toolCalls ?? []) {
            const selected = findByName(tools, call.name, "tool")
            const selectedInvocation = beginInvocation(bound, deps.runtime, activeInvocations, "tool", selected.snapshot.name, round)
            const selectedStarted = sessionEvent(
              bound, deps.runtime, "agent_tool_start", deps.role.name, round, call.input, selected.snapshot.name, selectedInvocation.id,
            )
            events.push(selectedStarted)
            yield selectedStarted
            let output: unknown
            try {
              deps.signal?.throwIfAborted()
              if (
                selected.snapshot.authorityFingerprint !== toolAuthority.fingerprint
                || selected.snapshot.permitEpoch !== bound.epoch
                || !toolAuthority.tools.includes(selected.snapshot.identity.id)
              ) throw new session.AuthorityEscalationError("tools")
              deps.runtime.tools.authorize(
                selected.snapshot.identity,
                selected.snapshot.permitEpoch,
                selected.snapshot.authorityFingerprint,
              )
              const parsed = await deps.engine.validate(selected.schema, call.input)
              if (parsed.issues) throw new ToolInputError(selected.snapshot.name, parsed.issues)
              deps.signal?.throwIfAborted()
              output = await ctx.exec({ flow: selected.flow as Lite.Flow<unknown, unknown>, rawInput: parsed.value })
              deps.signal?.throwIfAborted()
              settleInvocation(deps.runtime, activeInvocations, selectedInvocation.id, "completed")
            } catch (error) {
              settleInvocation(deps.runtime, activeInvocations, selectedInvocation.id, isAbort(error) ? "cancelled" : "failed")
              throw error
            }
            toolResults.push({ name: selected.snapshot.name, ...(call.id === undefined ? {} : { callId: call.id }), input: call.input, output })
            messages.push({ role: "tool", name: selected.snapshot.name, content: stringify(output), ...(call.id === undefined ? {} : { id: call.id, input: call.input }) })
            const selectedEnded = sessionEvent(
              bound, deps.runtime, "agent_tool_end", deps.role.name, round, output, selected.snapshot.name, selectedInvocation.id,
            )
            events.push(selectedEnded)
            yield selectedEnded
            deps.signal?.throwIfAborted()
          }

          for (const call of response.subagentCalls ?? []) {
            const selected = findByName(deps.role.subagents, call.name, "subagent")
            const parent = bound.work
            const branch = bound.branch
            const workId = call.id ?? `${parent?.id ?? "work"}.${selected.name}.${round}`
            const selectedInvocation = beginInvocation(bound, deps.runtime, activeInvocations, "subagent", selected.name, round)
            const selectedStarted = sessionEvent(
              bound, deps.runtime, "agent_subagent_start", deps.role.name, round, call.input, selected.name, selectedInvocation.id,
            )
            events.push(selectedStarted)
            yield selectedStarted
            let output: TurnResult
            try {
              deps.signal?.throwIfAborted()
              output = await ctx.exec({
                flow: selected.run as Lite.Flow<TurnResult, session.RunInput<TurnInput>>,
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
              deps.signal?.throwIfAborted()
              settleInvocation(deps.runtime, activeInvocations, selectedInvocation.id, "completed")
            } catch (error) {
              settleInvocation(deps.runtime, activeInvocations, selectedInvocation.id, isAbort(error) ? "cancelled" : "failed")
              throw error
            }
            subagentResults.push({ name: selected.name, workId, input: call.input, output })
            messages.push({ role: "subagent", name: selected.name, content: output.content, ...(call.id === undefined ? {} : { id: call.id, input: call.input }) })
            const selectedEnded = sessionEvent(
              bound, deps.runtime, "agent_subagent_end", deps.role.name, round, output, selected.name, selectedInvocation.id,
            )
            events.push(selectedEnded)
            yield selectedEnded
            deps.signal?.throwIfAborted()
          }

          const ended = sessionEvent(
            bound,
            deps.runtime,
            "agent_model_end",
            deps.role.name,
            round,
            response,
            deps.role.name,
            invocation.id,
          )
          events.push(ended)
          yield ended
          deps.signal?.throwIfAborted()
          const queued = bound.work
            ? deps.runtime.controls.drain(bound.work.id, controlSequence).some(
                (control) => control.mode === "queue" || control.mode === "input",
              )
            : false
          if ((response.stop === true || noCalls(response)) && !queued) break
        }

        const roleEnded = sessionEvent(bound, deps.runtime, "agent_role_end", deps.role.name, rounds, undefined, deps.role.name)
        events.push(roleEnded)
        yield roleEnded

        return {
          role: deps.role.name,
          content,
          messages,
          rounds,
          toolResults,
          skillResults,
          subagentResults,
          events,
        }
      } finally {
        for (const id of activeInvocations) deps.runtime.invocations.settle(id, "cancelled")
      }
    },
  })
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

function subagentCapability(value: AnySubagentDefinition): Capability {
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
  if (Array.isArray(value)) return value.map((item) => json(item, seen))
  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]"
    seen.add(value)
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, json(item, seen)]))
  }
  return String(value)
}

import { flow, tag, tags, typed, type Lite } from "@pumped-fn/lite"
import {
  extension as suspenseExtension,
  formatSuspenseStepKey,
  stepCounter,
  type SuspenseEventLog,
  type SuspenseExecEvent,
  type SuspenseStepCounter,
  type SuspenseStepEntry,
  type SuspenseStepKey,
} from "@pumped-fn/lite-extension-suspense"
import type { TurnInput, TurnResult } from "./agent.js"
import { model } from "./model.js"

export { model }

export type WorkerKind = "code" | "llm" | "cli" | string

export type StepCounter = SuspenseStepCounter
export type WorkflowStepKey = SuspenseStepKey
export type WorkflowStepEntry = SuspenseStepEntry
export type WorkflowEventLog = SuspenseEventLog
export type WorkflowExecEvent = SuspenseExecEvent
/** Describes a traced execution offered to a remote runner. */
export interface ExecEvent {
  readonly key?: WorkflowStepKey
  readonly target: Lite.ExecTarget
  readonly ctx: Lite.ExecutionContext
  readonly targetName: string
  readonly input: unknown
}
/** Configures workflow, remote, durability, worker kind, and timeout behavior for a step. */
export interface Step {
  workflow?: boolean
  remote?: boolean
  durable?: boolean
  kind?: WorkerKind
  timeoutMs?: number
}

export { SuspendSignal, SuspenseSignal } from "@pumped-fn/lite-extension-suspense"

/** Delegates a traced execution while preserving the local continuation. */
export interface RemoteRunner {
  run(event: ExecEvent, next: () => Promise<unknown>): Promise<unknown>
}

/** Configures workflow event storage and fallback task and run identities. */
export interface WorkflowExtensionOptions {
  log: WorkflowEventLog
  defaultTaskId?: string
  defaultRunId?: string
}

/** Configures optional remote execution for the SDK extension. */
export interface ExtensionOptions {
  remoteRunner?: RemoteRunner
}

export const step = tag<Step>({ label: "agent.step", default: {} })

export function formatStepKey(key: WorkflowStepKey): string {
  return formatSuspenseStepKey(key)
}

/** Identifies the task and run attached to an execution scope. */
export interface WorkflowRunOptions {
  taskId: string
  runId: string
}

/** Exposes the task and run identity resolved for workflow execution. */
export interface WorkflowContext {
  readonly taskId: string
  readonly runId: string
}

/** Exposes the task and run identity resolved for agent execution. */
export interface Runtime {
  readonly taskId: string
  readonly runId: string
}

export const workflowRun = tag<WorkflowRunOptions>({ label: "workflow.run" })
export const workflow = tag<WorkflowContext>({ label: "workflow.runtime" })
export const runtime = tag<Runtime>({ label: "agent.runtime" })
export const abortSignal = tag<AbortSignal>({ label: "workflow.abortSignal" })

const activeWorkflowEvent = tag<WorkflowExecEvent>({ label: "workflow.event" })

export function workflowExtension(options: WorkflowExtensionOptions): Lite.Extension {
  const base = createWorkflowExtension({
    name: "workflow",
    options,
    shouldHandle: shouldHandleWorkflowTarget,
    run: (event, next) => runTimer(event.target, event.ctx, next),
  })

  return {
    ...base,
    async wrapExec(next, target, ctx) {
      const wrapExec = base.wrapExec
      if (!wrapExec) return withRuntimeTag(ctx, workflow, workflowRuntimeOf(ctx, options), next)
      return withRuntimeTag(ctx, workflow, workflowRuntimeOf(ctx, options), () => wrapExec(next, target, ctx))
    },
  }
}

export function extension(options: ExtensionOptions = {}): Lite.Extension {
  return {
    name: "sdk",
    async wrapExec(next, target, ctx) {
      return withRuntimeTag(ctx, runtime, runtimeOf(ctx), async () => {
        if (stepOf(target, ctx).remote !== true) return next()
        if (!options.remoteRunner) throw new Error("Remote step requires remoteRunner")
        return options.remoteRunner.run(execEvent(target, ctx), next)
      })
    },
  }
}

function createWorkflowExtension(options: {
  name: string
  options: WorkflowExtensionOptions
  shouldHandle(target: Lite.ExecTarget, ctx: Lite.ExecutionContext): boolean
  run(event: WorkflowExecEvent, next: () => Promise<unknown>): Promise<unknown>
}): Lite.Extension {
  return suspenseExtension({
    name: options.name,
    log: options.options.log,
    defaultTaskId: options.options.defaultTaskId,
    defaultRunId: options.options.defaultRunId,
    getKey: (ctx) => nextWorkflowKey(ctx, options.options),
    shouldHandle: options.shouldHandle,
    shouldSuspend: (event) => {
      const config = stepOf(event.target, event.ctx)
      return config.durable === true && config.remote !== true
    },
    createPendingEntry: (event) => ({
      status: "pending",
      key: event.key,
      targetName: event.targetName,
      input: event.input,
      kind: "durable",
    }),
    run: (event, next) => {
      const previous = event.ctx.data.getTag(activeWorkflowEvent)
      event.ctx.data.setTag(activeWorkflowEvent, event)
      return options.run(event, next).finally(() => {
        if (previous) event.ctx.data.setTag(activeWorkflowEvent, previous)
        else event.ctx.data.deleteTag(activeWorkflowEvent)
      })
    },
  })
}

function execEvent(target: Lite.ExecTarget, ctx: Lite.ExecutionContext): ExecEvent {
  const workflowEvent = ctx.data.seekTag(activeWorkflowEvent)
  return workflowEvent ?? {
    target,
    ctx,
    targetName: targetNameOf(target, ctx),
    input: ctx.input,
  }
}

function nextWorkflowKey(
  ctx: Lite.ExecutionContext,
  options: Pick<WorkflowExtensionOptions, "defaultTaskId" | "defaultRunId">
): WorkflowStepKey {
  const config = ctx.data.seekTag(workflowRun)
  const foundTaskId = config?.taskId ?? options.defaultTaskId ?? "default-task"
  const foundRunId = config?.runId ?? options.defaultRunId ?? "default-run"
  let counter = ctx.data.seekTag(stepCounter)
  if (!counter) {
    counter = { next: 0 }
    rootContext(ctx).data.setTag(stepCounter, counter)
  }
  return { taskId: foundTaskId, runId: foundRunId, step: counter.next++ }
}

function workflowRuntimeOf(
  ctx: Lite.ExecutionContext,
  options: Pick<WorkflowExtensionOptions, "defaultTaskId" | "defaultRunId">
): WorkflowContext {
  const config = ctx.data.seekTag(workflowRun)
  return {
    taskId: config?.taskId ?? options.defaultTaskId ?? "default-task",
    runId: config?.runId ?? options.defaultRunId ?? "default-run",
  }
}

function runtimeOf(ctx: Lite.ExecutionContext): Runtime {
  const config = ctx.data.seekTag(workflow)
  if (!config) throw new Error("agent extension requires workflow extension")
  return {
    taskId: config.taskId,
    runId: config.runId,
  }
}

function withRuntimeTag<T, R>(
  ctx: Lite.ExecutionContext,
  runtimeTag: Lite.Tag<T, boolean>,
  value: T,
  next: () => Promise<R>
): Promise<R> {
  const hadPrevious = ctx.data.hasTag(runtimeTag)
  const previous = ctx.data.getTag(runtimeTag)
  ctx.data.setTag(runtimeTag, value)
  return next().finally(() => {
    if (hadPrevious) ctx.data.setTag(runtimeTag, previous as T)
    else ctx.data.deleteTag(runtimeTag)
  })
}

function shouldHandleWorkflowTarget(target: Lite.ExecTarget, ctx: Lite.ExecutionContext): boolean {
  const config = stepOf(target, ctx)
  return (
    config.workflow === true ||
    config.durable === true ||
    config.timeoutMs !== undefined
  )
}

function rootContext(ctx: Lite.ExecutionContext): Lite.ExecutionContext {
  let current = ctx
  while (current.parent) current = current.parent
  return current
}

function targetNameOf(target: Lite.ExecTarget, ctx: Lite.ExecutionContext): string {
  const name = ctx.name || target.name
  if (!name) throw new Error("Agent target must have a name")
  return name
}

function runTimer(target: Lite.ExecTarget, ctx: Lite.ExecutionContext, next: () => Promise<unknown>): Promise<unknown> {
  const timeoutMs = stepOf(target, ctx).timeoutMs
  if (timeoutMs === undefined) return next()
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  return withRuntimeTag(ctx, abortSignal, controller.signal, () =>
    Promise.race([
      next(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`Workflow step timed out after ${timeoutMs}ms`)
          controller.abort(error)
          reject(error)
        }, timeoutMs)
      }),
    ])
  ).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

function stepOf(target: Lite.ExecTarget, ctx: Lite.ExecutionContext): Step {
  const flowStep = typeof target === "function" ? {} : step.find(target)
  return { ...flowStep, ...(ctx.data.seekTag(step) ?? {}) }
}

/** Maps a host path into an isolated CLI worker with explicit access mode. */
export interface CliBind {
  source: string
  target?: string
  mode?: "ro" | "rw"
}

/** Configures filesystem, environment, write, and network isolation for a CLI worker. */
export interface CliIsolateOptions {
  bwrap?: string
  workdir?: string
  home?: string
  codexHome?: string
  writable?: boolean
  network?: boolean
  bind?: readonly CliBind[]
  env?: Record<string, string | undefined>
}

/** Captures a CLI worker's output, exit code, and terminating signal. */
export interface CliResult {
  stdout: string
  stderr: string
  exitCode: number | null
  signal: string | null
}

export class CliWorkerError extends Error {
  override readonly name = "CliWorkerError"

  constructor(message: string, readonly result: CliResult) {
    super(message)
  }
}

/** Defines the command, process environment, isolation, timeout, and cancellation for a CLI run. */
export interface RunCliOptions {
  command: string
  args?: readonly string[]
  stdin?: string
  cwd?: string
  env?: Record<string, string | undefined>
  isolate?: boolean | CliIsolateOptions
  timeoutMs?: number
  signal?: AbortSignal
}

export async function runCli(options: RunCliOptions): Promise<CliResult> {
  const { execFile } = await import("node:child_process")
  const prepared = await prepareCli(options)
  return new Promise((resolve, reject) => {
    const child = execFile(prepared.command, [...prepared.args], {
      cwd: prepared.cwd,
      env: prepared.env,
      timeout: options.timeoutMs,
      signal: options.signal,
    }, async (error, stdout, stderr) => {
      await prepared.cleanup()
      const execError = error as ExecFileError | null
      const exitCode = typeof execError?.code === "number" ? execError.code : error ? null : 0
      const signal = execError?.signal ?? null
      const result = { stdout: String(stdout), stderr: String(stderr), exitCode, signal }
      if (execError?.killed && options.timeoutMs !== undefined) {
        reject(new CliWorkerError(`CLI command timed out after ${options.timeoutMs}ms`, result))
        return
      }
      if (execError?.name === "AbortError") {
        reject(new CliWorkerError("CLI command aborted", result))
        return
      }
      if (error) {
        const label = exitCode === null ? error.message : `CLI command failed with exit code ${exitCode}`
        reject(new CliWorkerError(label, result))
        return
      }
      resolve(result)
    })

    child.stdin?.end(options.stdin)
  })
}

interface PreparedCli {
  command: string
  args: readonly string[]
  cwd?: string
  env: Record<string, string | undefined>
  cleanup(): Promise<void>
}

interface PreparedBind {
  source: string
  target: string
  mode: "ro" | "rw"
}

async function prepareCli(options: RunCliOptions): Promise<PreparedCli> {
  if (!options.isolate) {
    return {
      command: options.command,
      args: options.args ?? [],
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      cleanup: async () => undefined,
    }
  }
  return prepareIsolatedCli(options, typeof options.isolate === "boolean" ? {} : options.isolate)
}

async function prepareIsolatedCli(options: RunCliOptions, isolate: CliIsolateOptions): Promise<PreparedCli> {
  const { mkdtemp, rm, realpath } = await import("node:fs/promises")
  const { existsSync } = await import("node:fs")
  const { dirname, join, resolve } = await import("node:path")
  const { tmpdir } = await import("node:os")
  const hostCwd = resolve(options.cwd ?? process.cwd())
  const workdir = isolate.workdir ?? "/workspace"
  const tempDirs: string[] = []
  const home = isolate.home ?? await mkdtemp(join(tmpdir(), "pumped-fn-home-"))
  if (!isolate.home) tempDirs.push(home)
  const binds = new Map<string, PreparedBind>()
  addBind(binds, hostCwd, workdir, isolate.writable === true ? "rw" : "ro")
  addBind(binds, home, "/home/agent", "rw")
  if (isolate.codexHome) addBind(binds, isolate.codexHome, "/codex-home", "rw")
  const commandPath = await commandPathOf(options.command, process.env["PATH"] ?? "", existsSync, realpath)
  const nodePath = await realpath(process.execPath)
  for (const dir of defaultCliDirs(existsSync)) addBind(binds, dir, dir, "ro")
  for (const dir of defaultCliCertDirs(existsSync)) addBind(binds, dir, dir, "ro")
  for (const file of defaultCliFiles(existsSync)) addBind(binds, file, file, "ro")
  if (commandPath) {
    addBind(binds, dirname(commandPath), dirname(commandPath), "ro")
    addBind(binds, dirname(dirname(commandPath)), dirname(dirname(commandPath)), "ro")
  }
  addBind(binds, dirname(nodePath), dirname(nodePath), "ro")
  addBind(binds, dirname(dirname(nodePath)), dirname(dirname(nodePath)), "ro")
  for (const bind of isolate.bind ?? []) addBind(binds, bind.source, bind.target ?? bind.source, bind.mode ?? "ro")
  const env = {
    PATH: isolatedPathEnv(commandPath, nodePath, dirname),
    HOME: "/home/agent",
    TMPDIR: "/tmp",
    ...(isolate.codexHome ? { CODEX_HOME: "/codex-home" } : {}),
    ...options.env,
    ...isolate.env,
  }
  return {
    command: isolate.bwrap ?? "bwrap",
    args: [
      "--die-with-parent",
      "--unshare-all",
      ...(isolate.network === true ? ["--share-net"] : []),
      "--proc",
      "/proc",
      "--dev",
      "/dev",
      "--tmpfs",
      "/tmp",
      "--dir",
      "/etc",
      "--dir",
      "/home",
      ...Object.entries(env).flatMap(([key, value]) => value === undefined ? [] : ["--setenv", key, value]),
      ...[...binds.values()].flatMap((bind) => [bind.mode === "rw" ? "--bind" : "--ro-bind", bind.source, bind.target]),
      "--chdir",
      workdir,
      "--",
      commandPath ?? options.command,
      ...(options.args ?? []),
    ],
    env: { PATH: process.env["PATH"] },
    cleanup: async () => {
      await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
    },
  }
}

function addBind(
  binds: Map<string, PreparedBind>,
  source: string,
  target: string,
  mode: "ro" | "rw"
): void {
  binds.set(`${source}\u0000${target}`, { source, target, mode })
}

function defaultCliDirs(exists: (path: string) => boolean): string[] {
  return [
    "/usr/bin",
    "/bin",
    "/usr/lib",
    "/usr/lib64",
    "/lib",
    "/lib64",
  ].filter((path, index, items) => items.indexOf(path) === index && exists(path))
}

function defaultCliCertDirs(exists: (path: string) => boolean): string[] {
  return [
    "/etc/ssl",
    "/etc/pki",
    "/etc/ca-certificates",
    "/usr/share/ca-certificates",
    "/usr/local/share/ca-certificates",
  ].filter((path, index, items) => items.indexOf(path) === index && exists(path))
}

function defaultCliFiles(exists: (path: string) => boolean): string[] {
  return [
    "/etc/hosts",
    "/etc/resolv.conf",
  ].filter((path, index, items) => items.indexOf(path) === index && exists(path))
}

function isolatedPathEnv(
  commandPath: string | undefined,
  nodePath: string,
  dirname: (path: string) => string
): string {
  return [
    commandPath ? dirname(commandPath) : undefined,
    dirname(nodePath),
    "/usr/bin",
    "/bin",
  ].filter((path, index, items): path is string =>
    path !== undefined && items.indexOf(path) === index
  ).join(":")
}

async function commandPathOf(
  command: string,
  pathEnv: string,
  exists: (path: string) => boolean,
  realpath: (path: string) => Promise<string>
): Promise<string | undefined> {
  if (command.includes("/")) return realpath(command)
  const found = pathEnv
    .split(":")
    .filter(Boolean)
    .map((dir) => `${dir}/${command}`)
    .find((path) => exists(path))
  return found ? realpath(found) : undefined
}

type ExecFileError = Error & {
  code?: string | number | null
  signal?: string | null
  killed?: boolean
}

/** Supplies plain prompt text to a prompt-backed flow. */
export interface PromptInput {
  prompt: string
}

export function formatModelPrompt(request: ModelRequest): string {
  return [
    "Return JSON only.",
    "Schema: {\"content\":string,\"stop\"?:boolean,\"skillCalls\"?:array,\"toolCalls\"?:array,\"subagentCalls\"?:array}.",
    `Agent: ${request.agentName}`,
    request.instructions ? `Instructions:\n${request.instructions}` : undefined,
    request.skills.length ? `Available skills:\n${request.skills.map(formatCapability).join("\n")}` : undefined,
    request.loadedSkills.length ? `Loaded skills:\n${request.loadedSkills.map(formatLoadedSkill).join("\n\n")}` : undefined,
    request.tools.length ? `Available tools:\n${request.tools.map(formatCapability).join("\n")}` : undefined,
    request.subagents.length ? `Available subagents:\n${request.subagents.map(formatCapability).join("\n")}` : undefined,
    `Round: ${request.round}`,
    `Messages:\n${request.messages.map(formatMessage).join("\n")}`,
  ].filter((item) => item !== undefined).join("\n\n")
}

export function parseModelResponse(output: string): ModelResponse {
  const value = readJson(output)
  if (!isRecord(value)) return { content: output, stop: true }
  const response: ModelResponse = {
    content: typeof value["content"] === "string" ? value["content"] : output,
    stop: typeof value["stop"] === "boolean" ? value["stop"] : true,
  }
  const guard = guardTextOf(value["guard"] ?? value["antiGoal"])
  const skillCalls = skillCallsOf(value["skillCalls"])
  const toolCalls = toolCallsOf(value["toolCalls"])
  const subagentCalls = subagentCallsOf(value["subagentCalls"])
  if (guard) response.guard = guard
  if (skillCalls) response.skillCalls = skillCalls
  if (toolCalls) response.toolCalls = toolCalls
  if (subagentCalls) response.subagentCalls = subagentCalls
  return response
}

function readJson(output: string): unknown {
  const trimmed = output.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    const start = trimmed.indexOf("{")
    const end = trimmed.lastIndexOf("}")
    if (start === -1 || end <= start) return undefined
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as unknown
    } catch {
      return undefined
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function skillCallsOf(value: unknown): SkillCall[] | undefined {
  if (!Array.isArray(value)) return undefined
  const calls = value.flatMap((item) => {
    if (!isRecord(item) || typeof item["name"] !== "string") return []
    return [{
      name: item["name"],
      ...(typeof item["id"] === "string" ? { id: item["id"] } : {}),
    }]
  })
  return calls.length ? calls : undefined
}

function toolCallsOf(value: unknown): ToolCall[] | undefined {
  if (!Array.isArray(value)) return undefined
  const calls = value.flatMap((item) => {
    if (!isRecord(item) || typeof item["name"] !== "string") return []
    return [{
      name: item["name"],
      input: item["input"],
      ...(typeof item["id"] === "string" ? { id: item["id"] } : {}),
    }]
  })
  return calls.length ? calls : undefined
}

function subagentCallsOf(value: unknown): SubCall[] | undefined {
  if (!Array.isArray(value)) return undefined
  const calls = value.flatMap((item) => {
    if (!isRecord(item) || typeof item["name"] !== "string") return []
    return [{
      name: item["name"],
      input: turnInputOf(item["input"]),
      ...(typeof item["id"] === "string" ? { id: item["id"] } : {}),
    }]
  })
  return calls.length ? calls : undefined
}

function turnInputOf(value: unknown): TurnInput {
  if (isRecord(value)) return value as TurnInput
  return { prompt: stringifyAgentValue(value) }
}

function guardTextOf(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function formatCapability(capability: Capability): string {
  const schema = capability.inputSchema === undefined
    ? ""
    : `\n  Input schema: ${JSON.stringify(canonicalJson(capability.inputSchema))}`
  return `- ${capability.name}: ${capability.description}${schema}`
}

function canonicalJson(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map(canonicalJson)
  return Object.fromEntries(Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => compareUtf8(left, right))
    .map(([key, entry]) => [key, canonicalJson(entry)]))
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

function formatLoadedSkill(skill: LoadedSkill): string {
  return `## ${skill.name}\n${skill.content}`
}

function formatMessage(message: Message): string {
  return message.name ? `${message.role}(${message.name}): ${message.content}` : `${message.role}: ${message.content}`
}

type MaybePromise<T> = T | Promise<T>

export type Role = "system" | "user" | "assistant" | "tool" | "subagent" | "skill"

/** Represents one model conversation message and optional call metadata. */
export interface Message {
  role: Role
  content: string
  name?: string
  id?: string
  input?: unknown
}

/** Requests a named tool with unvalidated input from a model response. */
export interface ToolCall {
  name: string
  input: unknown
  id?: string
}

/** Requests a named subagent turn from a model response. */
export interface SubCall {
  name: string
  input: TurnInput
  id?: string
}

/** Requests loading a named skill from a model response. */
export interface SkillCall {
  name: string
  id?: string
}

/** Represents normalized model content and requested capability calls. */
export interface ModelResponse {
  content: string
  guard?: string
  skillCalls?: readonly SkillCall[]
  toolCalls?: readonly ToolCall[]
  subagentCalls?: readonly SubCall[]
  stop?: boolean
}

/** Supplies role context, conversation state, capabilities, and round to a model. */
export interface ModelRequest {
  agentName: string
  instructions: string
  messages: readonly Message[]
  tools: readonly Capability[]
  skills: readonly Capability[]
  loadedSkills: readonly LoadedSkill[]
  subagents: readonly Capability[]
  round: number
}

export type Model = Lite.Flow<ModelResponse, ModelRequest>

/** Describes a model-visible tool, skill, or subagent capability. */
export interface Capability {
  name: string
  description: string
  inputSchema?: boolean | Readonly<Record<string, unknown>>
}

/** Represents skill content loaded into the current model request. */
export interface LoadedSkill {
  readonly name: string
  readonly description?: string
  readonly content: string
}

export const complete = flow({
  name: "model.complete",
  parse: typed<ModelRequest>(),
  deps: { impl: tags.required(model) },
  tags: [step({ workflow: true, kind: "llm" })],
  factory: (ctx, { impl }) => impl.exec({ input: ctx.input }),
})

/** Reports the outcome and optional details of a deterministic evaluation check. */
export interface EvalCheckResult {
  name: string
  passed: boolean
  details?: string
}

export type EvalCheck = (result: TurnResult) => MaybePromise<EvalCheckResult>

/** Reports a named judge verdict with optional score and reason. */
export interface JudgeResult {
  name: string
  passed: boolean
  score?: number
  reason?: string
}

/** Defines an independent evaluator for a completed agent turn. */
export interface Judge {
  name: string
  evaluate(ctx: Lite.ExecutionContext, result: TurnResult): MaybePromise<JudgeResult>
}

/** Defines one turn input and its deterministic checks. */
export interface EvalCase {
  name: string
  input: TurnInput
  checks?: readonly EvalCheck[]
}

/** Represents a resolved evaluation suite with its turn, cases, and judge quorum. */
export interface Suite {
  name: string
  turn: Lite.Flow<TurnResult, TurnInput>
  cases: readonly EvalCase[]
  judges: readonly Judge[]
}

/** Configures an evaluation suite and its optional judges. */
export interface SuiteOptions {
  name: string
  turn: Lite.Flow<TurnResult, TurnInput>
  cases: readonly EvalCase[]
  judges?: readonly Judge[]
}

/** Collects the turn result and all check and judge verdicts for one case. */
export interface EvalCaseReport {
  name: string
  result: TurnResult
  checks: readonly EvalCheckResult[]
  judges: readonly JudgeResult[]
  passed: boolean
}

/** Collects case reports and the aggregate verdict for an evaluation suite. */
export interface EvalReport {
  name: string
  cases: readonly EvalCaseReport[]
  passed: boolean
}

/** Selects workflow events by task and run identity. */
export interface RunQuery {
  taskId: string
  runId: string
}

/** Projects a stored workflow step and its input, output, and execution kind. */
export interface RunStep {
  key: WorkflowStepKey
  status: WorkflowStepEntry["status"]
  targetName: string
  input?: unknown
  output?: unknown
  kind?: string
}

/** Represents the reconstructed status and steps of a workflow run. */
export interface RunRecord {
  taskId: string
  runId: string
  status: "pending" | "completed"
  steps: readonly RunStep[]
}

/** Provides workflow event storage with task and run filtering. */
export interface RunLog extends WorkflowEventLog {
  entries(query?: Partial<RunQuery>): MaybePromise<readonly WorkflowStepEntry[]>
}

export function judge(options: Judge): Judge {
  return options
}

export function suite(options: SuiteOptions): Suite {
  const judges = options.judges ?? []
  assertJudgeQuorum(judges)
  return {
    name: options.name,
    turn: options.turn,
    cases: options.cases,
    judges,
  }
}

export function includes(text: string): EvalCheck {
  return (result) => ({
    name: `output includes "${text}"`,
    passed: result.content.includes(text),
  })
}

export function used(name: string): EvalCheck {
  return (result) => ({
    name: `tool used "${name}"`,
    passed: result.toolResults.some((call) => call.name === name),
  })
}

export function loaded(name: string): EvalCheck {
  return (result) => ({
    name: `skill loaded "${name}"`,
    passed: result.skillResults.some((call) => call.name === name),
  })
}

export function delegated(name: string): EvalCheck {
  return (result) => ({
    name: `subagent used "${name}"`,
    passed: result.subagentResults.some((call) => call.name === name),
  })
}

export async function runEval(ctx: Lite.ExecutionContext, target: Suite): Promise<EvalReport> {
  assertJudgeQuorum(target.judges)
  const cases: EvalCaseReport[] = []
  for (const item of target.cases) {
    const result = await ctx.exec({ flow: target.turn, input: item.input })
    const checks = await runEvalChecks(result, item.checks ?? [])
    const judges = await runEvalJudges(ctx, result, target.judges)
    cases.push({
      name: item.name,
      result,
      checks,
      judges,
      passed: checks.every((check) => check.passed) && judges.every((judge) => judge.passed),
    })
  }
  return {
    name: target.name,
    cases,
    passed: cases.every((item) => item.passed),
  }
}

export async function inspect(log: RunLog, query: RunQuery): Promise<RunRecord> {
  const entries = (await log.entries(query)).filter((entry) =>
    entry.key.taskId === query.taskId && entry.key.runId === query.runId
  )
  const first = entries[0]
  if (!first) throw new Error("Run not found")
  const steps = entries.map(runStep)
  return {
    taskId: query.taskId,
    runId: query.runId,
    status: steps.some((item) => item.status === "pending") ? "pending" : "completed",
    steps,
  }
}

export function summary(report: EvalReport): Lite.JsonValue {
  return jsonValue({
    name: report.name,
    passed: report.passed,
    cases: report.cases.map((item) => ({
      name: item.name,
      passed: item.passed,
      output: item.result.content,
      checks: item.checks,
      judges: item.judges,
      tools: item.result.toolResults.map((call) => ({ name: call.name, output: call.output })),
      skills: item.result.skillResults.map((call) => ({ name: call.name })),
      subagents: item.result.subagentResults.map((call) => ({ name: call.name, output: call.output.content })),
      events: item.result.events.map((event) => ({
        type: event.type,
        ...(event.agentName === undefined ? {} : { agentName: event.agentName }),
        ...(event.targetName === undefined ? {} : { targetName: event.targetName }),
        ...(event.round === undefined ? {} : { round: event.round }),
      })),
    })),
  })
}

function runStep(entry: WorkflowStepEntry): RunStep {
  if (entry.status === "pending") {
    return {
      key: entry.key,
      status: entry.status,
      targetName: entry.targetName,
      input: entry.input,
      kind: entry.kind,
    }
  }
  if (entry.status === "resolved") {
    return {
      key: entry.key,
      status: entry.status,
      targetName: entry.targetName,
      output: entry.value,
    }
  }
  return {
    key: entry.key,
    status: entry.status,
    targetName: entry.targetName,
    output: entry.result,
  }
}

function stringifyAgentValue(value: unknown): string {
  if (typeof value === "string") return value
  if (value === undefined) return String(value)
  if (typeof value === "bigint" || typeof value === "symbol" || typeof value === "function") return String(value)
  const seen = new WeakSet<object>()
  const serialized = JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === "bigint" || typeof item === "symbol" || typeof item === "function") return String(item)
    if (typeof item === "object" && item !== null) {
      if (seen.has(item)) return "[Circular]"
      seen.add(item)
    }
    return item
  })
  return serialized ?? String(value)
}

function jsonValue(value: unknown, seen = new WeakSet<object>()): Lite.JsonValue {
  if (value === null) return null
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value
  if (value === undefined || typeof value === "bigint" || typeof value === "symbol" || typeof value === "function") return String(value)
  if (Array.isArray(value)) return value.map((item) => jsonValue(item, seen))
  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]"
    seen.add(value)
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, jsonValue(item, seen)]))
  }
  return String(value)
}

async function runEvalChecks(
  result: TurnResult,
  checks: readonly EvalCheck[]
): Promise<EvalCheckResult[]> {
  const results: EvalCheckResult[] = []
  for (const check of checks) results.push(await check(result))
  return results
}

function assertJudgeQuorum(judges: readonly Judge[]): void {
  if (judges.length === 1) throw new Error("Agent evals require zero judges or at least two judges")
}

async function runEvalJudges(
  ctx: Lite.ExecutionContext,
  result: TurnResult,
  judges: readonly Judge[]
): Promise<JudgeResult[]> {
  const results: JudgeResult[] = []
  for (const judge of judges) results.push(await judge.evaluate(ctx, result))
  return results
}

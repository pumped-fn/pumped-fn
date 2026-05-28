import { atom, flow, tag, typed, type Lite } from "@pumped-fn/lite"
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
import { execFile } from "node:child_process"

export type WorkerKind = "code" | "llm" | "cli" | string
export type MaterialKind = "json" | "text" | "binary" | "reference"

export type StepCounter = SuspenseStepCounter
export type WorkflowStepKey = SuspenseStepKey
export type WorkflowStepEntry = SuspenseStepEntry
export type WorkflowEventLog = SuspenseEventLog
export type WorkflowExecEvent = SuspenseExecEvent
export interface AgentExecEvent {
  readonly key?: WorkflowStepKey
  readonly target: Lite.ExecTarget
  readonly ctx: Lite.ExecutionContext
  readonly targetName: string
  readonly input: unknown
}
export interface Step {
  workflow?: boolean
  remote?: boolean
  durable?: boolean
  kind?: WorkerKind
  timeoutMs?: number
}

export { SuspendSignal, SuspenseSignal } from "@pumped-fn/lite-extension-suspense"

export interface AgentRemoteRunner {
  run(event: AgentExecEvent, next: () => Promise<unknown>): Promise<unknown>
}

export interface WorkflowExtensionOptions {
  log: WorkflowEventLog
  defaultTaskId?: string
  defaultRunId?: string
}

export interface AgentExtensionOptions {
  remoteRunner?: AgentRemoteRunner
}

export const step = tag<Step>({ label: "agent.step", default: {} })
export const materialKind = tag<MaterialKind>({ label: "agent.materialKind" })
export const workers = tag<WorkerRegistry>({ label: "agent.workerRegistry" })

export class WorkerRegistry {
  private readonly flows = new Map<string, Lite.Flow<unknown, unknown>>()

  register(flow: Lite.Flow<unknown, unknown>, name = flow.name): this {
    if (!name) throw new Error("Worker flow must have a name")
    this.flows.set(name, flow)
    return this
  }

  get(name: string): Lite.Flow<unknown, unknown> {
    const found = this.flows.get(name)
    if (!found) throw new Error(`Worker "${name}" not registered`)
    return found
  }

  list(): string[] {
    return [...this.flows.keys()]
  }
}

export function workerRegistry(flows: Lite.Flow<unknown, unknown>[] = []): WorkerRegistry {
  const registry = new WorkerRegistry()
  for (const workerFlow of flows) registry.register(workerFlow)
  return registry
}

export function formatStepKey(key: WorkflowStepKey): string {
  return formatSuspenseStepKey(key)
}

export interface WorkflowRunOptions {
  taskId: string
  runId: string
}

export interface WorkflowContext {
  readonly taskId: string
  readonly runId: string
}

export interface AgentContext {
  readonly taskId: string
  readonly runId: string
  delegate<Output = unknown, Input = unknown>(name: string, input: Input): Promise<Output>
}

export const workflowRun = tag<WorkflowRunOptions>({ label: "workflow.run" })
export const workflow = tag<WorkflowContext>({ label: "workflow.runtime" })
export const agent = tag<AgentContext>({ label: "agent.runtime" })
export const abortSignal = tag<AbortSignal>({ label: "workflow.abortSignal" })

const activeWorkflowEvent = tag<WorkflowExecEvent>({ label: "workflow.event" })

async function delegateWorker<Output = unknown, Input = unknown>(
  ctx: Lite.ExecutionContext,
  name: string,
  input: Input
): Promise<Output> {
  const registry = registryOf(ctx)
  if (!registry) throw new Error("Worker registry not found")
  const target = registry.get(name) as Lite.Flow<Output, Input>
  return ctx.exec({ flow: target, input } as Lite.ExecFlowOptions<Output, Input>)
}

export function workflowExtension(options: WorkflowExtensionOptions): Lite.Extension {
  const base = createWorkflowExtension({
    name: "workflow",
    options,
    shouldHandle: shouldHandleWorkflowTarget,
    run: (event, next) => runTimed(event.target, event.ctx, next),
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

export function extension(options: AgentExtensionOptions = {}): Lite.Extension {
  return {
    name: "agent-sdk",
    async wrapExec(next, target, ctx) {
      return withRuntimeTag(ctx, agent, agentRuntimeOf(ctx), async () => {
        if (stepOf(target, ctx).remote !== true) return next()
        if (!options.remoteRunner) throw new Error("Remote step requires remoteRunner")
        return options.remoteRunner.run(agentExecEvent(target, ctx), next)
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

function registryOf(ctx: Lite.ExecutionContext): WorkerRegistry | undefined {
  return ctx.data.seekTag(workers)
}

function agentExecEvent(target: Lite.ExecTarget, ctx: Lite.ExecutionContext): AgentExecEvent {
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

function agentRuntimeOf(ctx: Lite.ExecutionContext): AgentContext {
  const config = ctx.data.seekTag(workflow)
  if (!config) throw new Error("agent extension requires workflow extension")
  return {
    taskId: config.taskId,
    runId: config.runId,
    delegate: <Output = unknown, Input = unknown>(name: string, input: Input) =>
      delegateWorker<Output, Input>(ctx, name, input),
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

function runTimed(target: Lite.ExecTarget, ctx: Lite.ExecutionContext, next: () => Promise<unknown>): Promise<unknown> {
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

export type JsonPatchOperation =
  | { op: "add"; path: string; value: Lite.JsonValue }
  | { op: "replace"; path: string; value: Lite.JsonValue }
  | { op: "remove"; path: string }

export interface MaterialState<T> {
  name: string
  kind: MaterialKind
  revision: number
  state: T
}

export interface MaterialOptions<T> {
  kind: MaterialKind
  initialState: T
  tags?: Lite.Tagged<any>[]
  keepAlive?: boolean
}

const materialPatches = new WeakMap<object, Promise<void>>()

export class MaterialConflictError extends Error {
  override readonly name = "MaterialConflictError"

  constructor(readonly expectedRevision: number, readonly currentRevision: number) {
    super(`Material revision conflict: expected ${expectedRevision}, current ${currentRevision}`)
  }
}

export function material<T>(name: string, options: MaterialOptions<T>): Lite.Atom<MaterialState<T>> {
  return atom({
    keepAlive: options.keepAlive ?? true,
    tags: [materialKind(options.kind), ...(options.tags ?? [])],
    factory: () => ({
      name,
      kind: options.kind,
      revision: 0,
      state: clone(options.initialState),
    }),
  })
}

export async function patchMaterial<T>(
  ctx: Lite.ExecutionContext,
  target: Lite.Atom<MaterialState<T>>,
  ops: JsonPatchOperation[],
  options: { expectedRevision?: number } = {}
): Promise<MaterialState<T>> {
  return queueMaterialPatch(target, async () => {
    const ctrl = ctx.scope.controller(target)
    if (ctrl.state === "idle") await ctrl.resolve()
    const current = ctrl.get()
    if (current.kind !== "json") throw new Error(`Material "${current.name}" does not accept JSON Patch`)
    if (options.expectedRevision !== undefined && options.expectedRevision !== current.revision) {
      throw new MaterialConflictError(options.expectedRevision, current.revision)
    }
    ctrl.set({
      ...current,
      revision: current.revision + 1,
      state: applyJsonPatch(current.state, ops),
    })
    return ctrl.get()
  })
}

export function derivedMaterial<TSource, TOutput>(
  name: string,
  source: Lite.Atom<MaterialState<TSource>>,
  derive: (state: TSource) => TOutput,
  options: { kind: MaterialKind; tags?: Lite.Tagged<any>[]; keepAlive?: boolean }
): Lite.Atom<MaterialState<TOutput>> {
  return atom({
    keepAlive: options.keepAlive ?? true,
    deps: { source },
    tags: [materialKind(options.kind), ...(options.tags ?? [])],
    factory: (_ctx, deps) => ({
      name,
      kind: options.kind,
      revision: deps.source.revision,
      state: derive(deps.source.state),
    }),
  })
}

function queueMaterialPatch<T>(
  target: Lite.Atom<MaterialState<T>>,
  run: () => Promise<MaterialState<T>>
): Promise<MaterialState<T>> {
  const previous = materialPatches.get(target) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(run)
  const lock = current.then(() => undefined, () => undefined)
  materialPatches.set(target, lock)
  lock.then(() => {
    if (materialPatches.get(target) === lock) materialPatches.delete(target)
  })
  return current
}

function applyJsonPatch<T>(source: T, ops: JsonPatchOperation[]): T {
  let document: unknown = clone(source)
  for (const op of ops) {
    if (op.path === "") {
      if (op.op === "remove") {
        document = null
      } else {
        document = clone(op.value)
      }
      continue
    }

    const parts = splitPointer(op.path)
    const key = parts.at(-1)
    if (key === undefined) throw new Error("JSON Patch path cannot be empty")
    const parent = findPatchParent(document, parts.slice(0, -1))

    if (op.op === "remove") {
      removeValue(parent, key)
    } else {
      setValue(parent, key, clone(op.value), op.op)
    }
  }
  return document as T
}

function splitPointer(path: string): string[] {
  if (!path.startsWith("/")) throw new Error(`Invalid JSON Pointer "${path}"`)
  return path
    .slice(1)
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
}

function findPatchParent(document: unknown, parts: string[]): unknown {
  let current = document
  for (const part of parts) {
    if (Array.isArray(current)) {
      current = current[Number(part)]
      continue
    }
    if (isRecord(current)) {
      current = current[part]
      continue
    }
    throw new Error(`Cannot traverse JSON Patch path at "${part}"`)
  }
  return current
}

function setValue(parent: unknown, key: string, value: unknown, op: "add" | "replace"): void {
  if (Array.isArray(parent)) {
    if (key === "-") {
      parent.push(value)
      return
    }
    const index = Number(key)
    if (op === "add") parent.splice(index, 0, value)
    else parent[index] = value
    return
  }
  if (!isRecord(parent)) throw new Error(`Cannot set JSON Patch path "${key}"`)
  parent[key] = value
}

function removeValue(parent: unknown, key: string): void {
  if (Array.isArray(parent)) {
    parent.splice(Number(key), 1)
    return
  }
  if (!isRecord(parent)) throw new Error(`Cannot remove JSON Patch path "${key}"`)
  delete parent[key]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

type Resolvable<Input, T> = T | ((input: Input, ctx: Lite.ExecutionContext) => T)

export interface CliResult {
  stdout: string
  stderr: string
  exitCode: number | null
  signal: string | null
}

export interface CliWorkerOptions<Input, Output> {
  name: string
  parse?: ((raw: unknown) => Input) | Lite.Typed<Input>
  command: Resolvable<Input, string>
  args?: Resolvable<Input, readonly string[]>
  stdin?: Resolvable<Input, string | undefined>
  cwd?: Resolvable<Input, string | undefined>
  env?: Resolvable<Input, Record<string, string | undefined> | undefined>
  timeoutMs?: number
  kind?: WorkerKind
  parseOutput?: (result: CliResult, input: Input) => Output
  tags?: Lite.Tagged<any>[]
}

export class CliWorkerError extends Error {
  override readonly name = "CliWorkerError"

  constructor(message: string, readonly result: CliResult) {
    super(message)
  }
}

export function cliWorker<Input = { prompt: string }, Output = string>(
  options: CliWorkerOptions<Input, Output>
): Lite.Flow<Output, Input> {
  const config: Step = { kind: options.kind ?? "cli" }
  if (options.timeoutMs !== undefined) config.timeoutMs = options.timeoutMs
  const tags = [
    step(config),
    ...(options.tags ?? []),
  ]
  const factory = async (ctx: Lite.ExecutionContext & { readonly input: Input }) => {
    const input = ctx.input
    const result = await runCli({
      command: resolveRequiredValue(options.command, input, ctx),
      args: resolveValue(options.args ?? [], input, ctx),
      stdin: resolveValue(options.stdin, input, ctx),
      cwd: resolveValue(options.cwd, input, ctx),
      env: resolveValue(options.env, input, ctx),
      timeoutMs: options.timeoutMs,
      signal: ctx.data.seekTag(abortSignal),
    })
    return options.parseOutput ? options.parseOutput(result, input) : (result.stdout.trim() as Output)
  }

  const flowOptions = {
    name: options.name,
    tags,
    factory,
  }

  return typeof options.parse === "function"
    ? flow<Output, Input>({ ...flowOptions, parse: options.parse })
    : flow<Output, Input>({ ...flowOptions, parse: options.parse ?? typed<Input>() })
}

export interface RunCliOptions {
  command: string
  args?: readonly string[]
  stdin?: string
  cwd?: string
  env?: Record<string, string | undefined>
  timeoutMs?: number
  signal?: AbortSignal
}

export function runCli(options: RunCliOptions): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = execFile(options.command, [...(options.args ?? [])], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      timeout: options.timeoutMs,
      signal: options.signal,
    }, (error, stdout, stderr) => {
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

type ExecFileError = Error & {
  code?: string | number | null
  signal?: string | null
  killed?: boolean
}

function resolveValue<Input, T>(
  value: Resolvable<Input, T> | undefined,
  input: Input,
  ctx: Lite.ExecutionContext
): T | undefined {
  if (typeof value === "function") return (value as (input: Input, ctx: Lite.ExecutionContext) => T)(input, ctx)
  return value
}

function resolveRequiredValue<Input, T>(
  value: Resolvable<Input, T>,
  input: Input,
  ctx: Lite.ExecutionContext
): T {
  if (typeof value === "function") return (value as (input: Input, ctx: Lite.ExecutionContext) => T)(input, ctx)
  return value
}

export interface PromptInput {
  prompt: string
}

export interface ClaudeCliWorkerOptions {
  name?: string
  command?: string
  extraArgs?: readonly string[]
  timeoutMs?: number
  tags?: Lite.Tagged<any>[]
}

export function claudeCliWorker(options: ClaudeCliWorkerOptions = {}): Lite.Flow<string, PromptInput> {
  return cliWorker({
    name: options.name ?? "claude",
    command: options.command ?? "claude",
    args: (input) => cliPromptArgs(["-p", ...(options.extraArgs ?? [])], input.prompt),
    timeoutMs: options.timeoutMs,
    kind: "llm",
    tags: options.tags,
  })
}

export interface CodexCliWorkerOptions {
  name?: string
  command?: string
  sandbox?: "read-only" | "workspace-write" | "danger-full-access"
  extraArgs?: readonly string[]
  timeoutMs?: number
  tags?: Lite.Tagged<any>[]
}

export function codexCliWorker(options: CodexCliWorkerOptions = {}): Lite.Flow<string, PromptInput> {
  return cliWorker({
    name: options.name ?? "codex",
    command: options.command ?? "codex",
    args: (input) => cliPromptArgs([
      "exec",
      "-s",
      options.sandbox ?? "read-only",
      ...(options.extraArgs ?? []),
    ], input.prompt),
    timeoutMs: options.timeoutMs,
    kind: "llm",
    tags: options.tags,
  })
}

function cliPromptArgs(args: readonly string[], prompt: string): string[] {
  if (args.includes("--")) throw new Error("CLI helper extraArgs cannot include --")
  return [...args, "--", prompt]
}

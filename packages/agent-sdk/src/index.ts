import { atom, flow, tag, typed, type Lite } from "@pumped-fn/lite"
import {
  extension as suspenseExtension,
  formatSuspenseStepKey,
  run as baseRun,
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
export type AgentStepKey = SuspenseStepKey
export type AgentStepEntry = SuspenseStepEntry
export interface AgentEventLog extends SuspenseEventLog {}
export interface AgentExecEvent extends SuspenseExecEvent {}
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

export interface AgentExtensionOptions {
  log: AgentEventLog
  remoteRunner?: AgentRemoteRunner
  defaultTaskId?: string
  defaultRunId?: string
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

export function formatStepKey(key: AgentStepKey): string {
  return formatSuspenseStepKey(key)
}

export interface AgentRunOptions {
  taskId: string
  runId: string
  registry?: WorkerRegistry
  tags?: Lite.Tagged<any>[]
}

export function run(options: AgentRunOptions): Lite.CreateContextOptions {
  return baseRun({
    taskId: options.taskId,
    runId: options.runId,
    tags: [
      ...(options.registry ? [workers(options.registry)] : []),
      ...(options.tags ?? []),
    ],
  })
}

export async function delegate<Output = unknown, Input = unknown>(
  ctx: Lite.ExecutionContext,
  name: string,
  input: Input
): Promise<Output> {
  const registry = ctx.data.seekTag(workers)
  if (!registry) throw new Error("Worker registry not found")
  const target = registry.get(name) as Lite.Flow<Output, Input>
  return ctx.exec({ flow: target, input } as Lite.ExecFlowOptions<Output, Input>)
}

export function extension(options: AgentExtensionOptions): Lite.Extension {
  return suspenseExtension({
    name: "agent-sdk",
    log: options.log,
    defaultTaskId: options.defaultTaskId,
    defaultRunId: options.defaultRunId,
    shouldHandle: (target, ctx) => shouldHandleAgentTarget(target, ctx),
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
    run: (event, next) => runTimed(event.target, event.ctx, () =>
      stepOf(event.target, event.ctx).remote === true && options.remoteRunner
        ? options.remoteRunner.run(event, next)
        : next()
    ),
  })
}

function shouldHandleAgentTarget(target: Lite.ExecTarget, ctx: Lite.ExecutionContext): boolean {
  const config = stepOf(target, ctx)
  return (
    config.workflow === true ||
    config.remote === true ||
    config.durable === true ||
    config.timeoutMs !== undefined
  )
}

function runTimed(target: Lite.ExecTarget, ctx: Lite.ExecutionContext, next: () => Promise<unknown>): Promise<unknown> {
  const timeoutMs = stepOf(target, ctx).timeoutMs
  if (timeoutMs === undefined) return next()
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([
    next(),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Agent step timed out after ${timeoutMs}ms`)), timeoutMs)
    }),
  ]).finally(() => clearTimeout(timer))
}

function stepOf(target: Lite.ExecTarget, ctx: Lite.ExecutionContext): Step {
  const flowStep = typeof target === "function" ? {} : step.find(target)
  return { ...flowStep, ...(ctx.data.seekTag(step) ?? {}) }
}

export type JsonPatchOperation =
  | { op: "add"; path: string; value: unknown }
  | { op: "replace"; path: string; value: unknown }
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
}

export class MaterialConflictError extends Error {
  override readonly name = "MaterialConflictError"

  constructor(readonly expectedRevision: number, readonly currentRevision: number) {
    super(`Material revision conflict: expected ${expectedRevision}, current ${currentRevision}`)
  }
}

export function material<T>(name: string, options: MaterialOptions<T>): Lite.Atom<MaterialState<T>> {
  return atom({
    keepAlive: true,
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
}

export function derivedMaterial<TSource, TOutput>(
  name: string,
  source: Lite.Atom<MaterialState<TSource>>,
  derive: (state: TSource) => TOutput,
  options: { kind: MaterialKind; tags?: Lite.Tagged<any>[] }
): Lite.Atom<MaterialState<TOutput>> {
  return atom({
    keepAlive: true,
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
    })
    return options.parseOutput ? options.parseOutput(result, input) : (result.stdout.trim() as Output)
  }

  if (typeof options.parse === "function") {
    return flow<Output, Input>({
      name: options.name,
      parse: options.parse,
      tags,
      factory,
    })
  }

  return flow<Output, Input>({
    name: options.name,
    parse: options.parse ?? typed<Input>(),
    tags,
    factory,
  })
}

export interface RunCliOptions {
  command: string
  args?: readonly string[]
  stdin?: string
  cwd?: string
  env?: Record<string, string | undefined>
  timeoutMs?: number
}

export function runCli(options: RunCliOptions): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = execFile(options.command, [...(options.args ?? [])], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      timeout: options.timeoutMs,
    }, (error, stdout, stderr) => {
      const execError = error as ExecFileError | null
      const exitCode = typeof execError?.code === "number" ? execError.code : error ? null : 0
      const signal = execError?.signal ?? null
      const result = { stdout: String(stdout), stderr: String(stderr), exitCode, signal }
      if (execError?.killed && options.timeoutMs !== undefined) {
        reject(new CliWorkerError(`CLI command timed out after ${options.timeoutMs}ms`, result))
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
    args: (input) => ["-p", ...(options.extraArgs ?? []), input.prompt],
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
    args: (input) => [
      "exec",
      "-s",
      options.sandbox ?? "read-only",
      ...(options.extraArgs ?? []),
      input.prompt,
    ],
    timeoutMs: options.timeoutMs,
    kind: "llm",
    tags: options.tags,
  })
}

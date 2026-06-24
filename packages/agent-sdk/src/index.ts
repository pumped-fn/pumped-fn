import { atom, flow, isAtom, resource, tag, typed, type Lite } from "@pumped-fn/lite"
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

export type WorkerKind = "code" | "llm" | "cli" | string
export type MaterialKind = "json" | "text" | "binary" | "reference"

export type StepCounter = SuspenseStepCounter
export type WorkflowStepKey = SuspenseStepKey
export type WorkflowStepEntry = SuspenseStepEntry
export type WorkflowEventLog = SuspenseEventLog
export type WorkflowExecEvent = SuspenseExecEvent
export interface ExecEvent {
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

export interface RemoteRunner {
  run(event: ExecEvent, next: () => Promise<unknown>): Promise<unknown>
}

export interface WorkflowExtensionOptions {
  log: WorkflowEventLog
  defaultTaskId?: string
  defaultRunId?: string
}

export interface ExtensionOptions {
  remoteRunner?: RemoteRunner
}

export const step = tag<Step>({ label: "agent.step", default: {} })
export const materialKind = tag<MaterialKind>({ label: "agent.materialKind" })
export const workers = tag<WorkerRegistry>({ label: "agent.workerRegistry" })

type WorkerFlow = Lite.AnyFlow

export class WorkerRegistry {
  private readonly flows = new Map<string, WorkerFlow>()

  register(flow: WorkerFlow, name = flow.name): this {
    if (!name) throw new Error("Worker flow must have a name")
    this.flows.set(name, flow)
    return this
  }

  get(name: string): WorkerFlow {
    const found = this.flows.get(name)
    if (!found) throw new Error(`Worker "${name}" not registered`)
    return found
  }

  list(): string[] {
    return [...this.flows.keys()]
  }
}

export function workerRegistry(flows: readonly WorkerFlow[] = []): WorkerRegistry {
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

export interface Runtime {
  readonly taskId: string
  readonly runId: string
  delegate<Output = unknown, Input = unknown>(name: string, input: Input): Promise<Output>
}

export const workflowRun = tag<WorkflowRunOptions>({ label: "workflow.run" })
export const workflow = tag<WorkflowContext>({ label: "workflow.runtime" })
export const runtime = tag<Runtime>({ label: "agent.runtime" })
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

export function extension(options: ExtensionOptions = {}): Lite.Extension {
  return {
    name: "agent-sdk",
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

function registryOf(ctx: Lite.ExecutionContext): WorkerRegistry | undefined {
  return ctx.data.seekTag(workers)
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

const materialPatches = new WeakMap<object, WeakMap<object, Promise<void>>>()

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
  return queueMaterialPatch(ctx.scope, target, async () => {
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
  scope: Lite.Scope,
  target: Lite.Atom<MaterialState<T>>,
  run: () => Promise<MaterialState<T>>
): Promise<MaterialState<T>> {
  let scopePatches = materialPatches.get(scope)
  if (!scopePatches) {
    scopePatches = new WeakMap()
    materialPatches.set(scope, scopePatches)
  }
  const previous = scopePatches.get(target) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(run)
  const lock = current.then(() => undefined, () => undefined)
  scopePatches.set(target, lock)
  void lock.then(() => {
    if (scopePatches.get(target) === lock) scopePatches.delete(target)
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

export interface CliBind {
  source: string
  target?: string
  mode?: "ro" | "rw"
}

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
  isolate?: Resolvable<Input, boolean | CliIsolateOptions | undefined>
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
      isolate: resolveValue(options.isolate, input, ctx),
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

export interface GuardState {
  text: string
}

export function guard(name: string, text = ""): Lite.Atom<MaterialState<GuardState>> {
  return material(name, {
    kind: "json",
    initialState: { text },
  })
}

export interface ClaudeCliWorkerOptions {
  name?: string
  command?: string
  extraArgs?: readonly string[]
  isolate?: boolean | CliIsolateOptions
  timeoutMs?: number
  tags?: Lite.Tagged<any>[]
}

export function claudeCliWorker(options: ClaudeCliWorkerOptions = {}): Lite.Flow<string, PromptInput> {
  assertNoClaudeBare(options.extraArgs ?? [])
  return cliWorker({
    name: options.name ?? "claude",
    command: options.command ?? "claude",
    args: (input) => cliPromptArgs(["-p", ...(options.extraArgs ?? [])], input.prompt),
    isolate: options.isolate,
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
  isolate?: boolean | CliIsolateOptions
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
    isolate: options.isolate,
    timeoutMs: options.timeoutMs,
    kind: "llm",
    tags: options.tags,
  })
}

export interface CliHarnessOptions {
  name?: string
  command?: string
  extraArgs?: readonly string[]
  isolate?: boolean | CliIsolateOptions
  timeoutMs?: number
  guard?: Lite.Atom<MaterialState<GuardState>> | false
  prompt?: (request: ModelRequest, guard: GuardState) => string
  parse?: (output: string) => ModelResponse
  tags?: Lite.Tagged<any>[]
}

export interface CodexHarnessOptions extends CliHarnessOptions {
  sandbox?: "read-only" | "workspace-write" | "danger-full-access"
}

export function claudeHarness(options: CliHarnessOptions = {}): Model {
  const worker = claudeCliWorker({
    name: options.name ?? "claude-harness",
    command: options.command,
    extraArgs: ["--no-session-persistence", ...(options.extraArgs ?? [])],
    isolate: options.isolate ?? { network: true },
    timeoutMs: options.timeoutMs,
    tags: options.tags,
  })
  return cliHarnessModel(worker, {
    guard: options.guard === undefined ? guard(`${options.name ?? "claude-harness"}-guard`) : options.guard,
    prompt: options.prompt,
    parse: options.parse,
  })
}

export function codexHarness(options: CodexHarnessOptions = {}): Model {
  const worker = codexCliWorker({
    name: options.name ?? "codex-harness",
    command: options.command,
    sandbox: options.sandbox,
    extraArgs: ["--ephemeral", "--ignore-user-config", ...(options.extraArgs ?? [])],
    isolate: options.isolate ?? { network: true },
    timeoutMs: options.timeoutMs,
    tags: options.tags,
  })
  return cliHarnessModel(worker, {
    guard: options.guard === undefined ? guard(`${options.name ?? "codex-harness"}-guard`) : options.guard,
    prompt: options.prompt,
    parse: options.parse,
  })
}

interface CliHarnessConfig {
  guard: Lite.Atom<MaterialState<GuardState>> | false
  prompt?: (request: ModelRequest, guard: GuardState) => string
  parse?: (output: string) => ModelResponse
}

function cliHarnessModel(
  worker: Lite.Flow<string, PromptInput>,
  config: CliHarnessConfig
): Model {
  return {
    complete: async (ctx, request) => {
      const current = config.guard ? await ctx.resolve(config.guard) : undefined
      const state = current?.state ?? { text: "" }
      const output = await ctx.exec({
        flow: worker,
        input: { prompt: config.prompt ? config.prompt(request, state) : modelPrompt(request, state) },
      })
      const response = config.parse ? config.parse(output) : parseModelOutput(output)
      if (config.guard && current) await collectGuard(ctx, config.guard, current, response)
      return response
    },
  }
}

async function collectGuard(
  ctx: Lite.ExecutionContext,
  store: Lite.Atom<MaterialState<GuardState>>,
  current: MaterialState<GuardState>,
  response: ModelResponse
): Promise<void> {
  const text = guardTextOf(response.guard)
  if (!text || current.state.text) return
  await patchMaterial(ctx, store, [
    { op: "replace", path: "/text", value: text },
  ], { expectedRevision: current.revision })
}

function modelPrompt(request: ModelRequest, guard: GuardState): string {
  return [
    "Return JSON only.",
    "Schema: {\"content\":string,\"stop\"?:boolean,\"guard\"?:string,\"skillCalls\"?:array,\"toolCalls\"?:array,\"subagentCalls\"?:array}.",
    guard.text
      ? `Guard:\n${guard.text}`
      : "First run only: set guard to the anti-goal that should prevent this agent from drifting.",
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

function parseModelOutput(output: string): ModelResponse {
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
  return `- ${capability.name}: ${capability.description}`
}

function formatLoadedSkill(skill: LoadedSkill): string {
  return `## ${skill.name}\n${skill.content}`
}

function formatMessage(message: Message): string {
  return message.name ? `${message.role}(${message.name}): ${message.content}` : `${message.role}: ${message.content}`
}

function assertNoClaudeBare(args: readonly string[]): void {
  if (args.some((arg) => arg === "--bare" || arg.startsWith("--bare="))) throw new Error("Claude harness must not use --bare")
}

function cliPromptArgs(args: readonly string[], prompt: string): string[] {
  if (args.includes("--")) throw new Error("CLI helper extraArgs cannot include --")
  return [...args, "--", prompt]
}

type MaybePromise<T> = T | Promise<T>

export type Role = "system" | "user" | "assistant" | "tool" | "subagent" | "skill"

export interface Message {
  role: Role
  content: string
  name?: string
}

export interface ToolCall {
  name: string
  input: unknown
  id?: string
}

export interface SubCall {
  name: string
  input: TurnInput
  id?: string
}

export interface SkillCall {
  name: string
  id?: string
}

export interface ModelResponse {
  content: string
  guard?: string
  skillCalls?: readonly SkillCall[]
  toolCalls?: readonly ToolCall[]
  subagentCalls?: readonly SubCall[]
  stop?: boolean
}

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

export interface Model {
  complete(ctx: Lite.ExecutionContext, request: ModelRequest): MaybePromise<ModelResponse>
}

export interface SandboxExecResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface Sandbox {
  readFile(path: string): MaybePromise<string>
  writeFile(path: string, content: string): MaybePromise<void>
  exec(command: string, args?: readonly string[]): MaybePromise<SandboxExecResult>
}

export interface TurnInput {
  messages?: readonly Message[]
  prompt?: string
  maxRounds?: number
  metadata?: Lite.JsonValue
}

export interface Capability {
  name: string
  description: string
}

export interface Tool<Output = unknown, Input = unknown> extends Capability {
  flow: Lite.Flow<Output, Input>
}

type AnyTool = Tool<any, any>

export interface Skill {
  name: string
  description?: string
  load(ctx: Lite.ExecutionContext): MaybePromise<string>
}

export interface LoadedSkill {
  name: string
  description?: string
  content: string
}

export interface Sub extends Capability {
  agent: Agent
}

export interface Agent {
  name: string
  description?: string
  instructions: string
  model: Lite.Atom<Model>
  tools: readonly AnyTool[]
  skills: readonly Skill[]
  subagents: readonly Sub[]
  turn: Lite.Flow<TurnResult, TurnInput>
  maxRounds: number
}

export interface AgentOptions {
  name: string
  description?: string
  instructions?: string
  model: Lite.Atom<Model> | Model
  tools?: readonly AnyTool[]
  skills?: readonly Skill[]
  subagents?: readonly Sub[]
  maxRounds?: number
  tags?: Lite.Tagged<any>[]
}

export interface ChannelOptions<Input> {
  name: string
  parse: ((raw: unknown) => MaybePromise<Input>) | Lite.Typed<Input>
  agent: Agent
  input(ctx: Lite.ExecutionContext & { readonly input: Input }): MaybePromise<TurnInput>
  tags?: Lite.Tagged<any>[]
}

export interface ScheduleOptions {
  name: string
  agent: Agent
  input(ctx: Lite.ExecutionContext): MaybePromise<TurnInput>
  tags?: Lite.Tagged<any>[]
}

export interface ToolResult {
  name: string
  id?: string
  input: unknown
  output: unknown
}

export interface SkillResult {
  name: string
  id?: string
  content: string
}

export interface SubResult {
  name: string
  id?: string
  input: TurnInput
  output: TurnResult
}

export interface TurnResult {
  agentName: string
  content: string
  messages: readonly Message[]
  skillResults: readonly SkillResult[]
  toolResults: readonly ToolResult[]
  subagentResults: readonly SubResult[]
  rounds: number
  events: readonly Event[]
}

export interface SessionState {
  messages: readonly Message[]
}

export interface SessionOptions {
  messages?: readonly Message[]
  tags?: Lite.Tagged<any>[]
  keepAlive?: boolean
}

export type EventType =
  | "agent_start"
  | "agent_model_start"
  | "agent_model_end"
  | "agent_skill_start"
  | "agent_skill_end"
  | "agent_tool_start"
  | "agent_tool_end"
  | "agent_subagent_start"
  | "agent_subagent_end"
  | "agent_end"

export interface Event {
  index: number
  type: EventType
  agentName: string
  targetName?: string
  round?: number
  input?: unknown
  output?: unknown
}

export interface EventBuffer {
  readonly events: readonly Event[]
  record(event: Omit<Event, "index">): Event
}

export const events = resource<EventBuffer>({
  name: "agent.events",
  ownership: "boundary",
  factory: () => {
    let next = 0
    const events: Event[] = []
    return {
      get events() {
        return events
      },
      record(event) {
        const stored = { ...event, index: next++ }
        events.push(stored)
        return stored
      },
    }
  },
})

export const sandbox = tag<Sandbox>({ label: "agent.sandbox" })

export function session(name: string, options: SessionOptions = {}): Lite.Atom<MaterialState<SessionState>> {
  return material(name, {
    kind: "json",
    initialState: { messages: options.messages ?? [] },
    tags: options.tags,
    keepAlive: options.keepAlive,
  })
}

export interface ToolOptions<Output, Input> {
  name?: string
  description: string
  flow: Lite.Flow<Output, Input>
}

export function tool<Output, Input>(options: ToolOptions<Output, Input>): Tool<Output, Input> {
  const name = options.name ?? options.flow.name
  if (!name) throw new Error("Agent tool requires a name")
  return {
    name,
    description: options.description,
    flow: options.flow,
  }
}

export interface SkillOptions {
  name: string
  description?: string
  content?: string
  load?: (ctx: Lite.ExecutionContext) => MaybePromise<string>
}

export function skill(options: SkillOptions): Skill {
  if (options.load) {
    return {
      name: options.name,
      description: options.description,
      load: options.load,
    }
  }
  const content = options.content ?? ""
  return {
    name: options.name,
    description: options.description,
    load: () => content,
  }
}

export interface SubOptions {
  name?: string
  description: string
  agent: Agent
}

export function sub(options: SubOptions): Sub {
  return {
    name: options.name ?? options.agent.name,
    description: options.description,
    agent: options.agent,
  }
}

export function agent(options: AgentOptions): Agent {
  const model = modelAtomOf(options.model)
  const tools = options.tools ?? []
  const skills = options.skills ?? []
  const subagents = options.subagents ?? []
  const maxRounds = options.maxRounds ?? 4
  let agent: Agent
  const turn = flow({
    name: options.name,
    parse: typed<TurnInput>(),
    deps: { model },
    tags: agentStepTags({ workflow: true, kind: "agent" }, options.tags),
    factory: (ctx, deps) => executeAgentTurn(ctx, agent, deps.model),
  })
  agent = {
    name: options.name,
    description: options.description,
    instructions: options.instructions ?? "",
    model,
    tools,
    skills,
    subagents,
    turn,
    maxRounds,
  }
  return agent
}

export function turn(
  ctx: Lite.ExecutionContext,
  agent: Agent,
  input: TurnInput
): Promise<TurnResult> {
  return ctx.exec({
    flow: agent.turn,
    input,
    name: agent.name,
  })
}

export async function send(
  ctx: Lite.ExecutionContext,
  session: Lite.Atom<MaterialState<SessionState>>,
  agent: Agent,
  input: TurnInput
): Promise<TurnResult> {
  const current = await ctx.resolve(session)
  const result = await turn(ctx, agent, {
    ...input,
    messages: [
      ...current.state.messages,
      ...(input.messages ?? []),
    ],
  })
  await patchMaterial(ctx, session, [
    { op: "replace", path: "/messages", value: serializeMessages(result.messages) },
  ], { expectedRevision: current.revision })
  return result
}

export function channel<Input>(options: ChannelOptions<Input>): Lite.Flow<TurnResult, Input> {
  const flowOptions = {
    name: options.name,
    tags: agentStepTags({ workflow: true, kind: "channel" }, options.tags),
    factory: async (ctx: Lite.ExecutionContext & { readonly input: Input }) =>
      turn(ctx, options.agent, await options.input(ctx)),
  }
  return typeof options.parse === "function"
    ? flow<TurnResult, Input>({ ...flowOptions, parse: options.parse })
    : flow<TurnResult, Input>({ ...flowOptions, parse: options.parse })
}

export function schedule(options: ScheduleOptions): Lite.Flow<TurnResult, void> {
  return flow({
    name: options.name,
    tags: agentStepTags({ workflow: true, kind: "schedule" }, options.tags),
    factory: async (ctx) => turn(ctx, options.agent, await options.input(ctx)),
  })
}

export interface EvalCheckResult {
  name: string
  passed: boolean
  details?: string
}

export type EvalCheck = (result: TurnResult) => MaybePromise<EvalCheckResult>

export interface JudgeResult {
  name: string
  passed: boolean
  score?: number
  reason?: string
}

export interface Judge {
  name: string
  evaluate(ctx: Lite.ExecutionContext, result: TurnResult): MaybePromise<JudgeResult>
}

export interface EvalCase {
  name: string
  input: TurnInput
  checks?: readonly EvalCheck[]
}

export interface Suite {
  name: string
  agent: Agent
  cases: readonly EvalCase[]
  judges: readonly Judge[]
}

export interface SuiteOptions {
  name: string
  agent: Agent
  cases: readonly EvalCase[]
  judges?: readonly Judge[]
}

export interface EvalCaseReport {
  name: string
  result: TurnResult
  checks: readonly EvalCheckResult[]
  judges: readonly JudgeResult[]
  passed: boolean
}

export interface EvalReport {
  name: string
  cases: readonly EvalCaseReport[]
  passed: boolean
}

export interface RunQuery {
  taskId: string
  runId: string
}

export interface RunStep {
  key: WorkflowStepKey
  status: WorkflowStepEntry["status"]
  targetName: string
  input?: unknown
  output?: unknown
  kind?: string
}

export interface RunRecord {
  taskId: string
  runId: string
  status: "pending" | "completed"
  steps: readonly RunStep[]
}

export interface RunLog extends WorkflowEventLog {
  entries(query?: Partial<RunQuery>): MaybePromise<readonly WorkflowStepEntry[]>
}

export interface HttpOptions {
  scope: Lite.Scope
  agent: Agent
  input?: (request: Request) => MaybePromise<TurnInput>
  tags?: (request: Request) => MaybePromise<Lite.Tagged<any>[]>
}

export function judge(options: Judge): Judge {
  return options
}

export function suite(options: SuiteOptions): Suite {
  const judges = options.judges ?? []
  assertJudgeQuorum(judges)
  return {
    name: options.name,
    agent: options.agent,
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
    const result = await turn(ctx, target.agent, item.input)
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
        agentName: event.agentName,
        targetName: event.targetName,
        round: event.round,
      })),
    })),
  })
}

export function http(options: HttpOptions): (request: Request) => Promise<Response> {
  return async (request) => {
    const input = options.input ? await options.input(request) : await request.json() as TurnInput
    const tags = options.tags ? await options.tags(request) : []
    const ctx = options.scope.createContext({ tags })
    return turn(ctx, options.agent, input).then(
      async (result) => {
        await ctx.close()
        return Response.json(jsonValue(result))
      },
      async (error) => {
        await ctx.close({ ok: false, error })
        throw error
      }
    )
  }
}

async function executeAgentTurn(
  ctx: Lite.ExecutionContext & { readonly input: TurnInput },
  agent: Agent,
  model: Model
): Promise<TurnResult> {
  const messages = initialMessages(ctx.input)
  const loadedSkills: LoadedSkill[] = []
  const skillResults: SkillResult[] = []
  const toolResults: ToolResult[] = []
  const subagentResults: SubResult[] = []
  const maxRounds = ctx.input.maxRounds ?? agent.maxRounds
  let content = ""
  let rounds = 0
  const startIndex = (await ctx.resolve(events)).events.length

  await recordAgentEvent(ctx, {
    type: "agent_start",
    agentName: agent.name,
    input: ctx.input,
  })

  for (let round = 0; round < maxRounds; round++) {
    rounds = round + 1
    await recordAgentEvent(ctx, {
      type: "agent_model_start",
      agentName: agent.name,
      round,
      input: messages,
    })
    const response = await model.complete(ctx, {
      agentName: agent.name,
      instructions: agent.instructions,
      messages,
      tools: agent.tools.map(agentToolCapability),
      skills: agent.skills.map(agentSkillCapability),
      loadedSkills,
      subagents: agent.subagents.map(agentSubagentCapability),
      round,
    })
    content = response.content
    await recordAgentEvent(ctx, {
      type: "agent_model_end",
      agentName: agent.name,
      round,
      output: response,
    })

    const skillCalls = response.skillCalls ?? []
    const toolCalls = response.toolCalls ?? []
    const subagentCalls = response.subagentCalls ?? []
    if (response.content) messages.push({ role: "assistant", content: response.content })
    if (response.stop === true || (skillCalls.length === 0 && toolCalls.length === 0 && subagentCalls.length === 0)) break

    for (const call of skillCalls) {
      const result = await executeAgentSkill(ctx, agent, call)
      loadedSkills.push({
        name: result.name,
        content: result.content,
        description: findByName(agent.skills, result.name, "skill").description,
      })
      skillResults.push(result)
      messages.push({
        role: "skill",
        name: result.name,
        content: result.content,
      })
    }

    for (const call of toolCalls) {
      const result = await executeAgentTool(ctx, agent, call)
      toolResults.push(result)
      messages.push({
        role: "tool",
        name: result.name,
        content: stringifyAgentValue(result.output),
      })
    }

    for (const call of subagentCalls) {
      const result = await executeAgentSubagent(ctx, agent, call)
      subagentResults.push(result)
      messages.push({
        role: "subagent",
        name: result.name,
        content: result.output.content,
      })
    }
  }

  await recordAgentEvent(ctx, {
    type: "agent_end",
    agentName: agent.name,
    output: content,
  })

  const buffer = await ctx.resolve(events)
  return {
    agentName: agent.name,
    content,
    messages,
    skillResults,
    toolResults,
    subagentResults,
    rounds,
    events: buffer.events.slice(startIndex),
  }
}

async function executeAgentSkill(
  ctx: Lite.ExecutionContext,
  agent: Agent,
  call: SkillCall
): Promise<SkillResult> {
  const target = findByName(agent.skills, call.name, "skill")
  await recordAgentEvent(ctx, {
    type: "agent_skill_start",
    agentName: agent.name,
    targetName: target.name,
  })
  const content = await ctx.exec({
    fn: (skillCtx) => target.load(skillCtx),
    params: [],
    name: target.name,
    tags: [agentStepTag({ workflow: true, kind: "skill" })],
  })
  await recordAgentEvent(ctx, {
    type: "agent_skill_end",
    agentName: agent.name,
    targetName: target.name,
    output: content,
  })
  return {
    name: target.name,
    id: call.id,
    content,
  }
}

async function executeAgentTool(
  ctx: Lite.ExecutionContext,
  agent: Agent,
  call: ToolCall
): Promise<ToolResult> {
  const target = findByName(agent.tools, call.name, "tool")
  await recordAgentEvent(ctx, {
    type: "agent_tool_start",
    agentName: agent.name,
    targetName: target.name,
    input: call.input,
  })
  const output = await ctx.exec({
    flow: target.flow as Lite.Flow<unknown, unknown>,
    rawInput: call.input,
    name: target.name,
    tags: [agentStepTag({ workflow: true, kind: "tool" }, target.flow.tags)],
  })
  await recordAgentEvent(ctx, {
    type: "agent_tool_end",
    agentName: agent.name,
    targetName: target.name,
    output,
  })
  return {
    name: target.name,
    id: call.id,
    input: call.input,
    output,
  }
}

async function executeAgentSubagent(
  ctx: Lite.ExecutionContext,
  agent: Agent,
  call: SubCall
): Promise<SubResult> {
  const target = findByName(agent.subagents, call.name, "subagent")
  await recordAgentEvent(ctx, {
    type: "agent_subagent_start",
    agentName: agent.name,
    targetName: target.name,
    input: call.input,
  })
  const output = await ctx.exec({
    flow: target.agent.turn,
    input: call.input,
    name: target.name,
    tags: [agentStepTag({ workflow: true, kind: "subagent" }, target.agent.turn.tags)],
  })
  await recordAgentEvent(ctx, {
    type: "agent_subagent_end",
    agentName: agent.name,
    targetName: target.name,
    output,
  })
  return {
    name: target.name,
    id: call.id,
    input: call.input,
    output,
  }
}

async function recordAgentEvent(
  ctx: Lite.ExecutionContext,
  event: Omit<Event, "index">
): Promise<Event> {
  return (await ctx.resolve(events)).record(event)
}

function initialMessages(input: TurnInput): Message[] {
  return [
    ...(input.messages ?? []),
    ...(input.prompt ? [{ role: "user" as const, content: input.prompt }] : []),
  ]
}

function modelAtomOf(model: Lite.Atom<Model> | Model): Lite.Atom<Model> {
  return isAtom(model)
    ? model as Lite.Atom<Model>
    : atom({ factory: () => model })
}

function agentStepTags(defaults: Step, source: Lite.Tagged<any>[] = []): Lite.Tagged<any>[] {
  return [
    agentStepTag(defaults, source),
    ...source.filter((tagged) => tagged.key !== step.key),
  ]
}

function agentStepTag(defaults: Step, source: Lite.Tagged<any>[] = []): Lite.Tagged<Step> {
  return step(Object.assign({}, defaults, ...step.collect(source)))
}

function agentToolCapability(tool: AnyTool): Capability {
  return {
    name: tool.name,
    description: tool.description,
  }
}

function agentSkillCapability(skill: Skill): Capability {
  return {
    name: skill.name,
    description: skill.description ?? "",
  }
}

function agentSubagentCapability(subagent: Sub): Capability {
  return {
    name: subagent.name,
    description: subagent.description,
  }
}

function findByName<T extends { name: string }>(items: readonly T[], name: string, kind: string): T {
  const found = items.find((item) => item.name === name)
  if (!found) throw new Error(`Agent ${kind} "${name}" not found`)
  return found
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

function serializeMessages(messages: readonly Message[]): Lite.JsonValue {
  return messages.map((message) => {
    const serialized: Record<string, Lite.JsonValue> = {
      role: message.role,
      content: message.content,
    }
    if (message.name !== undefined) serialized["name"] = message.name
    return serialized
  })
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

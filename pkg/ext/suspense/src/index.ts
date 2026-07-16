import { isStreamingExec, tag, type Lite } from "@pumped-fn/lite"

type MaybePromise<T> = T | Promise<T>

/** Tracks the next durable step number within a suspense run. */
export interface SuspenseStepCounter {
  next: number
}

/** Identifies one durable step within a task and run. */
export interface SuspenseStepKey {
  taskId: string
  runId: string
  step: number
}

export type SuspenseStepEntry =
  | {
      status: "pending"
      key: SuspenseStepKey
      targetName: string
      input: unknown
      kind?: string
    }
  | {
      status: "resolved"
      key: SuspenseStepKey
      targetName: string
      value: unknown
    }
  | {
      status: "completed"
      key: SuspenseStepKey
      targetName: string
      result: unknown
    }

/** Stores pending, resolved, and completed durable step outcomes. */
export interface SuspenseEventLog {
  get(key: SuspenseStepKey): Promise<SuspenseStepEntry | undefined>
  putPending(entry: Extract<SuspenseStepEntry, { status: "pending" }>): Promise<void>
  putCompleted(entry: Extract<SuspenseStepEntry, { status: "completed" }>): Promise<void>
  resolve(key: SuspenseStepKey, value: unknown): Promise<void>
}

/** Describes the execution inspected by suspense policy hooks. */
export interface SuspenseExecEvent {
  key: SuspenseStepKey
  target: Lite.ExecTarget
  ctx: Lite.ExecutionContext
  targetName: string
  input: unknown
}

/** Configures durable step identity, storage, suspension, and execution hooks. */
export interface SuspenseExtensionOptions {
  log: SuspenseEventLog
  name?: string
  defaultTaskId?: string
  defaultRunId?: string
  shouldHandle?: (target: Lite.ExecTarget, ctx: Lite.ExecutionContext) => boolean
  shouldSuspend?: (event: SuspenseExecEvent) => MaybePromise<boolean>
  run?: (event: SuspenseExecEvent, next: () => Promise<unknown>) => Promise<unknown>
  getKey?: (ctx: Lite.ExecutionContext, target: Lite.ExecTarget) => SuspenseStepKey
  getTargetName?: (target: Lite.ExecTarget, ctx: Lite.ExecutionContext) => string
  createPendingEntry?: (event: SuspenseExecEvent) => Extract<SuspenseStepEntry, { status: "pending" }>
}

export const replay = tag<boolean>({ label: "suspense.replay", default: false })
export const suspend = tag<boolean>({ label: "suspense.suspend", default: false })
export const taskId = tag<string>({ label: "suspense.taskId" })
export const runId = tag<string>({ label: "suspense.runId" })
export const stepCounter = tag<SuspenseStepCounter>({ label: "suspense.stepCounter" })

export class SuspendSignal extends Error {
  override readonly name = "SuspendSignal"

  constructor(readonly entry: SuspenseStepEntry) {
    super(`Execution suspended at ${formatSuspenseStepKey(entry.key)}`)
  }
}

export { SuspendSignal as SuspenseSignal }

export function formatSuspenseStepKey(key: SuspenseStepKey): string {
  return `${key.taskId}:${key.runId}:${key.step}`
}

/** Binds a task, run, and optional tags to a suspense execution context. */
export interface SuspenseRunOptions {
  taskId: string
  runId: string
  tags?: Lite.Tagged<any>[]
}

export function run(options: SuspenseRunOptions): Lite.CreateContextOptions {
  return {
    tags: [
      taskId(options.taskId),
      runId(options.runId),
      stepCounter({ next: 0 }),
      ...(options.tags ?? []),
    ],
  }
}

export function extension(options: SuspenseExtensionOptions): Lite.Extension {
  return {
    name: options.name ?? "suspense",
    async wrapExec(next, target, ctx) {
      if (!(options.shouldHandle ?? shouldHandleSuspenseTarget)(target, ctx)) return next()
      if (isStreamingExec(target, ctx)) throw new Error("streaming flows are not replayable yet")

      const key = options.getKey ? options.getKey(ctx, target) : nextSuspenseKey(ctx, options)
      const targetName = options.getTargetName ? options.getTargetName(target, ctx) : getTargetName(target, ctx)
      const event = { key, target, ctx, targetName, input: ctx.input }
      const existing = await options.log.get(key)
      if (existing) assertSameTarget(existing, targetName)
      if (existing?.status === "completed") return existing.result
      if (existing?.status === "resolved") return existing.value
      if (existing?.status === "pending") throw new SuspendSignal(existing)

      const shouldSuspend = await (options.shouldSuspend ?? shouldSuspendTarget)(event)
      if (shouldSuspend) {
        const pending = options.createPendingEntry
          ? options.createPendingEntry(event)
          : { status: "pending" as const, key, targetName, input: ctx.input }
        await options.log.putPending(pending)
        throw new SuspendSignal(pending)
      }

      const result = await (options.run ? options.run(event, next) : next())
      if (isStreamingExec(target, ctx)) throw new Error("streaming flows are not replayable yet")
      await options.log.putCompleted({ status: "completed", key, targetName, result })
      return result
    },
  }
}

function shouldHandleSuspenseTarget(target: Lite.ExecTarget, ctx: Lite.ExecutionContext): boolean {
  return active(target, replay, ctx) || active(target, suspend, ctx)
}

function assertSameTarget(entry: SuspenseStepEntry, targetName: string): void {
  if (entry.targetName !== targetName) {
    throw new Error(
      `Suspense replay target mismatch at ${formatSuspenseStepKey(entry.key)}: expected "${entry.targetName}", got "${targetName}"`
    )
  }
}

function shouldSuspendTarget(event: SuspenseExecEvent): boolean {
  return active(event.target, suspend, event.ctx)
}

function active(target: Lite.ExecTarget, tag: Lite.Tag<boolean, boolean>, ctx?: Lite.ExecutionContext): boolean {
  const value = ctx?.data.seekTag(tag)
  if (value !== undefined) return value === true
  if (typeof target === "function") return false
  return tag.find(target) === true
}

function nextSuspenseKey(
  ctx: Lite.ExecutionContext,
  options: Pick<SuspenseExtensionOptions, "defaultTaskId" | "defaultRunId">
): SuspenseStepKey {
  const foundTaskId = ctx.data.seekTag(taskId) ?? options.defaultTaskId ?? "default-task"
  const foundRunId = ctx.data.seekTag(runId) ?? options.defaultRunId ?? "default-run"
  let counter = ctx.data.seekTag(stepCounter)
  if (!counter) {
    counter = { next: 0 }
    rootContext(ctx).data.setTag(stepCounter, counter)
  }
  return { taskId: foundTaskId, runId: foundRunId, step: counter.next++ }
}

function getTargetName(target: Lite.ExecTarget, ctx: Lite.ExecutionContext): string {
  const name = ctx.name || target.name
  if (!name) throw new Error("Suspense target must have a name")
  return name
}

function rootContext(ctx: Lite.ExecutionContext): Lite.ExecutionContext {
  let current = ctx
  while (current.parent) current = current.parent
  return current
}

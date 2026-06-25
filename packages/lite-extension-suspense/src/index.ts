import { tag, type Lite } from "@pumped-fn/lite"

type MaybePromise<T> = T | Promise<T>

export interface SuspenseStepCounter {
  next: number
}

export interface SuspenseStepKey {
  taskId: string
  runId: string
  step: number | string
}

export interface SuspenseStepFailure {
  name: string
  message: string
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
  | {
      status: "failed"
      key: SuspenseStepKey
      targetName: string
      error: SuspenseStepFailure
    }

export interface SuspenseStepListFilter {
  taskId?: string
  runId?: string
}

export interface SuspenseEventLog {
  get(key: SuspenseStepKey): Promise<SuspenseStepEntry | undefined>
  putPending(entry: Extract<SuspenseStepEntry, { status: "pending" }>): Promise<void>
  putCompleted(entry: Extract<SuspenseStepEntry, { status: "completed" }>): Promise<void>
  putFailed?(entry: Extract<SuspenseStepEntry, { status: "failed" }>): Promise<void>
  resolve(key: SuspenseStepKey, value: unknown): Promise<void>
  list?(filter?: SuspenseStepListFilter): Promise<readonly SuspenseStepEntry[]>
}

export interface SuspenseExecEvent {
  key: SuspenseStepKey
  target: Lite.ExecTarget
  ctx: Lite.ExecutionContext
  targetName: string
  input: unknown
}

export type SuspenseOperationalEvent =
  | {
      status: "started"
      key: SuspenseStepKey
      targetName: string
      input: unknown
    }
  | {
      status: "pending"
      key: SuspenseStepKey
      targetName: string
      input: unknown
      kind?: string
    }
  | {
      status: "completed"
      key: SuspenseStepKey
      targetName: string
      result: unknown
    }
  | {
      status: "replayed"
      key: SuspenseStepKey
      targetName: string
      result: unknown
    }
  | {
      status: "resolved"
      key: SuspenseStepKey
      targetName: string
      value: unknown
    }
  | {
      status: "failed"
      key: SuspenseStepKey
      targetName: string
      error: SuspenseStepFailure
    }

export type SuspenseObserver = (event: SuspenseOperationalEvent) => MaybePromise<void>

export interface SuspenseExtensionUnit {
  getKey?: (ctx: Lite.ExecutionContext, target: Lite.ExecTarget) => SuspenseStepKey
  getTargetName?: (target: Lite.ExecTarget, ctx: Lite.ExecutionContext) => string
  shouldHandle?: (target: Lite.ExecTarget, ctx: Lite.ExecutionContext) => boolean
  shouldSuspend?: (event: SuspenseExecEvent) => MaybePromise<boolean>
  createPendingEntry?: (event: SuspenseExecEvent) => Extract<SuspenseStepEntry, { status: "pending" }>
  run?: (event: SuspenseExecEvent, next: () => Promise<unknown>) => Promise<unknown>
  observe?: (event: SuspenseOperationalEvent) => MaybePromise<void>
}

export interface SuspenseExtensionOptions {
  log?: SuspenseEventLog
  name?: string
  defaultTaskId?: string
  defaultRunId?: string
  units?: readonly SuspenseExtensionUnit[]
  shouldHandle?: (target: Lite.ExecTarget, ctx: Lite.ExecutionContext) => boolean
  shouldSuspend?: (event: SuspenseExecEvent) => MaybePromise<boolean>
  run?: (event: SuspenseExecEvent, next: () => Promise<unknown>) => Promise<unknown>
  getKey?: (ctx: Lite.ExecutionContext, target: Lite.ExecTarget) => SuspenseStepKey
  getTargetName?: (target: Lite.ExecTarget, ctx: Lite.ExecutionContext) => string
  createPendingEntry?: (event: SuspenseExecEvent) => Extract<SuspenseStepEntry, { status: "pending" }>
  observe?: SuspenseObserver
}

export const replay = tag<boolean>({ label: "suspense.replay", default: false })
export const suspend = tag<boolean>({ label: "suspense.suspend", default: false })
export const taskId = tag<string>({ label: "suspense.taskId" })
export const runId = tag<string>({ label: "suspense.runId" })
export const stepCounter = tag<SuspenseStepCounter>({ label: "suspense.stepCounter" })
export const eventLog = tag<SuspenseEventLog>({ label: "suspense.eventLog" })
export const observer = tag<SuspenseObserver>({ label: "suspense.observer" })
export const units = tag<readonly SuspenseExtensionUnit[]>({ label: "suspense.units" })

export class SuspendSignal extends Error {
  override readonly name = "SuspendSignal"

  constructor(readonly entry: SuspenseStepEntry) {
    super(`Execution suspended at ${formatSuspenseStepKey(entry.key)}`)
  }
}

export { SuspendSignal as SuspenseSignal }

export class SuspenseFailureSignal extends Error {
  override readonly name = "SuspenseFailureSignal"

  constructor(readonly entry: Extract<SuspenseStepEntry, { status: "failed" }>) {
    super(`Execution failed at ${formatSuspenseStepKey(entry.key)}: ${entry.error.message}`)
  }
}

export function formatSuspenseStepKey(key: SuspenseStepKey): string {
  return `${key.taskId}:${key.runId}:${key.step}`
}

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

export function extension(options: SuspenseExtensionOptions = {}): Lite.Extension {
  return {
    name: options.name ?? "suspense",
    async wrapExec(next, target, ctx) {
      const extensionUnits = unitsOf(options, ctx)
      if (!shouldHandleTarget(options, extensionUnits, target, ctx)) return next()

      const log = logOf(options, ctx)
      const key = getKey(options, extensionUnits, ctx, target)
      const targetName = getTargetNameFor(options, extensionUnits, target, ctx)
      const event = { key, target, ctx, targetName, input: ctx.input }
      const existing = await log.get(key)
      if (existing) assertSameTarget(existing, targetName)
      if (existing?.status === "completed") {
        await observe(options, extensionUnits, ctx, { status: "replayed", key, targetName, result: existing.result })
        return existing.result
      }
      if (existing?.status === "resolved") {
        await observe(options, extensionUnits, ctx, { status: "resolved", key, targetName, value: existing.value })
        return existing.value
      }
      if (existing?.status === "failed") {
        await observe(options, extensionUnits, ctx, { status: "failed", key, targetName, error: existing.error })
        throw new SuspenseFailureSignal(existing)
      }
      if (existing?.status === "pending") {
        await observe(options, extensionUnits, ctx, { status: "pending", key, targetName, input: existing.input, kind: existing.kind })
        throw new SuspendSignal(existing)
      }

      const shouldSuspend = await shouldSuspendEvent(options, extensionUnits, event)
      if (shouldSuspend) {
        const pending = createPendingEntry(options, extensionUnits, event)
        await log.putPending(pending)
        await observe(options, extensionUnits, ctx, {
          status: "pending",
          key,
          targetName,
          input: pending.input,
          kind: pending.kind,
        })
        throw new SuspendSignal(pending)
      }

      await observe(options, extensionUnits, ctx, { status: "started", key, targetName, input: ctx.input })
      return runUnits(options, extensionUnits, event, next).then(
        async (result) => {
          await log.putCompleted({ status: "completed", key, targetName, result })
          await observe(options, extensionUnits, ctx, { status: "completed", key, targetName, result })
          return result
        },
        async (error) => {
          if (error instanceof SuspendSignal) throw error
          const failure = serializeError(error)
          await log.putFailed?.({ status: "failed", key, targetName, error: failure })
          await observe(options, extensionUnits, ctx, { status: "failed", key, targetName, error: failure })
          throw error
        }
      )
    },
  }
}

function shouldHandleTarget(
  options: SuspenseExtensionOptions,
  units: readonly SuspenseExtensionUnit[],
  target: Lite.ExecTarget,
  ctx: Lite.ExecutionContext
): boolean {
  if (options.shouldHandle?.(target, ctx) === true) return true
  for (const unit of units) {
    if (unit.shouldHandle?.(target, ctx) === true) return true
  }
  return shouldHandleSuspenseTarget(target, ctx)
}

function getKey(
  options: SuspenseExtensionOptions,
  units: readonly SuspenseExtensionUnit[],
  ctx: Lite.ExecutionContext,
  target: Lite.ExecTarget
): SuspenseStepKey {
  if (options.getKey) return options.getKey(ctx, target)
  for (const unit of units) {
    if (unit.getKey) return unit.getKey(ctx, target)
  }
  return nextSuspenseKey(ctx, options)
}

function getTargetNameFor(
  options: SuspenseExtensionOptions,
  units: readonly SuspenseExtensionUnit[],
  target: Lite.ExecTarget,
  ctx: Lite.ExecutionContext
): string {
  if (options.getTargetName) return options.getTargetName(target, ctx)
  for (const unit of units) {
    if (unit.getTargetName) return unit.getTargetName(target, ctx)
  }
  return getTargetName(target, ctx)
}

async function shouldSuspendEvent(
  options: SuspenseExtensionOptions,
  units: readonly SuspenseExtensionUnit[],
  event: SuspenseExecEvent
): Promise<boolean> {
  if (await options.shouldSuspend?.(event)) return true
  for (const unit of units) {
    if (await unit.shouldSuspend?.(event)) return true
  }
  return shouldSuspendTarget(event)
}

function createPendingEntry(
  options: SuspenseExtensionOptions,
  units: readonly SuspenseExtensionUnit[],
  event: SuspenseExecEvent
): Extract<SuspenseStepEntry, { status: "pending" }> {
  if (options.createPendingEntry) return options.createPendingEntry(event)
  for (const unit of units) {
    if (unit.createPendingEntry) return unit.createPendingEntry(event)
  }
  return { status: "pending", key: event.key, targetName: event.targetName, input: event.input }
}

function runUnits(
  options: SuspenseExtensionOptions,
  units: readonly SuspenseExtensionUnit[],
  event: SuspenseExecEvent,
  next: () => Promise<unknown>
): Promise<unknown> {
  let run = options.run ? () => options.run!(event, next) : next
  for (let i = units.length - 1; i >= 0; i--) {
    const unit = units[i]
    if (!unit?.run) continue
    const current = run
    run = () => unit.run!(event, current)
  }
  return run()
}

async function observe(
  options: SuspenseExtensionOptions,
  extensionUnits: readonly SuspenseExtensionUnit[],
  ctx: Lite.ExecutionContext,
  event: SuspenseOperationalEvent
): Promise<void> {
  await options.observe?.(event)
  await ctx.data.seekTag(observer)?.(event)
  for (const unit of extensionUnits) await unit.observe?.(event)
}

function logOf(options: SuspenseExtensionOptions, ctx: Lite.ExecutionContext): SuspenseEventLog {
  const found = ctx.data.seekTag(eventLog) ?? options.log
  if (!found) throw new Error("eventLog tag or suspense extension log required")
  return found
}

function unitsOf(options: SuspenseExtensionOptions, ctx: Lite.ExecutionContext): readonly SuspenseExtensionUnit[] {
  const found = ctx.data.seekTag(units)
  if (!found) return options.units ?? []
  if (!options.units) return found
  return [...found, ...options.units]
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

function serializeError(error: unknown): SuspenseStepFailure {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    }
  }
  return {
    name: "Error",
    message: String(error),
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

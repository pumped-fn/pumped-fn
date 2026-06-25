import { tag, type Lite } from "@pumped-fn/lite"
import {
  extension as suspenseExtension,
  eventLog,
  formatSuspenseStepKey,
  observer,
  stepCounter,
  units,
  type SuspenseEventLog,
  type SuspenseExecEvent,
  type SuspenseExtensionOptions,
  type SuspenseExtensionUnit,
  type SuspenseObserver,
  type SuspenseOperationalEvent,
  type SuspenseStepCounter,
  type SuspenseStepEntry,
  type SuspenseStepKey,
} from "@pumped-fn/lite-extension-suspense"

export type StepCounter = SuspenseStepCounter
export type WorkflowStepKey = SuspenseStepKey
export type WorkflowStepEntry = SuspenseStepEntry
export type WorkflowEventLog = SuspenseEventLog
export type WorkflowExecEvent = SuspenseExecEvent
export type WorkflowExtensionUnit = SuspenseExtensionUnit
export type WorkflowObserver = SuspenseObserver
export type WorkflowOperationalEvent = SuspenseOperationalEvent

export interface Step {
  key?: string
  workflow?: boolean
  remote?: boolean
  durable?: boolean
  kind?: string
  timeoutMs?: number
}

export { SuspendSignal, SuspenseFailureSignal, SuspenseSignal } from "@pumped-fn/lite-extension-suspense"

export interface WorkflowRunOptions {
  taskId: string
  runId: string
}

export interface WorkflowContext {
  readonly taskId: string
  readonly runId: string
}

export interface WorkflowRunDefaults {
  defaultTaskId?: string
  defaultRunId?: string
}

export interface WorkflowExtensionOptions {
  log?: WorkflowEventLog
  defaultTaskId?: string
  defaultRunId?: string
  observe?: SuspenseExtensionOptions["observe"]
  units?: readonly WorkflowExtensionUnit[]
}

export const step = tag<Step>({ label: "workflow.step", default: {} })
export const workflowRun = tag<WorkflowRunOptions>({ label: "workflow.run" })
export const workflow = tag<WorkflowContext>({ label: "workflow.runtime" })
export const abortSignal = tag<AbortSignal>({ label: "workflow.abortSignal" })
export const activeWorkflowEvent = tag<WorkflowExecEvent>({ label: "workflow.event" })
export const runDefaults = tag<WorkflowRunDefaults>({ label: "workflow.runDefaults" })

export { eventLog, observer, units }

export function formatStepKey(key: WorkflowStepKey): string {
  return formatSuspenseStepKey(key)
}

export function workflowExtension(options: WorkflowExtensionOptions = {}): Lite.Extension {
  const base = suspenseExtension({
    name: "workflow",
    log: options.log,
    defaultTaskId: options.defaultTaskId,
    defaultRunId: options.defaultRunId,
    observe: options.observe,
    units: options.units ?? workflowExtensionUnits(options),
  })

  return {
    ...base,
    async wrapExec(next, target, ctx) {
      const wrapExec = base.wrapExec
      return withRuntimeTag(ctx, workflow, workflowIdentityOf(ctx, options), () =>
        wrapExec ? wrapExec(next, target, ctx) : next()
      )
    },
  }
}

export function workflowExtensionUnits(
  options: Pick<WorkflowExtensionOptions, "defaultTaskId" | "defaultRunId"> = {}
): WorkflowExtensionUnit[] {
  return [
    workflowRunIdentityUnit(options),
    workflowStepUnit(),
    activeWorkflowEventUnit(),
    workflowTimerUnit(),
  ]
}

export function workflowRunIdentityUnit(
  options: Pick<WorkflowExtensionOptions, "defaultTaskId" | "defaultRunId"> = {}
): WorkflowExtensionUnit {
  return {
    getKey: (ctx, target) => nextWorkflowKey(ctx, target, options),
  }
}

export function workflowStepUnit(): WorkflowExtensionUnit {
  return {
    shouldHandle: shouldHandleWorkflowTarget,
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
  }
}

export function activeWorkflowEventUnit(): WorkflowExtensionUnit {
  return {
    run: (event, next) => withActiveWorkflowEvent(event, next),
  }
}

export function workflowTimerUnit(): WorkflowExtensionUnit {
  return {
    run: (event, next) => runStepTimer(event.target, event.ctx, next),
  }
}

function withActiveWorkflowEvent(event: WorkflowExecEvent, next: () => Promise<unknown>): Promise<unknown> {
  const hadPrevious = event.ctx.data.hasTag(activeWorkflowEvent)
  const previous = event.ctx.data.getTag(activeWorkflowEvent)
  event.ctx.data.setTag(activeWorkflowEvent, event)
  return next().finally(() => {
    if (hadPrevious) event.ctx.data.setTag(activeWorkflowEvent, previous as WorkflowExecEvent)
    else event.ctx.data.deleteTag(activeWorkflowEvent)
  })
}

function nextWorkflowKey(
  ctx: Lite.ExecutionContext,
  target: Lite.ExecTarget,
  options: Pick<WorkflowExtensionOptions, "defaultTaskId" | "defaultRunId">
): WorkflowStepKey {
  const identity = workflowIdentityOf(ctx, options)
  const key = stepOf(target, ctx).key
  if (key !== undefined) return { taskId: identity.taskId, runId: identity.runId, step: key }
  let counter = ctx.data.seekTag(stepCounter)
  if (!counter) {
    counter = { next: 0 }
    rootContext(ctx).data.setTag(stepCounter, counter)
  }
  return { taskId: identity.taskId, runId: identity.runId, step: counter.next++ }
}

function workflowIdentityOf(
  ctx: Lite.ExecutionContext,
  options: Pick<WorkflowExtensionOptions, "defaultTaskId" | "defaultRunId">
): WorkflowContext {
  const config = ctx.data.seekTag(workflowRun)
  const defaults = ctx.data.seekTag(runDefaults)
  const taskId = config?.taskId ?? defaults?.defaultTaskId ?? options.defaultTaskId
  const runId = config?.runId ?? defaults?.defaultRunId ?? options.defaultRunId
  if (!taskId || !runId) throw new Error("workflowRun tag or workflowExtension defaults required")
  return { taskId, runId }
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
    config.remote === true ||
    config.durable === true ||
    config.timeoutMs !== undefined
  )
}

function rootContext(ctx: Lite.ExecutionContext): Lite.ExecutionContext {
  let current = ctx
  while (current.parent) current = current.parent
  return current
}

function runStepTimer(target: Lite.ExecTarget, ctx: Lite.ExecutionContext, next: () => Promise<unknown>): Promise<unknown> {
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

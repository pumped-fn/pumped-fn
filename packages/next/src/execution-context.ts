import { type Core, type Extension, type ExecutionContext, type Flow, type Tag as TagNS, type StandardSchemaV1 } from "./types"
import type { Tag } from "./tag-types"
import { tag } from "./tag"
import { validate, custom } from "./ssch"
import { Promised } from "./promises"
import { mergeFlowTags } from "./tags/merge"
import { applyExtensions } from "./internal/extension-utils"
import { createAbortWithTimeout } from "./internal/abort-utils"
import { createJournalKey, checkJournalReplay, type JournalEntry } from "./internal/journal-utils"
import { createExecutor, isExecutor } from "./executor"
import { isTag, isTagged } from "./tag-executors"
import { createSystemError, ExecutionContextClosedError } from "./errors"

export const flowDefinitionMeta: Tag.Tag<Flow.Definition<any, any>, false> = tag(
  custom<Flow.Definition<any, any>>(),
  { label: "flow.definition" }
)

export const flowMeta: {
  depth: Tag.Tag<number, true>
  flowName: Tag.Tag<string | undefined, false>
  parentFlowName: Tag.Tag<string | undefined, false>
  isParallel: Tag.Tag<boolean, true>
  journal: Tag.Tag<ReadonlyMap<string, unknown>, false>
} = {
  depth: tag(custom<number>(), { label: "flow.depth", default: 0 }),
  flowName: tag(custom<string | undefined>(), { label: "flow.name" }),
  parentFlowName: tag(custom<string | undefined>(), { label: "flow.parentName" }),
  isParallel: tag(custom<boolean>(), { label: "flow.isParallel", default: false }),
  journal: tag(custom<ReadonlyMap<string, unknown>>(), { label: "flow.journal" })
}

type ContextConfig = {
  parent: ExecutionContextImpl
  tags?: Tag.Tagged[]
  abortController?: AbortController
  flowName: string
  isParallel: boolean
}

type FlowCallConfig<F extends Flow.UFlow> = {
  flow: F
  input: Flow.InferInput<F>
  key?: string
  timeout?: number
  retry?: number
  tags?: Tag.Tagged[]
}

type FnCallConfig = {
  fn: (...args: readonly unknown[]) => unknown
  params?: readonly unknown[]
  key?: string
  timeout?: number
  retry?: number
  tags?: Tag.Tagged[]
}

type DefineConfig<S, I> = {
  name?: string
  version?: string
  input: StandardSchemaV1<I>
  output: StandardSchemaV1<S>
  tags?: Tag.Tagged[]
}

const createFlowFromDefinition = <S, I>(
  config: DefineConfig<S, I>,
  handler: (ctx: Flow.Context, input: I) => Promise<S> | S
): Flow.Flow<I, S> => {
  const factory = (() => {
    const flowHandler = async (ctx: Flow.Context, input: I) => {
      return handler(ctx, input)
    }
    return flowHandler as Flow.Handler<S, I>
  }) as Core.NoDependencyFn<Flow.Handler<S, I>>

  const definition = {
    name: config.name || "anonymous",
    version: config.version || "1.0.0",
    input: config.input,
    output: config.output
  }

  const executor = createExecutor(factory, undefined, [
    ...(config.tags || []),
    flowDefinitionMeta(definition)
  ]) as Flow.Flow<I, S>

  executor.definition = definition
  return executor
}

const createFlowWithDependencies = <S, I, D extends Core.DependencyLike>(
  config: DefineConfig<S, I>,
  dependencies: D,
  handler: (
    deps: Core.InferOutput<D>,
    ctx: Flow.Context,
    input: I
  ) => Promise<S> | S
): Flow.Flow<I, S> => {
  const factory = ((deps: unknown, _controller: Core.Controller) => {
    const flowHandler = async (ctx: Flow.Context, input: I) => {
      return handler(deps as Core.InferOutput<D>, ctx, input)
    }
    return flowHandler as Flow.Handler<S, I>
  }) as Core.DependentFn<Flow.Handler<S, I>, unknown>

  const definition = {
    name: config.name || "anonymous",
    version: config.version || "1.0.0",
    input: config.input,
    output: config.output
  }

  const executor = createExecutor(factory, dependencies as
    | Core.UExecutor
    | ReadonlyArray<Core.UExecutor>
    | Record<string, Core.UExecutor>, [
    ...(config.tags || []),
    flowDefinitionMeta(definition)
  ]) as Flow.Flow<I, S>

  executor.definition = definition
  return executor
}

namespace ExecConfig {
  export type Flow<F extends Flow.UFlow> = {
    type: "flow"
    flow: F
    input: Flow.InferInput<F>
    key?: string
    timeout?: number
    retry?: number
    tags?: Tag.Tagged[]
  }

  export type Fn<T = unknown, Params extends readonly unknown[] = readonly unknown[]> = {
    type: "fn"
    fn: (...args: Params) => T | Promise<T>
    params: Params
    key?: string
    timeout?: number
    retry?: number
    tags?: Tag.Tagged[]
  }

  export type Normalized<T = unknown> = Flow<any> | Fn<T>
}

type UnwrappedExecutor<T> = {
  executor: () => Promised<T>
  operation: Extension.Operation
}

const getOperationKey = (journalKey?: string): string | undefined => {
  if (!journalKey) return undefined
  const parts = journalKey.split(":")
  return parts.length > 2 ? parts[2] : undefined
}

const ensureJournalStore = <T>(ctx: ExecutionContextImpl): Map<string, JournalEntry<T>> => {
  if (!ctx["journal"]) {
    ctx["journal"] = new Map()
  }
  return ctx["journal"] as Map<string, JournalEntry<T>>
}

const runWithJournal = async <T>(
  ctx: ExecutionContextImpl,
  journalKey: string,
  executor: () => Promise<T>
): Promise<T> => {
  const journal = ensureJournalStore<T>(ctx)
  const { isReplay, value } = checkJournalReplay(journal, journalKey)

  if (isReplay) {
    return value!
  }

  ctx.throwIfAborted()

  try {
    const result = await executor()
    journal.set(journalKey, result)
    return result
  } catch (error) {
    journal.set(journalKey, { __error: true, error })
    throw error
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const hasInputOutput = (
  value: Record<string, unknown>
): value is DefineConfig<unknown, unknown> => {
  return "input" in value && "output" in value
}

const isDefineConfig = (value: unknown): value is DefineConfig<any, any> => {
  return isPlainObject(value) && hasInputOutput(value)
}

const isDependencyCandidate = (value: unknown): boolean => {
  return typeof value === "function" || isExecutor(value)
}

const isDependencyCollection = (
  value: unknown
): value is Core.DependencyLike => {
  if (!value) {
    return false
  }
  if (isExecutor(value)) {
    return true
  }
  if (Array.isArray(value)) {
    return value.length === 0 || value.every(isDependencyCandidate)
  }
  if (!isPlainObject(value)) {
    return false
  }
  if (hasInputOutput(value)) {
    return false
  }
  const entries = Object.values(value)
  if (entries.length === 0) {
    return true
  }
  return entries.every(isDependencyCandidate)
}

const isFlowCallConfig = <F extends Flow.UFlow>(
  value: unknown
): value is FlowCallConfig<F> => {
  if (!value || typeof value !== "object") {
    return false
  }
  return "flow" in value && "input" in value
}

const isFnCallConfig = (value: unknown): value is FnCallConfig => {
  if (!value || typeof value !== "object") {
    return false
  }
  return "fn" in value && typeof (value as FnCallConfig).fn === "function"
}

function flowImpl<I, S>(
  handler: (ctx: Flow.Context, input: I) => Promise<S> | S
): Flow.Flow<I, S>

function flowImpl<D extends Core.DependencyLike, I, S>(
  dependencies: D,
  handler: (
    deps: Core.InferOutput<D>,
    ctx: Flow.Context,
    input: I
  ) => Promise<S> | S
): Flow.Flow<I, S>

function flowImpl<I, S>(
  handler: (ctx: Flow.Context, input: I) => Promise<S> | S,
  ...tags: Tag.Tagged[]
): Flow.Flow<I, S>

function flowImpl<D extends Core.DependencyLike, I, S>(
  dependencies: D,
  handler: (
    deps: Core.InferOutput<D>,
    ctx: Flow.Context,
    input: I
  ) => Promise<S> | S,
  ...tags: Tag.Tagged[]
): Flow.Flow<I, S>

function flowImpl<S, I>(
  config: DefineConfig<S, I>,
  handler: (ctx: Flow.Context, input: I) => Promise<S> | S
): Flow.Flow<I, S>

function flowImpl<S, I, D extends Core.DependencyLike>(
  config: DefineConfig<S, I>,
  dependencies: D,
  handler: (
    deps: Core.InferOutput<D>,
    ctx: Flow.Context,
    input: I
  ) => Promise<S> | S
): Flow.Flow<I, S>

function flowImpl<S, I, D extends Core.DependencyLike>(
  first:
    | DefineConfig<S, I>
    | D
    | ((ctx: Flow.Context, input: I) => Promise<S> | S),
  second?:
    | D
    | ((ctx: Flow.Context, input: I) => Promise<S> | S)
    | ((
        deps: Core.InferOutput<D>,
        ctx: Flow.Context,
        input: I
      ) => Promise<S> | S)
    | Tag.Tagged,
  third?:
    | ((
        deps: Core.InferOutput<D>,
        ctx: Flow.Context,
        input: I
      ) => Promise<S> | S)
    | Tag.Tagged,
  ...rest: Tag.Tagged[]
): Flow.Flow<I, S> {
  const allTags: Tag.Tagged[] = []

  const isHandlerOnly = typeof first === "function"
  const hasDeps = isDependencyCollection(first)

  if (isHandlerOnly || (hasDeps && typeof second === "function")) {
    const tagParams = hasDeps
      ? [third, ...rest].filter(t => t !== undefined)
      : [second, third, ...rest].filter(t => t !== undefined)

    for (const item of tagParams) {
      if (!isTagged(item)) {
        throw new Error("Invalid tag: expected Tag.Tagged from tag()")
      }
      allTags.push(item)
    }
  }

  if (typeof first === "function") {
    if (isTag(first)) {
      throw new Error("flow(handler) requires handler function")
    }
    const handler = first as (ctx: Flow.Context, input: I) => Promise<S> | S
    return createFlowFromDefinition({
      input: custom<I>(),
      output: custom<S>(),
      tags: allTags.length > 0 ? allTags : undefined
    }, handler)
  }

  if (isDependencyCollection(first)) {
    if (typeof second !== "function" || isTag(second)) {
      throw new Error("flow(deps, handler) requires handler as second argument")
    }
    const handler = second as (
      deps: Core.InferOutput<D>,
      ctx: Flow.Context,
      input: I
    ) => Promise<S> | S
    return createFlowWithDependencies({
      input: custom<I>(),
      output: custom<S>(),
      tags: allTags.length > 0 ? allTags : undefined
    }, first, handler)
  }

  if (isDefineConfig(first)) {
    const config = first as DefineConfig<S, I>

    if ("handler" in config || "dependencies" in config) {
      throw new Error(
        "Config object cannot contain 'handler' or 'dependencies' properties. Use flow(config, handler) or flow(config, deps, handler) instead."
      )
    }

    if (!second) {
      throw new Error("flow(config) requires handler as second argument")
    }

    if (typeof second === "function") {
      if (isTag(second)) {
        throw new Error("flow(config, handler) requires handler function")
      }
      return createFlowFromDefinition(config, second as (ctx: Flow.Context, input: I) => Promise<S> | S)
    }

    if (isExecutor(second)) {
      if (!third || typeof third !== "function" || isTag(third)) {
        throw new Error(
          "flow(config, deps, handler) requires handler as third argument"
        )
      }
      return createFlowWithDependencies(config, second, third)
    }

    throw new Error(
      "Invalid flow() call: second argument must be handler function or dependencies"
    )
  }

  if (isPlainObject(first)) {
    throw new Error(
      "Invalid flow() call: first argument must be either a config object with 'input' and 'output' properties, or a valid dependency object containing executors/functions"
    )
  }

  throw new Error(
    "Invalid flow() call: first argument must be handler, dependencies, or config object"
  )
}

export { flowImpl }

const executeFlowHandler = async <S, I>(
  handler: Flow.Handler<S, I>,
  definition: Flow.Definition<S, I>,
  input: I,
  context: ExecutionContextImpl
): Promise<S> => {
  const validated = validate(definition.input, input)
  const result = await handler(context, validated)
  validate(definition.output, result)
  return result
}

const createChildContext = (config: ContextConfig): ExecutionContextImpl => {
  const childCtx = new ExecutionContextImpl({
    scope: config.parent.scope,
    extensions: config.parent["extensions"],
    tags: config.tags,
    parent: config.parent,
    abortController: config.abortController,
    details: { name: config.flowName }
  })
  childCtx.initializeExecutionContext(config.flowName, config.isParallel)

  config.parent["~registerChild"](childCtx)

  return childCtx
}

const createFlowExecutionDescriptor = <F extends Flow.UFlow>(
  config: ExecConfig.Flow<F>,
  parentCtx: ExecutionContextImpl,
  controller: AbortController
): UnwrappedExecutor<Flow.InferOutput<F>> => {
  const definition = flowDefinitionMeta.readFrom(config.flow)
  if (!definition) {
    throw createSystemError(
      parentCtx.find(flowMeta.flowName) ?? "flow-definition-missing",
      []
    )
  }

  const childCtx = createChildContext({
    parent: parentCtx,
    tags: mergeFlowTags(definition.tags, config.tags),
    abortController: controller,
    flowName: definition.name,
    isParallel: false
  })

  const journalKey = config.key
    ? createJournalKey(
        parentCtx.find(flowMeta.flowName) || "unknown",
        parentCtx.get(flowMeta.depth),
        config.key
      )
    : undefined

  return {
    executor: () =>
      parentCtx.scope.resolve(config.flow, false, childCtx).map(async (handler) => {
        const runHandler = () =>
          executeFlowHandler(
            handler as Flow.Handler<Flow.InferOutput<F>, Flow.InferInput<F>>,
            definition,
            config.input,
            childCtx
          )

        const executor = async () => {
          if (!journalKey) {
            return runHandler()
          }
          return runWithJournal(parentCtx, journalKey, runHandler)
        }

        try {
          const result = await executor()
          childCtx.end()
          return result
        } catch (error) {
          childCtx.details.error = error
          childCtx.end()
          throw error
        }
      }),
    operation: {
      kind: "execution",
      name: definition.name,
      mode: "sequential",
      input: config.input,
      key: getOperationKey(journalKey),
      context: childCtx,
      flow: config.flow,
      definition
    }
  }
}

const createFnExecutionDescriptor = <T>(
  config: ExecConfig.Fn<T>,
  parentCtx: ExecutionContextImpl
): UnwrappedExecutor<T> => {
  const journalKey = config.key
    ? createJournalKey(
        parentCtx.find(flowMeta.flowName) || "unknown",
        parentCtx.get(flowMeta.depth),
        config.key
      )
    : undefined

  const runFn = () => Promise.resolve(config.fn(...config.params))

  return {
    executor: () => {
      if (!journalKey) {
        return Promised.create(runFn())
      }
      return Promised.create(runWithJournal(parentCtx, journalKey, runFn))
    },
    operation: {
      kind: "execution",
      name: "fn",
      mode: "sequential",
      input: undefined,
      key: getOperationKey(journalKey),
      context: parentCtx,
      params: config.params.length > 0 ? config.params : undefined
    }
  }
}

const createExecutionDescriptor = (
  config: ExecConfig.Normalized,
  parentCtx: ExecutionContextImpl,
  controller: AbortController
): UnwrappedExecutor<unknown> => {
  if (config.type === "flow") {
    return createFlowExecutionDescriptor(config, parentCtx, controller)
  }
  return createFnExecutionDescriptor(config, parentCtx)
}

const executeAndWrap = <T>(
  unwrapped: UnwrappedExecutor<T>,
  ctx: ExecutionContextImpl
): Promised<T> => {
  const wrapped = ctx["wrapWithExtensions"](unwrapped.executor, unwrapped.operation)
  return Promised.create(wrapped())
}

const executeWithTimeout = async <T>(
  executor: () => Promised<T>,
  timeout: number | undefined,
  timeoutId: NodeJS.Timeout | null,
  controller: AbortController
): Promise<T> => {
  if (!timeout) {
    return await executor()
  }

  let rejectAbort: ((reason: Error) => void) | null = null
  const abortPromise = new Promise<never>((_, reject) => {
    rejectAbort = reject
    if (controller.signal.aborted) {
      reject(controller.signal.reason || new Error("Operation aborted"))
      return
    }
    controller.signal.addEventListener(
      "abort",
      () => {
        reject(controller.signal.reason || new Error("Operation aborted"))
      },
      { once: true }
    )
  })

  abortPromise.catch(() => {})

  try {
    return await Promise.race([executor(), abortPromise])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

export class ExecutionContextImpl implements ExecutionContext.Context {
  readonly scope: Core.Scope
  readonly parent: ExecutionContext.Context | undefined
  readonly id: string
  readonly tagStore: Tag.Store
  readonly signal: AbortSignal
  readonly details: ExecutionContext.Details
  readonly tags: Tag.Tagged[] | undefined

  private extensions: Extension.Extension[]
  private contextData: Map<unknown, unknown>
  private journal: Map<string, unknown> | null = null
  private abortController: AbortController
  private tagData: Map<symbol, unknown>

  private _state: ExecutionContext.ContextState = 'active'
  private stateChangeCallbacks: Set<(state: ExecutionContext.ContextState, prev: ExecutionContext.ContextState) => void> = new Set()
  private inFlight: Set<Promise<unknown>> = new Set()
  private children: Set<ExecutionContextImpl> = new Set()
  private closePromise: Promise<void> | null = null

  constructor(config: {
    scope: Core.Scope
    extensions: Extension.Extension[]
    tags?: Tag.Tagged[]
    parent?: ExecutionContext.Context
    abortController?: AbortController
    details?: Partial<ExecutionContext.Details>
  }) {
    this.scope = config.scope
    this.extensions = [...config.extensions]
    this.parent = config.parent
    this.tags = config.tags

    this.id = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `ctx-${Date.now()}-${Math.random()}`

    const details = config.details ?? {}
    this.details = {
      name: details.name || "execution",
      startedAt: details.startedAt || Date.now(),
      completedAt: details.completedAt,
      error: details.error,
      metadata: details.metadata
    }

    this.abortController = config.abortController || new AbortController()
    this.signal = this.abortController.signal

    this.contextData = new Map()
    this.tagData = new Map()
    this.tagStore = {
      get: (key: unknown) => {
        if (typeof key !== "symbol") return undefined
        if (this.tagData.has(key)) {
          return this.tagData.get(key)
        }
        return this.parent?.tagStore.get(key)
      },
      set: (key: unknown, value: unknown) => {
        if (typeof key !== "symbol") return undefined
        const prev = this.tagData.get(key as symbol)
        this.tagData.set(key as symbol, value)
        return prev
      }
    }

    if (!this.parent && this.scope.tags) {
      for (const tagged of this.scope.tags) {
        this.tagStore.set(tagged.key, tagged.value)
      }
    }
    if (this.tags) {
      for (const tagged of this.tags) {
        this.tagStore.set(tagged.key, tagged.value)
      }
    }
  }

  private wrapWithExtensions<T>(
    baseExecutor: () => Promised<T>,
    operation: Extension.Operation
  ): () => Promised<T> {
    return applyExtensions(this.extensions, baseExecutor, this.scope, operation)
  }

  private readSymbolValue(key: symbol): unknown {
    if (this.tags) {
      const tagged = this.tags.find((entry) => entry.key === key)
      if (tagged) {
        return tagged.value
      }
    }
    if (this.scope.tags) {
      const tagged = this.scope.tags.find((entry) => entry.key === key)
      if (tagged) {
        return tagged.value
      }
    }
    if (this.parent) {
      return (this.parent.get as (key: unknown) => unknown)(key)
    }
    return undefined
  }

  private readStoredValue(key: unknown): unknown {
    if (this.contextData.has(key)) {
      return this.contextData.get(key)
    }
    if (typeof key === "symbol") {
      return this.readSymbolValue(key)
    }
    if (this.parent) {
      return (this.parent.get as (key: unknown) => unknown)(key)
    }
    return undefined
  }

  initializeExecutionContext(flowName: string, isParallel: boolean = false): void {
    const parentDepth = this.parent ? this.parent.get(flowMeta.depth) : undefined
    const currentDepth = parentDepth !== undefined ? parentDepth + 1 : 0
    const parentFlowName = this.parent ? this.parent.find(flowMeta.flowName) : undefined

    this.set(flowMeta.depth, currentDepth)
    this.set(flowMeta.flowName, flowName)
    this.set(flowMeta.parentFlowName, parentFlowName)
    this.set(flowMeta.isParallel, isParallel)
  }

  get<T>(accessor: Tag.Tag<T, false> | Tag.Tag<T, true>): T
  get<T>(accessorOrKey: unknown): T | unknown {
    if (
      (typeof accessorOrKey === "object" || typeof accessorOrKey === "function") &&
      accessorOrKey !== null &&
      "extractFrom" in accessorOrKey
    ) {
      const accessor = accessorOrKey as Tag.Tag<T, false> | Tag.Tag<T, true>
      return accessor.extractFrom(this.tagStore)
    }
    return this.readStoredValue(accessorOrKey)
  }

  find<T>(tag: Tag.Tag<T, false>): T | undefined
  find<T>(tag: Tag.Tag<T, true>): T
  find<T>(tag: Tag.Tag<T, boolean>): T | undefined {
    return tag.readFrom(this.tagStore)
  }

  set<T>(accessor: Tag.Tag<T, false> | Tag.Tag<T, true>, value: T): void
  set<T>(accessorOrKey: unknown, value: unknown): void | unknown {
    if (
      accessorOrKey !== null &&
      accessorOrKey !== undefined &&
      (typeof accessorOrKey === "object" || typeof accessorOrKey === "function") &&
      "writeToStore" in accessorOrKey
    ) {
      const accessor = accessorOrKey as Tag.Tag<T, false> | Tag.Tag<T, true>
      accessor.writeToStore(this.tagStore, value as T)
      return
    }
    const key = accessorOrKey
    this.contextData.set(key, value)
    return value
  }

  exec<F extends Flow.UFlow>(
    config: {
      flow: F
      key?: string
      timeout?: number
      retry?: number
      tags?: Tag.Tagged[]
    } & (Flow.InferInput<F> extends void | undefined
      ? { input?: never }
      : { input: Flow.InferInput<F> })
  ): Promised<Flow.InferOutput<F>>
  exec<T>(config: {
    fn: () => T | Promise<T>
    params?: never
    key?: string
    timeout?: number
    retry?: number
    tags?: Tag.Tagged[]
  }): Promised<T>
  exec<Fn extends (...args: readonly unknown[]) => unknown>(config: {
    fn: Fn
    params: Parameters<Fn>
    key?: string
    timeout?: number
    retry?: number
    tags?: Tag.Tagged[]
  }): Promised<ReturnType<Fn>>
  exec<F extends Flow.UFlow>(
    config: {
      flow?: F
      fn?: (...args: readonly unknown[]) => unknown
      input?: Flow.InferInput<F>
      params?: readonly unknown[]
      key?: string
      timeout?: number
      retry?: number
      tags?: Tag.Tagged[]
    }
  ): Promised<any> {
    this.throwIfAborted()
    this.throwIfClosed()

    const normalizedConfig = this.parseExecOverloads(config)
    const { controller, timeoutId } = createAbortWithTimeout(
      normalizedConfig.timeout,
      this.signal
    )

    const descriptor = createExecutionDescriptor(normalizedConfig, this, controller)
    const wrapped = () => executeAndWrap(descriptor, this)

    const execution = executeWithTimeout(wrapped, normalizedConfig.timeout, timeoutId, controller)
    this["~trackExecution"](execution)

    return Promised.create(execution)
  }

  private parseExecOverloads<F extends Flow.UFlow>(
    config: {
      flow?: F
      fn?: (...args: readonly unknown[]) => unknown
      input?: Flow.InferInput<F>
      params?: readonly unknown[]
      key?: string
      timeout?: number
      retry?: number
      tags?: Tag.Tagged[]
    }
  ): ExecConfig.Normalized {
    if (isFlowCallConfig<F>(config)) {
      return {
        type: "flow",
        flow: config.flow,
        input: config.input,
        key: config.key,
        timeout: config.timeout,
        retry: config.retry,
        tags: config.tags
      }
    }
    if (isFnCallConfig(config)) {
      return {
        type: "fn",
        fn: config.fn,
        params: config.params ?? [],
        key: config.key,
        timeout: config.timeout,
        retry: config.retry,
        tags: config.tags
      }
    }
    throw new Error("Invalid config: must have either 'flow' or 'fn'")
  }

  parallel<T extends readonly Promised<any>[]>(
    promises: [...T]
  ): Promised<
    Flow.ParallelResult<{
      [K in keyof T]: T[K] extends Promised<infer R> ? R : never
    }>
  > {
    type Results = Flow.ParallelResult<{
      [K in keyof T]: T[K] extends Promised<infer R> ? R : never
    }>["results"]

    const aggregate = () => Promise.all(promises).then((results) => results as Results)

    const stats = (results: Results) => ({
      total: results.length,
      succeeded: results.length,
      failed: 0
    })

    return this.runParallelExecutor(promises, "parallel", aggregate, stats)
  }

  parallelSettled<T extends readonly Promised<any>[]>(
    promises: [...T]
  ): Promised<
    Flow.ParallelSettledResult<{
      [K in keyof T]: T[K] extends Promised<infer R> ? R : never
    }>
  > {
    type Settled = Flow.ParallelSettledResult<{
      [K in keyof T]: T[K] extends Promised<infer R> ? R : never
    }>["results"]

    const aggregate = () =>
      Promise.allSettled(promises).then((results) => results as Settled)

    const stats = (results: Settled) => {
      const succeeded = results.filter((r) => r.status === "fulfilled").length
      const failed = results.length - succeeded
      return {
        total: results.length,
        succeeded,
        failed
      }
    }

    return this.runParallelExecutor(promises, "parallelSettled", aggregate, stats)
  }

  private runParallelExecutor<T>(
    promises: readonly Promised<any>[],
    mode: "parallel" | "parallelSettled",
    aggregate: () => Promise<T>,
    statsBuilder: (results: T) => {
      total: number
      succeeded: number
      failed: number
    }
  ): Promised<{
    results: T
    stats: { total: number; succeeded: number; failed: number }
  }> {
    const executeCore = (): Promised<{
      results: T
      stats: { total: number; succeeded: number; failed: number }
    }> => {
      return Promised.create(
        aggregate().then((results) => ({
          results,
          stats: statsBuilder(results)
        }))
      )
    }

    const operation: Extension.ExecutionOperation = {
      kind: "execution",
      name: "parallel",
      mode: mode === "parallel" ? "parallel" : "parallel-settled",
      input: undefined,
      key: undefined,
      context: this,
      count: promises.length
    }

    const executor = this.wrapWithExtensions(executeCore, operation)
    const result = Promised.create(executor())

    this["~trackExecution"](result.toPromise())

    return result
  }

  resetJournal(keyPattern?: string): void {
    if (!this.journal) {
      return
    }

    if (!keyPattern) {
      this.journal.clear()
      return
    }

    const keysToDelete: string[] = []
    for (const key of this.journal.keys()) {
      if (key.includes(keyPattern)) {
        keysToDelete.push(key)
      }
    }

    for (const key of keysToDelete) {
      this.journal.delete(key)
    }
  }

  createSnapshot(): Flow.ExecutionData {
    let snapshotData: Map<unknown, unknown> | null = null

    const getSnapshot = () => {
      if (!snapshotData) {
        snapshotData = new Map(this.contextData)
        if (this.journal) {
          snapshotData.set(flowMeta.journal.key, new Map(this.journal))
        }
      }
      return snapshotData
    }

    const snapshotContext = this
    const dataStore = {
      get: (key: unknown) => {
        const snapshot = getSnapshot()
        if (snapshot.has(key)) {
          return snapshot.get(key)
        }
        return snapshotContext.tagStore.get(key)
      },
      set: (_key: unknown, _value: unknown) => {
        throw new Error("Cannot set values on execution snapshot")
      },
      tags: this.tags
    }

    return {
      context: {
        get<T>(accessor: Tag.Tag<T, false> | Tag.Tag<T, true>): T {
          return accessor.extractFrom(dataStore)
        },
        find<T>(accessor: Tag.Tag<T, false> | Tag.Tag<T, true>): T | undefined {
          return accessor.readFrom(dataStore)
        }
      }
    }
  }

  end(): void {
    if (!this.details.completedAt) {
      this.details.completedAt = Date.now()
    }
  }

  throwIfAborted(): void {
    if (this.signal.aborted) {
      throw new Error("Execution aborted")
    }
  }

  private throwIfClosed(): void {
    if (this._state !== 'active') {
      throw new ExecutionContextClosedError(this.id, this._state)
    }
  }

  get state(): ExecutionContext.ContextState {
    return this._state
  }

  get closed(): boolean {
    return this._state === 'closed'
  }

  private setState(newState: ExecutionContext.ContextState): void {
    const prev = this._state
    if (prev === newState) return
    this._state = newState
    for (const cb of this.stateChangeCallbacks) {
      try {
        cb(newState, prev)
      } catch {
        // Callback errors must not prevent state transitions from completing
      }
    }
  }

  onStateChange(callback: (state: ExecutionContext.ContextState, prev: ExecutionContext.ContextState) => void): () => void {
    this.stateChangeCallbacks.add(callback)
    return () => {
      this.stateChangeCallbacks.delete(callback)
    }
  }

  close(options?: { mode?: 'graceful' | 'abort' }): Promise<void> {
    if (this.closePromise) {
      return this.closePromise
    }

    if (this._state === 'closed') {
      this.closePromise = Promise.resolve()
      return this.closePromise
    }

    const mode = options?.mode ?? 'graceful'

    this.closePromise = this.performClose(mode)
    return this.closePromise
  }

  private async performClose(mode: 'graceful' | 'abort'): Promise<void> {
    this.setState('closing')
    await this["~emitLifecycleOperation"]('closing', mode)

    if (mode === 'abort') {
      this.abortController.abort(new Error('Context closed'))
    }

    const childResults = await Promise.allSettled(
      Array.from(this.children).map(child => child.close({ mode }))
    )

    const inFlightResults = await Promise.allSettled([...this.inFlight])

    this.children.clear()
    this.inFlight.clear()

    if (this.parent instanceof ExecutionContextImpl) {
      this.parent["~unregisterChild"](this)
    }

    this.end()
    this.setState('closed')

    const errors: unknown[] = []
    for (const r of [...childResults, ...inFlightResults]) {
      if (r.status === 'rejected') {
        errors.push(r.reason)
      }
    }

    try {
      await this["~emitLifecycleOperation"]('closed', mode)
    } catch (extensionError) {
      errors.push(extensionError)
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, 'Errors occurred during context close')
    }
  }

  "~emitLifecycleOperation"(phase: 'create' | 'closing' | 'closed', mode?: 'graceful' | 'abort'): Promise<void> {
    const operation: Extension.ContextLifecycleOperation = {
      kind: 'context-lifecycle',
      phase,
      context: this,
      mode
    }

    const noop = () => Promised.create(Promise.resolve(undefined))
    const wrapped = applyExtensions(this.extensions, noop, this.scope, operation)
    return wrapped().toPromise()
  }

  "~registerChild"(child: ExecutionContextImpl): void {
    this.children.add(child)
  }

  "~unregisterChild"(child: ExecutionContextImpl): void {
    this.children.delete(child)
  }

  "~trackExecution"<T>(promise: Promise<T>): Promise<T> {
    this.inFlight.add(promise)
    const tracked = promise.finally(() => {
      this.inFlight.delete(promise)
    })
    // Suppress unhandled rejection - the caller is responsible for error handling
    tracked.catch(() => {})
    return promise
  }
}

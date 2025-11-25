import type { Core, Flow } from "./types"
import { createScope, type ScopeOption } from "./scope"
import type { Tag } from "./tag"
import { Promised } from "./primitives"
import { flowImpl, flowMeta } from "./execution-context"

const normalizeExecuteOptions = (
  options?:
    | {
        scope: Core.Scope
        executionTags?: Tag.Tagged[]
        details?: boolean
      }
    | (Omit<ScopeOption, "tags"> & {
        scopeTags?: Tag.Tagged[]
        executionTags?: Tag.Tagged[]
        details?: boolean
      })
): {
  scope: Core.Scope
  disposeScope: boolean
  executionTags?: Tag.Tagged[]
  details: boolean
} => {
  if (options && "scope" in options) {
    return {
      scope: options.scope,
      disposeScope: false,
      executionTags: options.executionTags,
      details: options.details === true
    }
  }

  const scope = options
    ? createScope({
        initialValues: options.initialValues,
        registry: options.registry,
        extensions: options.extensions,
        tags: options.scopeTags
      })
    : createScope()

  return {
    scope,
    disposeScope: true,
    executionTags: options?.executionTags,
    details: options?.details === true
  }
}

const createExecutionDetailsResult = <S>(
  execution: Flow.Execution<S>,
  scopeToDispose?: Core.Scope
): Promised<Flow.ExecutionDetails<S>> => {
  const dispose = scopeToDispose
    ? async () => {
        await scopeToDispose.dispose()
      }
    : async () => {}

  return Promised.create(
    execution.result
      .then(async (result) => {
        await dispose()
        const ctx = await execution.result.ctx()
        if (!ctx) {
          throw new Error("Execution context not available")
        }
        return { success: true as const, result, ctx }
      })
      .catch(async (error) => {
        await dispose()
        const ctx = await execution.result.ctx()
        if (!ctx) {
          throw new Error("Execution context not available")
        }
        return { success: false as const, error, ctx }
      })
  )
}

function execute<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>> | Flow.Flow<I, S>,
  input: I,
  options: {
    scope: Core.Scope
    executionTags?: Tag.Tagged[]
    details: true
  }
): Promised<Flow.ExecutionDetails<S>>

function execute<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>> | Flow.Flow<I, S>,
  input: I,
  options?: {
    scope: Core.Scope
    executionTags?: Tag.Tagged[]
    details?: false
  }
): Promised<S>

function execute<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>> | Flow.Flow<I, S>,
  input: I,
  options: Omit<ScopeOption, "tags"> & {
    scopeTags?: Tag.Tagged[]
    executionTags?: Tag.Tagged[]
    details: true
  }
): Promised<Flow.ExecutionDetails<S>>

function execute<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>> | Flow.Flow<I, S>,
  input: I,
  options?: Omit<ScopeOption, "tags"> & {
    scopeTags?: Tag.Tagged[]
    executionTags?: Tag.Tagged[]
    details?: false
  }
): Promised<S>

function execute<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>> | Flow.Flow<I, S>,
  input: I,
  options?:
    | {
        scope: Core.Scope
        executionTags?: Tag.Tagged[]
        details?: boolean
      }
    | (Omit<ScopeOption, "tags"> & {
        scopeTags?: Tag.Tagged[]
        executionTags?: Tag.Tagged[]
        details?: boolean
      })
): Promised<S> | Promised<Flow.ExecutionDetails<S>> {
  const normalized = normalizeExecuteOptions(options)
  const execution = normalized.scope.exec({
    flow,
    input,
    tags: normalized.executionTags
  })

  if (normalized.details) {
    return createExecutionDetailsResult(
      execution,
      normalized.disposeScope ? normalized.scope : undefined
    )
  }

  if (normalized.disposeScope) {
    return Promised.create(
      execution.result
        .then((r) => normalized.scope.dispose().then(() => r))
        .catch(async (error) => {
          await normalized.scope.dispose()
          throw error
        }),
      execution.result.ctx()
    ) as Promised<S>
  }
  return execution.result
}

export const flow: typeof flowImpl & { execute: typeof execute } = Object.assign(
  flowImpl,
  { execute }
)

export { flowMeta }

import type {
  ExecutorError as InternalExecutorError,
  Extension as InternalExtension,
  Flow as InternalFlow,
  MaybePromised as InternalMaybePromised,
  Multi as InternalMulti,
  StandardSchemaV1 as InternalStandardSchemaV1,
  Core as InternalCore,
  ExecutionContext as InternalExecutionContext,
} from "./types"
import type { Tag as TagType } from "./tag"
import type * as TagTypes from "./tag"
import * as errorsModule from "./errors"
import * as multiModule from "./multi"
import * as primitivesModule from "./primitives"
import { tag as tagImpl } from "./tag"
import { custom as customSchema } from "./primitives"

const standardSchema: typeof primitivesModule = primitivesModule
const multi: typeof multiModule = multiModule
const errors: typeof errorsModule = errorsModule

/**
 * Promise-aware helper returned by several APIs to carry execution metadata.
 */
export { Promised } from "./primitives"

/**
 * Toolkit for defining schema primitives compatible with Pumped-fn tags.
 */
export { standardSchema }

/**
 * Multi-executor helpers for key-scoped executor pools.
 */
export { multi }

/**
 * Canonical error catalog helpers for executor failures.
 */
export { errors }

/**
 * Build tag-aware schema instances or adapters.
 */
export { custom } from "./primitives"

/**
 * Creates a typed tag accessor bound to a schema.
 */
export { tag } from "./tag"

/**
 * Curated helpers for extracting metadata from tags.
 */
export { tags } from "./tag"

/**
 * Create a new execution scope with optional presets, registry, and extensions.
 */
export { createScope, type ScopeOption } from "./scope"

/**
 * Resolve a tree of executors inside a scope and return typed values.
 */
export { resolves } from "./helpers"

/**
 * Create typed extensions with init/wrap/onError/dispose hooks.
 */
export { extension } from "./helpers"

/**
 * Register a dependency-free executor that resolves directly from the controller.
 */
export { provide } from "./executor"

/**
 * Register an executor that depends on other executors before producing a value.
 */
export { derive } from "./executor"

/**
 * Override executor output within a scope using static values or other executors.
 */
export { preset } from "./executor"

/**
 * Runtime check verifying any object implements the executor contract.
 */
export { isExecutor } from "./executor"

/**
 * Runtime check verifying an executor was produced through the lazy channel.
 */
export { isLazyExecutor } from "./executor"

/**
 * Runtime check verifying an executor exposes the reactive channel.
 */
export { isReactiveExecutor } from "./executor"

/**
 * Runtime check verifying an executor exposes a static channel accessor.
 */
export { isStaticExecutor } from "./executor"

/**
 * Runtime check verifying the executor instance represents the main factory.
 */
export { isMainExecutor } from "./executor"

/**
 * Runtime check verifying a value represents a preset override entry.
 */
export { isPreset } from "./executor"

/**
 * Orchestrates flow factories and exposes helpers for standalone executions.
 */
export { flow } from "./flow"

/**
 * Accessor for metadata injected during flow definition.
 */
export { flowMeta } from "./flow"

/**
 * Error thrown when schema validation fails.
 */
export { SchemaError } from "./errors"

/**
 * Base executor resolution error capturing scope context.
 */
export { ExecutorResolutionError } from "./errors"

/**
 * Error thrown when executor factory throws or rejects.
 */
export { FactoryExecutionError } from "./errors"

/**
 * Error thrown when dependencies cannot be resolved.
 */
export { DependencyResolutionError } from "./errors"

/**
 * Flow-level error used for descriptive failures inside handlers.
 */
export { FlowError } from "./types"

/**
 * Error thrown when flow input or output validation fails.
 */
export { FlowValidationError } from "./types"

/**
 * Error thrown when operations are attempted on a closed ExecutionContext.
 */
export { ExecutionContextClosedError } from "./errors"

/**
 * Static analysis namespace containing types and functions for factory introspection.
 */
export { Sucrose, separateFunction, analyze, generate } from "./sucrose"

/**
 * Standard tag representing the friendly executor name.
 */
export const name: TagType.Tag<string, false> = tagImpl(customSchema<string>(), {
  label: "pumped-fn/name",
})

/**
 * Tag instance with consumer-facing metadata.
 */
export type Tag<T, HasDefault extends boolean = false> = TagType.Tag<T, HasDefault>

/**
 * Value that may be wrapped in a Promise.
 */
export type MaybePromised<T> = InternalMaybePromised<T>

/**
 * Base error type for all executor-related failures.
 */
export type ExecutorError = InternalExecutorError

/**
 * Standard schema contract compatible with validation libraries.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> extends InternalStandardSchemaV1<Input, Output> {}

/**
 * Tag helper types representing tag instances and metadata containers.
 */
export namespace Tag {
  /**
   * Container mapping tag labels to tag instances.
   */
  export type Store = TagTypes.Tag.Store

  /**
   * Object carrying tag metadata in its symbol properties.
   */
  export type Tagged<T = unknown> = TagTypes.Tag.Tagged<T>

  /**
   * Tag storage container attached to executors.
   */
  export type Container = TagTypes.Tag.Container

  /**
   * Source object providing tags for executor creation.
   */
  export type Source = TagTypes.Tag.Source

  /**
   * Tag instance with consumer-facing metadata.
   */
  export type Tag<T, HasDefault extends boolean = false> = TagTypes.Tag.Tag<T, HasDefault>

  /**
   * Executor producing tag values from tagged sources.
   */
  export type TagExecutor<TOutput, TTag = TOutput> = TagTypes.Tag.TagExecutor<TOutput, TTag>
}

/**
 * Standard schema helper types for validation contracts.
 */
export namespace StandardSchemaV1 {
  /**
   * Schema metadata properties.
   */
  export type Props<Input = unknown, Output = Input> = InternalStandardSchemaV1.Props<Input, Output>

  /**
   * Validation result union (success or failure).
   */
  export type Result<Output> = InternalStandardSchemaV1.Result<Output>

  /**
   * Successful validation result.
   */
  export type SuccessResult<Output> = InternalStandardSchemaV1.SuccessResult<Output>

  /**
   * Failed validation result.
   */
  export type FailureResult = InternalStandardSchemaV1.FailureResult

  /**
   * Single validation issue.
   */
  export type Issue = InternalStandardSchemaV1.Issue

  /**
   * Path segment identifying issue location.
   */
  export type PathSegment = InternalStandardSchemaV1.PathSegment

  /**
   * Type information for schema inputs and outputs.
   */
  export type Types<Input = unknown, Output = Input> = InternalStandardSchemaV1.Types<Input, Output>

  /**
   * Extract schema input type.
   */
  export type InferInput<Schema extends StandardSchemaV1> = InternalStandardSchemaV1.InferInput<Schema>

  /**
   * Extract schema output type.
   */
  export type InferOutput<Schema extends StandardSchemaV1> = InternalStandardSchemaV1.InferOutput<Schema>
}

/**
 * Core executor types representing factory contracts and execution states.
 */
export namespace Core {
  /**
   * Async-safe output returned by executors and scopes.
   */
  export type Output<T> = InternalCore.Output<T>

  /**
   * Factory signature used by {@link provide}.
   */
  export type NoDependencyFn<T> = InternalCore.NoDependencyFn<T>

  /**
   * Factory signature used by {@link derive}.
   */
  export type DependentFn<T, D> = InternalCore.DependentFn<T, D>

  /**
   * Executor with unknown output type.
   */
  export type UExecutor = InternalCore.UExecutor

  /**
   * Union of all executor variants.
   */
  export type AnyExecutor = InternalCore.AnyExecutor

  /**
   * Cleanup function invoked when executor is released.
   */
  export type Cleanup = InternalCore.Cleanup

  /**
   * Controller passed to executor factories for lifecycle management.
   */
  export type Controller = InternalCore.Controller

  /**
   * Base executor interface with core channels.
   */
  export type BaseExecutor<T> = InternalCore.BaseExecutor<T>

  /**
   * Executor instance produced by {@link provide} or {@link derive}.
   */
  export type Executor<T> = InternalCore.Executor<T>

  /**
   * Reactive channel exposing subscription capabilities.
   */
  export type Reactive<T> = InternalCore.Reactive<T>

  /**
   * Lazy channel for deferred execution.
   */
  export type Lazy<T> = InternalCore.Lazy<T>

  /**
   * Static channel providing synchronous access.
   */
  export type Static<T> = InternalCore.Static<T>

  /**
   * Accessor exposing lookup and subscription capabilities.
   */
  export type Accessor<T> = InternalCore.Accessor<T>

  /**
   * State representing an unresolved accessor.
   */
  export type PendingState<T> = InternalCore.PendingState<T>

  /**
   * State representing a successfully resolved accessor.
   */
  export type ResolvedState<T> = InternalCore.ResolvedState<T>

  /**
   * State representing a rejected accessor.
   */
  export type RejectedState = InternalCore.RejectedState

  /**
   * Union of all possible accessor states.
   */
  export type ResolveState<T> = InternalCore.ResolveState<T>

  /**
   * Preset configuration for overriding executor output.
   */
  export type Preset<T> = InternalCore.Preset<T>

  /**
   * Extract output type from executor.
   */
  export type InferOutput<T> = InternalCore.InferOutput<T>

  /**
   * Value accepted as executor dependency.
   */
  export type DependencyLike = InternalCore.DependencyLike

  /**
   * Callback invoked when executor output changes.
   */
  export type ResolveCallback = InternalCore.ResolveCallback

  /**
   * Callback invoked when executor is released.
   */
  export type ReleaseCallback = InternalCore.ReleaseCallback

  /**
   * Callback invoked when executor encounters an error.
   */
  export type ErrorCallback = InternalCore.ErrorCallback

  /**
   * Global error callback for unhandled executor errors.
   */
  export type GlobalErrorCallback = InternalCore.GlobalErrorCallback

  /**
   * Scope managing executor lifecycle and resolution.
   */
  export type Scope = InternalCore.Scope
}

/**
 * Flow helper types representing execution contexts and results.
 */
export namespace Flow {
  /**
   * Flow definition combining handler and metadata.
   */
  export type Definition<I, O> = InternalFlow.Definition<I, O>

  /**
   * Handler function processing flow inputs.
   */
  export type Handler<I, O> = InternalFlow.Handler<I, O>

  /**
   * Flow instance produced by {@link flow}.
   */
  export type Flow<I, O> = InternalFlow.Flow<I, O>

  /**
   * Extract type of flow input from handler or executor.
   */
  export type InferInput<F> = InternalFlow.InferInput<F>

  /**
   * Extract type of flow output from handler or executor.
   */
  export type InferOutput<F> = InternalFlow.InferOutput<F>

  /**
   * Single-argument executor signature returning results.
   */
  export type FnExecutor<I, O> = InternalFlow.FnExecutor<I, O>

  /**
   * Multi-argument executor signature returning results.
   */
  export type MultiFnExecutor<Args extends readonly unknown[], O> = InternalFlow.MultiFnExecutor<Args, O>

  /**
   * Result summary returned by {@link Core.Scope.parallel}.
   */
  export type ParallelResult<T> = InternalFlow.ParallelResult<T>

  /**
   * Settled result summary returned by {@link Core.Scope.parallelSettled}.
   */
  export type ParallelSettledResult<T> = InternalFlow.ParallelSettledResult<T>

  /**
   * Configuration applied to parallel executions.
   */
  export type ParallelExecutionOptions = InternalFlow.ParallelExecutionOptions

  /**
   * Flow execution context exposed to handlers.
   */
  export type Context = InternalFlow.Context

  /**
   * Execution data shared across flow status updates.
   */
  export type ExecutionData = InternalFlow.ExecutionData

  /**
   * Result details describing success/failure plus context.
   */
  export type ExecutionDetails<T> = InternalFlow.ExecutionDetails<T>

  /**
   * Current execution status for flows run through {@link Core.Scope}.
   */
  export type ExecutionStatus = InternalFlow.ExecutionStatus

  /**
   * Execution handle containing result promise, metadata, and abort controller.
   */
  export interface Execution<T> extends InternalFlow.Execution<T> {}
}

/**
 * Extension helper types representing lifecycle hooks.
 */
export namespace Extension {
  /**
   * Operation emitted when executors are resolved or updated.
   */
  export type ResolveOperation = InternalExtension.ResolveOperation

  /**
   * Execution mode for OTel span hierarchy support.
   * - "sequential": Single flow or function execution
   * - "parallel": ctx.parallel() operations
   * - "parallel-settled": ctx.parallelSettled() operations
   */
  export type ExecutionMode = InternalExtension.ExecutionMode

  /**
   * Operation metadata provided to extension hooks.
   *
   * Use `mode` to determine execution type:
   * - "sequential": flow/fn execution (check `flow`/`definition` for flows, `params` for fns)
   * - "parallel"/"parallel-settled": parallel execution (check `count` for item count)
   */
  export type ExecutionOperation = InternalExtension.ExecutionOperation

  /**
   * Operation emitted during ExecutionContext lifecycle (create/closing/closed).
   */
  export type ContextLifecycleOperation = InternalExtension.ContextLifecycleOperation

  /**
   * Union describing every supported extension operation.
   */
  export type Operation = InternalExtension.Operation

  /**
   * Extension contract implemented by custom cross-cutting hooks.
   */
  export interface Extension extends InternalExtension.Extension {}
}

/**
 * Multi executor helper types describing keyed pools.
 */
export namespace Multi {
  /**
   * Key type accepted by multi executors.
   */
  export type Key = InternalMulti.Key

  /**
   * Executor that can be called with keys to fetch accessor executors.
   */
  export type MultiExecutor<T, K> = InternalMulti.MultiExecutor<T, K>

  /**
   * Dependent factory signature for keyed executors.
   */
  export type DependentFn<T, K, D> = InternalMulti.DependentFn<T, K, D>

  /**
   * Multi executor configuration describing key schema and transforms.
   */
  export type Option<K> = InternalMulti.Option<K>

  /**
   * Derived multi configuration attaching dependencies.
   */
  export type DeriveOption<K, D> = InternalMulti.DeriveOption<K, D>
}

/**
 * ExecutionContext helper types for flow execution lifecycle.
 */
export namespace ExecutionContext {
  /**
   * Execution context lifecycle state.
   */
  export type ContextState = InternalExecutionContext.ContextState

  /**
   * Execution details tracking name, timing, and error state.
   */
  export type Details = InternalExecutionContext.Details

  /**
   * Flow execution context providing scope, tags, and nested execution.
   */
  export type Context = InternalExecutionContext.Context
}

import {
  derive as deriveExecutor,
  isExecutor as isExecutorFn,
  isLazyExecutor as isLazyExecutorFn,
  isMainExecutor as isMainExecutorFn,
  isPreset as isPresetFn,
  isReactiveExecutor as isReactiveExecutorFn,
  isStaticExecutor as isStaticExecutorFn,
  preset as presetExecutor,
  provide as provideExecutor,
} from "./executor";
import { flow as flowImpl, flowMeta as flowMetaImpl } from "./flow";
import { extension as extensionFactory } from "./extension";
import * as errorsModule from "./errors";
import type {
  ExecutorError as InternalExecutorError,
  Extension as InternalExtension,
  Flow as InternalFlow,
  MaybePromised as InternalMaybePromised,
  Multi as InternalMulti,
  StandardSchemaV1 as InternalStandardSchemaV1,
  Core as InternalCore,
} from "./types";
import {
  DependencyResolutionError as DependencyResolutionErrorCtor,
  ExecutorResolutionError as ExecutorResolutionErrorCtor,
  FactoryExecutionError as FactoryExecutionErrorCtor,
  FlowError as FlowErrorCtor,
  FlowValidationError as FlowValidationErrorCtor,
  SchemaError as SchemaErrorCtor,
} from "./types";
import * as multiModule from "./multi";
import { Promised as PromisedClass } from "./promises";
import { resolves as resolvesHelper } from "./helpers";
import { tag as tagImpl } from "./tag";
import { tags as tagsImpl } from "./tag-executors";
import { type Tag as TagType } from "./tag-types";
import type * as TagTypes from "./tag-types";
import * as standardSchemaModule from "./ssch";
import { custom as customSchema } from "./ssch";
import { type ScopeOption as InternalScopeOption, createScope as createScopeImpl } from "./scope";

const standardSchema: typeof standardSchemaModule = standardSchemaModule;
const multi: typeof multiModule = multiModule;
const errors: typeof errorsModule = errorsModule;

/**
 * Promise-aware helper returned by several APIs to carry execution metadata.
 */
export { PromisedClass as Promised };

/**
 * Toolkit for defining schema primitives compatible with Pumped-fn tags.
 */
export { standardSchema };

/**
 * Multi-executor helpers for key-scoped executor pools.
 */
export { multi };

/**
 * Canonical error catalog helpers for executor failures.
 */
export { errors };

/**
 * Build tag-aware schema instances or adapters.
 */
export const custom: typeof customSchema = customSchema;

/**
 * Creates a typed tag accessor bound to a schema.
 */
export const tag: typeof tagImpl = tagImpl;

/**
 * Curated helpers for extracting metadata from tags.
 */
export const tags: typeof tagsImpl = tagsImpl;

/**
 * Create a new execution scope with optional presets, registry, and extensions.
 */
export const createScope: typeof createScopeImpl = createScopeImpl;

/**
 * Register a dependency-free executor that resolves directly from the controller.
 */
export const provide: typeof provideExecutor = provideExecutor;

/**
 * Register an executor that depends on other executors before producing a value.
 */
export const derive: typeof deriveExecutor = deriveExecutor;

/**
 * Override executor output within a scope using static values or other executors.
 */
export const preset: typeof presetExecutor = presetExecutor;

/**
 * Runtime check verifying any object implements the executor contract.
 */
export const isExecutor: typeof isExecutorFn = isExecutorFn;

/**
 * Runtime check verifying an executor was produced through the lazy channel.
 */
export const isLazyExecutor: typeof isLazyExecutorFn = isLazyExecutorFn;

/**
 * Runtime check verifying an executor exposes the reactive channel.
 */
export const isReactiveExecutor: typeof isReactiveExecutorFn = isReactiveExecutorFn;

/**
 * Runtime check verifying an executor exposes a static channel accessor.
 */
export const isStaticExecutor: typeof isStaticExecutorFn = isStaticExecutorFn;

/**
 * Runtime check verifying the executor instance represents the main factory.
 */
export const isMainExecutor: typeof isMainExecutorFn = isMainExecutorFn;

/**
 * Runtime check verifying a value represents a preset override entry.
 */
export const isPreset: typeof isPresetFn = isPresetFn;

/**
 * Orchestrates flow factories and exposes helpers for standalone executions.
 */
export const flow: typeof flowImpl = flowImpl;

/**
 * Accessor for metadata injected during flow definition.
 */
export const flowMeta: typeof flowMetaImpl = flowMetaImpl;

/**
 * Create typed extensions with init/wrap/onError/dispose hooks.
 */
export const extension: typeof extensionFactory = extensionFactory;

/**
 * Resolve a tree of executors inside a scope and return typed values.
 */
export const resolves: typeof resolvesHelper = resolvesHelper;

/**
 * Standard tag representing the friendly executor name.
 */
export const name: TagType.Tag<string, false> = tagImpl(customSchema<string>(), {
  label: "pumped-fn/name",
});

/**
 * Options accepted by {@link createScope}.
 */
export type ScopeOption = InternalScopeOption;

/**
 * Tagged metadata accessor used throughout Pumped-fn.
 */
export type Tag<T, HasDefault extends boolean = false> = TagType.Tag<T, HasDefault>;

/**
 * Tag-related helper types.
 */
export namespace Tag {
  /**
   * Storage interface for tag key-value pairs.
   */
  export type Store = TagTypes.Tag.Store;

  /**
   * Tagged value instance attached to executors/flows/scopes.
   */
  export type Tagged<T = unknown> = TagTypes.Tag.Tagged<T>;

  /**
   * Tag container interface.
   */
  export type Container = TagTypes.Tag.Container;

  /**
   * Sources from which tag values can be extracted.
   */
  export type Source = TagTypes.Tag.Source;

  /**
   * Tag definition with schema and extraction methods.
   */
  export type Tag<T, HasDefault extends boolean = false> = TagTypes.Tag.Tag<T, HasDefault>;

  /**
   * Tag-based executor wrapper for dependency resolution.
   */
  export type TagExecutor<TOutput, TTag = TOutput> = TagTypes.Tag.TagExecutor<TOutput, TTag>;
}

/**
 * Promise-like helper that may resolve immediately or later.
 */
export type MaybePromised<T> = InternalMaybePromised<T>;

/**
 * Union describing every executor error variant raised during resolution.
 */
export type ExecutorError = InternalExecutorError;

/**
 * Strongly typed Standard Schema interface compatible with tags and executors.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> extends InternalStandardSchemaV1<Input, Output> {}

export namespace StandardSchemaV1 {
  /**
   * Shared properties describing schema metadata and validation contract.
   */
  export type Props<Input = unknown, Output = Input> = InternalStandardSchemaV1.Props<Input, Output>;

  /**
   * Result returned by schema validation hooks.
   */
  export type Result<Output> = InternalStandardSchemaV1.Result<Output>;

  /**
   * Successful validation outcome.
   */
  export type SuccessResult<Output> = InternalStandardSchemaV1.SuccessResult<Output>;

  /**
   * Failed validation outcome with issue breakdown.
   */
  export type FailureResult = InternalStandardSchemaV1.FailureResult;

  /**
   * Structured validation issue detail.
   */
  export type Issue = InternalStandardSchemaV1.Issue;

  /**
   * Additional path metadata for nested validation failures.
   */
  export type PathSegment = InternalStandardSchemaV1.PathSegment;

  /**
   * Optional input/output typing metadata.
   */
  export type Types<Input = unknown, Output = Input> = InternalStandardSchemaV1.Types<Input, Output>;

  /**
   * Extract Input type from schema metadata.
   */
  export type InferInput<Schema extends StandardSchemaV1> = InternalStandardSchemaV1.InferInput<Schema>;

  /**
   * Extract Output type from schema metadata.
   */
  export type InferOutput<Schema extends StandardSchemaV1> = InternalStandardSchemaV1.InferOutput<Schema>;
}

/**
 * Executor-level helper types for registering and operating scopes.
 */
export namespace Core {
  /**
   * Async-safe output returned by executors and scopes.
   */
  export type Output<T> = InternalCore.Output<T>;

  /**
   * Factory signature used by {@link provide}.
   */
  export type NoDependencyFn<T> = InternalCore.NoDependencyFn<T>;

  /**
   * Factory signature receiving resolved dependencies before producing values.
   */
  export type DependentFn<T, D> = InternalCore.DependentFn<T, D>;

  /**
   * Untyped executor placeholder used internally.
   */
  export type UExecutor = InternalCore.UExecutor;

  /**
   * Any executor variant produced by Pumped-fn.
   */
  export type AnyExecutor = InternalCore.AnyExecutor;

  /**
   * Cleanup callback invoked on scope disposal.
   */
  export type Cleanup = InternalCore.Cleanup;

  /**
   * Controller offered inside executor factories for lifecycle operations.
   */
  export type Controller = InternalCore.Controller;

  /**
   * Base executor contract shared by all executor flavors.
   */
  export type BaseExecutor<T> = InternalCore.BaseExecutor<T>;

  /**
   * Main executor flavor returned by {@link provide} and {@link derive}.
   */
  export type Executor<T> = InternalCore.Executor<T>;

  /**
   * Reactive executor exposing `.reactive`.
   */
  export type Reactive<T> = InternalCore.Reactive<T>;

  /**
   * Lazy executor exposing `.lazy`.
   */
  export type Lazy<T> = InternalCore.Lazy<T>;

  /**
   * Static executor exposing `.static`.
   */
  export type Static<T> = InternalCore.Static<T>;

  /**
   * Accessor bound to an executor inside a scope.
   */
  export type Accessor<T> = InternalCore.Accessor<T>;

  /**
   * Preset value applied to override executor outputs.
   */
  export type Preset<T> = InternalCore.Preset<T>;

  /**
   * Inferred output helper for dependencies passed to {@link derive}.
   */
  export type InferOutput<T> = InternalCore.InferOutput<T>;

  /**
   * Shapes that can be passed as dependencies when deriving executors.
   */
  export type DependencyLike = InternalCore.DependencyLike;

  /**
   * Scoped callback for change notifications.
   */
  export type ChangeCallback = InternalCore.ChangeCallback;

  /**
   * Scoped callback for release notifications.
   */
  export type ReleaseCallback = InternalCore.ReleaseCallback;

  /**
   * Executor-specific error callback signature.
   */
  export type ErrorCallback<T = unknown> = InternalCore.ErrorCallback<T>;

  /**
   * Global error callback signature.
   */
  export type GlobalErrorCallback = InternalCore.GlobalErrorCallback;

  /**
   * Scope interface representing executor registry and lifecycle.
   */
  export interface Scope extends InternalCore.Scope {}
}

/**
 * Flow helper types representing handlers and execution metadata.
 */
export namespace Flow {
  /**
   * Static definition describing flow input/output schemas.
   */
  export type Definition<S, I> = InternalFlow.Definition<S, I>;

  /**
   * Flow handler signature invoked during execution.
   */
  export type Handler<S, I> = InternalFlow.Handler<S, I>;

  /**
   * Flow executor wrapper embedding the definition metadata.
   */
  export type Flow<I, O> = InternalFlow.Flow<I, O>;

  /**
   * Extract type of flow input from handler or executor.
   */
  export type InferInput<F> = InternalFlow.InferInput<F>;

  /**
   * Extract type of flow output from handler or executor.
   */
  export type InferOutput<F> = InternalFlow.InferOutput<F>;

  /**
   * Single-argument executor signature returning results.
   */
  export type FnExecutor<I, O> = InternalFlow.FnExecutor<I, O>;

  /**
   * Multi-argument executor signature returning results.
   */
  export type MultiFnExecutor<Args extends readonly unknown[], O> = InternalFlow.MultiFnExecutor<Args, O>;

  /**
   * Result summary returned by {@link Core.Scope.parallel}.
   */
  export type ParallelResult<T> = InternalFlow.ParallelResult<T>;

  /**
   * Settled result summary returned by {@link Core.Scope.parallelSettled}.
   */
  export type ParallelSettledResult<T> = InternalFlow.ParallelSettledResult<T>;

  /**
   * Configuration applied to parallel executions.
   */
  export type ParallelExecutionOptions = InternalFlow.ParallelExecutionOptions;

  /**
   * Flow execution context exposed to handlers.
   */
  export type Context = InternalFlow.Context;

  /**
   * Execution data shared across flow status updates.
   */
  export type ExecutionData = InternalFlow.ExecutionData;

  /**
   * Result details describing success/failure plus context.
   */
  export type ExecutionDetails<T> = InternalFlow.ExecutionDetails<T>;

  /**
   * Current execution status for flows run through {@link Core.Scope}.
   */
  export type ExecutionStatus = InternalFlow.ExecutionStatus;

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
  export type ResolveOperation = InternalExtension.ResolveOperation;

  /**
   * Target metadata for flow executions.
   */
  export type FlowTarget = InternalExtension.FlowTarget;

  /**
   * Target metadata for stand-alone functions executed through ctx.exec.
   */
  export type FnTarget = InternalExtension.FnTarget;

  /**
   * Target metadata for ctx.parallel or ctx.parallelSettled operations.
   */
  export type ParallelTarget = InternalExtension.ParallelTarget;

  /**
   * Operation metadata provided to extension hooks.
   */
  export type ExecutionOperation = InternalExtension.ExecutionOperation;

  /**
   * Union describing every supported extension operation.
   */
  export type Operation = InternalExtension.Operation;

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
  export type Key = InternalMulti.Key;

  /**
   * Executor that can be called with keys to fetch accessor executors.
   */
  export type MultiExecutor<T, K> = InternalMulti.MultiExecutor<T, K>;

  /**
   * Dependent factory signature for keyed executors.
   */
  export type DependentFn<T, K, D> = InternalMulti.DependentFn<T, K, D>;

  /**
   * Multi executor configuration describing key schema and transforms.
   */
  export type Option<K> = InternalMulti.Option<K>;

  /**
   * Derived multi configuration attaching dependencies.
   */
  export type DeriveOption<K, D> = InternalMulti.DeriveOption<K, D>;
}

/**
 * Error thrown when schema validation fails.
 */
export { SchemaErrorCtor as SchemaError };

/**
 * Base executor resolution error capturing scope context.
 */
export { ExecutorResolutionErrorCtor as ExecutorResolutionError };

/**
 * Error thrown when executor factory throws or rejects.
 */
export { FactoryExecutionErrorCtor as FactoryExecutionError };

/**
 * Error thrown when dependencies cannot be resolved.
 */
export { DependencyResolutionErrorCtor as DependencyResolutionError };

/**
 * Flow-level error used for descriptive failures inside handlers.
 */
export { FlowErrorCtor as FlowError };

/**
 * Error thrown when flow input or output validation fails.
 */
export { FlowValidationErrorCtor as FlowValidationError };

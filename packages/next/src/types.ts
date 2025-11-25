import { type Promised } from "./primitives";
import { type Tag } from "./tag";
import { type Escapable } from "./helpers";

export const executorSymbol: unique symbol = Symbol.for(
  "@pumped-fn/core/executor"
);

export type MaybePromised<T> = T | Promise<T> | Promised<T>;

export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}

export declare namespace StandardSchemaV1 {
  export interface Props<Input = unknown, Output = Input> {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown
    ) => Result<Output> | Promise<Result<Output>>;
    readonly types?: Types<Input, Output> | undefined;
  }

  export type Result<Output> = SuccessResult<Output> | FailureResult;

  export interface SuccessResult<Output> {
    readonly value: Output;
    readonly issues?: undefined;
  }

  export interface FailureResult {
    readonly issues: ReadonlyArray<Issue>;
  }

  export interface Issue {
    readonly message: string;
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }

  export interface PathSegment {
    readonly key: PropertyKey;
  }

  export interface Types<Input = unknown, Output = Input> {
    readonly input: Input;
    readonly output: Output;
  }

  export type InferInput<Schema extends StandardSchemaV1> = NonNullable<
    Schema["~standard"]["types"]
  >["input"];

  export type InferOutput<Schema extends StandardSchemaV1> = NonNullable<
    Schema["~standard"]["types"]
  >["output"];
}

export type ExecutorError =
  | import("./errors").ExecutorResolutionError
  | import("./errors").FactoryExecutionError
  | import("./errors").DependencyResolutionError;

export declare namespace Core {
  export type Output<T> = T | Promise<T>;
  export type GeneratorOutput<Y, T> =
    | T
    | Promise<T>
    | Generator<Y, T>
    | AsyncGenerator<Y, T>;

  export type NoDependencyFn<T> = (scope: Controller) => Output<T>;
  export type DependentFn<T, D> = (
    dependencies: D,
    scope: Controller
  ) => Output<T>;

  export type NoDependencyGeneratorFn<Y, T> = (
    scope: Controller
  ) => GeneratorOutput<Y, T>;
  export type DependentGeneratorFn<Y, T, D> = (
    dependencies: D,
    scope: Controller
  ) => GeneratorOutput<Y, T>;
  export type RecordLike = Record<string, unknown>;
  export type UExecutor = BaseExecutor<unknown>;
  export type AnyExecutor = Executor<unknown>;

  export type Cleanup = () => void | Promised<void>;

  export type Controller = {
    cleanup: (cleanup: Cleanup) => void;
    release: () => Promised<void>;
    reload: () => Promised<void>;
    scope: Scope;
  };

  export type Kind = "main" | "reactive" | "lazy" | "static";

  export interface BaseExecutor<T> extends Tag.Container {
    [executorSymbol]: Kind;
    factory: NoDependencyFn<T> | DependentFn<T, unknown> | undefined;
    dependencies:
      | undefined
      | UExecutor
      | Array<UExecutor>
      | Record<string, UExecutor>;
  }

  export interface Executor<T> extends BaseExecutor<T> {
    [executorSymbol]: "main";
    factory: NoDependencyFn<T> | DependentFn<T, unknown>;
    readonly lazy: Lazy<T>;
    readonly reactive: Reactive<T>;
    readonly static: Static<T>;
  }

  export interface Reactive<T> extends BaseExecutor<T> {
    [executorSymbol]: "reactive";
    factory: undefined;
    readonly executor: Executor<T>;
  }

  export interface Lazy<T> extends BaseExecutor<Accessor<T>> {
    [executorSymbol]: "lazy";
    factory: undefined;
    readonly executor: Executor<T>;
  }

  export interface Static<T> extends BaseExecutor<Accessor<T>> {
    [executorSymbol]: "static";
    factory: undefined;
    readonly executor: Executor<T>;
  }

  export type PendingState<T> = { kind: "pending"; promise: Promise<T> };
  export type ResolvedState<T> = {
    kind: "resolved";
    value: T;
    promised: Promised<T>;
  };
  export type RejectedState = {
    kind: "rejected";
    error: unknown;
    enhancedError?: import("./errors").ExecutorResolutionError;
  };

  export type ResolveState<T> =
    | PendingState<T>
    | ResolvedState<T>
    | RejectedState;

  export interface Accessor<T> extends Tag.Container {
    lookup(): undefined | ResolveState<T>;

    get(): T;
    resolve(force?: boolean): Promised<T>;
    release(soft?: boolean): Promised<void>;
    update(updateFn: T | ((current: T) => T)): Promised<void>;
    set(value: T): Promised<void>;
    subscribe(callback: (value: T) => void): Cleanup;
  }

  export interface Preset<T> {
    [executorSymbol]: "preset";
    executor: Executor<T>;
    value: T | Executor<T>;
  }

  export type ExecutorProxy<T> = T extends object
    ? {
        [K in keyof T]: T[K] extends (...args: infer Args) => infer R
          ? Executor<(...args: Args) => R>
          : never;
      }
    : never;

  export type NestedProxy<T> = T extends object
    ? {
        [K in keyof T]: T[K] extends (...args: infer Args) => infer R
          ? Executor<(...args: Args) => R>
          : T[K] extends object
          ? NestedProxy<T[K]>
          : never;
      }
    : never;

  export type InferOutput<T> = T extends Tag.TagExecutor<infer U, any>
    ? U
    : T extends Tag.Tag<infer U, any>
    ? U
    : T extends Executor<infer U> | Reactive<infer U>
    ? Awaited<U>
    : T extends Lazy<infer U> | Static<infer U>
    ? Accessor<Awaited<U>>
    : T extends ReadonlyArray<any> | Record<string, any>
    ? { [K in keyof T]: InferOutput<T[K]> }
    : never;

  export type Event = "resolve" | "update" | "release";
  export type Replacer = Preset<unknown>;
  type EventCallbackResult = void | Replacer;

  export type ResolveCallback = (
    event: "resolve" | "update",
    executor: AnyExecutor,
    resolved: unknown,
    scope: Scope
  ) => EventCallbackResult | Promised<EventCallbackResult>;

  export type ReleaseCallback = (
    event: "release",
    executor: AnyExecutor,
    scope: Scope
  ) => void | Promised<void>;

  export type ErrorCallback<T = unknown> = (
    error: ExecutorError,
    executor: Executor<T>,
    scope: Scope
  ) => MaybePromised<void>;

  export type GlobalErrorCallback = (
    error: ExecutorError,
    executor: AnyExecutor,
    scope: Scope
  ) => MaybePromised<void>;

  export type WrapContext = {
    operation: "resolve" | "update";
    executor: AnyExecutor;
    scope: Scope;
  };

  export type SingleDependencyLike =
    | UExecutor
    | Tag.Tag<any, boolean>
    | Tag.TagExecutor<any, any>;

  export type MultiDependencyLike =
    | ReadonlyArray<
        UExecutor | Tag.Tag<any, boolean> | Tag.TagExecutor<any, any>
      >
    | Record<
        string,
        UExecutor | Tag.Tag<any, boolean> | Tag.TagExecutor<any, any>
      >;

  export type DependencyLike = SingleDependencyLike | MultiDependencyLike;
  export type Destructed<T extends DependencyLike> =
    T extends SingleDependencyLike
      ? T
      : {
          [K in keyof T]: T[K];
        };

  export interface Scope extends Tag.Container {
    accessor<T>(executor: Core.Executor<T>, eager?: boolean): Accessor<T>;
    entries(): [AnyExecutor, Accessor<unknown>][];
    registeredExecutors(): AnyExecutor[];

    /**
     * Resolves an executor and returns its value.
     *
     * @param executor - The executor to resolve
     * @param force - If true, forces re-resolution even if cached
     * @param executionContext - Optional execution context for context-specific resolution.
     *   When provided, bypasses scope cache and resolves tags from the execution context
     *   instead of the scope, ensuring proper isolation between execution contexts.
     * @returns Promised value of the resolved executor
     */
    resolve<T>(executor: Core.Executor<T>, force?: boolean, executionContext?: ExecutionContext.Context): Promised<T>;
    resolveAccessor<T>(executor: Core.Executor<T>): Promised<Accessor<T>>;

    run<T, D extends Core.DependencyLike>(
      dependencies: D,
      callback: (deps: Core.InferOutput<D>) => T | Promise<T>
    ): Promised<T>;

    run<T, D extends Core.DependencyLike, Args extends readonly unknown[]>(
      dependencies: D,
      callback: (deps: Core.InferOutput<D>, ...args: Args) => T | Promise<T>,
      args: Args
    ): Promised<T>;

    update<T>(
      executor: Executor<T>,
      updateFn: T | ((current: T) => T)
    ): Promised<void>;
    set<T>(executor: Executor<T>, value: T): Promised<void>;

    release(executor: Executor<any>, soft?: boolean): Promised<void>;

    dispose(): Promised<void>;

    onUpdate<T>(
      executor: Executor<T>,
      callback: (accessor: Accessor<T>) => void
    ): Cleanup;

    onResolve(cb: ResolveCallback): Cleanup;
    onRelease(cb: ReleaseCallback): Cleanup;
    onError<T>(executor: Executor<T>, callback: ErrorCallback<T>): Cleanup;
    onError(callback: GlobalErrorCallback): Cleanup;

    useExtension(extension: Extension.Extension): Cleanup;

    exec<S, I>(config: {
      flow: Executor<Flow.Handler<S, I>>;
      input?: I;
      timeout?: number;
      tags?: Tag.Tagged[];
    }): Flow.Execution<S>;

    exec<S, D extends DependencyLike>(config: {
      dependencies: D;
      fn: (deps: InferOutput<D>) => S | Promise<S>;
      timeout?: number;
      tags?: Tag.Tagged[];
    }): Flow.Execution<S>;

    exec<S, I, D extends DependencyLike>(config: {
      dependencies: D;
      fn: (deps: InferOutput<D>, input: I) => S | Promise<S>;
      input: I;
      timeout?: number;
      tags?: Tag.Tagged[];
    }): Flow.Execution<S>;

    createExecution(
      details?: Partial<ExecutionContext.Details> & { tags?: Tag.Tagged[] }
    ): ExecutionContext.Context;
  }
}

export type ResolvableItem =
  | Core.UExecutor
  | Tag.Tag<unknown, boolean>
  | Tag.TagExecutor<unknown>
  | Escapable<unknown>;

export class FlowError extends Error {
  public readonly code: string;
  public readonly data?: unknown;

  constructor(
    message: string,
    code: string,
    data?: unknown,
    options?: { cause?: unknown }
  ) {
    super(message);
    this.name = "FlowError";
    this.code = code;
    this.data = data;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

export class FlowValidationError extends FlowError {
  public readonly issues: StandardSchemaV1.Issue[];

  constructor(
    message: string,
    issues: StandardSchemaV1.Issue[],
    options?: { cause?: unknown }
  ) {
    super(message, "VALIDATION_ERROR", { issues }, options);
    this.name = "FlowValidationError";
    this.issues = issues;
  }
}

export namespace Flow {
  export type Definition<S, I> = {
    name: string;
    input: StandardSchemaV1<I>;
    output: StandardSchemaV1<S>;
    version?: string;
  } & Tag.Container;

  export interface Handler<S, I> {
    (ctx: Context, input: I): S | Promised<S>;
    def: Definition<S, I>;
  }

  export type UFlow = Core.Executor<Handler<any, any>>;
  export type UHandler = Handler<any, any>;

  export interface Flow<I, O> extends Core.Executor<Handler<O, I>> {
    definition: Definition<O, I>;
  }

  export type InferInput<F> = F extends
    | Handler<any, infer I>
    | Core.Executor<Handler<any, infer I>>
    | Flow<infer I, any>
    ? I
    : never;

  export type InferOutput<F> = F extends
    | Handler<infer S, any>
    | Core.Executor<Handler<infer S, any>>
    | Flow<any, infer O>
    ? S extends never
      ? O
      : S
    : never;

  export type FnExecutor<I, O> = (input: I) => O | Promised<O>;

  export type MultiFnExecutor<Args extends readonly unknown[], O> = (
    ...args: Args
  ) => O | Promised<O>;

  export type AnyFnExecutor<O = unknown> =
    | FnExecutor<any, O>
    | MultiFnExecutor<any[], O>;

  export type Opt = {};

  export type ParallelResult<T> = {
    results: T;
    stats: {
      total: number;
      succeeded: number;
      failed: number;
    };
  };

  export type ParallelSettledResult<T> = {
    results: PromiseSettledResult<T>[];
    stats: {
      total: number;
      succeeded: number;
      failed: number;
    };
  };

  export type ParallelExecutionOptions = {
    mode?: "race" | "all" | "all-settled";
    errorMapper?: (error: unknown, index: number) => any;
    onItemComplete?: (result: any, index: number) => void;
  };

  export type Context = ExecutionContext.Context;

  export type C = ExecutionContext.Context;

  export type ExecutionData = {
    readonly context: {
      get<T>(accessor: Tag.Tag<T, false> | Tag.Tag<T, true>): T;
      find<T>(accessor: Tag.Tag<T, false>): T | undefined;
      find<T>(accessor: Tag.Tag<T, true>): T;
    };
  };

  export type ExecutionDetails<T> =
    | { success: true; result: T; ctx: ExecutionData }
    | { success: false; error: unknown; ctx: ExecutionData };

  export type ExecutionStatus =
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "cancelled";

  export interface Execution<T> {
    readonly result: Promised<T>;
    readonly id: string;
    readonly flowName: string | undefined;
    readonly status: ExecutionStatus;
    readonly ctx: ExecutionData | undefined;
    readonly abort: AbortController;
    readonly statusCallbackErrors: readonly Error[];

    onStatusChange(
      callback: (
        status: ExecutionStatus,
        execution: Execution<T>
      ) => void | Promise<void>
    ): Core.Cleanup;

    then<TResult1 = T, TResult2 = never>(
      onfulfilled?:
        | ((value: T) => TResult1 | PromiseLike<TResult1>)
        | null
        | undefined,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null
        | undefined
    ): PromiseLike<TResult1 | TResult2>;
  }
}

export namespace ExecutionContext {
  export type ContextState = 'active' | 'closing' | 'closed'

  export interface Details {
    name: string;
    startedAt: number;
    completedAt?: number;
    error?: unknown;
    metadata?: Record<string, unknown>;
  }

  export interface Context {
    readonly scope: Core.Scope;
    readonly parent: Context | undefined;
    readonly id: string;
    readonly tagStore: Tag.Store;
    readonly signal: AbortSignal;
    readonly details: Details;
    readonly tags: Tag.Tagged[] | undefined;

    /**
     * Current lifecycle state of the context.
     *
     * States:
     * - `'active'`: Context is operational, can execute work
     * - `'closing'`: Close has been called, draining or aborting
     * - `'closed'`: Close complete, no new executions allowed
     *
     * @example
     * ```typescript
     * if (ctx.state === 'active') {
     *   // Safe to start new work
     *   ctx.exec(flow, input)
     * }
     * ```
     */
    readonly state: ContextState;

    /**
     * Convenience property indicating if context is closed.
     * Equivalent to `state === 'closed'`.
     *
     * @example
     * ```typescript
     * if (!ctx.closed) {
     *   // Context is still active or closing
     * }
     * ```
     */
    readonly closed: boolean;

    /**
     * Close this execution context and all child contexts.
     *
     * In graceful mode (default), waits for in-flight executions to complete.
     * In abort mode, signals abort to in-flight executions immediately.
     *
     * The method is idempotent - multiple calls return the same promise.
     *
     * @example
     * ```typescript
     * // Graceful close - wait for work to complete
     * const ctx = scope.createExecution()
     * const work = ctx.exec(longRunningFlow, input)
     * await ctx.close() // Waits for work to finish
     * ```
     *
     * @example
     * ```typescript
     * // Abort mode - cancel in-flight work
     * const ctx = scope.createExecution()
     * ctx.exec(infiniteFlow, input) // Never completes
     * await ctx.close({ mode: 'abort' }) // Forces termination
     * ```
     *
     * @example
     * ```typescript
     * // Idempotent - safe to call multiple times
     * const p1 = ctx.close()
     * const p2 = ctx.close()
     * assert(p1 === p2) // Same promise
     * ```
     *
     * @param options.mode - 'graceful' (default) or 'abort'
     * @returns Promise that resolves when close completes
     * @throws {AggregateError} When child contexts, in-flight executions, or extension
     *   hooks fail during close. Requires Node.js 15+ or modern browser.
     */
    close(options?: { mode?: 'graceful' | 'abort' }): Promise<void>;

    /**
     * Subscribe to context state changes.
     *
     * The callback fires on each state transition:
     * - `active` → `closing`: When close() is called
     * - `closing` → `closed`: When close completes
     *
     * @example
     * ```typescript
     * const ctx = scope.createExecution()
     *
     * const cleanup = ctx.onStateChange((state, prev) => {
     *   console.log(`State changed: ${prev} → ${state}`)
     *   if (state === 'closing') {
     *     // Context is shutting down
     *   }
     * })
     *
     * // Later: unsubscribe
     * cleanup()
     * ```
     *
     * @example
     * ```typescript
     * // Track lifecycle in middleware
     * const cleanup = ctx.onStateChange((state) => {
     *   metrics.recordState(state)
     *   if (state === 'closed') {
     *     logger.info('Request context closed')
     *   }
     * })
     * ```
     *
     * @param callback - Called with new state and previous state
     * @returns Cleanup function to unsubscribe
     */
    onStateChange(callback: (state: ContextState, prev: ContextState) => void): () => void;

    get<T>(tag: Tag.Tag<T, false> | Tag.Tag<T, true>): T;
    find<T>(tag: Tag.Tag<T, false>): T | undefined;
    find<T>(tag: Tag.Tag<T, true>): T;
    set<T>(tag: Tag.Tag<T, false> | Tag.Tag<T, true>, value: T): void;
    initializeExecutionContext(flowName: string, isParallel?: boolean): void;

    exec<F extends Flow.UFlow>(
      config: {
        flow: F;
        key?: string;
        timeout?: number;
        retry?: number;
        tags?: Tag.Tagged[];
      } & (Flow.InferInput<F> extends void | undefined
        ? { input?: never }
        : { input: Flow.InferInput<F> })
    ): Promised<Flow.InferOutput<F>>;

    exec<T>(config: {
      fn: () => T | Promise<T>;
      params?: never;
      key?: string;
      timeout?: number;
      retry?: number;
      tags?: Tag.Tagged[];
    }): Promised<T>;

    exec<Fn extends (...args: any[]) => any>(config: {
      fn: Fn;
      params: Parameters<Fn>;
      key?: string;
      timeout?: number;
      retry?: number;
      tags?: Tag.Tagged[];
    }): Promised<ReturnType<Fn>>;

    parallel<T extends readonly Promised<any>[]>(
      promises: [...T]
    ): Promised<
      Flow.ParallelResult<{
        [K in keyof T]: T[K] extends Promised<infer R> ? R : never;
      }>
    >;

    parallelSettled<T extends readonly Promised<any>[]>(
      promises: [...T]
    ): Promised<
      Flow.ParallelSettledResult<{
        [K in keyof T]: T[K] extends Promised<infer R> ? R : never;
      }>
    >;

    resetJournal(keyPattern?: string): void;
    createSnapshot(): Flow.ExecutionData;
    end(): void;
    throwIfAborted(): void;
  }
}

export namespace Extension {
  export type ResolveOperation = {
    kind: "resolve";
    executor: Core.Executor<unknown>;
    scope: Core.Scope;
    operation: "resolve" | "update";
  };

  export type ExecutionMode = "sequential" | "parallel" | "parallel-settled"

  export type ExecutionOperation = {
    kind: "execution";
    name: string;
    mode: ExecutionMode;
    input?: unknown;
    key?: string;
    context: Tag.Store;
    flow?: Flow.UFlow;
    definition?: Flow.Definition<any, any>;
    params?: readonly unknown[];
    count?: number;
  };

  export type ContextLifecycleOperation = {
    kind: "context-lifecycle"
    phase: "create" | "closing" | "closed"
    context: ExecutionContext.Context
    mode?: 'graceful' | 'abort'
  }

  export type Operation = ResolveOperation | ExecutionOperation | ContextLifecycleOperation;

  export interface Extension {
    name: string;

    init?(scope: Core.Scope): MaybePromised<void>;

    wrap?(
      scope: Core.Scope,
      next: () => Promised<unknown>,
      operation: Operation
    ): Promise<unknown> | Promised<unknown>;

    onError?(error: ExecutorError, scope: Core.Scope): void;

    dispose?(scope: Core.Scope): MaybePromised<void>;
  }
}

export namespace Multi {
  export type Key = unknown;
  export type MultiExecutor<T, K> = Core.Executor<(k: K) => Core.Accessor<T>> &
    ((key: K) => Core.Executor<T>) & {
      release: (scope: Core.Scope) => Promised<void>;
      id: Tag.Tag<unknown, true>;
    };

  export type DependentFn<T, K, D> = (
    dependencies: D,
    key: K,
    scope: Core.Controller
  ) => Core.Output<T>;

  export type Option<K> = {
    keySchema: StandardSchemaV1<K>;
    keyTransform?: (key: K) => unknown;
  };

  export type DeriveOption<K, D> = Option<K> & {
    dependencies: D;
  };
}

export { tagSymbol, type Tag } from "./tag";

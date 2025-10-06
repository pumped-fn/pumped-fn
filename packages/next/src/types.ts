import { type FlowPromise } from "./promises";

export const executorSymbol: unique symbol = Symbol.for(
  "@pumped-fn/core/executor"
);
export const metaSymbol: unique symbol = Symbol.for("@pumped-fn/core/meta");

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

export class SchemaError extends Error {
  public readonly issues: ReadonlyArray<StandardSchemaV1.Issue>;

  constructor(issues: ReadonlyArray<StandardSchemaV1.Issue>) {
    super(issues[0].message);
    this.name = "SchemaError";
    this.issues = issues;
  }
}

export interface ErrorContext {
  readonly executorName?: string;
  readonly resolutionStage:
    | "dependency-resolution"
    | "factory-execution"
    | "post-processing"
    | "validation";
  readonly dependencyChain: string[];
  readonly scopeId?: string;
  readonly timestamp: number;
  readonly additionalInfo?: Record<string, unknown>;
}

export class ExecutorResolutionError extends Error {
  public readonly context: ErrorContext;
  public readonly code: string;
  public readonly category: "USER_ERROR" | "SYSTEM_ERROR" | "VALIDATION_ERROR";

  constructor(
    message: string,
    context: ErrorContext,
    code: string,
    category: "USER_ERROR" | "SYSTEM_ERROR" | "VALIDATION_ERROR" = "USER_ERROR",
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "ExecutorResolutionError";
    this.context = context;
    this.code = code;
    this.category = category;
  }
}

export class FactoryExecutionError extends ExecutorResolutionError {
  constructor(
    message: string,
    context: Omit<ErrorContext, "resolutionStage">,
    code: string,
    options?: { cause?: unknown }
  ) {
    super(
      message,
      { ...context, resolutionStage: "factory-execution" },
      code,
      "USER_ERROR",
      options
    );
    this.name = "FactoryExecutionError";
  }
}

export class DependencyResolutionError extends ExecutorResolutionError {
  public readonly missingDependency?: string;

  constructor(
    message: string,
    context: Omit<ErrorContext, "resolutionStage">,
    code: string,
    missingDependency?: string,
    options?: { cause?: unknown }
  ) {
    super(
      message,
      { ...context, resolutionStage: "dependency-resolution" },
      code,
      "USER_ERROR",
      options
    );
    this.name = "DependencyResolutionError";
    this.missingDependency = missingDependency;
  }
}

export declare namespace Meta {
  export interface MetaContainer {
    metas: Meta[] | undefined;
  }

  export interface Meta<V = unknown> {
    readonly [metaSymbol]: true;
    readonly key: string | symbol;
    readonly schema: StandardSchemaV1<V>;
    readonly value: V;
  }

  export interface MetaFn<V> {
    (value: V): Meta<V>;
    readonly key: string | symbol;
    partial: <D extends Partial<V>>(d: D) => D;
    some: (source: MetaContainer | Meta[] | undefined) => V[];
    find: (source: MetaContainer | Meta[] | undefined) => V | undefined;
    get: (source: MetaContainer | Meta[] | undefined) => V;
  }

  export interface DefaultMetaFn<V> extends MetaFn<V> {
    (value?: V): Meta<V>;
    defaultValue: V;
  }
}

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

  export type Cleanup = () => void | Promise<void>;

  export type Controller = {
    cleanup: (cleanup: Cleanup) => void;
    release: () => Promise<void>;
    reload: () => Promise<void>;
    scope: Scope;
  };

  export type Kind = "main" | "reactive" | "lazy" | "static";

  export interface BaseExecutor<T> extends Meta.MetaContainer {
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
  export type ResolvedState<T> = { kind: "resolved"; value: T };
  export type RejectedState = {
    kind: "rejected";
    error: unknown;
    context?: ErrorContext;
    enhancedError?: ExecutorResolutionError;
  };

  export type ResolveState<T> =
    | PendingState<T>
    | ResolvedState<T>
    | RejectedState;

  export interface Accessor<T> extends Meta.MetaContainer {
    lookup(): undefined | ResolveState<T>;

    get(): T;
    resolve(force?: boolean): Promise<T>;
    release(soft?: boolean): Promise<void>;
    update(updateFn: T | ((current: T) => T)): Promise<void>;
    set(value: T): Promise<void>;
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

  export type InferOutput<T> = T extends Executor<infer U> | Reactive<infer U>
    ? Awaited<U>
    : T extends Lazy<infer U> | Static<infer U>
    ? Accessor<Awaited<U>>
    : T extends
        | ReadonlyArray<Core.BaseExecutor<unknown>>
        | Record<string, Core.BaseExecutor<unknown>>
    ? { [K in keyof T]: InferOutput<T[K]> }
    : never;

  export type Event = "resolve" | "update" | "release";
  export type Replacer = Preset<unknown>;
  type EventCallbackResult = void | Replacer;

  export type ChangeCallback = (
    event: "resolve" | "update",
    executor: Executor<unknown>,
    resolved: unknown,
    scope: Scope
  ) => EventCallbackResult | Promise<EventCallbackResult>;

  export type ReleaseCallback = (
    event: "release",
    executor: Executor<unknown>,
    scope: Scope
  ) => void | Promise<void>;

  export type ErrorCallback<T = unknown> = (
    error:
      | ExecutorResolutionError
      | FactoryExecutionError
      | DependencyResolutionError,
    executor: Executor<T>,
    scope: Scope
  ) => void | Promise<void>;

  export type GlobalErrorCallback = (
    error:
      | ExecutorResolutionError
      | FactoryExecutionError
      | DependencyResolutionError,
    executor: Executor<unknown>,
    scope: Scope
  ) => void | Promise<void>;

  export type WrapContext = {
    operation: "resolve" | "update";
    executor: Executor<unknown>;
    scope: Scope;
  };

  export type SingleDependencyLike = Core.BaseExecutor<unknown>;

  export type MultiDependencyLike =
    | ReadonlyArray<Core.BaseExecutor<unknown>>
    | Record<string, Core.BaseExecutor<unknown>>;

  export type DependencyLike = SingleDependencyLike | MultiDependencyLike;
  export type Destructed<T extends DependencyLike> =
    T extends SingleDependencyLike
      ? T
      : {
          [K in keyof T]: T[K];
        };

  export interface Pod
    extends Omit<
        Core.Scope,
        "update" | "disposePod" | "onChange" | "registeredExecutors"
      >,
      Meta.MetaContainer {
    getDepth(): number;
    getRootPod(): Pod;
    getChildPods(): ReadonlySet<Pod>;
  }

  export interface Scope extends Meta.MetaContainer {
    accessor<T>(executor: Core.Executor<T>, eager?: boolean): Accessor<T>;
    entries(): [Core.Executor<unknown>, Core.Accessor<unknown>][];
    registeredExecutors(): Core.Executor<unknown>[];

    resolve<T>(executor: Core.Executor<T>, force?: boolean): Promise<T>;
    resolveAccessor<T>(executor: Core.Executor<T>): Promise<Accessor<T>>;

    update<T>(
      executor: Executor<T>,
      updateFn: T | ((current: T) => T)
    ): Promise<void>;
    set<T>(executor: Executor<T>, value: T): Promise<void>;

    release(executor: Executor<any>, soft?: boolean): Promise<void>;

    dispose(): Promise<void>;

    onUpdate<T>(
      executor: Executor<T>,
      callback: (accessor: Accessor<T>) => void
    ): Cleanup;

    onChange(cb: ChangeCallback): Cleanup;
    onRelease(cb: ReleaseCallback): Cleanup;
    onError<T>(executor: Executor<T>, callback: ErrorCallback<T>): Cleanup;
    onError(callback: GlobalErrorCallback): Cleanup;

    useExtension(extension: Extension.Extension): Cleanup;

    pod(...presets: Preset<unknown>[]): Pod;
    pod(options: {
      initialValues?: Preset<unknown>[];
      extensions?: Extension.Extension[];
      meta?: Meta.Meta[];
    }): Pod;
    disposePod(scope: Pod): Promise<void>;
  }
}

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
  } & Meta.MetaContainer;

  export interface Handler<S, I> {
    (ctx: Context, input: I): S | Promise<S>;
    def: Definition<S, I>;
  }

  export type UFlow = Core.Executor<Handler<any, any>>;

  export type InferInput<F> = F extends
    | Handler<any, infer I>
    | Core.Executor<Handler<any, infer I>>
    ? I
    : never;

  export type InferOutput<F> = F extends
    | Handler<infer S, any>
    | Core.Executor<Handler<infer S, any>>
    ? S
    : never;

  export type FnExecutor<I, O> = (input: I) => O | Promise<O>;

  export type MultiFnExecutor<Args extends readonly unknown[], O> = (
    ...args: Args
  ) => O | Promise<O>;

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

  export type C = {
    readonly pod: Core.Pod;

    get<T>(accessor: Accessor.Accessor<T> | Accessor.AccessorWithDefault<T>): T;
    find<T>(accessor: Accessor.Accessor<T>): T | undefined;
    find<T>(accessor: Accessor.AccessorWithDefault<T>): T;
    set<T>(
      accessor: Accessor.Accessor<T> | Accessor.AccessorWithDefault<T>,
      value: T
    ): void;

    run<T>(key: string, fn: () => Promise<T> | T): FlowPromise<T>;
    run<T, P extends readonly unknown[]>(
      key: string,
      fn: (...args: P) => Promise<T> | T,
      ...params: P
    ): FlowPromise<T>;

    exec<F extends UFlow>(
      flow: F,
      input: InferInput<F>
    ): FlowPromise<InferOutput<F>>;

    exec<F extends UFlow>(
      key: string,
      flow: F,
      input: InferInput<F>
    ): FlowPromise<InferOutput<F>>;

    parallel<T extends readonly FlowPromise<any>[]>(
      promises: [...T]
    ): Promise<
      ParallelResult<{
        [K in keyof T]: T[K] extends FlowPromise<infer R> ? R : never;
      }>
    >;

    parallelSettled<T extends readonly FlowPromise<any>[]>(
      promises: [...T]
    ): Promise<
      ParallelSettledResult<{
        [K in keyof T]: T[K] extends FlowPromise<infer R> ? R : never;
      }>
    >;
  };

  export type Context = C;

  export type ExecutionData = {
    readonly context: {
      get<T>(accessor: Accessor.Accessor<T> | Accessor.AccessorWithDefault<T>): T;
      find<T>(accessor: Accessor.Accessor<T>): T | undefined;
      find<T>(accessor: Accessor.AccessorWithDefault<T>): T;
    };
  };

  export type ExecutionDetails<T> =
    | { success: true; result: T; ctx: ExecutionData }
    | { success: false; error: unknown; ctx: ExecutionData };
}

export namespace Extension {
  export type Operation =
    | {
        kind: "resolve";
        executor: Core.Executor<unknown>;
        scope: Core.Scope;
        operation: "resolve" | "update";
      }
    | {
        kind: "execute";
        flow: Flow.UFlow;
        definition: Flow.Definition<any, any>;
        input: unknown;
        flowName: string | undefined;
        depth: number;
        isParallel: boolean;
        parentFlowName: string | undefined;
      }
    | {
        kind: "journal";
        key: string;
        flowName: string;
        depth: number;
        isReplay: boolean;
        pod: Core.Pod;
        params?: readonly unknown[];
      }
    | {
        kind: "subflow";
        flow: Flow.UFlow;
        definition: Flow.Definition<any, any>;
        input: unknown;
        journalKey: string | undefined;
        parentFlowName: string | undefined;
        depth: number;
        pod: Core.Pod;
      }
    | {
        kind: "parallel";
        mode: "parallel" | "parallelSettled";
        promiseCount: number;
        depth: number;
        parentFlowName: string | undefined;
        pod: Core.Pod;
      };

  export interface Extension {
    name: string;

    init?(scope: Core.Scope): void | Promise<void>;
    initPod?(pod: Core.Pod, context: Accessor.DataStore): void | Promise<void>;

    wrap?<T>(
      context: Accessor.DataStore,
      next: () => Promise<T>,
      operation: Operation
    ): Promise<T>;

    onError?(
      error:
        | ExecutorResolutionError
        | FactoryExecutionError
        | DependencyResolutionError,
      scope: Core.Scope
    ): void;
    onPodError?(
      error: unknown,
      pod: Core.Pod,
      context: Accessor.DataStore
    ): void;

    dispose?(scope: Core.Scope): void | Promise<void>;
    disposePod?(pod: Core.Pod): void | Promise<void>;
  }
}

export declare namespace Accessor {
  export interface DataStore {
    get(key: unknown): unknown;
    set(key: unknown, value: unknown): unknown | undefined;
  }

  export type AccessorSource = DataStore | Meta.MetaContainer | Meta.Meta[];

  interface BaseAccessor<T> {
    readonly key: symbol;
    readonly schema: StandardSchemaV1<T>;
  }

  export interface Accessor<T> extends BaseAccessor<T> {
    get(source: AccessorSource): T;
    find(source: AccessorSource): T | undefined;
    set(source: DataStore, value: T): void;
    preset(value: T): [symbol, T];
  }

  export interface AccessorWithDefault<T> extends BaseAccessor<T> {
    readonly defaultValue: T;
    get(source: AccessorSource): T;
    find(source: AccessorSource): T;
    set(source: DataStore, value: T): void;
    preset(value: T): [symbol, T];
  }
}

export namespace Multi {
  export type Key = unknown;
  export type MultiExecutor<T, K> = Core.Executor<(k: K) => Core.Accessor<T>> &
    ((key: K) => Core.Executor<T>) & {
      release: (scope: Core.Scope) => Promise<void>;
      id: Meta.MetaFn<unknown>;
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

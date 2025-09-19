import { AdaptedExecutor, PreparedExecutor } from "./helpers";
import type { DataStore } from "./accessor";

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
    super(message);
    // Manually set cause if options provided
    if (options && "cause" in options) {
      (this as any).cause = options.cause;
    }
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

    /** Return an executor controller without resolving Executor */
    readonly lazy: Lazy<T>;

    /** Return an resolved executor, and mark the user to be reactived for future changes */
    readonly reactive: Reactive<T>;

    /** Return an resolved executor with its controller */
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

  export type InferOutput<T> = T extends
    | Executor<infer U>
    | Reactive<infer U>
    | PreparedExecutor<infer U>
    ? Awaited<U>
    : T extends Lazy<infer U> | Static<infer U>
    ? Accessor<Awaited<U>>
    : T extends AdaptedExecutor<infer A, infer U>
    ? (...args: A) => Promise<Awaited<U>>
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

  export type Plugin = {
    init?: (scope: Scope) => void | Promise<void>;
    dispose?: (scope: Scope) => void | Promise<void>;

    wrap?(next: () => Promise<unknown>, context: WrapContext): Promise<unknown>;

    onError?: (
      error:
        | ExecutorResolutionError
        | FactoryExecutionError
        | DependencyResolutionError,
      executor: Executor<unknown>,
      scope: Scope,
      context: {
        stage: "resolve" | "update" | "release";
        attemptCount?: number;
      }
    ) => void | Promise<void>;
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
      "update" | "pod" | "disposePod" | "onChange" | "registeredExecutors"
    > {}

  export interface Scope {
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

    use(middleware: Plugin): Cleanup;

    pod(...presets: Preset<unknown>[]): Pod;
    disposePod(scope: Pod): Promise<void>;
  }
}

export namespace Flow {
  export type OK<S> = {
    type: "ok";
    data: S;
    isOk(): this is OK<S>;
    isKo(): this is never;
  };
  export type KO<E> = {
    type: "ko";
    data: E;
    isOk(): this is never;
    isKo(): this is KO<E>;
  };
  export type OutputLike<S, E> = OK<S> | KO<E>;

  export type Definition<I, S, E> = {
    name: string;
    input: StandardSchemaV1<I>;
    success: StandardSchemaV1<S>;
    error: StandardSchemaV1<E>;
    version?: string;
  } & Meta.MetaContainer;

  export interface NoDependencyHandler<I, S, E> {
    (ctx: Context<I, S, E>): OutputLike<S, E> | Promise<OutputLike<S, E>>;
    def: Definition<I, S, E>;
  }

  export interface DependentHandler<D, I, S, E> {
    (ctx: Context<I, S, E>): OutputLike<S, E> | Promise<OutputLike<S, E>>;
    def: Definition<I, S, E>;
  }

  export type NoDependencyFlow<I, S, E> = Core.Executor<
    NoDependencyHandler<I, S, E>
  >;

  export type DependentFlow<D, I, S, E> = Core.Executor<
    DependentHandler<D, I, S, E>
  >;

  export type UFlow =
    | Core.Executor<NoDependencyHandler<any, any, any>>
    | Core.Executor<DependentHandler<any, any, any, any>>;

  export type InferInput<F> = F extends NoDependencyFlow<infer I, any, any>
    ? I
    : F extends DependentFlow<any, infer I, any, any>
    ? I
    : never;

  export type InferSuccess<F> = F extends NoDependencyFlow<any, infer S, any>
    ? S
    : F extends DependentFlow<any, any, infer S, any>
    ? S
    : never;

  export type InferError<F> = F extends NoDependencyFlow<any, any, infer E>
    ? E
    : F extends DependentFlow<any, any, any, infer E>
    ? E
    : never;

  export type InferOutput<F> = F extends NoDependencyFlow<any, infer S, infer E>
    ? OK<S> | KO<E>
    : F extends DependentFlow<any, any, infer S, infer E>
    ? OK<S> | KO<E>
    : never;

  export type FnExecutor<I, O> = (input: I) => O | Promise<O>;

  export type MultiFnExecutor<Args extends readonly unknown[], O> =
    (...args: Args) => O | Promise<O>;

  export type AnyFnExecutor<O = unknown> =
    | FnExecutor<any, O>
    | MultiFnExecutor<any[], O>;

  export type R<S, E> = {
    ok: (value: S) => OK<S>;
    ko: (value: E) => KO<E>;
    output: (
      ok: boolean,
      value: typeof ok extends true ? S : E
    ) => typeof ok extends true ? OK<S> : KO<E>;
  };

  export type Opt = {};

  export type C = {
    execute: {
      <F extends UFlow>(
        flow: F,
        input: InferInput<F>,
        opt?: Opt
      ): Promise<InferOutput<F>>;

      <I, O, E = unknown>(
        fn: FnExecutor<I, O>,
        input: I,
        errorMapper?: (error: unknown) => E,
        opt?: Opt
      ): Promise<OK<O> | KO<E>>;

      <Args extends readonly unknown[], O, E = unknown>(
        fn: MultiFnExecutor<Args, O>,
        args: Args,
        errorMapper?: (error: unknown) => E,
        opt?: Opt
      ): Promise<OK<O> | KO<E>>;
    };

    executeParallel: {
      <T extends ReadonlyArray<[UFlow, any]>>(
        flows: T
      ): Promise<{
        [K in keyof T]: T[K] extends [infer F, any]
          ? F extends UFlow
            ? Awaited<InferOutput<F>>
            : never
          : never;
      }>;

      <T extends ReadonlyArray<[FnExecutor<any, any> | MultiFnExecutor<any[], any>, any]>>(
        items: T
      ): Promise<{
        [K in keyof T]: T[K] extends [infer F, any]
          ? F extends FnExecutor<any, infer O>
            ? OK<O> | KO<unknown>
            : F extends MultiFnExecutor<any[], infer O>
            ? OK<O> | KO<unknown>
            : never
          : never;
      }>;

      <T extends ReadonlyArray<[UFlow | FnExecutor<any, any> | MultiFnExecutor<any[], any>, any]>>(
        mixed: T
      ): Promise<{
        [K in keyof T]: T[K] extends [infer F, any]
          ? F extends UFlow
            ? Awaited<InferOutput<F>>
            : F extends FnExecutor<any, infer O>
            ? OK<O> | KO<unknown>
            : F extends MultiFnExecutor<any[], infer O>
            ? OK<O> | KO<unknown>
            : never
          : never;
      }>;
    };
  };

  export type Context<I, S, E> = DataStore &
    R<S, E> &
    C & {
      input: I;
    };

  export interface Plugin {
    name: string;
    init?(pod: Core.Pod, context: DataStore): void | Promise<void>;
    wrap?<T>(
      context: DataStore,
      next: () => Promise<T>,
      execution: {
        flowName: string | undefined;
        depth: number;
        isParallel: boolean;
        parentFlowName: string | undefined;
      }
    ): Promise<T>;
    dispose?(pod: Core.Pod): void | Promise<void>;
  }
}

export namespace Multi {
  export type Key = unknown;
  export type MultiExecutor<T, K> = Core.Executor<(k: K) => Promise<T>>;
}

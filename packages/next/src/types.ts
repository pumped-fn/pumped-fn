import { AdaptedExecutor, PreparedExecutor } from "./helpers";

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
  export type RejectedState = { kind: "rejected"; error: unknown };

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
    value: T;
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

  type K = InferOutput<[Core.Executor<string>, Core.Executor<number>]>;
  //     ^?

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

  export type Plugin = {
    init?: (
      scope: Scope,
      initialOpt: { registry: Core.Executor<unknown>[] }
    ) => void | Promise<void>;
    dispose?: (scope: Scope) => void | Promise<void>;
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
    extends Omit<Core.Scope, "update" | "pod" | "disposePod" | "onChange"> {}

  export interface Scope {
    accessor<T>(executor: Core.Executor<T>, eager?: boolean): Accessor<T>;
    entries(): [Core.Executor<unknown>, Core.Accessor<unknown>][];

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

    use(middleware: Plugin): Cleanup;

    pod(...presets: Preset<unknown>[]): Pod;
    disposePod(scope: Pod): Promise<void>;
  }
}

export namespace Flow {
  export type Context = {};

  export type ExecutionPlugin = {};
  export type ExecuteOpt = {
    scope?: Core.Scope;
    name?: string;
    description?: string;
    plugins?: FlowPlugin[];
    presets?: Core.Preset<unknown>[];
  };

  export type Controller = {
    execute: <Input, Output>(
      input: Flow<Input, Output>,
      param: Input,
      opt?: ExecuteOpt
    ) => Promise<Output>;
    safeExecute: <Input, Output>(
      input: Flow<Input, Output>,
      param: Input,
      opt?: ExecuteOpt
    ) => Promise<Result<Output>>;
  };

  export type NoDependencyFlowFn<Input, Output> = (
    input: Input,
    context: Controller & { context: ExecutionContext }
  ) => Output | Promise<Output>;

  export type DependentFlowFn<D, Input, Output> = (
    dependency: D,
    input: Input,
    context: Controller & { context: ExecutionContext }
  ) => Output | Promise<Output>;

  export type FlowPlugin = {
    name: string;
    wrap<T>(context: ExecutionContext, execute: () => Promise<T>): Promise<T>;
  };

  export type Flow<Input, Output> = {
    execution: NoDependencyFlowFn<Input, Output>;
  } & Config &
    Schema<Input, Output>;

  export type Schema<Input, Output> = {
    input: StandardSchemaV1<Input>;
    output: StandardSchemaV1<Output>;
  };

  export type Config = {
    name?: string;
    description?: string;
    plugins?: FlowPlugin[];
    metas?: Meta.Meta[];
  };

  export type Executor<Input, Output> = Core.Executor<Flow<Input, Output>> &
    Config &
    Schema<Input, Output>;

  export type ExecutionContext<Input = any, Output = any> = {
    data: Map<unknown, unknown>;
    parent?: ExecutionContext;
    scope: Core.Scope;
    plugins: FlowPlugin[];
    flow: Flow<Input, Output>; // The flow being executed
  };

  export type Success<T> = { kind: "success"; value: T };
  export type Error = { kind: "error"; error: unknown };

  export type Result<T> = Success<T> | Error;

  export type ExecutionResult<Output> = {
    context: ExecutionContext;
    result: Result<Output>;
  };
}

export namespace Multi {
  export type Key = unknown;
  export type MultiExecutor<T, K> = Core.Executor<(k: K) => Promise<T>>;
}

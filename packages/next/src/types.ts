export const executorSymbol: unique symbol = Symbol.for("@pumped-fn/core/executor");
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
}

export declare namespace Core {
  export type Output<T> = T | Promise<T>;

  export type NoDependencyFn<T> = (scope: Controller) => Output<T>;
  export type DependentFn<T, D> = (
    dependencies: D,
    scope: Controller
  ) => Output<T>;
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

  export interface Accessor<T> extends Meta.MetaContainer {
    lookup(): T;
    get(): T;
    resolve(force?: boolean): Promise<T>;
    release(soft?: boolean): Promise<void>;
    update(updateFn: T | ((current: T) => T)): Promise<void>;
    subscribe(callback: (value: T) => void): Cleanup;
  }

  export interface Preset<T> {
    [executorSymbol]: "preset";
    executor: Executor<T>;
    value: T;
  }

  export type InferOutput<T> = T extends Executor<infer U> | Reactive<infer U>
    ? Awaited<U>
    : T extends Lazy<infer U> | Static<infer U>
    ? Accessor<Awaited<U>>
    : never;

  export interface Scope {
    accessor<T>(executor: Core.Executor<T>, eager?: boolean): Accessor<T>;

    resolve<T>(executor: Core.Executor<T>): Promise<T>;
    resolveAccessor<T>(executor: Core.Executor<T>): Promise<Accessor<T>>;

    update<T>(
      executor: Executor<T>,
      updateFn: T | ((current: T) => T)
    ): Promise<void>;

    reset<T>(executor: Executor<T>): Promise<void>;
    release(executor: Executor<any>, soft?: boolean): Promise<void>;

    dispose(): Promise<void>;

    onUpdate<T>(
      executor: Executor<T>,
      callback: (accessor: Accessor<T>) => void
    ): Cleanup;
    // onRelease<T>(executor: Executor<T>, callback: () => void): () => void;
  }
}

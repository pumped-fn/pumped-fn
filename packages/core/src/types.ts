import { Meta } from "./meta";

export type Factory<P, D = undefined> = (value: D, scope: Scope) => P | Promise<P>;
export type ExecutionFactory<P, D = undefined> = (value: D, scope: ExecutionScope) => P | Promise<P>;

export type Immutable = { kind: "immutable" };
export type Mutable = { kind: "mutable" };
export type Effect = { kind: "effect" };
export type Reactive = { kind: "reactive" };
export type Resource = { kind: "resource" };
export type ReactiveResource = { kind: "reactive-resource" };
export type Reference = { kind: "reference" };
export type Execution = { kind: "execution" };
export type ExecutionOptional = { kind: "execution-optional" };

export const executorSymbol = Symbol("jumped-fn.executor");

export function isExecutor<T>(value: unknown): value is Executor<T> {
  return typeof value === "object" && value !== null && executorSymbol in value;
}

export interface Executor<T> {
  [executorSymbol]:
    | Immutable
    | Mutable
    | Effect
    | Reactive
    | Resource
    | ReactiveResource
    | Reference
    | Execution
    | ExecutionOptional;

  readonly factory: (dependencies: unknown, scope: Scope | ExecutionScope) => T | Promise<T>;
  readonly dependencies: Executor<unknown>[] | Record<string, Executor<unknown>> | Executor<unknown> | undefined;
  readonly id: string;
  readonly ref: Executor<this>;
  readonly metas?: Meta<unknown>[];
}

export interface ImmutableExecutor<T> extends Executor<T> {
  [executorSymbol]: Immutable;
}

export interface ResourceExecutor<T> extends Executor<[T, Cleanup]> {
  [executorSymbol]: Resource;
}

export interface ReactiveExecutor<T> extends Executor<T> {
  [executorSymbol]: Reactive;
}

export interface ReactiveResourceExecutor<T> extends Executor<[T, Cleanup]> {
  [executorSymbol]: ReactiveResource;
}

export interface ReferenceExecutor<T extends Executor<unknown>> extends Executor<T> {
  [executorSymbol]: Reference;
}

export interface MutableExecutor<T> extends Executor<T> {
  [executorSymbol]: Mutable;
}

export interface EffectExecutor extends Executor<Cleanup> {
  [executorSymbol]: Effect;
}

export interface ExecutionExecutor<T> extends Executor<T> {
  [executorSymbol]: Execution;
}

export interface ExecutionOptionalExecutor<T> extends Executor<T | undefined> {
  [executorSymbol]: ExecutionOptional;
}

export declare namespace ExecutionValue {
  export type Preset = (scope: ExecutionScope) => void;
  export type PresetFn<V> = (value: V) => Preset;
  export type Setter<V> = ExecutionExecutor<(value: V) => void>;
  export type Getter<V> = ExecutionExecutor<V>;
  export type Finder<V> = ExecutionOptionalExecutor<V>;
}

export type ExecutionValue<V> = {
  readonly preset: ExecutionValue.PresetFn<V>;
  readonly getter: ExecutionValue.Getter<V>;
  readonly setter: ExecutionValue.Setter<V>;
  readonly finder: ExecutionValue.Finder<V>;
};

export type InferOutput<T> = T extends
  | ImmutableExecutor<infer U>
  | MutableExecutor<infer U>
  | ResourceExecutor<infer U>
  | ReactiveExecutor<infer U>
  | ReactiveResourceExecutor<infer U>
  ? Awaited<U>
  : T extends EffectExecutor
    ? Cleanup
    : T extends Executor<infer U>
      ? Awaited<U>
      : T extends Record<string, Executor<unknown>>
        ? { [K in keyof T]: InferOutput<T[K]> }
        : T extends [...infer U]
          ? { [K in keyof U]: InferOutput<U[K]> }
          : unknown;

export interface Middleware {
  onResolve?: (scope: Scope, executor: Executor<unknown>, value: unknown) => Promise<unknown>;
  onUpdate?: (
    scope: Scope,
    executor: MutableExecutor<unknown>,
    nextValue: unknown,
    previousValue: unknown,
  ) => Promise<unknown>;
  onRelease?: (scope: Scope, executor: Executor<unknown>) => Promise<void>;
  onDispose?: (scope: Scope) => Promise<void>;
}

export interface Scope {
  readonly isDisposed: boolean;
  get<T>(executor: Executor<T>): GetAccessor<T> | undefined;

  resolve<T extends Executor<unknown>>(executor: T): Promise<GetAccessor<InferOutput<T>>>;
  update<T>(executor: MutableExecutor<T>, updateFn: T | ((current: T) => T)): Promise<void>;
  reset<T>(executor: Executor<T>): Promise<void>;
  release(executor: Executor<any>, soft?: boolean): Promise<void>;

  dispose(): Promise<void>;
  on<T>(executor: Executor<T>, listener: (value: T) => void): Cleanup;
  once<T>(executor: Executor<T>): Promise<void>;

  addCleanup(cleanup: Cleanup): Cleanup;
}

export interface ExecutionScope extends Scope {
  readonly context: Map<unknown, unknown>;
  readonly refScope: Scope;
}

export type Cleanup = () => void | Promise<void>;

export const outputSymbol = Symbol("jumped-fn.output");
export interface Output<T> {
  value: T;
  [outputSymbol]: string;
}

export interface GetAccessor<T> {
  get: () => Awaited<T>;
}

export const getAccessor = <T>(get: () => T): GetAccessor<T> => ({
  get: () => get() as Awaited<T>,
});

export function createExecutor<
  T,
  K extends Immutable | Mutable | Effect | Reactive | Resource | ReactiveResource | Execution | ExecutionOptional,
>(
  kind: K,
  factory: (dependencies: any, scope: Scope | ExecutionScope) => any,
  dependencies: Executor<unknown>[] | Record<string, Executor<unknown>> | Executor<unknown> | undefined,
  id: string,
  meta: Meta<unknown>[] | undefined,
): K extends Immutable
  ? ImmutableExecutor<T>
  : K extends Mutable
    ? MutableExecutor<T>
    : K extends Effect
      ? EffectExecutor
      : K extends Reactive
        ? ReactiveExecutor<T>
        : K extends Resource
          ? ResourceExecutor<T>
          : K extends ReactiveResource
            ? ReactiveResourceExecutor<T>
            : never {
  const executor = {} as Executor<T>;

  Object.defineProperties(executor, {
    [executorSymbol]: {
      value: kind,
      writable: false,
      configurable: false,
      enumerable: false,
    },
    factory: {
      value: factory,
      writable: false,
      configurable: false,
      enumerable: false,
    },
    dependencies: {
      value: dependencies,
      writable: false,
      configurable: false,
      enumerable: false,
    },
    id: {
      value: id,
      writable: false,
      configurable: false,
      enumerable: false,
    },
    metas: {
      value: meta,
      writable: false,
      configurable: false,
      enumerable: false,
    },
  });

  const ref = createRefExecutor(executor);

  Object.defineProperty(executor, "ref", {
    value: ref,
    writable: false,
    configurable: false,
    enumerable: true,
  });

  return executor as any;
}

function createRefExecutor<T extends Executor<unknown>>(executor: T): ReferenceExecutor<T> {
  if (executor[executorSymbol].kind === "reference") {
    throw new Error(`a ref couldn't be refed`);
  }

  return Object.defineProperties<ReferenceExecutor<T>>({} as ReferenceExecutor<T>, {
    [executorSymbol]: {
      value: { kind: "reference" },
      writable: false,
      configurable: false,
      enumerable: false,
    },
    factory: {
      value: async (_: unknown, scope: Scope) => {
        await scope.resolve(executor);

        return executor;
      },
      writable: false,
      configurable: false,
      enumerable: false,
    },
    dependencies: {
      value: [executor],
      writable: false,
      configurable: false,
      enumerable: false,
    },
    id: {
      value: `ref(${executor.id})`,
      writable: false,
      configurable: false,
      enumerable: false,
    },
    ref: {
      get() {
        throw new Error(`a ref couldn't be refed`);
      },
    },
  });
}

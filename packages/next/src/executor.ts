import { Core, executorSymbol, Meta } from "./types";
import type { Escapable } from "./helpers";

function createExecutor<T>(
  factory: Core.NoDependencyFn<T> | Core.DependentFn<T, unknown>,
  dependencies:
    | undefined
    | Core.UExecutor
    | Array<Core.UExecutor>
    | Record<string, Core.UExecutor>,
  metas: Meta.Meta[] | undefined
): Core.Executor<T> {
  const executor = {
    [executorSymbol]: "main",
    factory: (_: unknown, controller: Core.Controller) => {
      if (dependencies === undefined) {
        const f = factory as Core.NoDependencyFn<T>;
        return f(controller);
      }

      const f = factory as Core.DependentFn<T, unknown>;
      return f(_, controller);
    },
    dependencies,
    metas: metas,
  } as unknown as Core.Executor<T>;

  const lazyExecutor = {
    [executorSymbol]: "lazy",
    dependencies: undefined,
    executor,
    factory: undefined,
    metas: metas,
  } satisfies Core.Lazy<T>;

  const reactiveExecutor = {
    [executorSymbol]: "reactive",
    executor,
    factory: undefined,
    dependencies: undefined,
    metas: metas,
  } satisfies Core.Reactive<T>;

  const staticExecutor = {
    [executorSymbol]: "static",
    dependencies: undefined,
    factory: undefined,
    metas: metas,
    executor,
  } satisfies Core.Static<T>;

  Object.defineProperties(executor, {
    lazy: {
      value: lazyExecutor,
      writable: false,
      configurable: false,
      enumerable: false,
    },
    reactive: {
      value: reactiveExecutor,
      writable: false,
      configurable: false,
      enumerable: false,
    },
    static: {
      value: staticExecutor,
      writable: false,
      configurable: false,
      enumerable: false,
    },
  });

  return executor;
}

export function isLazyExecutor(
  executor: Core.BaseExecutor<unknown>
): executor is Core.Lazy<unknown> {
  return executor[executorSymbol] === "lazy";
}

export function isReactiveExecutor(
  executor: Core.BaseExecutor<unknown>
): executor is Core.Reactive<unknown> {
  return executor[executorSymbol] === "reactive";
}

export function isStaticExecutor(
  executor: Core.BaseExecutor<unknown>
): executor is Core.Static<unknown> {
  return executor[executorSymbol] === "static";
}

export function isMainExecutor(
  executor: unknown
): executor is Core.Executor<unknown> {
  return isExecutor(executor) && executor[executorSymbol] === "main";
}

export function isExecutor<T>(input: unknown): input is Core.BaseExecutor<T> {
  return typeof input === "object" && input !== null && executorSymbol in input;
}

export function provide<T>(
  factory: Core.NoDependencyFn<T>,
  ...metas: Meta.Meta[]
): Core.Executor<T> {
  return createExecutor(factory, undefined, metas);
}

export function derive<T, D extends Core.BaseExecutor<unknown>>(
  dependencies: D,
  factory: Core.DependentFn<T, Core.InferOutput<D>>,
  ...metas: Meta.Meta[]
): Core.Executor<T>;

export function derive<
  T,
  D extends
    | ReadonlyArray<Core.BaseExecutor<unknown>>
    | Record<string, Core.BaseExecutor<unknown>>
>(
  dependencies: { [K in keyof D]: D[K] },
  factory: Core.DependentFn<T, { [K in keyof D]: Core.InferOutput<D[K]> }>,
  ...metas: Meta.Meta[]
): Core.Executor<T>;

export function derive<T, D>(
  pdependencies:
    | Core.BaseExecutor<D>
    | Array<Core.BaseExecutor<D>>
    | Record<string, Core.BaseExecutor<unknown>>,
  pfactory:
    | Core.DependentFn<T, Core.InferOutput<D>>
    | Core.DependentFn<T, { [K in keyof D]: Core.InferOutput<D[K]> }>,
  ...metas: Meta.Meta[]
): Core.Executor<T> {
  return createExecutor(pfactory as any, pdependencies, metas);
}

export function preset<T>(
  e: Core.Executor<T> | Escapable<T>,
  v: T
): Core.Preset<T> {
  const executor = isExecutor(e) ? e : e.escape();

  return {
    [executorSymbol]: "preset",
    value: v,
    executor,
  };
}

export function placeholder<V>(...metas: Meta.Meta<unknown>[]): Core.Executor<V> {
  return provide<V>(() => {
    throw new Error("Placeholder executor cannot be resolved");
  }, ...metas);
}
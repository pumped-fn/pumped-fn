import { Core, executorSymbol, Meta, metaSymbol } from "./types";

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
    [executorSymbol]: "base",
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

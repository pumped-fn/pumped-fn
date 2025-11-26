import { Core, executorSymbol, type Escapable } from "./types";
import type { Tag } from "./tag";
import { compile, type Sucrose } from "./sucrose";

function getDependencyShape(
  dependencies: undefined | Core.UExecutor | ReadonlyArray<Core.UExecutor> | Record<string, Core.UExecutor>
): Sucrose.DependencyShape {
  if (dependencies === undefined) return "none"
  if (Array.isArray(dependencies)) return "array"
  if (typeof dependencies === "object" && !(executorSymbol in dependencies)) return "record"
  return "single"
}

export function createExecutor<T>(
  factory: Core.NoDependencyFn<T> | Core.DependentFn<T, unknown>,
  dependencies:
    | undefined
    | Core.UExecutor
    | ReadonlyArray<Core.UExecutor>
    | Record<string, Core.UExecutor>,
  tags: Tag.Tagged[] | undefined,
  originalFactory?: Function
): Core.Executor<T> {
  const dependencyShape = getDependencyShape(dependencies)

  let _lazy: Core.Lazy<T> | undefined
  let _reactive: Core.Reactive<T> | undefined
  let _static: Core.Static<T> | undefined

  const executor = {
    [executorSymbol]: "main",
    dependencies,
    tags: tags,
  } as unknown as Core.Executor<T>

  compile(originalFactory || factory, dependencyShape, executor, tags)

  Object.defineProperties(executor, {
    lazy: {
      get() {
        return _lazy ??= {
          [executorSymbol]: "lazy",
          dependencies: undefined,
          executor,
          factory: undefined,
          tags: tags,
        } as Core.Lazy<T>
      },
      enumerable: false,
      configurable: false,
    },
    reactive: {
      get() {
        return _reactive ??= {
          [executorSymbol]: "reactive",
          executor,
          factory: undefined,
          dependencies: undefined,
          tags: tags,
        } as Core.Reactive<T>
      },
      enumerable: false,
      configurable: false,
    },
    static: {
      get() {
        return _static ??= {
          [executorSymbol]: "static",
          dependencies: undefined,
          factory: undefined,
          tags: tags,
          executor,
        } as Core.Static<T>
      },
      enumerable: false,
      configurable: false,
    },
  })

  return executor
}

export function isLazyExecutor(
  executor: Core.UExecutor
): executor is Core.Lazy<unknown> {
  return executor[executorSymbol] === "lazy";
}

export function isReactiveExecutor(
  executor: Core.UExecutor
): executor is Core.Reactive<unknown> {
  return executor[executorSymbol] === "reactive";
}

export function isStaticExecutor(
  executor: Core.UExecutor
): executor is Core.Static<unknown> {
  return executor[executorSymbol] === "static";
}

export function isMainExecutor(
  executor: unknown
): executor is Core.AnyExecutor {
  return isExecutor(executor) && executor[executorSymbol] === "main";
}

export function isExecutor<T>(input: unknown): input is Core.BaseExecutor<T> {
  return typeof input === "object" && input !== null && executorSymbol in input;
}

export function isPreset(input: unknown): input is Core.Preset<unknown> {
  return (
    typeof input === "object" &&
    input !== null &&
    executorSymbol in input &&
    (input as Core.Preset<unknown>)[executorSymbol] === "preset"
  );
}

/**
 * Creates executor without dependencies.
 * @param factory - Receives controller, returns value
 * @param tags - Optional metadata tags
 * @example provide((ctl) => new Database())
 */
export function provide<T>(
  factory: Core.NoDependencyFn<T>,
  ...tags: Tag.Tagged[]
): Core.Executor<T> {
  return createExecutor(factory, undefined, tags);
}

/**
 * Creates executor depending on other executors.
 * @param dependencies - Single executor, array, or record of executors
 * @param factory - Receives resolved deps + controller, returns value
 * @param tags - Optional metadata tags
 * @example derive([dbExecutor], ([db], ctl) => new UserRepo(db))
 */
export function derive<T, D extends Core.DependencyLike>(
  dependencies: { [K in keyof D]: D[K] },
  factory: Core.DependentFn<T, Core.InferOutput<D>>,
  ...tags: Tag.Tagged[]
): Core.Executor<T> {
  const wrappedFactory: Core.DependentFn<T, unknown> = (deps, ctl) =>
    factory(deps as Core.InferOutput<D>, ctl);

  const typedDependencies = dependencies as
    | Core.UExecutor
    | ReadonlyArray<Core.UExecutor>
    | Record<string, Core.UExecutor>;

  return createExecutor(wrappedFactory, typedDependencies, tags, factory);
}

/**
 * Override executor value in scope.
 * @param targetExecutor - Executor to override
 * @param overrideValue - Static value or executor providing value
 * @example preset(configExecutor, { port: 3000 })
 */
export function preset<T>(
  targetExecutor: Core.Executor<T> | Escapable<T>,
  overrideValue: T | Core.Executor<T>
): Core.Preset<T> {
  const executor = isExecutor(targetExecutor) ? targetExecutor : targetExecutor.escape();

  return {
    [executorSymbol]: "preset",
    value: overrideValue,
    executor,
  };
}


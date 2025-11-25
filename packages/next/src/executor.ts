import { Core, executorSymbol, analysisSymbol, type Escapable } from "./types";
import type { Tag } from "./tag";

function isExecutorLike(item: unknown): item is Core.UExecutor {
  return typeof item === "object" && item !== null && executorSymbol in item;
}

function extractDirectDependencies(
  dependencies:
    | undefined
    | Core.UExecutor
    | ReadonlyArray<Core.UExecutor>
    | Record<string, Core.UExecutor>
): Core.UExecutor[] {
  if (dependencies === undefined) {
    return [];
  }

  if (isExecutorLike(dependencies)) {
    return [dependencies];
  }

  if (Array.isArray(dependencies)) {
    return dependencies.filter(isExecutorLike);
  }

  if (typeof dependencies === "object") {
    return Object.values(dependencies).filter(isExecutorLike);
  }

  return [];
}

function computeDependencyShape(
  dependencies:
    | undefined
    | Core.UExecutor
    | ReadonlyArray<Core.UExecutor>
    | Record<string, Core.UExecutor>
): Core.DependencyShape {
  if (dependencies === undefined) {
    return "none";
  }

  if (isExecutorLike(dependencies)) {
    return "single";
  }

  if (Array.isArray(dependencies)) {
    return "array";
  }

  if (typeof dependencies === "object") {
    return "record";
  }

  return "none";
}

function computeMaxDepth(
  executor: Core.UExecutor,
  visited: Set<Core.UExecutor> = new Set(),
  currentDepth: number = 0
): number {
  if (visited.has(executor)) {
    return currentDepth;
  }

  visited.add(executor);

  const deps = executor.dependencies;
  if (!deps) {
    return currentDepth;
  }

  const directDeps = extractDirectDependencies(deps);
  if (directDeps.length === 0) {
    return currentDepth;
  }

  let maxChildDepth = currentDepth;
  for (const dep of directDeps) {
    const childDepth = computeMaxDepth(dep, visited, currentDepth + 1);
    if (childDepth > maxChildDepth) {
      maxChildDepth = childDepth;
    }
  }

  return maxChildDepth;
}

function detectCircularRisk(
  executor: Core.UExecutor,
  visited: Set<Core.UExecutor> = new Set()
): boolean {
  if (visited.has(executor)) {
    return true;
  }

  visited.add(executor);

  const deps = executor.dependencies;
  if (!deps) {
    visited.delete(executor);
    return false;
  }

  const directDeps = extractDirectDependencies(deps);
  for (const dep of directDeps) {
    if (detectCircularRisk(dep, visited)) {
      return true;
    }
  }

  visited.delete(executor);
  return false;
}

function computeOptimizedKeys(
  dependencies:
    | undefined
    | Core.UExecutor
    | ReadonlyArray<Core.UExecutor>
    | Record<string, Core.UExecutor>
): ReadonlyArray<string> | undefined {
  if (
    dependencies !== undefined &&
    typeof dependencies === "object" &&
    !Array.isArray(dependencies) &&
    !isExecutorLike(dependencies)
  ) {
    return Object.keys(dependencies);
  }
  return undefined;
}

function analyzeExecutor(
  executor: Core.UExecutor,
  dependencies:
    | undefined
    | Core.UExecutor
    | ReadonlyArray<Core.UExecutor>
    | Record<string, Core.UExecutor>
): Core.ExecutorAnalysis {
  const shape = computeDependencyShape(dependencies);
  const directDeps = extractDirectDependencies(dependencies);
  const maxDepth = computeMaxDepth(executor);
  const circularRisk = directDeps.length > 0 && detectCircularRisk(executor);
  const optimizedKeys = computeOptimizedKeys(dependencies);

  return {
    shape,
    dependencyCount: directDeps.length,
    directDependencies: directDeps,
    hasNestedDependencies: maxDepth > 1,
    maxDepth,
    circularRisk,
    optimizedKeys,
  };
}

export function createExecutor<T>(
  factory: Core.NoDependencyFn<T> | Core.DependentFn<T, unknown>,
  dependencies:
    | undefined
    | Core.UExecutor
    | ReadonlyArray<Core.UExecutor>
    | Record<string, Core.UExecutor>,
  tags: Tag.Tagged[] | undefined
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
    tags: tags,
  } as unknown as Core.Executor<T>;

  const analysis = analyzeExecutor(executor, dependencies);
  (executor as Core.UExecutor)[analysisSymbol] = analysis;

  const lazyExecutor = {
    [executorSymbol]: "lazy",
    dependencies: undefined,
    executor,
    factory: undefined,
    tags: tags,
  } satisfies Core.Lazy<T>;

  const reactiveExecutor = {
    [executorSymbol]: "reactive",
    executor,
    factory: undefined,
    dependencies: undefined,
    tags: tags,
  } satisfies Core.Reactive<T>;

  const staticExecutor = {
    [executorSymbol]: "static",
    dependencies: undefined,
    factory: undefined,
    tags: tags,
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
 * Gets the pre-computed static analysis for an executor.
 * Returns undefined if executor was not created via provide/derive.
 */
export function getAnalysis(executor: Core.UExecutor): Core.ExecutorAnalysis | undefined {
  return executor[analysisSymbol];
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

  return createExecutor(wrappedFactory, typedDependencies, tags);
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


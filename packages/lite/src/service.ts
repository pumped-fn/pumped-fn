import { atomSymbol, serviceSymbol } from "./symbols"
import type { Lite, MaybePromise } from "./types"

type AnyFunction = (...args: unknown[]) => unknown

function bindMethods<T extends Record<string, unknown>>(obj: T): T {
  const bound = {} as T
  for (const key of Object.keys(obj)) {
    const value = obj[key]
    if (typeof value === "function") {
      const fn = value as AnyFunction
      bound[key as keyof T] = fn.bind(obj) as T[keyof T]
    } else {
      bound[key as keyof T] = value as T[keyof T]
    }
  }
  return bound
}

export interface ServiceConfig<T, D extends Record<string, Lite.Dependency>> {
  deps?: D
  factory: Lite.ServiceFactory<T, D>
  tags?: Lite.Tagged<unknown>[]
}

/**
 * Creates a context-aware service that exposes multiple methods.
 * Each method receives ExecutionContext as its first parameter.
 *
 * @param config - Configuration object containing factory function, optional dependencies, and tags
 * @returns A Service instance that can be resolved to produce methods
 *
 * @example
 * ```typescript
 * const dbService = service({
 *   deps: { pool: poolAtom },
 *   factory: (ctx, { pool }) => ({
 *     query: (ctx, sql: string) => pool.query(sql),
 *     transaction: (ctx, fn) => pool.withTransaction(fn),
 *   })
 * })
 * ```
 */
export function service<T>(config: {
  deps?: undefined
  factory: (ctx: Lite.ResolveContext) => MaybePromise<T>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Service<T>

export function service<
  T,
  const D extends Record<string, Lite.Atom<unknown> | Lite.ControllerDep<unknown> | { mode: string }>,
>(config: {
  deps: D
  factory: (ctx: Lite.ResolveContext, deps: Lite.InferDeps<D>) => MaybePromise<T>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Service<T>

export function service<T, D extends Record<string, Lite.Dependency>>(
  config: ServiceConfig<T, D>
): Lite.Service<T> {
  const originalFactory = config.factory as (
    ctx: Lite.ResolveContext,
    deps?: Lite.InferDeps<D>
  ) => MaybePromise<T>

  const wrappedFactory = (
    ctx: Lite.ResolveContext,
    deps?: Lite.InferDeps<D>
  ): MaybePromise<T> => {
    const result = originalFactory(ctx, deps)
    if (result instanceof Promise) {
      return result.then((resolved) => {
        if (typeof resolved === "object" && resolved !== null) {
          return bindMethods(resolved as Record<string, unknown>) as T
        }
        return resolved
      })
    }
    if (typeof result === "object" && result !== null) {
      return bindMethods(result as Record<string, unknown>) as T
    }
    return result
  }

  return {
    [atomSymbol]: true,
    [serviceSymbol]: true,
    factory: wrappedFactory as unknown as Lite.ServiceFactory<T, Record<string, Lite.Dependency>>,
    deps: config.deps as unknown as Record<string, Lite.Dependency> | undefined,
    tags: config.tags,
  }
}

/**
 * Type guard to check if a value is a Service.
 *
 * @param value - The value to check
 * @returns True if the value is a Service, false otherwise
 *
 * @example
 * ```typescript
 * if (isService(value)) {
 *   const methods = await scope.resolve(value)
 * }
 * ```
 */
export function isService(value: unknown): value is Lite.Service<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[serviceSymbol] === true
  )
}

import { atomSymbol, serviceSymbol } from "./symbols"
import type { Lite, MaybePromise } from "./types"

type AnyFunction = (...args: unknown[]) => unknown
type PropertyKey = string | symbol

function bindMethods<T extends Record<PropertyKey, unknown>>(obj: T): T {
  const bound = Object.create(Object.getPrototypeOf(obj)) as T
  const keys: PropertyKey[] = [
    ...Object.getOwnPropertyNames(obj),
    ...Object.getOwnPropertySymbols(obj),
  ]

  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(obj, key)
    if (!descriptor) continue

    if (descriptor.get || descriptor.set) {
      Object.defineProperty(bound, key, descriptor)
    } else if (typeof descriptor.value === "function") {
      const fn = descriptor.value as AnyFunction
      Object.defineProperty(bound, key, {
        ...descriptor,
        value: fn.bind(obj),
      })
    } else {
      Object.defineProperty(bound, key, descriptor)
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
  const D extends Record<string, Lite.Atom<unknown> | Lite.ControllerDep<unknown> | Lite.TagExecutor<unknown>>,
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

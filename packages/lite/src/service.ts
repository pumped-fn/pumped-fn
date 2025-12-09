import { atomSymbol, serviceSymbol } from "./symbols"
import type { Lite, MaybePromise } from "./types"

export interface ServiceConfig<T extends Lite.ServiceMethods, D extends Record<string, Lite.Dependency>> {
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
export function service<T extends Lite.ServiceMethods>(config: {
  deps?: undefined
  factory: (ctx: Lite.ResolveContext) => MaybePromise<T>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Service<T>

export function service<
  T extends Lite.ServiceMethods,
  const D extends Record<string, Lite.Atom<unknown> | Lite.ControllerDep<unknown> | Lite.TagExecutor<unknown>>,
>(config: {
  deps: D
  factory: (ctx: Lite.ResolveContext, deps: Lite.InferDeps<D>) => MaybePromise<T>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Service<T>

export function service<T extends Lite.ServiceMethods, D extends Record<string, Lite.Dependency>>(
  config: ServiceConfig<T, D>
): Lite.Service<T> {
  return {
    [atomSymbol]: true,
    [serviceSymbol]: true,
    factory: config.factory as unknown as Lite.ServiceFactory<T, Record<string, Lite.Dependency>>,
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
export function isService(value: unknown): value is Lite.Service<Lite.ServiceMethods> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[serviceSymbol] === true
  )
}

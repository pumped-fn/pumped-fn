import { resourceSymbol, type Lite, type MaybePromise } from "./types"
import { addUses } from "./use"

/**
 * Creates an execution-scoped dependency that is resolved per execution chain.
 * Fresh instance on first encounter, seek-up on nested execs within the same chain.
 *
 * @param config - Configuration object containing factory function and optional dependencies
 * @returns A Resource instance that can be declared as a dependency in flows and other resources
 *
 * @example
 * ```typescript
 * const requestLogger = resource({
 *   deps: { logService: logServiceAtom },
 *   factory: (ctx, { logService }) => {
 *     const logger = logService.child({ requestId: ctx.data.get("requestId") })
 *     ctx.cleanup(() => logger.flush())
 *     return logger
 *   }
 * })
 * ```
 */
export function resource<
  const U extends readonly Lite.Use<any, any>[],
  T extends Lite.UseOutput<U>,
>(config: {
  name?: string
  tags?: Lite.Tagged<any>[]
  deps?: undefined
  use: U
  factory: (ctx: Lite.WithUseExt<Lite.ResourceContext, U>) => MaybePromise<T>
}): Lite.Resource<T>

export function resource<
  const U extends readonly Lite.Use<any, any>[],
  T extends Lite.UseOutput<U>,
  const D extends Record<string, Lite.ResourceDependency>,
>(config: {
  name?: string
  tags?: Lite.Tagged<any>[]
  deps: D
  use: U
  factory: (ctx: Lite.WithUseExt<Lite.ResourceContext, U>, deps: Lite.InferDeps<D>) => MaybePromise<T>
}): Lite.Resource<T>

export function resource<T>(config: {
  name?: string
  tags?: Lite.Tagged<any>[]
  deps?: undefined
  factory: (ctx: Lite.ResourceContext) => MaybePromise<T>
}): Lite.Resource<T>

export function resource<
  T,
  const D extends Record<string, Lite.ResourceDependency>,
>(config: {
  name?: string
  tags?: Lite.Tagged<any>[]
  deps: D
  factory: (ctx: Lite.ResourceContext, deps: Lite.InferDeps<D>) => MaybePromise<T>
}): Lite.Resource<T>

export function resource(config: any): Lite.Resource<any> {
  const tags = addUses(config.tags, config.use)
  return Object.freeze({
    [resourceSymbol]: true,
    name: config.name,
    tags,
    deps: config.deps as unknown as Record<string, Lite.Dependency> | undefined,
    factory: config.factory as unknown as Lite.ResourceFactory<any, Record<string, Lite.Dependency>>,
  }) as Lite.Resource<any>
}

/**
 * Type guard to check if a value is a Resource.
 *
 * @param value - The value to check
 * @returns True if the value is a Resource, false otherwise
 *
 * @example
 * ```typescript
 * if (isResource(value)) {
 *   // value is Lite.Resource<unknown>
 * }
 * ```
 */
export function isResource(value: unknown): value is Lite.Resource<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[resourceSymbol] === true
  )
}

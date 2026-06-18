import { resourceSymbol, type Lite, type MaybePromise } from "./types"

/**
 * Creates an execution-context-owned dependency.
 * Boundary-owned resources create on the nearest execution boundary. Current-owned resources
 * create on the current execution boundary while `ctx.exec()` children can reuse them.
 *
 * @param config - Configuration object containing factory function and optional dependencies
 * @returns A Resource instance that can be declared as a dependency in flows and other resources
 *
 * @example
 * ```typescript
 * const requestId = tag<string>({ label: "request.id" })
 *
 * const requestLogger = resource({
 *   deps: { logService },
 *   factory: (ctx, { logService }) => {
 *     const logger = logService.child({ requestId: ctx.data.seekTag(requestId) })
 *     ctx.cleanup(() => logger.flush())
 *     return logger
 *   }
 * })
 * ```
 */
export function resource<T>(config: {
  name?: string
  tags?: Lite.Tagged<any>[]
  ownership?: Lite.ResourceOwnership
  deps?: undefined
  factory: (ctx: Lite.ResourceContext) => MaybePromise<T>
}): Lite.Resource<T>

export function resource<
  T,
  const D extends Record<string, Lite.ResourceDependency>,
>(config: {
  name?: string
  tags?: Lite.Tagged<any>[]
  ownership?: Lite.ResourceOwnership
  deps: D
  factory: (ctx: Lite.ResourceContext, deps: Lite.InferDeps<D>) => MaybePromise<T>
}): Lite.Resource<T>

export function resource(config: any): Lite.Resource<any> {
  return Object.freeze({
    [resourceSymbol]: true,
    name: config.name,
    tags: config.tags,
    ownership: config.ownership,
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

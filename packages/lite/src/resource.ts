import { resourceSymbol } from "./symbols"
import type { Lite, MaybePromise } from "./types"

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
 *     ctx.onClose(() => logger.flush())
 *     return logger
 *   }
 * })
 * ```
 */
export function resource<T>(config: {
  name?: string
  deps?: undefined
  factory: (ctx: Lite.ExecutionContext) => MaybePromise<T>
}): Lite.Resource<T>

export function resource<
  T,
  const D extends Record<string, Lite.Atom<unknown> | Lite.ControllerDep<unknown> | Lite.Resource<unknown, Record<string, Lite.Dependency>> | { mode: string }>,
>(config: {
  name?: string
  deps: D
  factory: (ctx: Lite.ExecutionContext, deps: Lite.InferDeps<D>) => MaybePromise<T>
}): Lite.Resource<T>

export function resource<T, D extends Record<string, Lite.Dependency>>(
  config: {
    name?: string
    deps?: D
    factory: Lite.ResourceFactory<T, D>
  }
): Lite.Resource<T> {
  return Object.freeze({
    [resourceSymbol]: true,
    name: config.name,
    deps: config.deps as unknown as Record<string, Lite.Dependency> | undefined,
    factory: config.factory as unknown as Lite.ResourceFactory<T, Record<string, Lite.Dependency>>,
  }) as Lite.Resource<T>
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

import { atomSymbol } from "./symbols"
import type { Lite, MaybePromise } from "./types"

/**
 * Creates a service - a narrowed Atom returning methods for ctx.exec().
 * Resolution is identical to atom(). The constraint ensures methods
 * match the (ctx: ExecutionContext, ...args) => result signature.
 */
export function service<T extends Lite.ServiceMethods>(config: {
  deps?: undefined
  factory: (ctx: Lite.ResolveContext) => MaybePromise<T>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Atom<T>

export function service<
  T extends Lite.ServiceMethods,
  const D extends Record<string, Lite.Atom<unknown> | Lite.ControllerDep<unknown> | Lite.TagExecutor<unknown>>,
>(config: {
  deps: D
  factory: (ctx: Lite.ResolveContext, deps: Lite.InferDeps<D>) => MaybePromise<T>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Atom<T>

export function service<T extends Lite.ServiceMethods, D extends Record<string, Lite.Dependency>>(config: {
  deps?: D
  factory: Lite.AtomFactory<T, D>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Atom<T> {
  return {
    [atomSymbol]: true,
    factory: config.factory as Lite.AtomFactory<T, Record<string, Lite.Dependency>>,
    deps: config.deps as Record<string, Lite.Dependency> | undefined,
    tags: config.tags,
  }
}

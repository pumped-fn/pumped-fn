import { atomSymbol, lazySymbol } from "./symbols"
import type { Lite, MaybePromise } from "./types"

export interface AtomConfig<T, D extends Record<string, Lite.Dependency>> {
  deps?: D
  factory: Lite.AtomFactory<T, D>
  tags?: Lite.Tagged<unknown>[]
}

export function atom<T>(config: {
  deps?: undefined
  factory: (ctx: Lite.ResolveContext) => MaybePromise<T>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Atom<T>

export function atom<
  T,
  const D extends Record<string, Lite.Atom<unknown> | Lite.Lazy<unknown> | { mode: string }>,
>(config: {
  deps: D
  factory: (ctx: Lite.ResolveContext, deps: Lite.InferDeps<D>) => MaybePromise<T>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Atom<T>

export function atom<T, D extends Record<string, Lite.Dependency>>(
  config: AtomConfig<T, D>
): Lite.Atom<T> {
  return {
    [atomSymbol]: true,
    factory: config.factory as Lite.AtomFactory<T, Record<string, Lite.Dependency>>,
    deps: config.deps as Record<string, Lite.Dependency> | undefined,
    tags: config.tags,
  }
}

export function isAtom(value: unknown): value is Lite.Atom<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[atomSymbol] === true
  )
}

export function lazy<T>(atom: Lite.Atom<T>): Lite.Lazy<T> {
  return {
    [lazySymbol]: true,
    atom,
  }
}

export function isLazy(value: unknown): value is Lite.Lazy<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[lazySymbol] === true
  )
}

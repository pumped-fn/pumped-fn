import { atomSymbol, lazySymbol } from "./symbols"
import type { Lite, MaybePromise } from "./types"

export interface AtomConfig<T, D extends Record<string, Lite.Dependency>> {
  deps?: D
  factory: Lite.AtomFactory<T, D>
  tags?: Lite.Tagged<unknown>[]
}

/**
 * Creates a long-lived dependency that can be resolved and reused within a scope.
 *
 * @param config - Configuration object containing factory function, optional dependencies, and tags
 * @returns An Atom instance that can be resolved to produce a value of type T
 *
 * @example
 * ```typescript
 * const dbAtom = atom({
 *   factory: async (ctx) => createDatabase()
 * })
 * ```
 */
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
    factory: config.factory as unknown as Lite.AtomFactory<T, Record<string, Lite.Dependency>>,
    deps: config.deps as unknown as Record<string, Lite.Dependency> | undefined,
    tags: config.tags,
  }
}

/**
 * Type guard to check if a value is an Atom.
 *
 * @param value - The value to check
 * @returns True if the value is an Atom, false otherwise
 *
 * @example
 * ```typescript
 * if (isAtom(value)) {
 *   await scope.resolve(value)
 * }
 * ```
 */
export function isAtom(value: unknown): value is Lite.Atom<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[atomSymbol] === true
  )
}

/**
 * Wraps an Atom for deferred resolution, providing an accessor instead of the resolved value.
 *
 * @param atom - The Atom to wrap
 * @returns A Lazy wrapper that resolves to an Accessor for the Atom
 *
 * @example
 * ```typescript
 * const lazyDb = lazy(dbAtom)
 * const myAtom = atom({
 *   deps: { db: lazyDb },
 *   factory: (ctx, { db }) => db.get()
 * })
 * ```
 */
export function lazy<T>(atom: Lite.Atom<T>): Lite.Lazy<T> {
  return {
    [lazySymbol]: true,
    atom,
  }
}

/**
 * Type guard to check if a value is a Lazy wrapper.
 *
 * @param value - The value to check
 * @returns True if the value is a Lazy wrapper, false otherwise
 *
 * @example
 * ```typescript
 * if (isLazy(dep)) {
 *   const accessor = await scope.resolveDeps({ dep })
 * }
 * ```
 */
export function isLazy(value: unknown): value is Lite.Lazy<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[lazySymbol] === true
  )
}

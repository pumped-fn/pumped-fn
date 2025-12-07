import { atomSymbol, controllerDepSymbol } from "./symbols"
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
  const D extends Record<string, Lite.Atom<unknown> | Lite.ControllerDep<unknown> | { mode: string }>,
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
 * Wraps an Atom to receive a Controller instead of the resolved value.
 * The Controller provides full lifecycle control: get, resolve, release, invalidate, and subscribe.
 *
 * @param atom - The Atom to wrap
 * @param options - Optional configuration for the controller dependency
 * @param options.resolve - If true, the atom will be auto-resolved before the factory receives the controller
 * @returns A ControllerDep that resolves to a Controller for the Atom
 *
 * @example
 * ```typescript
 * const configAtom = atom({ factory: () => fetchConfig() })
 *
 * // Lazy controller - manual resolution required
 * const lazyAtom = atom({
 *   deps: { config: controller(configAtom) },
 *   factory: async (ctx, { config }) => {
 *     await config.resolve()
 *     return createServer(config.get().port)
 *   }
 * })
 *
 * // Resolved controller - ready to use immediately
 * const readyAtom = atom({
 *   deps: { config: controller(configAtom, { resolve: true }) },
 *   factory: (ctx, { config }) => {
 *     return createServer(config.get().port)
 *   }
 * })
 * ```
 */
export function controller<T>(
  atom: Lite.Atom<T>,
  options?: Lite.ControllerDepOptions
): Lite.ControllerDep<T> {
  return {
    [controllerDepSymbol]: true,
    atom,
    options,
  }
}

/**
 * Type guard to check if a value is a ControllerDep wrapper.
 *
 * @param value - The value to check
 * @returns True if the value is a ControllerDep wrapper, false otherwise
 *
 * @example
 * ```typescript
 * if (isControllerDep(dep)) {
 *   const ctrl = scope.controller(dep.atom)
 * }
 * ```
 */
export function isControllerDep(value: unknown): value is Lite.ControllerDep<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[controllerDepSymbol] === true
  )
}

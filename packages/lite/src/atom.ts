import { atomSymbol, controllerDepSymbol, resourceSymbol, type Lite, type MaybePromise } from "./types"
import { registerAtomToTags } from "./tag"
import { warmDepsGraph } from "./deps-graph"

export interface AtomConfig<T, D extends Record<string, Lite.Dependency>> {
  deps?: D
  factory: Lite.AtomFactory<T, D>
  tags?: Lite.Tagged<any>[]
  keepAlive?: boolean
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
  tags?: Lite.Tagged<any>[]
  keepAlive?: boolean
}): Lite.Atom<T>

export function atom<
  T,
  const D extends Record<string, Lite.AtomDependency>,
>(config: {
  deps: D
  factory: (ctx: Lite.ResolveContext, deps: Lite.InferDeps<D>) => MaybePromise<T>
  tags?: Lite.Tagged<any>[]
  keepAlive?: boolean
}): Lite.Atom<T>

export function atom<T, D extends Record<string, Lite.Dependency>>(
  config: any
): Lite.Atom<any> {
  const atomInstance: Lite.Atom<any> = {
    [atomSymbol]: true,
    factory: config.factory as unknown as Lite.AtomFactory<any, Record<string, Lite.Dependency>>,
    deps: config.deps as unknown as Record<string, Lite.Dependency> | undefined,
    tags: config.tags,
    keepAlive: config.keepAlive,
  }

  if (config.tags?.length) {
    registerAtomToTags(atomInstance, config.tags)
  }

  if (config.deps) warmDepsGraph(config.deps as Record<string, Lite.Dependency>)

  return atomInstance
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
 * Wraps an Atom or Resource to receive a controller instead of the resolved value.
 * Atom controllers provide value mutation and invalidation. Resource controllers
 * provide execution-scoped observation plus resolve/release only.
 *
 * @param atom - The Atom or Resource to wrap
 * @param options - Optional configuration:
 *   - `resolve: true` — auto-resolves the dep before the parent factory runs; `config.get()` is safe.
 *   - `watch: true` — requires `resolve: true`; atom deps re-run the parent atom factory when
 *     the dep resolves to a new value. Resource deps release the dependent resource on value
 *     change and re-resolve lazily on the next access. Flow deps do not support watch.
 *   - `eq` — custom equality function `(a: T, b: T) => boolean`; only used with `watch: true`.
 * @returns A ControllerDep that resolves to a Controller for the Atom or Resource
 *
 * @example
 * ```typescript
 * // resolve only
 * const serverAtom = atom({
 *   deps: { config: controller(configAtom, { resolve: true }) },
 *   factory: (_, { config }) => createServer(config.get().port),
 * })
 *
 * // watch: re-runs parent when dep value changes
 * const profileAtom = atom({
 *   deps: { token: controller(tokenAtom, { resolve: true, watch: true }) },
 *   factory: (_, { token }) => ({ id: `user-${token.get().jwt}` }),
 * })
 *
 * // watch with custom equality
 * const derivedAtom = atom({
 *   deps: { src: controller(srcAtom, { resolve: true, watch: true, eq: (a, b) => a.id === b.id }) },
 *   factory: (_, { src }) => src.get().name,
 * })
 * ```
 */
export function controller<T>(
  atom: Lite.Atom<T>
): Lite.NonWatchControllerDep<T>

export function controller<T>(
  atom: Lite.Atom<T>,
  options: { resolve: true; watch: true; eq: (a: T, b: T) => boolean }
): Lite.WatchControllerDep<T>

export function controller<T>(
  atom: Lite.Atom<T>,
  options: { resolve: true; watch: true; eq?: never }
): Lite.WatchControllerDep<T>

export function controller<T>(
  atom: Lite.Atom<T>,
  options: { resolve: true; watch?: never; eq?: never }
): Lite.NonWatchControllerDep<T>

export function controller<T>(
  atom: Lite.Atom<T>,
  options: { resolve?: never; watch?: never; eq?: never }
): Lite.NonWatchControllerDep<T>

export function controller<T>(
  resource: Lite.Resource<T>
): Lite.NonWatchResourceControllerDep<T>

export function controller<T>(
  resource: Lite.Resource<T>,
  options: { resolve: true; watch?: never; eq?: never }
): Lite.NonWatchResourceControllerDep<T>

export function controller<T>(
  resource: Lite.Resource<T>,
  options: { resolve: true; watch: true; eq: (a: T, b: T) => boolean }
): Lite.WatchResourceControllerDep<T>

export function controller<T>(
  resource: Lite.Resource<T>,
  options: { resolve: true; watch: true; eq?: never }
): Lite.WatchResourceControllerDep<T>

export function controller<T>(
  resource: Lite.Resource<T>,
  options: { resolve?: never; watch?: never; eq?: never }
): Lite.NonWatchResourceControllerDep<T>

export function controller<T>(
  target: Lite.Atom<T> | Lite.Resource<T>,
  options?: Lite.ControllerDepOptions<T> | Lite.ResourceControllerDepOptions
): Lite.ControllerDep<T> {
  if ((target as unknown as Record<symbol, unknown>)[resourceSymbol] === true) {
    return {
      [controllerDepSymbol]: true,
      resource: target as Lite.Resource<T>,
      resolve: options?.resolve,
      watch: (options as Lite.ResourceControllerDepOptions | undefined)?.watch,
      eq: (options as Lite.ResourceControllerDepOptions | undefined)?.eq,
    }
  }

  return {
    [controllerDepSymbol]: true,
    atom: target as Lite.Atom<T>,
    resolve: (options as Lite.ControllerDepOptions<T> | undefined)?.resolve,
    watch: (options as Lite.ControllerDepOptions<T> | undefined)?.watch,
    eq: (options as Lite.ControllerDepOptions<T> | undefined)?.eq,
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

/** Creates an atom with methods constrained to (ctx: ExecutionContext, ...args) => result. */
export function service<T extends Lite.ServiceMethods>(config: {
  deps?: undefined
  factory: (ctx: Lite.ResolveContext) => MaybePromise<T>
  tags?: Lite.Tagged<any>[]
}): Lite.Atom<T>

export function service<
  T extends Lite.ServiceMethods,
  const D extends Record<string, Lite.Atom<unknown> | Lite.ControllerDep<unknown> | Lite.TagExecutor<any>>,
>(config: {
  deps: D
  factory: (ctx: Lite.ResolveContext, deps: Lite.InferDeps<D>) => MaybePromise<T>
  tags?: Lite.Tagged<any>[]
}): Lite.Atom<T>

export function service(config: any): Lite.Atom<any> {
  const atomInstance: Lite.Atom<any> = {
    [atomSymbol]: true,
    factory: config.factory as unknown as Lite.AtomFactory<any, Record<string, Lite.Dependency>>,
    deps: config.deps as unknown as Record<string, Lite.Dependency> | undefined,
    tags: config.tags,
  }

  if (config.tags?.length) {
    registerAtomToTags(atomInstance, config.tags)
  }

  return atomInstance
}

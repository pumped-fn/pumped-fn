export const atomSymbol: unique symbol = Symbol.for("@pumped-fn/lite/atom")
export const flowSymbol: unique symbol = Symbol.for("@pumped-fn/lite/flow")
export const tagSymbol: unique symbol = Symbol.for("@pumped-fn/lite/tag")
export const taggedSymbol: unique symbol = Symbol.for("@pumped-fn/lite/tagged")
export const controllerDepSymbol: unique symbol = Symbol.for("@pumped-fn/lite/controller-dep")
export const presetSymbol: unique symbol = Symbol.for("@pumped-fn/lite/preset")
export const controllerSymbol: unique symbol = Symbol.for("@pumped-fn/lite/controller")
export const tagExecutorSymbol: unique symbol = Symbol.for("@pumped-fn/lite/tag-executor")
export const typedSymbol: unique symbol = Symbol.for("@pumped-fn/lite/typed")
export const resourceSymbol: unique symbol = Symbol.for("@pumped-fn/lite/resource")

export class ParseError extends Error {
  override readonly name = "ParseError"

  constructor(
    message: string,
    readonly phase: "tag" | "flow-input",
    readonly label: string,
    override readonly cause: unknown
  ) {
    super(message)
  }
}

export type MaybePromise<T> = T | Promise<T>

export type AtomState = 'idle' | 'resolving' | 'resolved' | 'failed'

export namespace Lite {
  export interface Scope {
    readonly ready: Promise<void>
    resolve<T>(atom: Atom<T>): Promise<T>
    controller<T>(atom: Atom<T>): Controller<T>
    controller<T>(atom: Atom<T>, options: { resolve: true }): Promise<Controller<T>>
    controller<T>(atom: Atom<T>, options?: ControllerOptions): Controller<T> | Promise<Controller<T>>
    release<T>(atom: Atom<T>): Promise<void>
    dispose(): Promise<void>
    flush(): Promise<void>
    createContext(options?: CreateContextOptions): ExecutionContext
    on(event: AtomState, atom: Atom<unknown>, listener: () => void): () => void
    select<T, S>(
      atom: Atom<T>,
      selector: (value: T) => S,
      options?: SelectOptions<S>
    ): SelectHandle<S>
  }

  export interface CreateContextOptions {
    tags?: Tagged<any>[]
  }

  export interface ScopeOptions {
    extensions?: Extension[]
    tags?: Tagged<any>[]
    presets?: Preset<any, any>[]
    gc?: GCOptions
  }

  export interface GCOptions {
    /** Enable automatic garbage collection. Default: true */
    enabled?: boolean
    /** Grace period before releasing (ms). Default: 3000 */
    graceMs?: number
  }

  export interface Atom<T> {
    readonly [atomSymbol]: true
    readonly factory: AtomFactory<T, Record<string, Dependency>>
    readonly deps?: Record<string, Dependency>
    readonly tags?: Tagged<any>[]
    readonly keepAlive?: boolean
  }

  export interface Flow<TOutput, TInput = unknown> {
    readonly [flowSymbol]: true
    readonly name?: string
    readonly parse?: (raw: unknown) => MaybePromise<TInput>
    readonly factory: FlowFactory<TOutput, TInput, Record<string, Dependency>>
    readonly deps?: Record<string, Dependency>
    readonly tags?: Tagged<any>[]
  }

  export interface Resource<T, D extends Record<string, Dependency> = Record<string, Dependency>> {
    readonly [resourceSymbol]: true
    readonly name?: string
    readonly deps?: D
    readonly tags?: Tagged<any>[]
    readonly factory: ResourceFactory<T, D>
  }

  /**
   * Unified context data storage with both raw Map operations and Tag-based DX.
   */
  export interface ContextData {
    /** Get value by key */
    get(key: string | symbol): unknown
    /** Set value by key */
    set(key: string | symbol, value: unknown): void
    /** Check if key exists */
    has(key: string | symbol): boolean
    /** Delete value by key, returns true if existed */
    delete(key: string | symbol): boolean
    /** Remove all stored values */
    clear(): void
    /**
     * Look up value by key, traversing parent chain if not found locally.
     * Returns first match or undefined.
     */
    seek(key: string | symbol): unknown
    /**
     * Look up tag value, traversing parent chain if not found locally.
     * Returns first match or undefined (ignores tag defaults).
     */
    seekTag<T>(tag: Tag<T, boolean>): T | undefined
    /**
     * Check if key exists locally or in parent chain.
     */
    seekHas(key: string | symbol): boolean

    /** Get value by tag, returns undefined if not stored */
    getTag<T>(tag: Tag<T, boolean>): T | undefined
    /** Set value by tag */
    setTag<T>(tag: Tag<T, boolean>, value: T): void
    /** Check if tag has stored value */
    hasTag<T, H extends boolean>(tag: Tag<T, H>): boolean
    /** Delete value by tag, returns true if existed */
    deleteTag<T, H extends boolean>(tag: Tag<T, H>): boolean
    /**
     * Get existing value or initialize with tag's default.
     * Stores and returns the value.
     */
    getOrSetTag<T>(tag: Tag<T, true>): T
    /**
     * Get existing value or initialize with provided value.
     * Stores and returns the value.
     */
    getOrSetTag<T>(tag: Tag<T, true>, value: T): T
    /**
     * Get existing value or initialize with provided value.
     * Required for tags without defaults.
     */
    getOrSetTag<T>(tag: Tag<T, false>, value: T): T
  }

  export interface ResolveContext {
    cleanup(fn: () => MaybePromise<void>): void
    invalidate(): void
    readonly scope: Scope
    readonly data: ContextData
  }

  export type CloseResult = { ok: true } | { ok: false; error: unknown }

  export interface ExecutionContext {
    readonly input: unknown
    readonly name: string | undefined
    readonly scope: Scope
    readonly parent: ExecutionContext | undefined
    readonly data: ContextData
    resolve<T>(target: Atom<T>): Promise<T>
    resolve<T>(target: Resource<T>): Promise<T>
    release<T>(resource: Resource<T>): Promise<void>
    controller<T>(resource: Resource<T>): ResourceController<T>
    exec<Output, Input>(options: ExecFlowOptions<Output, Input>): Promise<Output>
    exec<Output, Args extends unknown[]>(options: ExecFnOptions<Output, Args>): Promise<Output>
    onClose(fn: (result: CloseResult) => MaybePromise<void>): () => void
    close(result?: CloseResult): Promise<void>
  }

  export interface ResourceContext extends ExecutionContext {
    cleanup(fn: () => MaybePromise<void>): void
  }

  export type ExecFlowOptions<Output, Input> = {
    flow: Flow<Output, Input>
    name?: string
    tags?: Tagged<any>[]
  } & (
    | ([NoInfer<Input>] extends [void | undefined | null]
        ? { input?: undefined | null; rawInput?: never }
        : { input: NoInfer<Input>; rawInput?: never })
    | { rawInput: unknown; input?: never }
  )

  export interface ExecFnOptions<Output, Args extends unknown[] = unknown[]> {
    fn: (ctx: ExecutionContext, ...args: Args) => MaybePromise<Output>
    params: Args
    name?: string
    tags?: Tagged<any>[]
  }

  export type ControllerEvent = 'resolving' | 'resolved' | '*'
  export type ResourceControllerEvent = AtomState | '*'

  /**
   * Reactive handle for observing and controlling atom state.
   */
  export interface Controller<T> {
    readonly [controllerSymbol]: true
    /** Current lifecycle state */
    readonly state: AtomState
    /**
     * Get current value synchronously.
     * @throws If atom is idle or failed
     * @returns Current value (stale value during resolving)
     */
    get(): T
    /** Trigger resolution if not already resolved */
    resolve(): Promise<T>
    /** Run cleanups and remove from cache */
    release(): Promise<void>
    /** Schedule re-resolution (runs factory) */
    invalidate(): void
    /**
     * Replace value directly without running factory.
     * Runs cleanups, transitions resolving→resolved, notifies listeners.
     * @throws If atom is idle or failed
     */
    set(value: T): void
    /**
     * Transform value using function without running factory.
     * Equivalent to `set(fn(get()))` but queued atomically.
     * Runs cleanups, transitions resolving→resolved, notifies listeners.
     * @throws If atom is idle or failed
     */
    update(fn: (prev: T) => T): void
    /** Subscribe to state changes */
    on(event: ControllerEvent, listener: () => void): () => void
  }

  /**
   * Execution-context handle for observing and controlling a resource.
   */
  export interface ResourceController<T> {
    /** Current lifecycle state visible from this execution context */
    readonly state: AtomState
    /**
     * Get current value synchronously.
     * @throws If resource is idle, resolving without a value, or failed
     */
    get(): T
    /** Trigger resolution if not already resolved */
    resolve(): Promise<T>
    /** Owner-local release/reset */
    release(): Promise<void>
    /** Subscribe to resource state changes visible from this execution context */
    on(event: ResourceControllerEvent, listener: () => void): () => void
  }

  export interface SelectOptions<S> {
    eq?: (prev: S, next: S) => boolean
  }

  export interface SelectHandle<S> {
    get(): S
    subscribe(listener: () => void): () => void
    dispose(): void
  }

  export interface Tag<T, HasDefault extends boolean = false> {
    readonly [tagSymbol]: true
    readonly key: symbol
    readonly label: string
    readonly defaultValue: HasDefault extends true ? T : undefined
    readonly hasDefault: HasDefault
    readonly parse?: (raw: unknown) => T
    (value: T): Tagged<T>
    get(source: TagSource): T
    find(source: TagSource): HasDefault extends true ? T : T | undefined
    collect(source: TagSource): T[]
    atoms(): Atom<unknown>[]
  }

  export interface Tagged<T> {
    readonly [taggedSymbol]: true
    readonly key: symbol
    readonly value: T
    readonly tag: Tag<T, boolean>
  }

  export type TagSource = Tagged<any>[] | { tags?: Tagged<any>[] }

  export interface TagExecutor<TOutput, TTag = TOutput> {
    readonly [tagExecutorSymbol]: true
    readonly tag: Tag<TTag, boolean>
    readonly mode: "required" | "optional" | "all"
  }

  export interface AtomControllerDep<T> {
    readonly [controllerDepSymbol]: true
    readonly atom: Atom<T>
    readonly resource?: undefined
    readonly resolve?: boolean
    readonly watch?: boolean
    readonly eq?: (a: any, b: any) => boolean
  }

  export interface ResourceControllerDep<T> {
    readonly [controllerDepSymbol]: true
    readonly atom?: undefined
    readonly resource: Resource<T>
    readonly resolve?: boolean
    readonly watch?: boolean
    readonly eq?: (a: any, b: any) => boolean
  }

  export type ControllerDep<T> = AtomControllerDep<T> | ResourceControllerDep<T>

  export type WatchControllerDep<T> = AtomControllerDep<T> & {
    readonly resolve: true
    readonly watch: true
  }

  export type NonWatchControllerDep<T> = AtomControllerDep<T> & {
    readonly watch?: never
    readonly eq?: never
  }

  export type NonWatchResourceControllerDep<T> = ResourceControllerDep<T> & {
    readonly watch?: never
    readonly eq?: never
  }

  export type WatchResourceControllerDep<T> = ResourceControllerDep<T> & {
    readonly resolve: true
    readonly watch: true
  }

  export interface ControllerOptions {
    resolve?: boolean
  }

  export type ControllerDepOptions<T> =
    | { resolve: true; watch: true; eq: (a: T, b: T) => boolean }
    | { resolve: true; watch: true; eq?: never }
    | { resolve: true; watch?: never; eq?: never }
    | { resolve?: never; watch?: never; eq?: never }

  export type ResourceControllerDepOptions =
    | { resolve: true; watch: true; eq: (a: any, b: any) => boolean }
    | { resolve: true; watch: true; eq?: never }
    | { resolve: true; watch?: never; eq?: never }
    | { resolve?: never; watch?: never; eq?: never }

  export interface Typed<T> {
    readonly [typedSymbol]: true
  }

  export type PresetTarget<T, I = unknown> = Atom<T> | Flow<T, I> | Resource<T>

  export type PresetValue<T, I = unknown> =
    | T
    | Atom<T>
    | Flow<T, I>
    | Resource<T>
    | ((ctx: ExecutionContext & { readonly input: I }) => MaybePromise<T>)
    | ((ctx: ResourceContext) => MaybePromise<T>)

  export interface Preset<T, I = unknown> {
    readonly [presetSymbol]: true
    readonly target: PresetTarget<T, I>
    readonly value: PresetValue<T, I>
  }

  /**
   * Discriminated context for `wrapResolve`.
   *
   * - `"atom"` — scope-level singleton. Cached after first resolve.
   * - `"resource"` — execution-level. Fresh factory per first encounter,
   *   seek-up on nested execs within the same chain.
   */
  export type ResolveEvent =
    | {
        readonly kind: "atom"
        readonly target: Atom<unknown>
        readonly scope: Scope
      }
    | {
        readonly kind: "resource"
        readonly target: Resource<unknown>
        readonly ctx: ExecutionContext
      }

  export interface Extension {
    readonly name: string
    init?(scope: Scope): MaybePromise<void>
    /**
     * Wraps dependency resolution. Dispatch by `event.kind`:
     *
     * - `"atom"` — `event.scope`, `event.target: Atom`. Cached in scope.
     * - `"resource"` — `event.ctx`, `event.target: Resource`. Seek-up in
     *   execution hierarchy, factory(ctx, deps) on miss.
     */
    wrapResolve?(
      next: () => Promise<unknown>,
      event: ResolveEvent
    ): Promise<unknown>
    wrapExec?(
      next: () => Promise<unknown>,
      target: ExecTarget,
      ctx: ExecutionContext
    ): Promise<unknown>
    dispose?(scope: Scope): MaybePromise<void>
  }

  export type JsonValue =
    | string
    | number
    | boolean
    | null
    | readonly JsonValue[]
    | { readonly [key: string]: JsonValue }

  export type FlowExtensionArgs<Config> = [Config] extends [void]
    ? []
    : [config: Config]

  export interface FlowExtensionEvent {
    readonly target: Flow<unknown, unknown>
    readonly ctx: ExecutionContext
  }

  export interface FlowExtensionInstance<Ext extends object = {}, Output = unknown> {
    readonly ext?: Ext
    wrapExec?(
      next: () => Promise<Output>,
      event: FlowExtensionEvent
    ): MaybePromise<Output>
  }

  export interface FlowExtensionUse<Ext extends object = {}, Output = unknown> {
    readonly key: symbol
    readonly name: string
    create(ctx: ExecutionContext): FlowExtensionInstance<Ext, Output>
  }

  export interface FlowExtension<Config = void, Ext extends object = {}, Output = unknown> {
    readonly key: symbol
    readonly name: string
    (...args: FlowExtensionArgs<Config>): FlowExtensionUse<Ext, Output>
  }

  type FlowExtensionExtFn<Use> = Use extends FlowExtensionUse<infer Ext, any>
    ? (value: Ext) => void
    : never

  type FlowExtensionOutputFn<Use> = Use extends FlowExtensionUse<any, infer Output>
    ? (value: Output) => void
    : never

  export type FlowExtensionExt<Extensions extends readonly FlowExtensionUse<any, any>[]> =
    [Extensions[number]] extends [never]
      ? {}
      : FlowExtensionExtFn<Extensions[number]> extends (value: infer I) => void ? I : never

  export type FlowExtensionOutput<Extensions extends readonly FlowExtensionUse<any, any>[]> =
    [Extensions[number]] extends [never]
      ? unknown
      : FlowExtensionOutputFn<Extensions[number]> extends (value: infer I) => void ? I : never

  export type FlowExtensionContext<Extensions extends readonly FlowExtensionUse<any, any>[]> =
    ExecutionContext & { readonly ext: FlowExtensionExt<Extensions> }

  export type FlowContext<Input, Extensions extends readonly FlowExtensionUse<any, any>[]> =
    FlowExtensionContext<Extensions> & { readonly input: Input }

  export type Dependency =
    | Atom<unknown>
    | ControllerDep<unknown>
    | TagExecutor<any>
    | Resource<unknown>

  export type AtomDependency = Atom<unknown> | AtomControllerDep<unknown> | TagExecutor<any, any>

  export type ExecutionDependency =
    | Atom<unknown>
    | NonWatchControllerDep<unknown>
    | NonWatchResourceControllerDep<unknown>
    | TagExecutor<any, any>
    | Resource<unknown, Record<string, Dependency>>

  export type ResourceDependency =
    | Atom<unknown>
    | NonWatchControllerDep<unknown>
    | ResourceControllerDep<unknown>
    | TagExecutor<any, any>
    | Resource<unknown, Record<string, Dependency>>

  export type InferDep<D> = D extends Atom<infer T>
    ? T
    : D extends AtomControllerDep<infer T>
      ? Controller<T>
      : D extends ResourceControllerDep<infer T>
        ? ResourceController<T>
      : D extends TagExecutor<infer TOutput, infer _TTag>
        ? TOutput
        : D extends Resource<infer T>
          ? T
          : never

  export type InferDeps<D> = { [K in keyof D]: InferDep<D[K]> }

  export type AtomFactory<T, D extends Record<string, Dependency>> =
    keyof D extends never
      ? (ctx: ResolveContext) => MaybePromise<T>
      : (ctx: ResolveContext, deps: InferDeps<D>) => MaybePromise<T>

  export type FlowFactory<
    Output,
    Input,
    D extends Record<string, Dependency>,
  > = keyof D extends never
    ? (ctx: ExecutionContext & { readonly input: Input }) => MaybePromise<Output>
    : (ctx: ExecutionContext & { readonly input: Input }, deps: InferDeps<D>) => MaybePromise<Output>

  export type ResourceFactory<T, D extends Record<string, Dependency>> =
    keyof D extends never
      ? (ctx: ResourceContext) => MaybePromise<T>
      : (ctx: ResourceContext, deps: InferDeps<D>) => MaybePromise<T>

  export type ServiceMethod = (ctx: ExecutionContext, ...args: any[]) => unknown

  export type ServiceMethods = Record<string, ServiceMethod>

  /**
   * Any atom regardless of value type.
   * Useful for APIs that don't need the value type.
   */
  export type AnyAtom = Atom<any>

  /**
   * Any flow regardless of input/output types.
   * Useful for APIs that don't need the type parameters.
   */
  export type AnyFlow = Flow<any, any>

  /**
   * Any controller regardless of value type.
   */
  export type AnyController = Controller<any>

  /**
   * Any resource regardless of value type.
   */
  export type AnyResource = Resource<any>

  /**
   * Target type for wrapExec extension hook.
   * Either a Flow or an inline function.
   */
  export type ExecTarget = Flow<unknown, unknown> | ExecTargetFn

  /**
   * Inline function that can be executed via ctx.exec.
   */
  export type ExecTargetFn = (ctx: ExecutionContext, ...args: any[]) => MaybePromise<unknown>

  /**
   * Utility types for type extraction and manipulation.
   * @example
   * type Config = Lite.Utils.AtomValue<typeof configAtom>
   * type Result = Lite.Utils.FlowOutput<typeof processFlow>
   */
  export namespace Utils {
    /**
     * Extract value type from an Atom.
     * @example
     * type Config = Lite.Utils.AtomValue<typeof configAtom> // string
     */
    export type AtomValue<A> = A extends Atom<infer T> ? T : never

    /**
     * Extract output type from a Flow.
     * @example
     * type Result = Lite.Utils.FlowOutput<typeof processFlow> // ProcessResult
     */
    export type FlowOutput<F> = F extends Flow<infer O, unknown> ? O : never

    /**
     * Extract input type from a Flow.
     * @example
     * type Input = Lite.Utils.FlowInput<typeof processFlow> // ProcessRequest
     */
    export type FlowInput<F> = F extends Flow<unknown, infer I> ? I : never

    /**
     * Extract value type from a Tag.
     * @example
     * type UserId = Lite.Utils.TagValue<typeof userIdTag> // string
     */
    export type TagValue<T> = T extends Tag<infer V, boolean> ? V : never

    /**
     * Extract dependencies record from an Atom or Flow.
     * @example
     * type Deps = Lite.Utils.DepsOf<typeof myAtom> // { db: DbAtom, cache: CacheAtom }
     */
    export type DepsOf<T> = T extends Atom<unknown>
      ? T['deps']
      : T extends Flow<unknown, unknown>
        ? T['deps']
        : never

    /**
     * Flatten complex intersection types for better IDE display.
     */
    export type Simplify<T> = { [K in keyof T]: T[K] } & {}

    /**
     * Create an atom type with inferred value.
     * Useful for declaring atom types without defining the atom.
     */
    export type AtomType<T, D extends Record<string, Dependency> = Record<string, never>> = Atom<T> & {
      readonly deps: D
    }

    /**
     * Create a flow type with inferred input/output.
     * Useful for declaring flow types without defining the flow.
     */
    export type FlowType<O, I = void, D extends Record<string, Dependency> = Record<string, never>> = Flow<O, I> & {
      readonly deps: D
    }

    /**
     * Extract value type from a Controller.
     * @example
     * type Value = Lite.Utils.ControllerValue<typeof ctrl> // string
     */
    export type ControllerValue<C> = C extends Controller<infer T> ? T : never
  }
}

import type {
  atomSymbol,
  flowSymbol,
  tagSymbol,
  taggedSymbol,
  controllerDepSymbol,
  presetSymbol,
  controllerSymbol,
  tagExecutorSymbol,
  typedSymbol,
} from "./symbols"

export type MaybePromise<T> = T | Promise<T>

export type AtomState = 'idle' | 'resolving' | 'resolved' | 'failed'

export namespace Lite {
  export interface Scope {
    readonly ready: Promise<void>
    resolve<T>(atom: Atom<T>): Promise<T>
    controller<T>(atom: Atom<T>): Controller<T>
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
    tags?: Tagged<unknown>[]
  }

  export interface ScopeOptions {
    extensions?: Extension[]
    tags?: Tagged<unknown>[]
    presets?: Preset<unknown>[]
  }

  export interface Atom<T> {
    readonly [atomSymbol]: true
    readonly factory: AtomFactory<T, Record<string, Dependency>>
    readonly deps?: Record<string, Dependency>
    readonly tags?: Tagged<unknown>[]
  }

  export interface Flow<TOutput, TInput = unknown> {
    readonly [flowSymbol]: true
    readonly name?: string
    readonly parse?: (raw: unknown) => MaybePromise<TInput>
    readonly factory: FlowFactory<TOutput, TInput, Record<string, Dependency>>
    readonly deps?: Record<string, Dependency>
    readonly tags?: Tagged<unknown>[]
  }

  /**
   * Per-atom private storage using Tags as keys. Data survives invalidation
   * but is cleared on release.
   */
  export interface DataStore {
    /**
     * Pure lookup - returns stored value or undefined.
     * Does NOT use tag defaults (Map-like semantics).
     * Use `getOrSet()` when you need defaults.
     */
    get<T>(tag: Tag<T, boolean>): T | undefined
    /** Store value for tag */
    set<T>(tag: Tag<T, boolean>, value: T): void
    /** Check if tag has stored value */
    has<T, H extends boolean>(tag: Tag<T, H>): boolean
    /** Remove stored value, returns true if existed */
    delete<T, H extends boolean>(tag: Tag<T, H>): boolean
    /** Remove all stored values */
    clear(): void
    /**
     * Get existing value or initialize with tag's default.
     * Stores and returns the value (materializes it).
     */
    getOrSet<T>(tag: Tag<T, true>): T
    /**
     * Get existing value or initialize with provided value.
     * Stores and returns the value (materializes it).
     */
    getOrSet<T>(tag: Tag<T, true>, value: T): T
    /**
     * Get existing value or initialize with provided value.
     * Required for tags without defaults.
     */
    getOrSet<T>(tag: Tag<T, false>, value: T): T
  }

  export interface ResolveContext {
    cleanup(fn: () => MaybePromise<void>): void
    invalidate(): void
    readonly scope: Scope
    readonly data: DataStore
  }

  export interface ExecutionContext {
    readonly input: unknown
    readonly scope: Scope
    readonly parent: ExecutionContext | undefined
    readonly data: Map<symbol, unknown>
    exec<Output, Input>(options: ExecFlowOptions<Output, Input>): Promise<Output>
    exec<Output, Args extends unknown[]>(options: ExecFnOptions<Output, Args>): Promise<Output>
    onClose(fn: () => MaybePromise<void>): void
    close(): Promise<void>
  }

  export type ExecFlowOptions<Output, Input> = {
    flow: Flow<Output, Input>
    name?: string
    tags?: Tagged<unknown>[]
  } & ([NoInfer<Input>] extends [void | undefined | null]
    ? { input?: undefined | null }
    : { input: NoInfer<Input> })

  export interface ExecFnOptions<Output, Args extends unknown[] = unknown[]> {
    fn: (ctx: ExecutionContext, ...args: Args) => MaybePromise<Output>
    params: Args
    tags?: Tagged<unknown>[]
  }

  export type ControllerEvent = 'resolving' | 'resolved' | '*'

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

  export interface SelectOptions<S> {
    eq?: (prev: S, next: S) => boolean
  }

  export interface SelectHandle<S> {
    get(): S
    subscribe(listener: () => void): () => void
  }

  export interface Tag<T, HasDefault extends boolean = false> {
    readonly [tagSymbol]: true
    readonly key: symbol
    readonly label: string
    readonly defaultValue: HasDefault extends true ? T : undefined
    readonly hasDefault: HasDefault
    readonly parse?: (raw: unknown) => T
    (value: T): Tagged<T>
    get(source: TagSource): HasDefault extends true ? T : T
    find(source: TagSource): HasDefault extends true ? T : T | undefined
    collect(source: TagSource): T[]
  }

  export interface Tagged<T> {
    readonly [taggedSymbol]: true
    readonly key: symbol
    readonly value: T
  }

  export type TagSource = Tagged<unknown>[] | { tags?: Tagged<unknown>[] }

  export interface TagExecutor<TOutput, TTag = TOutput> {
    readonly [tagExecutorSymbol]: true
    readonly tag: Tag<TTag, boolean>
    readonly mode: "required" | "optional" | "all"
  }

  export interface ControllerDep<T> {
    readonly [controllerDepSymbol]: true
    readonly atom: Atom<T>
  }

  export interface Typed<T> {
    readonly [typedSymbol]: true
  }

  export interface Preset<T> {
    readonly [presetSymbol]: true
    readonly atom: Atom<T>
    readonly value: T | Atom<T>
  }

  export interface Extension {
    readonly name: string
    init?(scope: Scope): MaybePromise<void>
    wrapResolve?(
      next: () => Promise<unknown>,
      atom: Atom<unknown>,
      scope: Scope
    ): Promise<unknown>
    wrapExec?(
      next: () => Promise<unknown>,
      target: Flow<unknown, unknown> | ((ctx: ExecutionContext, ...args: unknown[]) => MaybePromise<unknown>),
      ctx: ExecutionContext
    ): Promise<unknown>
    dispose?(scope: Scope): MaybePromise<void>
  }

  export type Dependency =
    | Atom<unknown>
    | ControllerDep<unknown>
    | TagExecutor<unknown>

  export type InferDep<D> = D extends Atom<infer T>
    ? T
    : D extends ControllerDep<infer T>
      ? Controller<T>
      : D extends TagExecutor<infer TOutput, infer _TTag>
        ? TOutput
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

  export type ServiceMethod = (ctx: ExecutionContext, ...args: unknown[]) => unknown

  export type ServiceMethods = Record<string, ServiceMethod>
}

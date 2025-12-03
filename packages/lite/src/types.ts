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

  export interface DataStore {
    get<T, H extends boolean>(tag: Tag<T, H>): H extends true ? T : T | undefined
    set<T>(tag: Tag<T, boolean>, value: T): void
    has<T, H extends boolean>(tag: Tag<T, H>): boolean
    delete<T, H extends boolean>(tag: Tag<T, H>): boolean
    clear(): void
    getOrSet<T>(tag: Tag<T, true>): T
    getOrSet<T>(tag: Tag<T, false>, defaultValue: T): T
  }

  export interface ResolveContext {
    cleanup(fn: () => MaybePromise<void>): void
    invalidate(): void
    readonly scope: Scope
    readonly data: DataStore
  }

  export interface ExecutionContext<TInput = unknown> {
    readonly input: TInput
    readonly scope: Scope
    exec<T>(options: ExecFlowOptions<T>): Promise<T>
    exec<T, Args extends unknown[]>(options: ExecFnOptions<T, Args>): Promise<T>
    onClose(fn: () => MaybePromise<void>): void
    close(): Promise<void>
  }

  export interface ExecFlowOptions<T> {
    flow: Flow<T, unknown>
    input: unknown
    name?: string
    tags?: Tagged<unknown>[]
  }

  export interface ExecFnOptions<T, Args extends unknown[] = unknown[]> {
    fn: (...args: Args) => MaybePromise<T>
    params: Args
    tags?: Tagged<unknown>[]
  }

  export type ControllerEvent = 'resolving' | 'resolved' | '*'

  export interface Controller<T> {
    readonly [controllerSymbol]: true
    readonly state: AtomState
    get(): T
    resolve(): Promise<T>
    release(): Promise<void>
    invalidate(): void
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
    wrapResolve?<T>(
      next: () => Promise<T>,
      atom: Atom<T>,
      scope: Scope
    ): Promise<T>
    wrapExec?<T>(
      next: () => Promise<T>,
      target: Flow<T, unknown> | ((...args: unknown[]) => MaybePromise<T>),
      ctx: ExecutionContext
    ): Promise<T>
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
    TOutput,
    TInput,
    D extends Record<string, Dependency>,
  > = keyof D extends never
    ? (ctx: ExecutionContext<TInput>) => MaybePromise<TOutput>
    : (ctx: ExecutionContext<TInput>, deps: InferDeps<D>) => MaybePromise<TOutput>
}

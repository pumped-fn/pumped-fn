import { controllerSymbol, ParseError, FlowFault, type Lite, type MaybePromise, type AtomState } from "./types"
import { isAtom, isControllerDep } from "./atom"
import { classifyDeps, type DepsGraph } from "./deps-graph"
import { isFlow } from "./flow"
import { isResource } from "./resource"
import { latest, type Latest } from "./latest"
import { assertNoReturnedStream, consumeScalarResult, isAsyncGenerator, isAsyncGeneratorFunction, isPromiseLike, markStreamingExec, registerStreamingExec, requireAsyncGenerator, streamResultBeforeStartError } from "./streaming"
export { isStreamingExec } from "./streaming"

function isPlainObject(value: object): value is Record<PropertyKey, unknown> {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}


export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
  if (!isPlainObject(a) || !isPlainObject(b)) return false
  const keysA = Reflect.ownKeys(a).filter((key) => Object.prototype.propertyIsEnumerable.call(a, key))
  if (keysA.length !== Reflect.ownKeys(b).filter((key) => Object.prototype.propertyIsEnumerable.call(b, key)).length) return false
  for (const key of keysA) {
    if (!Object.hasOwn(b as Record<PropertyKey, unknown>, key)) return false
    if (!Object.is((a as Record<PropertyKey, unknown>)[key], (b as Record<PropertyKey, unknown>)[key])) return false
  }
  return true
}

const controllerReadHooks: Array<(ctrl: Lite.Controller<unknown>) => void> = []

interface Cleanup {
  fn: (...args: any[]) => MaybePromise<void>
  params: unknown[]
}

interface CloseCleanup {
  fn: (result: Lite.CloseResult, ...args: any[]) => MaybePromise<void>
  params: unknown[]
}

type Listener = () => void

interface Update<T> {
  fn: (value: T) => T
}

interface PendingSet<T> {
  hasValue: boolean
  value?: T
  updates: Update<T>[]
}

function runCleanup(cleanup: Cleanup): MaybePromise<void> {
  return cleanup.fn(...cleanup.params)
}

function bindListener(fn: (...args: any[]) => void, params: unknown[]): Listener {
  return params.length === 0 ? fn : () => fn(...params)
}

async function runCleanupsSafe(cleanups: Cleanup[]): Promise<void> {
  for (let i = cleanups.length - 1; i >= 0; i--) {
    try {
      const result = runCleanup(cleanups[i]!)
      if (result != null && typeof (result as any).then === 'function') await result
    } catch {}
  }
}

type ListenerEvent = 'resolving' | 'resolved' | '*'

class ContextDataImpl implements Lite.ContextData {
  private readonly map = new Map<string | symbol, unknown>()
  private readonly tagValues = new Map<symbol, unknown[]>()

  constructor(
    private readonly parentData?: Lite.ContextData
  ) {}

  get(key: string | symbol): unknown {
    return this.map.get(key)
  }

  set(key: string | symbol, value: unknown): void {
    this.map.set(key, value)
    if (typeof key === "symbol" && this.tagValues.has(key)) this.tagValues.set(key, [value])
  }

  appendTagValue(key: symbol, value: unknown): void {
    const values = this.tagValues.get(key)
    if (values) {
      values.push(value)
      return
    }
    this.tagValues.set(key, [value])
    this.map.set(key, value)
  }

  collectTag<T>(tag: Lite.Tag<T, boolean>): T[] {
    return (this.tagValues.get(tag.key) ?? (this.map.has(tag.key) ? [this.map.get(tag.key)] : [])) as T[]
  }

  has(key: string | symbol): boolean {
    return this.map.has(key)
  }

  delete(key: string | symbol): boolean {
    if (typeof key === "symbol") this.tagValues.delete(key)
    return this.map.delete(key)
  }

  clear(): void {
    this.map.clear()
    this.tagValues.clear()
  }

  seek(key: string | symbol): unknown {
    if (this.map.has(key)) {
      return this.map.get(key)
    }
    return this.parentData?.seek(key)
  }

  seekHas(key: string | symbol): boolean {
    if (this.map.has(key)) return true
    return this.parentData?.seekHas(key) ?? false
  }

  getTag<T>(tag: Lite.Tag<T, boolean>): T | undefined {
    return this.map.get(tag.key) as T | undefined
  }

  setTag<T>(tag: Lite.Tag<T, boolean>, value: T): void {
    this.map.set(tag.key, value)
    this.tagValues.set(tag.key, [value])
  }

  hasTag<T, H extends boolean>(tag: Lite.Tag<T, H>): boolean {
    return this.map.has(tag.key)
  }

  deleteTag<T, H extends boolean>(tag: Lite.Tag<T, H>): boolean {
    this.tagValues.delete(tag.key)
    return this.map.delete(tag.key)
  }

  seekTag<T>(tag: Lite.Tag<T, boolean>): T | undefined {
    if (this.map.has(tag.key)) {
      return this.map.get(tag.key) as T
    }
    return this.parentData?.seekTag(tag)
  }

  getOrSetTag<T>(tag: Lite.Tag<T, true>): T
  getOrSetTag<T>(tag: Lite.Tag<T, true>, value: T): T
  getOrSetTag<T>(tag: Lite.Tag<T, false>, value: T): T
  getOrSetTag<T>(tag: Lite.Tag<T, boolean>, value?: T): T {
    if (this.map.has(tag.key)) {
      return this.map.get(tag.key) as T
    }
    const storedValue = value !== undefined ? value : (tag.defaultValue as T)
    this.setTag(tag, storedValue)
    return storedValue
  }
}

interface AtomEntry<T> {
  state: AtomState
  value?: T
  hasValue: boolean
  error?: Error
  cleanups: Cleanup[]
  resolvingListeners: Set<Listener>
  resolvedListeners: Set<Listener>
  allListeners: Set<Listener>
  pendingInvalidate: boolean
  pendingSet?: PendingSet<T>
  data?: ContextDataImpl
  dependents: Set<Lite.Atom<unknown>>
  gcPending: boolean
  gcQueued: boolean
  gcScheduled: ReturnType<typeof setTimeout> | null
  resolvedPromise?: Promise<T>
}

interface ResourceEntry<T> {
  state: AtomState
  value?: T
  hasValue: boolean
  error?: Error
  cleanups: Cleanup[]
  promise?: Promise<T>
}

interface ResourceListeners {
  idle: Set<Listener>
  resolving: Set<Listener>
  resolved: Set<Listener>
  failed: Set<Listener>
  all: Set<Listener>
}

type ResourceDependencyConsumer = {
  ownerCtx: ExecutionContextImpl
  resource: Lite.Resource<unknown>
  entry: ResourceEntry<unknown>
}

type StreamSource<T> = AsyncIterable<T> | AsyncIterator<T>

const pendingAbort = Symbol()

type StreamHub<T> = {
  atom: Lite.Atom<StreamSource<T>>
  views: Set<Latest<T>>
  unsubs: (() => void)[]
  version: number
  iterator?: AsyncIterator<T>
  source?: StreamSource<T>
}

type ExecFlowRuntimeOptions = {
  flow: Lite.Flow<unknown, any, any, unknown>
  input?: unknown
  rawInput?: unknown
  name?: string
  tags?: Lite.Tagged<any>[]
  signal?: AbortSignal
  blockedTags?: Lite.Tagged<any>[]
}

type ExecDepsRuntimeOptions = {
  name: string
  deps: Record<string, Lite.ExecutionDependency>
  fn: (deps: Record<string, unknown>, ...params: any[]) => unknown
  params: unknown[]
  tags?: Lite.Tagged<any>[]
  signal?: AbortSignal
}

type ExecRuntimeOptions = {
  name: string
  deps?: undefined
  fn: (...params: any[]) => unknown
  params: unknown[]
  tags?: Lite.Tagged<any>[]
  signal?: AbortSignal
}

function assertExecutionContextImpl(ctx: Lite.ExecutionContext): asserts ctx is ExecutionContextImpl {
  if (!(ctx instanceof ExecutionContextImpl)) {
    throw new Error("Resource deps require an ExecutionContext")
  }
}

function isAtomControllerDep(dep: Lite.ControllerDep<unknown>): dep is Lite.AtomControllerDep<unknown> {
  return dep.atom !== undefined
}

function getAsyncIterator<T>(source: StreamSource<T>): AsyncIterator<T> {
  const iterate = (source as AsyncIterable<T>)[Symbol.asyncIterator]
  return iterate ? iterate.call(source) : source as AsyncIterator<T>
}

function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController()
  const abort = (event: Event) => {
    for (let i = 0; i < signals.length; i++) signals[i]!.removeEventListener("abort", abort)
    controller.abort((event.target as AbortSignal).reason)
  }
  for (let i = 0; i < signals.length; i++) {
    if (signals[i]!.aborted) {
      controller.abort(signals[i]!.reason)
      return controller.signal
    }
    signals[i]!.addEventListener("abort", abort, { once: true })
  }
  return controller.signal
}

function applyUpdates<T>(value: T, updates: Update<T>[]): T {
  let current = value
  for (let i = 0; i < updates.length; i++) {
    const update = updates[i]!
    current = update.fn(current)
  }
  return current
}

function notifyListeners(listeners: Set<Listener> | undefined): void {
  if (!listeners?.size) return
  if (listeners.size === 1) {
    listeners.values().next().value!()
    return
  }
  const arr = [...listeners]
  for (let i = 0; i < arr.length; i++) arr[i]!()
}

class SelectHandleImpl<T, S> implements Lite.SelectHandle<S> {
  private listeners = new Set<Listener>()
  private sourceValue: T
  private currentValue: S
  private ctrlUnsub: (() => void) | null = null
  private frozen = false

  constructor(
    private ctrl: Lite.Controller<T>,
    private selector: (value: T) => S,
    private eq: (prev: S, next: S) => boolean
  ) {
    if (ctrl.state !== 'resolved') {
      throw new Error("Cannot select from unresolved atom")
    }

    this.sourceValue = ctrl.get()
    this.currentValue = selector(this.sourceValue)
  }

  private refreshFromSource(): void {
    const source = this.ctrl.get()
    if (Object.is(source, this.sourceValue)) return
    this.sourceValue = source
    const nextValue = this.selector(source)
    if (!this.eq(this.currentValue, nextValue)) {
      this.currentValue = nextValue
    }
  }

  get(): S {
    if (!this.ctrlUnsub && !this.frozen) this.refreshFromSource()
    return this.currentValue
  }

  subscribe<Args extends unknown[]>(listener: (...args: Args) => void, ...params: Args): () => void {
    if (!this.ctrlUnsub) {
      this.refreshFromSource()
      this.frozen = false
      this.ctrlUnsub = this.ctrl.on('resolved', () => {
        this.sourceValue = this.ctrl.get()
        const nextValue = this.selector(this.sourceValue)
        if (!this.eq(this.currentValue, nextValue)) {
          this.currentValue = nextValue
          notifyListeners(this.listeners)
        }
      })
    }
    const registered = bindListener(listener, params)
    this.listeners.add(registered)

    return () => {
      this.listeners.delete(registered)
      if (this.listeners.size === 0) {
        this.cleanup()
      }
    }
  }

  dispose(): void {
    this.listeners.clear()
    this.cleanup()
  }

  private cleanup(): void {
    this.ctrlUnsub?.()
    this.ctrlUnsub = null
    this.frozen = true
  }
}

class ControllerImpl<T> implements Lite.Controller<T> {
  readonly [controllerSymbol] = true
  _entryCache: AtomEntry<T> | null = null

  constructor(
    private atom: Lite.Atom<T>,
    private scope: ScopeImpl
  ) {}

  private resolveEntry(): AtomEntry<T> | undefined {
    const cached = this._entryCache
    if (cached) return cached
    const fresh = this.scope.getEntry(this.atom) as AtomEntry<T> | undefined
    if (fresh) this._entryCache = fresh
    return fresh
  }

  _invalidateEntryCache(): void {
    this._entryCache = null
  }

  get state(): AtomState {
    const e = this.resolveEntry()
    return e?.state ?? 'idle'
  }

  get(): T {
    for (let i = controllerReadHooks.length - 1; i >= 0; i--) {
      controllerReadHooks[i]!(this)
    }
    const entry = this.resolveEntry()
    if (!entry || entry.state === 'idle') throw new Error("Atom not resolved")
    if (entry.state === 'failed') throw entry.error!
    if (entry.hasValue) return entry.value as T
    throw new Error("Atom not resolved")
  }

  async resolve(): Promise<T> {
    return this.scope.resolve(this.atom)
  }

  async release(): Promise<void> {
    return this.scope.release(this.atom)
  }

  invalidate(): void {
    this.scope.invalidate(this.atom)
  }

  set(value: T): void {
    this.scope.scheduleSet(this.atom, value, this._entryCache ?? undefined)
  }

  update(fn: (prev: T) => T): void {
    this.scope.scheduleUpdate(this.atom, fn, this._entryCache ?? undefined)
  }

  on<Args extends unknown[]>(event: ListenerEvent, listener: (...args: Args) => void, ...params: Args): () => void {
    return this.scope.addListener(this.atom, event, listener, params)
  }
}

class ResourceControllerImpl<T> implements Lite.ResourceController<T> {
  constructor(
    private resource: Lite.Resource<T>,
    private ctx: ExecutionContextImpl
  ) {}

  get state(): AtomState {
    const found = this.ctx.findResourceEntry(this.resource)
    return found?.entry.state ?? "idle"
  }

  get(): T {
    const found = this.ctx.findResourceEntry(this.resource)
    const entry = found?.entry
    if (!entry || entry.state === "idle") throw new Error("Resource not resolved")
    if (entry.state === "failed") throw entry.error!
    if (entry.hasValue) return entry.value as T
    throw new Error("Resource not resolved")
  }

  resolve(): Promise<T> {
    return this.ctx.resolve(this.resource)
  }

  release(): Promise<void> {
    return this.ctx.release(this.resource)
  }

  on<Args extends unknown[]>(
    event: Lite.ResourceControllerEvent,
    listener: (...args: Args) => void,
    ...params: Args
  ): () => void {
    return this.ctx.addResourceListener(this.resource, event, listener, params)
  }
}

class ScopeImpl implements Lite.Scope {
  private cache = new Map<Lite.Atom<unknown>, AtomEntry<unknown>>()
  private presets = new Map<Lite.Atom<unknown> | Lite.Flow<unknown, unknown, any, unknown> | Lite.Resource<unknown>, unknown>()
  private resolving = new Set<Lite.Atom<unknown>>()
  private pending = new Map<Lite.Atom<unknown>, Promise<unknown>>()
  private stateListeners = new Map<AtomState, Map<Lite.Atom<unknown>, Set<Listener>>>()
  private invalidationQueue: Lite.Atom<unknown>[] = []
  private invalidationQueued = new Set<Lite.Atom<unknown>>()
  private invalidationChain: Set<Lite.Atom<unknown>> | null = null
  private chainPromise: Promise<void> | null = null
  private chainError: unknown = null
  private initialized = false
  private disposed = false
  private disposeListeners = new Set<Listener>()
  private controllers = new Map<Lite.Atom<unknown>, ControllerImpl<unknown>>()
  private streamHubs = new Map<Lite.Atom<unknown>, StreamHub<unknown>>()
  private gcOptions: Required<Lite.GCOptions>
  readonly extensions: Lite.Extension[]
  readonly tags: Lite.Tagged<any>[]
  readonly resolveExts: Lite.Extension[]
  readonly execExts: Lite.Extension[]
  readonly ready: Promise<void>

  private scheduleInvalidation<T>(atom: Lite.Atom<T>, entry?: AtomEntry<T>): void {
    if (!entry) {
      entry = this.cache.get(atom) as AtomEntry<T> | undefined
      if (!entry || entry.state === "idle") return
    }

    if (entry.state === "resolving") {
      entry.pendingInvalidate = true
      return
    }

    if (!this.invalidationQueued.has(atom)) {
      this.invalidationQueued.add(atom)
      this.invalidationQueue.push(atom)
    }

    if (!this.chainPromise) {
      this.chainError = null
      this.chainPromise = Promise.resolve().then(() =>
        this.processInvalidationChain().catch(error => {
          this.chainError = error
        })
      )
    }
  }

  private async processInvalidationChain(): Promise<void> {
    try {
      while (this.invalidationQueue.length > 0 && !this.disposed) {
        const atom = this.invalidationQueue.shift()!
        this.invalidationQueued.delete(atom)
        const result = this.doInvalidateSequential(atom)
        if (result) await result
      }
    } finally {
      this.invalidationChain = null
      this.chainPromise = null
    }
  }

  constructor(options?: Lite.ScopeOptions) {
    this.extensions = options?.extensions ?? []
    this.tags = options?.tags ?? []
    this.resolveExts = this.extensions.filter(e => e.wrapResolve)
    this.execExts = this.extensions.filter(e => e.wrapExec)

    for (const p of options?.presets ?? []) {
      this.presets.set(p.target, p.value)
    }

    this.gcOptions = {
      enabled: options?.gc?.enabled ?? true,
      graceMs: options?.gc?.graceMs ?? 3000,
    }

    this.ready = this.init()
  }

  private async init(): Promise<void> {
    for (const ext of this.extensions) {
      if (ext.init) {
        await ext.init(this)
      }
    }
    this.initialized = true
  }

  getEntry<T>(atom: Lite.Atom<T>): AtomEntry<T> | undefined {
    return this.cache.get(atom) as AtomEntry<T> | undefined
  }

  private getOrCreateEntry<T>(atom: Lite.Atom<T>): AtomEntry<T> {
    let entry = this.cache.get(atom) as AtomEntry<T> | undefined
    if (!entry) {
      entry = {
        state: 'idle',
        hasValue: false,
        cleanups: [],
        resolvingListeners: new Set(),
        resolvedListeners: new Set(),
        allListeners: new Set(),
        pendingInvalidate: false,
        dependents: new Set(),
        gcPending: false,
        gcQueued: false,
        gcScheduled: null,
      }
      this.cache.set(atom, entry as AtomEntry<unknown>)
    }
    return entry
  }

  addListener<T, Args extends unknown[]>(
    atom: Lite.Atom<T>,
    event: ListenerEvent,
    listener: (...args: Args) => void,
    params: Args
  ): () => void {
    const entry = this.getOrCreateEntry(atom)
    if (entry.gcScheduled) {
      clearTimeout(entry.gcScheduled)
      entry.gcScheduled = null
    }
    entry.gcPending = false
    const listeners = event === 'resolving'
      ? entry.resolvingListeners
      : event === 'resolved'
        ? entry.resolvedListeners
        : entry.allListeners
    const registered = bindListener(listener, params)
    listeners.add(registered)
    return () => {
      listeners.delete(registered)
      this.maybeScheduleGCEntry(atom, entry as AtomEntry<unknown>)
    }
  }

  private hasSubscribers(entry: AtomEntry<unknown>): boolean {
    return entry.resolvingListeners.size > 0 || entry.resolvedListeners.size > 0 || entry.allListeners.size > 0
  }

  private canQueueGC<T>(atom: Lite.Atom<T>, entry: AtomEntry<unknown>): boolean {
    return this.gcOptions.enabled
      && !atom.keepAlive
      && entry.state !== 'idle'
      && !this.hasSubscribers(entry)
      && entry.dependents.size === 0
      && !entry.gcScheduled
      && !entry.gcQueued
  }

  private canStartGCTimer<T>(atom: Lite.Atom<T>, entry: AtomEntry<unknown>): boolean {
    return !this.disposed
      && this.cache.get(atom) === entry
      && !this.hasSubscribers(entry)
      && entry.dependents.size === 0
      && !entry.gcScheduled
  }

  private canExecuteGC(entry: AtomEntry<unknown>): boolean {
    return !this.hasSubscribers(entry) && entry.dependents.size === 0
  }

  private trackDependent<T>(atom: Lite.Atom<T>, dependentAtom?: Lite.Atom<unknown>): void {
    if (!dependentAtom) return
    this.getEntry(atom)?.dependents.add(dependentAtom)
  }

  private maybeScheduleGCEntry<T>(atom: Lite.Atom<T>, entry?: AtomEntry<unknown>): void {
    const gcEntry = entry ?? this.cache.get(atom)
    if (!gcEntry || !this.canQueueGC(atom, gcEntry)) return

    gcEntry.gcPending = true
    gcEntry.gcQueued = true
    queueMicrotask(() => {
      gcEntry.gcQueued = false
      if (!gcEntry.gcPending) return
      gcEntry.gcPending = false
      if (!this.canStartGCTimer(atom, gcEntry)) return
      gcEntry.gcScheduled = setTimeout(() => {
        void this.executeGC(atom)
      }, this.gcOptions.graceMs)
    })
  }

  private async executeGC<T>(atom: Lite.Atom<T>): Promise<void> {
    const entry = this.cache.get(atom)!

    entry.gcScheduled = null
    entry.gcPending = false

    if (!this.canExecuteGC(entry)) return

    await this.release(atom)

    if (atom.deps) {
      for (const key in atom.deps) {
        const dep = atom.deps[key]!
        const depAtom = isControllerDep(dep) && isAtomControllerDep(dep) ? dep.atom : dep
        if (!isAtom(depAtom)) continue
        this.cache.get(depAtom)?.dependents.delete(atom)
        this.maybeScheduleGCEntry(depAtom)
      }
    }
  }

  private notifyEntry(entry: AtomEntry<unknown>, event: 'resolving' | 'resolved'): void {
    notifyListeners(event === 'resolving' ? entry.resolvingListeners : entry.resolvedListeners)
    notifyListeners(entry.allListeners)
  }

  private notifyEntryAll(entry: AtomEntry<unknown>): void {
    notifyListeners(entry.allListeners)
  }

  private emitStateChange(state: AtomState, atom: Lite.Atom<unknown>): void {
    if (this.stateListeners.size === 0) return
    const stateMap = this.stateListeners.get(state)
    if (!stateMap) return
    notifyListeners(stateMap.get(atom))
  }

  on<Args extends unknown[]>(
    event: AtomState,
    atom: Lite.Atom<unknown>,
    listener: (...args: Args) => void,
    ...params: Args
  ): () => void {
    let stateMap = this.stateListeners.get(event)
    if (!stateMap) {
      stateMap = new Map()
      this.stateListeners.set(event, stateMap)
    }
    let listeners = stateMap.get(atom)
    if (!listeners) {
      listeners = new Set()
      stateMap.set(atom, listeners)
    }
    const registered = bindListener(listener, params)
    listeners.add(registered)

    const capturedStateMap = stateMap
    const capturedListeners = listeners

    return () => {
      capturedListeners.delete(registered)
      if (capturedListeners.size === 0) {
        capturedStateMap.delete(atom)
        if (capturedStateMap.size === 0) {
          this.stateListeners.delete(event)
        }
      }
    }
  }

  private onDispose<Args extends unknown[]>(listener: (...args: Args) => void, ...params: Args): () => void {
    const registered = bindListener(listener, params)
    this.disposeListeners.add(registered)
    return () => {
      this.disposeListeners.delete(registered)
    }
  }

  private emitDispose(): void {
    const listeners = [...this.disposeListeners]
    this.disposeListeners.clear()
    for (let i = 0; i < listeners.length; i++) listeners[i]!()
  }

  private tryResolveSyncDeps(
    graph: DepsGraph,
    dependentAtom?: Lite.Atom<unknown>
  ): Record<string, unknown> | null {
    const result: Record<string, unknown> = {}

    for (let i = 0; i < graph.atoms.length; i++) {
      const [key, dep] = graph.atoms[i]!
      const cachedEntry = this.cache.get(dep)
      if (cachedEntry?.state !== 'resolved') return null
      result[key] = cachedEntry.value
      this.trackDependent(dep, dependentAtom)
    }

    for (let i = 0; i < graph.controllers.length; i++) {
      const [key, dep] = graph.controllers[i]!
      if (!isAtomControllerDep(dep)) return null
      if (dep.watch) {
        if (!dependentAtom) return null
        if (!dep.resolve) return null
      }
      const ctrl = this.controller(dep.atom)
      if (dep.resolve) {
        const cachedCtrlEntry = this.cache.get(dep.atom)
        if (cachedCtrlEntry?.state !== 'resolved') return null
        result[key] = ctrl
        this.trackDependent(dep.atom, dependentAtom)
        if (dep.watch) {
          if (!dependentAtom) return null
          this.wireWatch(dep, ctrl, dependentAtom)
        }
      } else {
        result[key] = ctrl
        this.trackDependent(dep.atom, dependentAtom)
      }
    }

    for (let i = 0; i < graph.tags.length; i++) {
      const [key, tagExecutor] = graph.tags[i]!
      switch (tagExecutor.mode) {
        case "required": {
          const value = tagExecutor.tag.find(this.tags)
          if (value !== undefined) {
            if (isFlow(value)) return null
            result[key] = value
          } else if (tagExecutor.tag.hasDefault) {
            if (isFlow(tagExecutor.tag.defaultValue)) return null
            result[key] = tagExecutor.tag.defaultValue
          } else {
            return null
          }
          break
        }
        case "optional": {
          const value = tagExecutor.tag.find(this.tags) ?? tagExecutor.tag.defaultValue
          if (isFlow(value)) return null
          result[key] = value
          break
        }
        case "all": {
          const values = tagExecutor.tag.collect(this.tags)
          if (values.some((value) => isFlow(value))) return null
          result[key] = values
          break
        }
      }
    }

    return result
  }

  private tryResolveCurrentTick<T>(atom: Lite.Atom<T>): Promise<T> | null {
    if (this.hasResolvePipeline()) return null

    const entry = this.getOrCreateEntry(atom)
    if (entry.state !== 'idle') return null

    let resolvedDeps: Record<string, unknown> | null = null
    if (atom.deps) {
      const graph = classifyDeps(atom.deps)
      if (!graph.syncable) return null
      resolvedDeps = this.tryResolveSyncDeps(graph, atom)
      if (!resolvedDeps) return null
    }

    entry.state = 'resolving'
    this.emitStateChange('resolving', atom)
    this.notifyEntry(entry as AtomEntry<unknown>, 'resolving')

    const ctx: Lite.ResolveContext = {
      cleanup: (fn, ...params) => entry.cleanups.push({ fn, params }),
      invalidate: () => { this.scheduleInvalidation(atom) },
      scope: this,
      get data() {
        if (!entry.data) entry.data = new ContextDataImpl()
        return entry.data
      },
    }

    const factory = atom.factory as (
      ctx: Lite.ResolveContext,
      deps?: Record<string, unknown>
    ) => MaybePromise<T>

    let value: MaybePromise<T>
    try {
      value = resolvedDeps ? factory(ctx, resolvedDeps) : factory(ctx)
    } catch (err) {
      entry.state = 'failed'
      entry.error = err instanceof Error ? err : new Error(String(err))
      entry.value = undefined
      entry.hasValue = false
      this.emitStateChange('failed', atom)
      this.notifyEntryAll(entry as AtomEntry<unknown>)
      this.handlePostResolveError(atom, entry)
      return Promise.reject(entry.error)
    }

    if (value != null && typeof (value as any).then === 'function') {
      const promise = (value as Promise<T>).then(
        (resolved) => {
          entry.state = 'resolved'
          entry.value = resolved
          entry.hasValue = true
          entry.error = undefined
          entry.resolvedPromise = Promise.resolve(resolved)
          this.emitStateChange('resolved', atom)
          this.notifyEntry(entry as AtomEntry<unknown>, 'resolved')
          this.handlePostResolve(atom, entry)
          return resolved
        },
        (err) => {
          entry.state = 'failed'
          entry.error = err instanceof Error ? err : new Error(String(err))
          entry.value = undefined
          entry.hasValue = false
          this.emitStateChange('failed', atom)
          this.notifyEntryAll(entry as AtomEntry<unknown>)
          this.handlePostResolveError(atom, entry)
          throw entry.error
        }
      )
      this.pending.set(atom, promise as Promise<unknown>)
      return promise.finally(() => { this.pending.delete(atom) })
    }

    entry.state = 'resolved'
    entry.value = value as T
    entry.hasValue = true
    entry.error = undefined
    entry.resolvedPromise = Promise.resolve(value as T)
    this.emitStateChange('resolved', atom)
    this.notifyEntry(entry as AtomEntry<unknown>, 'resolved')
    this.handlePostResolve(atom, entry)

    return entry.resolvedPromise
  }

  private handlePostResolve<T>(atom: Lite.Atom<T>, entry: AtomEntry<T>): void {
    if (entry.pendingInvalidate) {
      entry.pendingInvalidate = false
      this.invalidationChain?.delete(atom)
      this.scheduleInvalidation(atom)
    } else if (entry.pendingSet) {
      this.invalidationChain?.delete(atom)
      this.scheduleInvalidation(atom)
    }
  }

  private handlePostResolveError<T>(atom: Lite.Atom<T>, entry: AtomEntry<T>): void {
    if (entry.pendingInvalidate) {
      entry.pendingInvalidate = false
      this.invalidationChain?.delete(atom)
      this.scheduleInvalidation(atom)
    } else if (entry.pendingSet?.hasValue) {
      this.invalidationChain?.delete(atom)
      this.scheduleInvalidation(atom)
    } else {
      entry.pendingSet = undefined
    }
  }

  resolve<T>(atom: Lite.Atom<T>): Promise<T> {
    if (this.disposed) return Promise.reject(new Error("Scope is disposed"))

    if (!this.initialized) {
      if (!this.ready) return this.resolveAndTrack(atom)
      return this.ready.then(() => this.resolve(atom))
    }

    const entry = this.cache.get(atom) as AtomEntry<T> | undefined
    if (entry?.state === 'resolved') {
      return entry.resolvedPromise ?? (entry.resolvedPromise = Promise.resolve(entry.value as T))
    }

    const pendingPromise = this.pending.get(atom)
    if (pendingPromise) {
      return pendingPromise as Promise<T>
    }

    if (this.resolving.has(atom)) {
      return Promise.reject(new Error("Circular dependency detected"))
    }

    if (this.presets.has(atom)) {
      const presetValue = this.presets.get(atom)
      if (isAtom(presetValue)) {
        return this.resolve(presetValue as Lite.Atom<T>)
      }
      const newEntry = this.getOrCreateEntry(atom)
      newEntry.state = 'resolved'
      newEntry.value = presetValue as T
      newEntry.hasValue = true
      this.emitStateChange('resolved', atom)
      this.notifyEntry(newEntry as AtomEntry<unknown>, 'resolved')
      return Promise.resolve(newEntry.value)
    }

    const syncResult = this.tryResolveCurrentTick(atom)
    if (syncResult) return syncResult

    return this.resolveAndTrack(atom)
  }

  private async resolveAndTrack<T>(atom: Lite.Atom<T>): Promise<T> {
    this.resolving.add(atom)
    const promise = this.doResolve(atom)
    this.pending.set(atom, promise as Promise<unknown>)
    try {
      return await promise
    } finally {
      this.resolving.delete(atom)
      this.pending.delete(atom)
    }
  }

  private async doResolve<T>(atom: Lite.Atom<T>): Promise<T> {
    const entry = this.getOrCreateEntry(atom)

    const wasResolving = entry.state === 'resolving'
    if (!wasResolving) {
      if (entry.cleanups.length > 0) {
        await runCleanupsSafe(entry.cleanups)
        entry.cleanups = []
      }
      entry.state = 'resolving'
      this.emitStateChange('resolving', atom)
      this.notifyEntry(entry as AtomEntry<unknown>, 'resolving')
    }

    const depsResult = this.resolveDepsOptimistic(atom.deps, undefined, atom)
    const resolvedDeps = depsResult != null && typeof (depsResult as any).then === 'function'
      ? await (depsResult as Promise<Record<string, unknown>>)
      : depsResult as Record<string, unknown>

    const ctx: Lite.ResolveContext = {
      cleanup: (fn, ...params) => entry.cleanups.push({ fn, params }),
      invalidate: () => {
        this.scheduleInvalidation(atom)
      },
      scope: this,
      get data() {
        if (!entry.data) {
          entry.data = new ContextDataImpl()
        }
        return entry.data
      },
    }

    const factory = atom.factory as (
      ctx: Lite.ResolveContext,
      deps?: Record<string, unknown>
    ) => MaybePromise<T>

    try {
      let value: T
      if (!this.hasResolvePipeline()) {
        const raw = atom.deps ? factory(ctx, resolvedDeps) : factory(ctx)
        value = raw != null && typeof (raw as any).then === 'function' ? await (raw as Promise<T>) : raw as T
      } else {
        const doResolve = async () => atom.deps ? factory(ctx, resolvedDeps) : factory(ctx)
        const event: Lite.ResolveEvent = { kind: "atom", target: atom as Lite.Atom<unknown>, scope: this, ctx }
        value = await this.applyResolvePipeline(event, doResolve)
      }
      entry.state = 'resolved'
      entry.value = value
      entry.hasValue = true
      entry.error = undefined
      entry.resolvedPromise = Promise.resolve(value)
      this.emitStateChange('resolved', atom)
      this.notifyEntry(entry as AtomEntry<unknown>, 'resolved')
      this.handlePostResolve(atom, entry)

      return value
    } catch (err) {
      entry.state = 'failed'
      entry.error = err instanceof Error ? err : new Error(String(err))
      entry.value = undefined
      entry.hasValue = false
      this.emitStateChange('failed', atom)
      this.notifyEntryAll(entry as AtomEntry<unknown>)
      this.handlePostResolveError(atom, entry)

      throw entry.error
    }
  }

  private hasResolvePipeline(): boolean {
    return this.resolveExts.length > 0
  }

  private async applyResolvePipeline<T>(
    event: Lite.ResolveEvent,
    doResolve: () => Promise<T>
  ): Promise<T> {
    let next = doResolve

    for (let i = this.resolveExts.length - 1; i >= 0; i--) {
      const ext = this.resolveExts[i]!
      const currentNext = next
      next = ext.wrapResolve!.bind(ext, currentNext, event) as () => Promise<T>
    }

    return next()
  }

  resolveDepsOptimistic(
    deps: Record<string, Lite.Dependency> | undefined,
    ctx: Lite.ExecutionContext | undefined,
    dependentAtom: Lite.Atom<unknown> | undefined,
    resourcePath?: Set<Lite.Resource<unknown>>,
    dependentResource?: ResourceDependencyConsumer,
    flowPath: Set<Lite.Flow<unknown, unknown, any, unknown>> = new Set(),
    activationTags: Lite.Tagged<any>[] = [],
  ): Record<string, unknown> | Promise<Record<string, unknown>> {
    if (!deps) return {}

    const graph = classifyDeps(deps)
    const result: Record<string, unknown> = {}
    const parallel: Promise<void>[] = []

    for (let i = 0; i < graph.atoms.length; i++) {
      const [key, dep] = graph.atoms[i]!
      const cachedEntry = this.cache.get(dep)
      if (cachedEntry?.state === 'resolved') {
        result[key] = cachedEntry.value
        this.trackDependent(dep, dependentAtom)
      } else {
        parallel.push(
          this.resolve(dep).then(value => {
            result[key] = value
            this.trackDependent(dep, dependentAtom)
          })
        )
      }
    }

    for (let i = 0; i < graph.flows.length; i++) {
      if (!ctx) throw new Error("Flow deps require an ExecutionContext")
      const [key, dep, options] = graph.flows[i]!
      result[key] = this.createFlowHandle(dep, ctx, options)
      if (!options) {
        const activation = this.activateFlowTree(dep, ctx, flowPath, activationTags)
        if (activation) parallel.push(activation)
      }
    }

    for (let i = 0; i < graph.controllers.length; i++) {
      const [key, dep] = graph.controllers[i]!
      if (!isAtomControllerDep(dep)) {
        if (!ctx) throw new Error("Resource controller deps require an ExecutionContext")
        if (dep.watch && !dep.resolve) throw new Error("Resource controller watch requires resolve: true")
        if (dep.watch && !dependentResource) {
          throw new Error("Resource controller watch is only supported in resource dependencies")
        }
        assertExecutionContextImpl(ctx)
        const ctrl = ctx.controller(dep.resource)
        if (dep.resolve) {
          const found = ctx.findResourceEntry(dep.resource)
          if (found?.entry.state === "resolved") {
            result[key] = ctrl
            if (dep.watch) this.wireResourceWatch(dep, ctrl, dependentResource!)
          } else {
            parallel.push(ctrl.resolve().then(() => {
              result[key] = ctrl
              if (dep.watch) this.wireResourceWatch(dep, ctrl, dependentResource!)
            }))
          }
        } else {
          result[key] = ctrl
        }
        continue
      }

      if (dep.watch) {
        if (!dependentAtom) throw new Error("controller({ watch: true }) is only supported in atom dependencies")
        if (!dep.resolve) throw new Error("controller({ watch: true }) requires resolve: true")
      }
      const ctrl = this.controller(dep.atom)
      if (dep.resolve) {
        const cachedCtrlEntry = this.cache.get(dep.atom)
        if (cachedCtrlEntry?.state === 'resolved') {
          result[key] = ctrl
          this.trackDependent(dep.atom, dependentAtom)
          if (dep.watch) {
            this.wireWatch(dep, ctrl, dependentAtom!)
          }
        } else {
          parallel.push(
            ctrl.resolve().then(() => {
              result[key] = ctrl
              this.trackDependent(dep.atom, dependentAtom)
              if (dep.watch) {
                this.wireWatch(dep, ctrl, dependentAtom!)
              }
            })
          )
        }
      } else {
        result[key] = ctrl
        this.trackDependent(dep.atom, dependentAtom)
      }
    }

    for (let i = 0; i < graph.tags.length; i++) {
      const [key, tagExecutor] = graph.tags[i]!
      switch (tagExecutor.mode) {
        case "required": {
          const activationValue = this.findActivationTag(activationTags, tagExecutor.tag)
          const value = activationTags.length > 0
            ? activationValue !== undefined ? activationValue : ctx?.data.seekTag(tagExecutor.tag)
            : ctx
              ? ctx.data.seekTag(tagExecutor.tag)
            : tagExecutor.tag.find(this.tags)
          if (value !== undefined) {
            result[key] = this.projectTagValue(value, ctx, flowPath, activationTags, parallel)
          } else if (tagExecutor.tag.hasDefault) {
            result[key] = this.projectTagValue(tagExecutor.tag.defaultValue, ctx, flowPath, activationTags, parallel)
          } else {
            throw new Error(`Tag "${tagExecutor.tag.label}" not found while activating "${ctx?.name ?? "scope"}"`)
          }
          break
        }
        case "optional": {
          const activationValue = this.findActivationTag(activationTags, tagExecutor.tag)
          const value = activationTags.length > 0
            ? activationValue !== undefined ? activationValue : ctx?.data.seekTag(tagExecutor.tag)
            : ctx
              ? ctx.data.seekTag(tagExecutor.tag)
            : tagExecutor.tag.find(this.tags)
          result[key] = this.projectTagValue(value ?? tagExecutor.tag.defaultValue, ctx, flowPath, activationTags, parallel)
          break
        }
        case "all": {
          const values = ctx
            ? [
                ...tagExecutor.tag.collect(activationTags),
                ...this.collectFromHierarchy(
                  ctx,
                  tagExecutor.tag,
                  activationTags.some((value) => value.key === tagExecutor.tag.key),
                ),
              ]
            : tagExecutor.tag.collect(this.tags)
          result[key] = values.map((value) => this.projectTagValue(value, ctx, flowPath, activationTags, parallel))
          break
        }
      }
    }

    if (graph.resources.length > 0) {
      if (!ctx) throw new Error("Resource deps require an ExecutionContext")
      const afterParallel = parallel.length > 0
        ? (parallel.length === 1 ? parallel[0]!.then(() => {}) : Promise.all(parallel).then(() => {}))
        : null
      return this.resolveResourceDeps(graph, result, ctx, afterParallel, resourcePath)
    }

    if (parallel.length === 0) return result
    if (parallel.length === 1) return parallel[0]!.then(() => result)
    return Promise.all(parallel).then(() => result)
  }

  private projectTagValue(
    value: unknown,
    ctx: Lite.ExecutionContext | undefined,
    flowPath: Set<Lite.Flow<unknown, unknown, any, unknown>>,
    activationTags: Lite.Tagged<any>[],
    parallel: Promise<void>[]
  ): unknown {
    if (!isFlow(value)) return value
    if (!ctx) throw new Error("Flow deps require an ExecutionContext")
    const activation = this.activateFlowTree(value, ctx, flowPath, activationTags)
    if (activation) parallel.push(activation)
    return this.createFlowHandle(value, ctx)
  }

  private findActivationTag<T>(
    values: Lite.Tagged<any>[],
    target: Lite.Tag<T, boolean>
  ): T | undefined {
    for (let i = 0; i < values.length; i++) {
      if (values[i]!.key === target.key) return values[i]!.value as T
    }
    return undefined
  }

  private activateFlowTree(
    flow: Lite.Flow<unknown, unknown, any, unknown>,
    ctx: Lite.ExecutionContext,
    path: Set<Lite.Flow<unknown, unknown, any, unknown>>,
    inheritedTags: Lite.Tagged<any>[],
    execTags?: Lite.Tagged<any>[]
  ): Promise<void> | undefined {
    if (path.has(flow)) {
      throw new Error(`Circular flow dependency detected: ${flow.name ?? "anonymous"}`)
    }

    const nextPath = new Set(path)
    nextPath.add(flow)
    const presetValue = this.getFlowPreset(flow)
    const localTags = execTags?.length || flow.tags?.length
      ? [
          ...(execTags ?? []),
          ...(flow.tags ?? []).filter((tagged) => !execTags?.some((value) => value.key === tagged.key)),
        ]
      : []
    const activation = presetValue === undefined
      ? this.resolveDepsOptimistic(
          flow.deps,
          ctx,
          undefined,
          undefined,
          undefined,
          nextPath,
          localTags.length > 0 ? [...localTags, ...inheritedTags] : inheritedTags
        )
      : isFlow(presetValue)
        ? this.activateFlowTree(presetValue, ctx, nextPath, inheritedTags, execTags)
        : undefined

    return isPromiseLike(activation) ? Promise.resolve(activation).then(() => {}) : undefined
  }

  private createFlowHandle<Output, Input, Yield>(
    flow: Lite.Flow<Output, Input, any, Yield>,
    ctx: Lite.ExecutionContext,
    defaults?: Lite.FlowControllerOptions<Input>
  ): Lite.FlowHandle<Output, Input, Yield> {
    return {
      flow,
      exec: (...args: Lite.FlowExecArgs<Input>) => {
        return this.execFlowHandle(flow, ctx, this.mergeFlowOptions(defaults, args[0] ?? {}))
      },
      execStream: (...args: Lite.FlowExecArgs<Input>) => {
        return ctx.execStream({ flow, ...this.mergeFlowOptions(defaults, args[0] ?? {}) } as Lite.ExecFlowOptions<Output, Input, Yield>)
      },
      prepare: (...args: Lite.FlowPrepareArgs<Input>) => {
        const options = this.mergeFlowOptions(defaults, args[0] ?? {})
        const preparedOptions = options as Lite.FlowPrepareOptions<Input>
        const preparedCtx = new ExecutionContextImpl(this, {
          parent: ctx,
          boundary: false,
          execName: ctx.name,
          signal: preparedOptions.signal,
        })
        const unregister = ctx.onClose((result, prepared) => prepared.close(result), preparedCtx)
        if (preparedOptions.tags) {
          for (let i = 0; i < preparedOptions.tags.length; i++) {
            preparedCtx.appendTagValue(preparedOptions.tags[i]!.key, preparedOptions.tags[i]!.value)
          }
        }
        const ready = Promise.resolve().then(async () => {
          try {
            await this.activateFlowTree(
              flow as Lite.Flow<unknown, unknown, any, unknown>,
              preparedCtx,
              new Set(),
              [],
              preparedOptions.tags,
            )
          } catch (error) {
            unregister()
            await preparedCtx.close({ ok: false, error })
            throw error
          }
        })
        let consumed = false
        const consume = () => {
          if (consumed) throw new Error("Prepared flow invocations can be consumed only once")
          consumed = true
        }
        return {
          flow,
          options: preparedOptions,
          key: preparedOptions.key,
          ready,
          exec: async () => {
            consume()
            await ready
            try {
              const output = await this.execFlowHandle(flow, preparedCtx, options)
              unregister()
              await preparedCtx.close({ ok: true })
              return output
            } catch (error) {
              unregister()
              await preparedCtx.close({ ok: false, error })
              throw error
            }
          },
          execStream: () => {
            consume()
            return this.execPreparedStream(flow, preparedCtx, options, ready, unregister)
          },
        }
      },
    }
  }

  private execPreparedStream<Output, Input, Yield>(
    flow: Lite.Flow<Output, Input, any, Yield>,
    preparedCtx: ExecutionContextImpl,
    options: Lite.FlowPrepareOptions<Input> | Lite.FlowExecOptions<Input> | {},
    ready: Promise<void>,
    unregister: () => void,
  ): Lite.FlowStream<Yield, Output> {
    let started = false
    let consumed = false
    let settle!: (value: Output) => void
    let fail!: (error: unknown) => void
    const result = new Promise<Output>((resolve, reject) => {
      settle = resolve
      fail = reject
    })
    result.catch(() => {})
    const { key: _key, ...execOptions } = options as Lite.FlowPrepareOptions<Input>

    return {
      get result() {
        if (!started) throw streamResultBeforeStartError()
        return result
      },
      [Symbol.asyncIterator]() {
        if (consumed) throw new Error("execStream() results can be consumed only once.")
        consumed = true
        started = true
        return (async function* () {
          let settled = false
          try {
            await ready
            const stream = preparedCtx.execStream({ flow, ...execOptions } as Lite.ExecFlowOptions<Output, Input, Yield>)
            for await (const value of stream) yield value
            const output = await stream.result
            unregister()
            await preparedCtx.close({ ok: true })
            settle(output)
            settled = true
            return output
          } catch (error) {
            unregister()
            await preparedCtx.close({ ok: false, error })
            fail(error)
            settled = true
            throw error
          } finally {
            if (!settled) {
              const error = new DOMException("Prepared flow stream aborted", "AbortError")
              unregister()
              await preparedCtx.close({ ok: false, error })
              fail(error)
            }
          }
        })()
      },
    }
  }

  private mergeFlowOptions<Input>(
    defaults: Lite.FlowControllerOptions<Input> | undefined,
    options: Lite.FlowPrepareOptions<Input> | Lite.FlowExecOptions<Input> | {}
  ): Lite.FlowPrepareOptions<Input> | Lite.FlowExecOptions<Input> | {} {
    if (!defaults) return options
    const callOptions = options as Lite.FlowPrepareOptions<Input>
    const defaultTags = defaults.tags ?? []
    const callTags = callOptions.tags ?? []
    return {
      ...defaults,
      ...callOptions,
      tags: defaultTags.length > 0 || callTags.length > 0
        ? [...defaultTags, ...callTags]
        : undefined,
    }
  }

  private execFlowHandle<Output, Input>(
    flow: Lite.Flow<Output, Input, any, any>,
    ctx: Lite.ExecutionContext,
    options: Lite.FlowPrepareOptions<Input> | Lite.FlowExecOptions<Input> | {}
  ): Promise<Output> {
    const { key: _key, ...execOptions } = options as Lite.FlowPrepareOptions<Input>
    return ctx.exec({
      flow,
      ...execOptions,
    } as Lite.ExecFlowOptions<Output, Input>)
  }

  private wireWatch(dep: Lite.AtomControllerDep<unknown>, ctrl: Lite.Controller<unknown>, dependentAtom: Lite.Atom<unknown>): void {
    const eq = dep.eq ?? shallowEqual
    let prev = ctrl.get() as unknown
    const unsub = this.on("resolved", dep.atom, () => {
      const next = ctrl.get() as unknown
      if (!eq(prev, next)) {
        this.scheduleInvalidation(dependentAtom)
      }
      prev = next
    })
    this.getEntry(dependentAtom)?.cleanups.push({ fn: unsub, params: [] })
  }

  private wireResourceWatch(
    dep: Lite.ResourceControllerDep<unknown>,
    ctrl: Lite.ResourceController<unknown>,
    dependent: ResourceDependencyConsumer
  ): void {
    const eq = dep.eq ?? shallowEqual
    let prev = ctrl.get()
    const unsub = ctrl.on("resolved", () => {
      const next = ctrl.get()
      if (!eq(prev, next)) {
        void dependent.ownerCtx.release(dependent.resource)
      }
      prev = next
    })
    dependent.entry.cleanups.push({ fn: unsub, params: [] })
  }

  private async resolveResourceDeps(
    graph: DepsGraph,
    result: Record<string, unknown>,
    ctx: Lite.ExecutionContext,
    afterParallel: Promise<void> | null,
    resourcePath?: Set<Lite.Resource<unknown>>,
  ): Promise<Record<string, unknown>> {
    if (afterParallel) await afterParallel
    assertExecutionContextImpl(ctx)

    for (let i = 0; i < graph.resources.length; i++) {
      const [key, resource] = graph.resources[i]!
      const value = await this.resolveResource(resource, ctx, resourcePath)
      result[key] = value
    }

    return result
  }

  async resolveDeps(
    deps: Record<string, Lite.Dependency> | undefined,
    ctx?: Lite.ExecutionContext,
    dependentAtom?: Lite.Atom<unknown>
  ): Promise<Record<string, unknown>> {
    const r = this.resolveDepsOptimistic(deps, ctx, dependentAtom)
    return r != null && typeof (r as any).then === 'function'
      ? r as Promise<Record<string, unknown>>
      : r as Record<string, unknown>
  }

  private collectFromHierarchy<T>(
    ctx: Lite.ExecutionContext,
    tag: Lite.Tag<T, boolean>,
    skipCurrent = false,
  ): T[] {
    const results: T[] = []
    let current: Lite.ExecutionContext | undefined = ctx
    let first = true

    while (current) {
      assertExecutionContextImpl(current)
      if (!first || !skipCurrent) results.push(...current.dataImpl().collectTag(tag))
      first = false
      current = current.parent
    }

    return results
  }

  controller<T>(atom: Lite.Atom<T>): Lite.Controller<T>
  controller<T>(atom: Lite.Atom<T>, options: { resolve: true }): Promise<Lite.Controller<T>>
  controller<T>(atom: Lite.Atom<T>, options?: Lite.ControllerOptions): Lite.Controller<T> | Promise<Lite.Controller<T>>
  controller<T>(atom: Lite.Atom<T>, options?: Lite.ControllerOptions): Lite.Controller<T> | Promise<Lite.Controller<T>> {
    if (this.disposed) throw new Error("Scope is disposed")
    let ctrl = this.controllers.get(atom) as ControllerImpl<T> | undefined
    if (!ctrl) {
      ctrl = new ControllerImpl(atom, this)
      this.controllers.set(atom, ctrl as ControllerImpl<unknown>)
    }
    if (options?.resolve) {
      return ctrl.resolve().then(() => ctrl)
    }
    return ctrl
  }

  select<T, S>(
    atom: Lite.Atom<T>,
    selector: (value: T) => S,
    options?: Lite.SelectOptions<S>
  ): Lite.SelectHandle<S> {
    const ctrl = this.controller(atom)
    const eq = options?.eq ?? Object.is
    return new SelectHandleImpl(ctrl, selector, eq)
  }

  changes<T>(atom: Lite.Atom<T>): AsyncIterable<T>
  changes<T>(atom: Lite.Atom<T>, options: Lite.ChangesOptions): AsyncIterable<Lite.AtomChange<T>>
  changes<T>(handle: Lite.SelectHandle<T>): AsyncIterable<T>
  changes<T>(
    target: Lite.Atom<T> | Lite.SelectHandle<T>,
    options?: Lite.ChangesOptions
  ): AsyncIterable<T> | AsyncIterable<Lite.AtomChange<T>> {
    if (this.disposed) throw new Error("Scope is disposed")
    if (!isAtom(target)) return this.selectChanges(target)
    return options ? this.atomChanges(target, options) : this.atomChanges(target)
  }

  private atomChanges<T>(atom: Lite.Atom<T>): Latest<T>
  private atomChanges<T>(atom: Lite.Atom<T>, options: Lite.ChangesOptions): Latest<Lite.AtomChange<T>>
  private atomChanges<T>(atom: Lite.Atom<T>, options?: Lite.ChangesOptions): Latest<T | Lite.AtomChange<T>> {
    const presetValue = this.presets.get(atom)
    if (isAtom(presetValue)) {
      return options ? this.atomChanges(presetValue as Lite.Atom<T>, options) : this.atomChanges(presetValue as Lite.Atom<T>)
    }

    const stream = latest<T | Lite.AtomChange<T>>()
    const emit = () => {
      const entry = this.cache.get(atom) as AtomEntry<T> | undefined
      if (!entry) return
      if (options?.states) {
        if (entry.state === "resolving") stream.push({ state: "resolving" })
        if (entry.state === "resolved" && entry.hasValue) stream.push({ state: "resolved", value: entry.value as T })
        if (entry.state === "failed" && entry.error) stream.push({ state: "failed", error: entry.error })
        return
      }
      if (entry.state === "resolved" && entry.hasValue) stream.push(entry.value as T)
      if (entry.state === "failed" && entry.error) stream.fail(entry.error)
    }
    const unsubs = [
      this.on("resolving", atom, emit),
      this.on("resolved", atom, emit),
      this.on("failed", atom, emit),
      this.onDispose((target) => target.close(), stream),
    ]
    stream.onClose((subscriptions) => {
      for (let i = subscriptions.length - 1; i >= 0; i--) subscriptions[i]!()
    }, unsubs)
    const entry = this.cache.get(atom) as AtomEntry<T> | undefined
    if (entry?.state === "resolved" || entry?.state === "failed" || entry?.state === "resolving") {
      emit()
    }
    if (!entry || entry.state === "idle") {
      void this.resolve(atom).catch(() => {})
    }
    return stream
  }

  private selectChanges<T>(handle: Lite.SelectHandle<T>): Latest<T> {
    const stream = latest<T>()
    stream.push(handle.get())
    const unsub = handle.subscribe((target, source) => target.push(source.get()), stream, handle)
    const offDispose = this.onDispose((target) => target.close(), stream)
    stream.onClose((dispose, unsubscribe) => {
      dispose()
      unsubscribe()
    }, offDispose, unsub)
    return stream
  }

  resolveStream<T>(atom: Lite.Atom<StreamSource<T>>): AsyncIterable<T> {
    if (this.disposed) throw new Error("Scope is disposed")
    const presetValue = this.presets.get(atom as Lite.Atom<unknown>)
    if (isAtom(presetValue)) return this.resolveStream(presetValue as Lite.Atom<StreamSource<T>>)
    const hub = this.getStreamHub(atom)
    const stream = latest<T>()
    hub.views.add(stream)
    stream.onClose((target, view) => {
      target.views.delete(view)
    }, hub, stream)
    this.ensureStreamHub(hub)
    return stream
  }

  async drain<T>(atom: Lite.Atom<StreamSource<T>>, options?: Lite.DrainOptions): Promise<T[]> {
    const take = options?.take
    if (take !== undefined && take <= 0) return []
    const values: T[] = []
    const iterator = this.resolveStream(atom)[Symbol.asyncIterator]()
    while (take === undefined || values.length < take) {
      const result = await iterator.next()
      if (result.done) return values
      values.push(result.value)
    }
    await iterator.return?.()
    return values
  }

  private getStreamHub<T>(atom: Lite.Atom<StreamSource<T>>): StreamHub<T> {
    const cached = this.streamHubs.get(atom as Lite.Atom<unknown>) as StreamHub<T> | undefined
    if (cached) return cached
    const hub: StreamHub<T> = {
      atom,
      views: new Set(),
      unsubs: [],
      version: 0,
    }
    hub.unsubs = [
      this.on("resolving", atom as Lite.Atom<unknown>, () => {
        void this.stopStreamHub(hub)
      }),
      this.on("resolved", atom as Lite.Atom<unknown>, () => this.driveResolvedStreamHub(hub)),
      this.on("failed", atom as Lite.Atom<unknown>, () => {
        const entry = this.cache.get(atom as Lite.Atom<unknown>)
        if (entry?.state === "failed" && entry.error) this.finishStreamHub(hub, true, entry.error)
      }),
    ]
    this.streamHubs.set(atom as Lite.Atom<unknown>, hub as StreamHub<unknown>)
    return hub
  }

  private ensureStreamHub<T>(hub: StreamHub<T>): void {
    const entry = this.cache.get(hub.atom as Lite.Atom<unknown>) as AtomEntry<StreamSource<T>> | undefined
    if (entry?.state === "resolved" && entry.hasValue) {
      this.driveStreamHub(hub, entry.value as StreamSource<T>)
      return
    }
    if (entry?.state === "failed" && entry.error) {
      this.finishStreamHub(hub, true, entry.error)
      return
    }
    void this.resolve(hub.atom).then(
      source => this.driveStreamHub(hub, source),
      error => this.finishStreamHub(hub, true, error)
    )
  }

  private driveResolvedStreamHub<T>(hub: StreamHub<T>): void {
    const entry = this.cache.get(hub.atom as Lite.Atom<unknown>) as AtomEntry<StreamSource<T>> | undefined
    if (entry?.state !== "resolved" || !entry.hasValue) return
    this.driveStreamHub(hub, entry.value as StreamSource<T>)
  }

  private driveStreamHub<T>(hub: StreamHub<T>, source: StreamSource<T>): void {
    if (hub.unsubs.length === 0 || Object.is(hub.source, source)) return
    void this.stopStreamHub(hub)
    hub.source = source
    hub.iterator = getAsyncIterator(source)
    const version = ++hub.version
    void this.runStreamHub(hub, hub.iterator, version)
  }

  private async runStreamHub<T>(
    hub: StreamHub<T>,
    iterator: AsyncIterator<T>,
    version: number
  ): Promise<void> {
    try {
      for (;;) {
        const result = await iterator.next()
        if (hub.unsubs.length === 0 || hub.version !== version || hub.iterator !== iterator) return
        if (result.done) {
          this.finishStreamHub(hub, false)
          return
        }
        for (const view of hub.views) view.push(result.value)
      }
    } catch (error) {
      if (hub.unsubs.length > 0 && hub.version === version && hub.iterator === iterator) {
        this.finishStreamHub(hub, true, error)
      }
    }
  }

  private async stopStreamHub<T>(hub: StreamHub<T>): Promise<void> {
    hub.version++
    const iterator = hub.iterator
    hub.iterator = undefined
    hub.source = undefined
    try {
      await iterator?.return?.()
    } catch {}
  }

  private stopStreamHubForAtom(atom: Lite.Atom<unknown>): Promise<void> {
    const hub = this.streamHubs.get(atom)
    return hub ? this.stopStreamHub(hub) : Promise.resolve()
  }

  private releaseStreamHub(atom: Lite.Atom<unknown>): Promise<void> {
    const hub = this.streamHubs.get(atom)
    return hub ? this.releaseStreamHubInstance(hub) : Promise.resolve()
  }

  private async releaseStreamHubInstance<T>(hub: StreamHub<T>): Promise<void> {
    await this.stopStreamHub(hub)
    this.finishStreamHub(hub, false)
  }

  private async releaseStreamHubs(): Promise<void> {
    for (const hub of [...this.streamHubs.values()]) {
      await this.releaseStreamHubInstance(hub)
    }
  }

  private finishStreamHub<T>(hub: StreamHub<T>, failed: boolean, error?: unknown): void {
    if (hub.unsubs.length === 0) return
    hub.version++
    hub.iterator = undefined
    hub.source = undefined
    this.streamHubs.delete(hub.atom as Lite.Atom<unknown>)
    this.cleanupStreamHub(hub)
    const views = [...hub.views]
    hub.views.clear()
    for (let i = 0; i < views.length; i++) {
      if (failed) views[i]!.fail(error)
      else views[i]!.close()
    }
  }

  private cleanupStreamHub<T>(hub: StreamHub<T>): void {
    for (let i = hub.unsubs.length - 1; i >= 0; i--) hub.unsubs[i]!()
    hub.unsubs = []
  }

  getFlowPreset<O, I, Y>(flow: Lite.Flow<O, I, any, Y>): Lite.PresetValue<O, I, Y> | undefined {
    return this.presets.get(flow as Lite.Flow<unknown, unknown, any, unknown>) as Lite.PresetValue<O, I, Y> | undefined
  }

  resolveResource<T>(
    resource: Lite.Resource<T>,
    receiverCtx: ExecutionContextImpl,
    resourcePath?: Set<Lite.Resource<unknown>>
  ): Promise<T> {
    if (this.disposed) return Promise.reject(new Error("Scope is disposed"))

    try {
      receiverCtx.assertOpen()
    } catch (error) {
      return Promise.reject(error)
    }

    if (resourcePath?.has(resource as Lite.Resource<unknown>)) {
      return Promise.reject(new Error(`Circular resource dependency detected: ${resource.name ?? "anonymous"}`))
    }

    const found = receiverCtx.findResourceEntry(resource)
    if (found) {
      const entry = found.entry as ResourceEntry<T>
      if (entry.state === "resolved") return Promise.resolve(entry.value as T)
      if (entry.state === "failed") return Promise.reject(entry.error!)
      if (entry.promise) return entry.promise
    }

    const ownerCtx = receiverCtx.resourceOwner(resource)
    try {
      ownerCtx.assertOpen()
    } catch (error) {
      return Promise.reject(error)
    }
    const entry = ownerCtx.createResourceEntry(resource)
    const nextPath = new Set(resourcePath)
    nextPath.add(resource as Lite.Resource<unknown>)

    entry.state = "resolving"
    entry.promise = this.resolveResourceValue(resource, receiverCtx, ownerCtx, entry, nextPath).then(
      (value) => {
        if (ownerCtx.getLocalResourceEntry(resource) !== entry) {
          throw new Error("Resource is released")
        }
        entry.state = "resolved"
        entry.value = value
        entry.hasValue = true
        entry.error = undefined
        entry.promise = undefined
        ownerCtx.emitResourceState(resource, "resolved")
        return value
      },
      async (error) => {
        if (ownerCtx.getLocalResourceEntry(resource) === entry) {
          entry.state = "failed"
          entry.error = error instanceof Error ? error : new Error(String(error))
          entry.value = undefined
          entry.hasValue = false
          entry.promise = undefined
          if (entry.cleanups.length > 0) {
            await runCleanupsSafe(entry.cleanups)
            entry.cleanups = []
          }
          ownerCtx.emitResourceState(resource, "failed")
          throw entry.error
        }
        throw error instanceof Error ? error : new Error(String(error))
      }
    )
    ownerCtx.emitResourceState(resource, "resolving")

    return entry.promise
  }

  private async resolveResourceValue<T>(
    resource: Lite.Resource<T>,
    receiverCtx: ExecutionContextImpl,
    ownerCtx: ExecutionContextImpl,
    entry: ResourceEntry<T>,
    resourcePath: Set<Lite.Resource<unknown>>,
  ): Promise<T> {
    if (this.presets.has(resource)) {
      const presetValue = this.presets.get(resource)
      if (isResource(presetValue)) {
        return this.resolveResource(presetValue as Lite.Resource<T>, receiverCtx, resourcePath)
      }
      if (typeof presetValue === "function") {
        const factory = presetValue as (ctx: Lite.ResourceContext) => MaybePromise<T>
        if (!this.hasResolvePipeline()) {
          return ownerCtx.runResourceFactory(resource, entry, factory)
        }
        const resourceCtx = ownerCtx.createResourceContext(resource, entry)
        const event: Lite.ResolveEvent = { kind: "resource", target: resource, ctx: resourceCtx }
        const doResolve = async () => factory(resourceCtx)
        return this.applyResolvePipeline(event, doResolve)
      }
      return presetValue as T
    }

    const depsResult = this.resolveDepsOptimistic(
      resource.deps,
      ownerCtx,
      undefined,
      resourcePath,
      { ownerCtx, resource: resource as Lite.Resource<unknown>, entry: entry as ResourceEntry<unknown> }
    )
    const resourceDeps = depsResult != null && typeof (depsResult as any).then === 'function'
      ? await (depsResult as Promise<Record<string, unknown>>)
      : depsResult as Record<string, unknown>

    const factory = resource.factory as (
      ctx: Lite.ResourceContext,
      deps?: Record<string, unknown>
    ) => MaybePromise<T>

    if (!this.hasResolvePipeline()) {
      return ownerCtx.runResourceFactory(resource, entry, (ctx) => resource.deps ? factory(ctx, resourceDeps) : factory(ctx))
    }
    const resourceCtx = ownerCtx.createResourceContext(resource, entry)
    const event: Lite.ResolveEvent = { kind: "resource", target: resource, ctx: resourceCtx }
    const doResolve = async () => resource.deps ? factory(resourceCtx, resourceDeps) : factory(resourceCtx)
    return this.applyResolvePipeline(event, doResolve)
  }

  invalidate<T>(atom: Lite.Atom<T>): void {
    const entry = this.cache.get(atom)
    if (!entry) return

    if (entry.state === 'idle') return

    if (entry.state === 'resolving') {
      entry.pendingInvalidate = true
      return
    }

    this.scheduleInvalidation(atom)
  }

  scheduleSet<T>(atom: Lite.Atom<T>, value: T, cachedEntry?: AtomEntry<T>): void {
    const entry = cachedEntry ?? (this.cache.get(atom) as AtomEntry<T> | undefined)
    if (!entry || entry.state === 'idle') {
      throw new Error("Atom not resolved")
    }
    if (entry.state === 'failed' && entry.error) {
      throw entry.error
    }

    if (entry.state === 'resolving') {
      entry.pendingSet = { hasValue: true, value, updates: [] }
      return
    }

    entry.value = value
    entry.state = 'resolved'
    entry.hasValue = true
    entry.error = undefined
    entry.pendingInvalidate = false
    entry.resolvedPromise = undefined
    if (this.stateListeners.size) this.emitStateChange('resolved', atom)
    this.notifyEntry(entry as AtomEntry<unknown>, 'resolved')
  }

  scheduleUpdate<T>(
    atom: Lite.Atom<T>,
    fn: (prev: T) => T,
    cachedEntry?: AtomEntry<T>
  ): void {
    const entry = cachedEntry ?? (this.cache.get(atom) as AtomEntry<T> | undefined)
    if (!entry || entry.state === 'idle') {
      throw new Error("Atom not resolved")
    }
    if (entry.state === 'failed' && entry.error) {
      throw entry.error
    }

    if (entry.state === 'resolving') {
      const pending = entry.pendingSet ?? { hasValue: false, updates: [] }
      pending.updates.push({ fn })
      entry.pendingSet = pending
      return
    }

    entry.value = fn(entry.value as T)
    entry.state = 'resolved'
    entry.hasValue = true
    entry.error = undefined
    entry.pendingInvalidate = false
    entry.resolvedPromise = undefined
    if (this.stateListeners.size) this.emitStateChange('resolved', atom)
    this.notifyEntry(entry as AtomEntry<unknown>, 'resolved')
  }

  private doInvalidateSequential<T>(atom: Lite.Atom<T>): void | Promise<void> {
    const entry = this.cache.get(atom) as AtomEntry<T> | undefined
    if (!entry) return

    const previousValue = entry.value
    const pendingSet = entry.pendingSet
    entry.pendingSet = undefined

    if (pendingSet) {
      entry.value = applyUpdates(
        pendingSet.hasValue ? pendingSet.value as T : previousValue as T,
        pendingSet.updates,
      )
      entry.state = 'resolved'
      entry.hasValue = true
      entry.error = undefined
      entry.pendingInvalidate = false
      entry.resolvedPromise = undefined
      if (this.stateListeners.size) this.emitStateChange('resolved', atom)
      this.notifyEntry(entry as AtomEntry<unknown>, 'resolved')
      return
    }

    if (!this.invalidationChain) this.invalidationChain = new Set()
    if (this.invalidationChain.has(atom)) {
      const chainAtoms = Array.from(this.invalidationChain)
      chainAtoms.push(atom)
      const path = chainAtoms
        .map(a => a.factory?.name || "<anonymous>")
        .join(" → ")
      throw new Error(`Infinite invalidation loop detected: ${path}`)
    }
    this.invalidationChain.add(atom)
    return this.doInvalidateAsync(atom, entry, previousValue)
  }

  private async doInvalidateAsync<T>(atom: Lite.Atom<T>, entry: AtomEntry<T>, previousValue: T | undefined): Promise<void> {
    if (this.streamHubs.has(atom as Lite.Atom<unknown>)) await this.stopStreamHubForAtom(atom as Lite.Atom<unknown>)

    if (entry.cleanups.length > 0) {
      await runCleanupsSafe(entry.cleanups)
      entry.cleanups = []
    }

    entry.state = "resolving"
    entry.value = previousValue
    entry.error = undefined
    entry.pendingInvalidate = false
    this.pending.delete(atom)
    this.resolving.delete(atom)
    this.emitStateChange("resolving", atom)
    this.notifyEntry(entry as AtomEntry<unknown>, "resolving")

    try {
      await this.resolve(atom)
    } catch (e) {
      if (!entry.pendingSet && !entry.pendingInvalidate) throw e
    }
  }

  async release<T>(atom: Lite.Atom<T>): Promise<void> {
    const entry = this.cache.get(atom)
    if (!entry) return

    if (this.streamHubs.has(atom as Lite.Atom<unknown>)) await this.releaseStreamHub(atom as Lite.Atom<unknown>)

    if (entry.gcScheduled) {
      clearTimeout(entry.gcScheduled)
      entry.gcScheduled = null
    }

    if (entry.cleanups.length > 0) await runCleanupsSafe(entry.cleanups)

    if (atom.deps) {
      for (const key in atom.deps) {
        const dep = atom.deps[key]!
        const depAtom = isControllerDep(dep) && isAtomControllerDep(dep) ? dep.atom : dep
        if (!isAtom(depAtom)) continue
        this.cache.get(depAtom)?.dependents.delete(atom)
        this.maybeScheduleGCEntry(depAtom)
      }
    }

    this.notifyEntryAll(entry as AtomEntry<unknown>)

    const ctrl = this.controllers.get(atom) as ControllerImpl<unknown> | undefined
    ctrl?._invalidateEntryCache()

    this.cache.delete(atom)
    this.controllers.delete(atom)

    for (const [state, stateMap] of this.stateListeners) {
      stateMap.delete(atom)
      if (stateMap.size === 0) this.stateListeners.delete(state)
    }
  }

  async dispose(): Promise<void> {
    if (this.chainPromise) {
      try { await this.chainPromise } catch {}
    }

    this.disposed = true
    if (this.streamHubs.size > 0) await this.releaseStreamHubs()
    this.emitDispose()

    this.invalidationQueue.length = 0
    this.invalidationQueued.clear()
    this.invalidationChain = null
    this.chainPromise = null

    for (const ext of this.extensions) {
      if (ext.dispose) {
        await ext.dispose(this)
      }
    }

    for (const entry of this.cache.values()) {
      if (entry.gcScheduled) {
        clearTimeout(entry.gcScheduled)
        entry.gcScheduled = null
      }
    }

    const atoms = Array.from(this.cache.keys())
    for (const atom of atoms) {
      await this.release(atom as Lite.Atom<unknown>)
    }
  }

  async flush(): Promise<void> {
    if (this.chainPromise) {
      await this.chainPromise
    }
    if (this.chainError !== null) {
      const error = this.chainError
      this.chainError = null
      throw error
    }
  }

  run<Output, Input, Yield = never>(options: Lite.ExecFlowOptions<Output, Input, Yield> & {
    deps?: never
    fn?: never
    params?: never
  }): Promise<Output>
  run<
    const Args extends unknown[],
    Result,
  >(options: Lite.ExecOptions<Args, Result>): Promise<Awaited<Result>>
  run<
    const D extends Record<string, Lite.ExecutionDependency>,
    const Args extends unknown[],
    Result,
  >(options: Lite.ExecDepsOptions<D, Args, Result>): Promise<Awaited<Result>>
  async run(options: ExecFlowRuntimeOptions | ExecRuntimeOptions | ExecDepsRuntimeOptions): Promise<unknown> {
    const ctx = this.createContext(options.tags || options.signal
      ? { tags: options.tags, signal: options.signal }
      : undefined) as ExecutionContextImpl
    try {
      let execution: ExecFlowRuntimeOptions | ExecRuntimeOptions | ExecDepsRuntimeOptions
      if ("flow" in options && options.flow !== undefined) {
        execution = { ...options, tags: undefined, signal: undefined, blockedTags: options.tags }
      } else {
        execution = { ...options, tags: undefined, signal: undefined }
      }
      const output = assertNoReturnedStream(await ctx.exec(execution))
      await ctx.close({ ok: true })
      return output
    } catch (error) {
      await ctx.close({ ok: false, error })
      throw error
    }
  }

  runStream<Output, Yield, Input>(options: Lite.ExecFlowOptions<Output, Input, Yield>): Lite.FlowStream<Yield, Output>
  runStream(options: ExecFlowRuntimeOptions): Lite.FlowStream<unknown, unknown>
  runStream(options: ExecFlowRuntimeOptions): Lite.FlowStream<unknown, unknown> {
    let consumed = false
    let started = false
    let settleResult!: (value: unknown) => void
    let failResult!: (error: unknown) => void
    const result = new Promise<unknown>((resolve, reject) => {
      settleResult = resolve
      failResult = reject
    })
    result.catch(() => {})
    const owner = this

    return {
      get result() {
        if (!started) throw streamResultBeforeStartError()
        return result
      },
      [Symbol.asyncIterator]() {
        if (consumed) throw new Error("runStream() results can be consumed only once.")
        consumed = true
        return (async function* () {
          started = true
          let ctx: ExecutionContextImpl | undefined
          let closed = false
          try {
            ctx = owner.createContext(options.tags || options.signal
              ? { tags: options.tags, signal: options.signal }
              : undefined) as ExecutionContextImpl
            const stream = ctx.execStream({
              ...options,
              tags: undefined,
              signal: undefined,
              blockedTags: options.tags,
            })
            for await (const value of stream) yield value
            const output = await stream.result
            await ctx.close({ ok: true })
            closed = true
            settleResult(output)
            return output
          } catch (error) {
            try {
              await ctx?.close({ ok: false, error })
            } finally {
              closed = true
              failResult(error)
            }
            throw error
          } finally {
            if (!closed && ctx) {
              const error = new DOMException("Flow stream aborted", "AbortError")
              ctx.abort(error)
              try {
                await ctx.close({ ok: false, error })
              } finally {
                failResult(error)
              }
            }
          }
        })()
      },
    } as Lite.FlowStream<unknown, unknown>
  }

  createContext(options?: Lite.CreateContextOptions): Lite.ExecutionContext {
    if (this.disposed) throw new Error("Scope is disposed")
    assertCreateContextOptions(options)
    if (options && "parent" in options && options.parent !== undefined) {
      assertExecutionContextImpl(options.parent)
      options.parent.assertOpen()
      if (options.parent.scope !== this) {
        throw new Error("createContext() parent must belong to the same scope")
      }
    }
    const ctx = new ExecutionContextImpl(this, options)

    const ctxTags = options?.tags
    if (ctxTags && ctxTags.length > 0) {
      for (let i = 0; i < ctxTags.length; i++) {
        ctx.appendTagValue(ctxTags[i]!.key, ctxTags[i]!.value)
      }
    }

    if (this.tags.length > 0) {
      const blocked = new Set(this.tags.filter((tagged) => ctx.data.seekHas(tagged.key)).map((tagged) => tagged.key))
      for (let i = 0; i < this.tags.length; i++) {
        if (!blocked.has(this.tags[i]!.key)) ctx.appendTagValue(this.tags[i]!.key, this.tags[i]!.value)
      }
    }

    return ctx
  }
}

function assertCreateContextOptions(options: unknown): asserts options is Lite.CreateContextOptions | undefined {
  if (options === undefined) return
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("createContext() expects { tags, parent, signal }")
  }

  const record = options as Record<string, unknown>
  const invalidKey = Object.keys(record).find((key) => key !== "tags" && key !== "parent" && key !== "signal")
  if (invalidKey) {
    throw new Error(`createContext() expects { tags, parent, signal }; received "${invalidKey}"`)
  }
  if (record["tags"] !== undefined && !Array.isArray(record["tags"])) {
    throw new Error("createContext() expects { tags, parent, signal }")
  }
}

class ExecutionContextImpl implements Lite.ExecutionContext {
  private cleanups: CloseCleanup[] = []
  private resources: Map<Lite.Resource<unknown>, ResourceEntry<unknown>> | undefined
  private resourceListeners: Map<Lite.Resource<unknown>, ResourceListeners> | undefined
  private resourceControllers: Map<Lite.Resource<unknown>, ResourceControllerImpl<unknown>> | undefined
  private descendants = new Set<Promise<unknown>>()
  private activeIterators = new Set<AsyncIterator<unknown, unknown, unknown>>()
  private children = new Set<ExecutionContextImpl>()
  private readonly baselineMode: boolean
  private abortController: AbortController | undefined
  private abortReason: unknown = pendingAbort
  private signalOverride: AbortSignal | undefined
  private closePromise: Promise<void> | undefined
  private closed = false
  private readonly _input: unknown
  private _data: ContextDataImpl | undefined
  private readonly _execName: string | undefined
  private readonly _flowName: string | undefined
  private readonly boundary: boolean
  readonly parent: Lite.ExecutionContext | undefined

  constructor(
    readonly scope: ScopeImpl,
    options?: Lite.CreateContextOptions & {
      parent?: Lite.ExecutionContext
      input?: unknown
      execName?: string
      flowName?: string
      boundary?: boolean
      signal?: AbortSignal
    }
  ) {
    this.parent = options?.parent
    this._input = options?.input
    this._execName = options?.execName
    this._flowName = options?.flowName
    this.boundary = options?.boundary ?? true
    if (this.parent) assertExecutionContextImpl(this.parent)
    this.baselineMode = options?.signal !== undefined || (this.parent?.baselineMode ?? false)
    if (this.baselineMode) {
      this.abortController = new AbortController()
      const signals = [this.abortController.signal]
      if (this.parent) signals.push(this.parent.signal)
      if (options?.signal) signals.push(options.signal)
      this.signalOverride = signals.length === 1 ? signals[0]! : combineAbortSignals(signals)
    }
    if (this.parent) {
      this.parent.children.add(this)
      if (!this.baselineMode && this.parent.abortReason !== pendingAbort) {
        this.captureAbort(this.parent.abortReason)
      }
    }
  }

  get input(): unknown {
    return this._input
  }

  get name(): string | undefined {
    return this._execName ?? this._flowName
  }

  get signal(): AbortSignal {
    if (this.signalOverride) return this.signalOverride
    if (!this.abortController) {
      this.abortController = new AbortController()
      if (this.abortReason !== pendingAbort) this.abortController.abort(this.abortReason)
    }
    return this.abortController.signal
  }

  get data(): Lite.ContextData {
    if (!this._data) {
      this._data = new ContextDataImpl(this.parent?.data)
    }
    return this._data
  }

  dataImpl(): ContextDataImpl {
    void this.data
    return this._data!
  }

  appendTagValue(key: symbol, value: unknown): void {
    this.dataImpl().appendTagValue(key, value)
  }

  assertOpen(): void {
    if (this.closed) {
      throw new Error("ExecutionContext is closed")
    }
  }

  fail(fault: unknown): never {
    throw new FlowFault(fault, this.name)
  }

  resourceOwner(resource?: Lite.Resource<unknown>): ExecutionContextImpl {
    if (resource?.ownership === "current") return this
    let owner: ExecutionContextImpl = this
    while (!owner.boundary && owner.parent) {
      assertExecutionContextImpl(owner.parent)
      owner = owner.parent
    }
    return owner
  }

  findResourceEntry<T>(resource: Lite.Resource<T>): { owner: ExecutionContextImpl; entry: ResourceEntry<T> } | undefined {
    let current: ExecutionContextImpl | undefined = this
    while (current) {
      const entry = current.resources?.get(resource as Lite.Resource<unknown>) as ResourceEntry<T> | undefined
      if (entry) return { owner: current, entry }
      if (current.boundary) return undefined
      if (!current.parent) return undefined
      assertExecutionContextImpl(current.parent)
      current = current.parent
    }
    return undefined
  }

  createResourceEntry<T>(resource: Lite.Resource<T>): ResourceEntry<T> {
    const entry: ResourceEntry<T> = {
      state: "idle",
      hasValue: false,
      cleanups: [],
    }
    this.resources ??= new Map()
    this.resources.set(resource as Lite.Resource<unknown>, entry as ResourceEntry<unknown>)
    return entry
  }

  getLocalResourceEntry<T>(resource: Lite.Resource<T>): ResourceEntry<T> | undefined {
    return this.resources?.get(resource as Lite.Resource<unknown>) as ResourceEntry<T> | undefined
  }

  controller<T>(resource: Lite.Resource<T>): Lite.ResourceController<T> {
    let ctrl = this.resourceControllers?.get(resource as Lite.Resource<unknown>) as ResourceControllerImpl<T> | undefined
    if (!ctrl) {
      ctrl = new ResourceControllerImpl(resource, this)
      this.resourceControllers ??= new Map()
      this.resourceControllers.set(
        resource as Lite.Resource<unknown>,
        ctrl as ResourceControllerImpl<unknown>
      )
    }
    return ctrl
  }

  private bindLatestToContextClose<T>(stream: Latest<T>): Latest<T> {
    stream.onClose(this.onClose((_result, target) => target.close(), stream))
    return stream
  }

  changes<T>(atom: Lite.Atom<T>): AsyncIterable<T>
  changes<T>(atom: Lite.Atom<T>, options: Lite.ChangesOptions): AsyncIterable<Lite.AtomChange<T>>
  changes<T>(handle: Lite.SelectHandle<T>): AsyncIterable<T>
  changes<T>(
    target: Lite.Atom<T> | Lite.SelectHandle<T>,
    options?: Lite.ChangesOptions
  ): AsyncIterable<T> | AsyncIterable<Lite.AtomChange<T>> {
    this.assertOpen()
    const iterable = isAtom(target)
      ? (options ? this.scope.changes(target, options) : this.scope.changes(target))
      : this.scope.changes(target)
    const stream = this.bindLatestToContextClose(iterable as unknown as Latest<T | Lite.AtomChange<T>>)
    return stream as unknown as AsyncIterable<T> | AsyncIterable<Lite.AtomChange<T>>
  }

  resolveStream<T>(atom: Lite.Atom<StreamSource<T>>): AsyncIterable<T> {
    this.assertOpen()
    return this.bindLatestToContextClose(this.scope.resolveStream(atom) as Latest<T>)
  }

  private getResourceListeners(resource: Lite.Resource<unknown>): ResourceListeners {
    let listeners = this.resourceListeners?.get(resource)
    if (!listeners) {
      listeners = {
        idle: new Set(),
        resolving: new Set(),
        resolved: new Set(),
        failed: new Set(),
        all: new Set(),
      }
      this.resourceListeners ??= new Map()
      this.resourceListeners.set(resource, listeners)
    }
    return listeners
  }

  addResourceListener<Args extends unknown[]>(
    resource: Lite.Resource<unknown>,
    event: Lite.ResourceControllerEvent,
    listener: (...args: Args) => void,
    params: Args
  ): () => void {
    const owner = this.findResourceEntry(resource)?.owner ?? this.resourceOwner(resource)
    const listeners = owner.getResourceListeners(resource)
    const set = event === "*" ? listeners.all : listeners[event]
    const registered = bindListener(listener, params)
    set.add(registered)
    return () => {
      set.delete(registered)
    }
  }

  emitResourceState(resource: Lite.Resource<unknown>, state: AtomState): void {
    const listeners = this.resourceListeners?.get(resource)
    if (!listeners) return
    notifyListeners(listeners[state])
    notifyListeners(listeners.all)
  }

  runResourceFactory<T>(
    resource: Lite.Resource<unknown>,
    entry: ResourceEntry<unknown>,
    factory: (ctx: Lite.ResourceContext) => MaybePromise<T>
  ): MaybePromise<T> {
    return factory(this.createResourceContext(resource, entry))
  }

  createResourceContext(
    resource: Lite.Resource<unknown>,
    entry: ResourceEntry<unknown>
  ): Lite.ResourceContext {
    const owner = this
    const resourceCtx = {
      get input() { return owner.input },
      get name() { return owner.name },
      get scope() { return owner.scope },
      get parent() { return owner.parent },
      get signal() { return owner.signal },
      get data() { return owner.data },
      exec: owner.exec.bind(owner) as Lite.ResourceContext["exec"],
      execStream: owner.execStream.bind(owner) as Lite.ResourceContext["execStream"],
      resolve: owner.resolve.bind(owner) as Lite.ResourceContext["resolve"],
      release: owner.release.bind(owner) as Lite.ResourceContext["release"],
      controller: owner.controller.bind(owner),
      changes: owner.changes.bind(owner) as Lite.ResourceContext["changes"],
      resolveStream: owner.resolveStream.bind(owner),
      onClose: owner.onClose.bind(owner) as Lite.ResourceContext["onClose"],
      close: owner.close.bind(owner),
      fail: owner.fail.bind(owner),
      cleanup<Args extends unknown[]>(
        fn: (...args: Args) => MaybePromise<void>,
        ...params: Args
      ) {
        if (owner.getLocalResourceEntry(resource) !== entry) {
          throw new Error("Resource is released")
        }
        entry.cleanups.push({ fn, params })
      },
    }
    return resourceCtx as Lite.ResourceContext
  }

  resolve<T>(target: Lite.Atom<T>): Promise<T>
  resolve<T>(target: Lite.Resource<T>): Promise<T>
  resolve<T>(target: Lite.Atom<T> | Lite.Resource<T>): Promise<T> {
    try {
      this.assertOpen()
    } catch (error) {
      return Promise.reject(error)
    }
    if (isAtom(target)) return this.scope.resolve(target)
    if (isResource(target)) return this.scope.resolveResource(target, this)
    return Promise.reject(new Error("ExecutionContext can only resolve atoms and resources"))
  }

  async release<T>(resource: Lite.Resource<T>): Promise<void> {
    this.assertOpen()
    const entry = this.resources?.get(resource as Lite.Resource<unknown>)
    if (!entry) return
    this.resources!.delete(resource as Lite.Resource<unknown>)
    if (entry.cleanups.length > 0) {
      await runCleanupsSafe(entry.cleanups)
      entry.cleanups = []
    }
    this.emitResourceState(resource, "idle")
  }

  exec(options: ExecFlowRuntimeOptions | ExecRuntimeOptions | ExecDepsRuntimeOptions): Promise<unknown> {
    try {
      this.assertOpen()
    } catch (error) {
      return Promise.reject(error)
    }
    return this.trackDescendant(this.runExec(options))
  }

  private async runExec(options: ExecFlowRuntimeOptions | ExecRuntimeOptions | ExecDepsRuntimeOptions): Promise<unknown> {
    if ("flow" in options) {
      const invocation = this.createChildInvocation(options)
      const { flow, presetValue, childCtx, streaming } = isPromiseLike(invocation)
        ? await invocation
        : invocation
      const unregisterStreaming = streaming ? registerStreamingExec(flow, childCtx) : undefined
      try {
        const runFlow = async () => typeof presetValue === 'function'
          ? await childCtx.execPresetFn(presetValue as (ctx: Lite.ExecutionContext) => unknown, flow)
          : await childCtx.execFlowInternal(flow)
        const result = await (this.scope.execExts.length === 0
          ? runFlow()
          : childCtx.applyExecPipeline(flow, runFlow))
        await childCtx.close({ ok: true })
        return result
      } catch (error) {
        await childCtx.close({ ok: false, error })
        throw error
      } finally {
        unregisterStreaming?.()
      }
    } else {
      const childCtx = new ExecutionContextImpl(this.scope, {
        parent: this,
        execName: options.name,
        flowName: options.fn.name || undefined,
        input: options.params,
        boundary: false,
        signal: options.signal
      })

      this.seedTags(childCtx, options.tags)

      try {
        const runFn = async () => await childCtx.execInlineInternal(options)
        const result = await (this.scope.execExts.length === 0
          ? runFn()
          : childCtx.applyExecPipeline(options.fn, runFn))
        await childCtx.close({ ok: true })
        return result
      } catch (error) {
        await childCtx.close({ ok: false, error })
        throw error
      }
    }
  }

  execStream<Output, Yield, Input>(options: Lite.ExecFlowOptions<Output, Input, Yield>): Lite.FlowStream<Yield, Output>
  execStream(options: ExecFlowRuntimeOptions): Lite.FlowStream<unknown, unknown>
  execStream(options: ExecFlowRuntimeOptions): Lite.FlowStream<unknown, unknown> {
    this.assertOpen()

    let consumed = false
    let started = false
    let settleResult: (value: unknown) => void
    let failResult: (error: unknown) => void

    const result = new Promise<unknown>((resolve, reject) => {
      settleResult = resolve
      failResult = reject
    })
    result.catch(() => {})

    const start = () => {
      started = true
      owner.trackDescendant(result)
    }
    const owner = this

    return {
      get result() {
        if (!started) throw streamResultBeforeStartError()
        return result
      },
      [Symbol.asyncIterator]() {
        if (consumed) throw new Error("execStream() results can be consumed only once.")
        consumed = true
        const iterator = owner.iterateExecStream(options, result, settleResult!, failResult!, start)
        owner.activeIterators.add(iterator)
        return {
          async next(value?: unknown) {
            try {
              const step = await iterator.next(value)
              if (step.done) owner.activeIterators.delete(iterator)
              return step
            } catch (error) {
              owner.activeIterators.delete(iterator)
              throw error
            }
          },
          async return(value?: unknown) {
            owner.activeIterators.delete(iterator)
            return iterator.return?.(value) ?? { done: true, value }
          },
          async throw(error?: unknown) {
            owner.activeIterators.delete(iterator)
            if (iterator.throw) return iterator.throw(error)
            throw error
          },
        }
      },
    } as Lite.FlowStream<unknown, unknown>
  }

  private seedTags(
    childCtx: ExecutionContextImpl,
    execTags?: Lite.Tagged<any>[],
    flowTags?: Lite.Tagged<any>[],
    blockedTags?: Lite.Tagged<any>[]
  ): void {
    if (execTags) for (let i = 0; i < execTags.length; i++) {
      childCtx.appendTagValue(execTags[i]!.key, execTags[i]!.value)
    }
    if (!flowTags?.length) return
    if (!execTags?.length && !blockedTags?.length) {
      for (let i = 0; i < flowTags.length; i++) {
        childCtx.appendTagValue(flowTags[i]!.key, flowTags[i]!.value)
      }
      return
    }
    const blocked = new Set<symbol>()
    if (execTags) for (let i = 0; i < execTags.length; i++) {
      blocked.add(execTags[i]!.key)
    }
    if (blockedTags) for (let i = 0; i < blockedTags.length; i++) {
      blocked.add(blockedTags[i]!.key)
    }
    for (let i = 0; i < flowTags.length; i++) {
      if (!blocked.has(flowTags[i]!.key)) childCtx.appendTagValue(flowTags[i]!.key, flowTags[i]!.value)
    }
  }

  private createChildInvocation(options: ExecFlowRuntimeOptions): MaybePromise<{
    flow: Lite.Flow<unknown, unknown, any, unknown>
    presetValue: unknown
    childCtx: ExecutionContextImpl
    streaming: boolean
  }> {
    this.assertOpen()
    const { flow, input, rawInput, name: execName, tags: execTags, blockedTags } = options
    const presetValue = this.scope.getFlowPreset(flow)
    if (presetValue !== undefined && isFlow(presetValue)) {
      return this.createChildInvocation({ ...options, flow: presetValue })
    }

    const finish = (parsedInput: unknown) => {
      const childCtx = new ExecutionContextImpl(this.scope, {
        parent: this,
        input: parsedInput,
        execName,
        flowName: flow.name,
        boundary: false,
        signal: options.signal
      })

      this.seedTags(childCtx, execTags, flow.tags, blockedTags)

      return {
        flow,
        presetValue,
        childCtx,
        streaming: typeof presetValue === "function"
          ? isAsyncGeneratorFunction(presetValue)
          : isAsyncGeneratorFunction(flow.factory),
      }
    }

    const rawValue = rawInput !== undefined ? rawInput : input
    if (!flow.parse) return finish(rawValue)

    const label = execName ?? flow.name ?? "anonymous"
    const wrap = (err: unknown) => new ParseError(
      `Failed to parse flow input "${label}"`,
      "flow-input",
      label,
      err
    )
    let parsed: unknown
    try {
      parsed = flow.parse(rawValue)
    } catch (err) {
      throw wrap(err)
    }
    if (isPromiseLike(parsed)) {
      return Promise.resolve(parsed).then(finish, (err) => {
        throw wrap(err)
      })
    }
    return finish(parsed)
  }

  private async *iterateExecStream(
    options: ExecFlowRuntimeOptions,
    result: Promise<unknown>,
    settleResult: (value: unknown) => void,
    failResult: (error: unknown) => void,
    start: () => void
  ): AsyncGenerator<unknown, unknown, unknown> {
    start()
    let invocation: Awaited<ReturnType<ExecutionContextImpl["createChildInvocation"]>>
    try {
      invocation = await this.createChildInvocation(options)
    } catch (error) {
      failResult(error)
      throw error
    }

    const { flow, presetValue, childCtx } = invocation
    const unregisterStreaming = registerStreamingExec(flow, childCtx)
    let settleRaw: (value: unknown) => void
    let failRaw: (error: unknown) => void
    const raw = new Promise<unknown>((resolve, reject) => {
      settleRaw = resolve
      failRaw = reject
    })
    raw.catch(() => {})
    let iterator: AsyncGenerator<unknown, unknown, unknown> | undefined
    let abortError: Error | undefined
    let resolveSetup!: (value: IteratorReturnResult<unknown> | undefined) => void
    let rejectSetup!: (error: unknown) => void
    const setup = new Promise<IteratorReturnResult<unknown> | undefined>((resolve, reject) => {
      resolveSetup = resolve
      rejectSetup = reject
    })

    void (async () => {
      try {
        const runFlow = async () => {
          iterator = typeof presetValue === "function"
            ? await childCtx.execPresetStreamFn(presetValue as (ctx: Lite.ExecutionContext) => unknown)
            : await childCtx.execFlowStreamInternal(flow)
          resolveSetup(undefined)
          return raw
        }
        const value = await (this.scope.execExts.length === 0
          ? runFlow()
          : childCtx.applyExecPipeline(flow, runFlow))
        if (!iterator) resolveSetup({ done: true, value })
        await childCtx.close({ ok: true })
        settleResult(value)
      } catch (error) {
        await childCtx.close({ ok: false, error })
        rejectSetup(error)
        failResult(error)
      } finally {
        unregisterStreaming()
      }
    })()

    try {
      const shortCircuit = await setup
      if (shortCircuit) {
        await result
        return shortCircuit.value
      }

      for (;;) {
        const step = await iterator!.next()
        if (step.done) {
          settleRaw!(step.value)
          await result
          iterator = undefined
          return step.value
        }
        yield step.value
      }
    } catch (error) {
      if (iterator) {
        iterator = undefined
        failRaw!(error)
        await result.catch(() => {})
      }
      throw error
    } finally {
      if (iterator) {
        abortError = new DOMException("Flow stream aborted", "AbortError")
        childCtx.abort(abortError)
        try {
          await iterator.return?.(undefined)
        } catch {}
        failRaw!(abortError)
        await result.catch(() => {})
      }
    }
  }

  private execFlowFactoryResult<T>(
    flow: Lite.Flow<unknown, unknown, any, unknown>,
    consume: (value: MaybePromise<unknown> | AsyncGenerator<unknown, unknown, unknown>) => MaybePromise<T>
  ): MaybePromise<T> {
    const depsResult = this.scope.resolveDepsOptimistic(flow.deps, this, undefined)
    const factory = flow.factory as unknown as (
      ctx: Lite.ExecutionContext,
      deps?: Record<string, unknown>
    ) => MaybePromise<unknown> | AsyncGenerator<unknown, unknown, unknown>
    const run = (resolvedDeps: Record<string, unknown>) => {
      return consume(flow.deps ? factory(this, resolvedDeps) : factory(this))
    }

    if (isPromiseLike(depsResult)) {
      return (depsResult as Promise<Record<string, unknown>>).then(run)
    }

    return run(depsResult as Record<string, unknown>)
  }

  private execFlowInternal(flow: Lite.Flow<unknown, unknown, any, unknown>): MaybePromise<unknown> {
    return this.execFlowFactoryResult(flow, (value) => {
      if (isAsyncGenerator(value)) markStreamingExec(this, flow)
      return consumeScalarResult(value)
    })
  }

  private execFlowStreamInternal(flow: Lite.Flow<unknown, unknown, any, unknown>): MaybePromise<AsyncGenerator<unknown, unknown, unknown>> {
    return this.execFlowFactoryResult(flow, (value) => requireAsyncGenerator(value))
  }

  private async execInlineInternal(options: ExecRuntimeOptions | ExecDepsRuntimeOptions): Promise<unknown> {
    if (options.deps === undefined) {
      return assertNoReturnedStream(await options.fn(...options.params))
    }
    const resolved = await this.scope.resolveDepsOptimistic(options.deps, this, undefined)
    return assertNoReturnedStream(await options.fn(resolved, ...options.params))
  }

  private async execPresetFn(
    fn: (ctx: Lite.ExecutionContext) => MaybePromise<unknown> | AsyncGenerator<unknown, unknown, unknown>,
    target?: Lite.ExecTarget
  ): Promise<unknown> {
    const value = fn(this)
    if (target && isAsyncGenerator(value)) markStreamingExec(this, target)
    return consumeScalarResult(value)
  }

  private execPresetStreamFn(fn: (ctx: Lite.ExecutionContext) => unknown): AsyncGenerator<unknown, unknown, unknown> {
    return requireAsyncGenerator(fn(this))
  }

  private async applyExecPipeline(
    target: Lite.ExecTarget,
    doExec: () => Promise<unknown>
  ): Promise<unknown> {
    let next = doExec

    for (let i = this.scope.execExts.length - 1; i >= 0; i--) {
      const ext = this.scope.execExts[i]!
      const currentNext = next
      next = ext.wrapExec!.bind(ext, currentNext, target, this) as () => Promise<unknown>
    }

    return next()
  }

  onClose<Args extends unknown[]>(
    fn: (result: Lite.CloseResult, ...args: Args) => MaybePromise<void>,
    ...params: Args
  ): () => void {
    const cleanup = { fn, params }
    this.cleanups.push(cleanup)
    return () => {
      const index = this.cleanups.indexOf(cleanup)
      if (index >= 0) this.cleanups.splice(index, 1)
    }
  }

  close(result: Lite.CloseResult = { ok: true }): Promise<void> {
    if (this.closePromise) return this.closePromise
    if (this.closed) return Promise.resolve()

    this.closed = true
    const closeResult = this.classifyCloseResult(result)
    const reason = new DOMException("Execution context closed", "AbortError")
    this.abort(reason)
    const boundaryChildren = [...this.children].filter((child) => child.boundary)
    this.closePromise = this.runStructuredClose(closeResult, boundaryChildren).finally(() => {
      if (this.parent) {
        assertExecutionContextImpl(this.parent)
        this.parent.children.delete(this)
      }
    })
    this.closePromise.then(
      () => { this.closePromise = undefined },
      () => { this.closePromise = undefined }
    )
    return this.closePromise
  }

  abort(reason: unknown): void {
    if (this.baselineMode) {
      if (!this.abortController!.signal.aborted) this.abortController!.abort(reason)
      return
    }
    this.captureAbort(reason)
  }

  private captureAbort(reason: unknown): void {
    if (this.abortReason !== pendingAbort) return
    this.abortReason = reason
    this.abortController?.abort(reason)
    for (const child of this.children) {
      if (!child.baselineMode) child.captureAbort(reason)
    }
  }

  private trackDescendant<T>(pending: Promise<T>): Promise<T> {
    this.descendants.add(pending)
    pending.then(
      () => this.descendants.delete(pending),
      () => this.descendants.delete(pending)
    )
    return pending
  }

  private classifyCloseResult(result: Lite.CloseResult): Lite.CloseResult {
    if (result.ok) return result
    const errorName = typeof result.error === "object" && result.error !== null && "name" in result.error
      ? (result.error as { name?: unknown }).name
      : undefined
    return this.signal.aborted && (result.error === this.signal.reason || errorName === "AbortError")
      ? { ok: false, error: result.error, aborted: true }
      : { ok: false, error: result.error }
  }

  private async runStructuredClose(
    result: Lite.CloseResult,
    boundaryChildren: ExecutionContextImpl[]
  ): Promise<void> {
    const iterators = [...this.activeIterators]
    this.activeIterators.clear()
    await Promise.allSettled(iterators.map((iterator) => iterator.return?.()))
    const boundaryCloses = boundaryChildren.map((child) => child.close({ ok: false, error: child.signal.reason }))
    const resourceResolutions = [...(this.resources?.values() ?? [])]
      .flatMap((entry) => entry.promise ? [entry.promise] : [])
    await Promise.allSettled([...this.descendants, ...boundaryCloses, ...resourceResolutions])
    await this.runCloseCleanups(result)
  }

  private async runCloseCleanups(result: Lite.CloseResult): Promise<void> {
    const failures: unknown[] = []
    for (let i = this.cleanups.length - 1; i >= 0; i--) {
      try {
        const cleanup = this.cleanups[i]
        if (cleanup) await cleanup.fn(result, ...cleanup.params)
      } catch (error) {
        if (result.ok) failures.push(error)
      }
    }
    const resources = Array.from(this.resources?.keys() ?? [])
    for (let i = resources.length - 1; i >= 0; i--) {
      const entry = this.resources!.get(resources[i]!)
      this.resources!.delete(resources[i]!)
      if (entry && entry.cleanups.length > 0) {
        if (result.ok) {
          for (let j = entry.cleanups.length - 1; j >= 0; j--) {
            try { await runCleanup(entry.cleanups[j]!) } catch (error) {
              failures.push(error)
            }
          }
        } else {
          await runCleanupsSafe(entry.cleanups)
        }
        entry.cleanups = []
      }
      this.emitResourceState(resources[i]!, "idle")
    }
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, "close settlement failed")
  }
}

/**
 * Registers or restores controller-read observers used by integrations that
 * need to track `controller.get()` access.
 */
export function setControllerReadHook(fn: ((ctrl: Lite.Controller<unknown>) => void) | null): void {
  if (fn) {
    controllerReadHooks.push(fn)
    return
  }
  controllerReadHooks.pop()
}

/**
 * Creates a DI container that manages Atom resolution, caching, and lifecycle.
 *
 * The scope is returned synchronously, with a `ready` promise that resolves
 * when all extensions have been initialized. Resolution methods automatically
 * wait for `ready` before proceeding.
 *
 * @param options - Optional configuration for extensions, presets, and tags
 * @returns A Scope instance with a `ready` promise for extension initialization
 *
 * @example
 * ```typescript
 * const scope = createScope({
 *   extensions: [logging],
 *   presets: [preset(db, testDb)]
 * })
 *
 * // Option 1: resolve() waits for ready internally
 * const pool = await scope.resolve(db)
 *
 * // Option 2: explicit wait
 * await scope.ready
 * const conn = await scope.resolve(db)
 * ```
 */
export function createScope(options?: Lite.ScopeOptions): Lite.Scope {
  return new ScopeImpl(options)
}

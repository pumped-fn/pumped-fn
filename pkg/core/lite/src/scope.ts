import { controllerSymbol, tagExecutorSymbol, ParseError, FlowFault, type Lite, type MaybePromise, type AtomState } from "./types"
import { isAtom, isControllerDep } from "./atom"
import { classifyDeps, type DepsGraph } from "./deps-graph"
import { isFlow } from "./flow"
import { isResource } from "./resource"
import { latest, type Latest } from "./latest"
import { consumeScalarResult, isAsyncGenerator, isAsyncGeneratorFunction, isPromiseLike, markStreamingExec, registerStreamingExec, requireAsyncGenerator, streamResultBeforeStartError } from "./streaming"
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

async function runCleanupsSafe(cleanups: (() => MaybePromise<void>)[]): Promise<void> {
  for (let i = cleanups.length - 1; i >= 0; i--) {
    try {
      const result = cleanups[i]!()
      if (result != null && typeof (result as any).then === 'function') await result
    } catch {}
  }
}

type ListenerEvent = 'resolving' | 'resolved' | '*'

class ContextDataImpl implements Lite.ContextData {
  private readonly map = new Map<string | symbol, unknown>()

  constructor(
    private readonly parentData?: Lite.ContextData
  ) {}

  get(key: string | symbol): unknown {
    return this.map.get(key)
  }

  set(key: string | symbol, value: unknown): void {
    this.map.set(key, value)
  }

  has(key: string | symbol): boolean {
    return this.map.has(key)
  }

  delete(key: string | symbol): boolean {
    return this.map.delete(key)
  }

  clear(): void {
    this.map.clear()
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
  }

  hasTag<T, H extends boolean>(tag: Lite.Tag<T, H>): boolean {
    return this.map.has(tag.key)
  }

  deleteTag<T, H extends boolean>(tag: Lite.Tag<T, H>): boolean {
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
    this.map.set(tag.key, storedValue)
    return storedValue
  }
}

interface AtomEntry<T> {
  state: AtomState
  value?: T
  hasValue: boolean
  error?: Error
  cleanups: (() => MaybePromise<void>)[]
  resolvingListeners: Set<() => void>
  resolvedListeners: Set<() => void>
  allListeners: Set<() => void>
  pendingInvalidate: boolean
  pendingSet?: { value: T } | { fn: (prev: T) => T }
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
  cleanups: (() => MaybePromise<void>)[]
  promise?: Promise<T>
}

interface ResourceListeners {
  idle: Set<() => void>
  resolving: Set<() => void>
  resolved: Set<() => void>
  failed: Set<() => void>
  all: Set<() => void>
}

type ResourceDependencyConsumer = {
  ownerCtx: ExecutionContextImpl
  resource: Lite.Resource<unknown>
  entry: ResourceEntry<unknown>
}

type StreamSource<T> = AsyncIterable<T> | AsyncIterator<T>

type StreamHub<T> = {
  atom: Lite.Atom<StreamSource<T>>
  views: Set<Latest<T>>
  unsubs: (() => void)[]
  version: number
  iterator?: AsyncIterator<T>
  source?: StreamSource<T>
}

type ExecFlowRuntimeOptions = {
  flow: Lite.Flow<unknown, unknown, any, unknown>
  input?: unknown
  rawInput?: unknown
  name?: string
  tags?: Lite.Tagged<any>[]
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

function notifyListeners(listeners: Set<() => void> | undefined): void {
  if (!listeners?.size) return
  if (listeners.size === 1) {
    listeners.values().next().value!()
    return
  }
  const arr = [...listeners]
  for (let i = 0; i < arr.length; i++) arr[i]!()
}

class SelectHandleImpl<T, S> implements Lite.SelectHandle<S> {
  private listeners = new Set<() => void>()
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

  subscribe(listener: () => void): () => void {
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
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
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

  on(event: ListenerEvent, listener: () => void): () => void {
    return this.scope.addListener(this.atom, event, listener)
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

  on(event: Lite.ResourceControllerEvent, listener: () => void): () => void {
    return this.ctx.addResourceListener(this.resource, event, listener)
  }
}

class ScopeImpl implements Lite.Scope {
  private cache = new Map<Lite.Atom<unknown>, AtomEntry<unknown>>()
  private presets = new Map<Lite.Atom<unknown> | Lite.Flow<unknown, unknown, any, unknown> | Lite.Resource<unknown>, unknown>()
  private resolving = new Set<Lite.Atom<unknown>>()
  private pending = new Map<Lite.Atom<unknown>, Promise<unknown>>()
  private stateListeners = new Map<AtomState, Map<Lite.Atom<unknown>, Set<() => void>>>()
  private invalidationQueue: Lite.Atom<unknown>[] = []
  private invalidationQueued = new Set<Lite.Atom<unknown>>()
  private invalidationChain: Set<Lite.Atom<unknown>> | null = null
  private chainPromise: Promise<void> | null = null
  private chainError: unknown = null
  private initialized = false
  private disposed = false
  private disposeListeners = new Set<() => void>()
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

  addListener<T>(atom: Lite.Atom<T>, event: ListenerEvent, listener: () => void): () => void {
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
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
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

  on(event: AtomState, atom: Lite.Atom<unknown>, listener: () => void): () => void {
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
    listeners.add(listener)

    const capturedStateMap = stateMap
    const capturedListeners = listeners

    return () => {
      capturedListeners.delete(listener)
      if (capturedListeners.size === 0) {
        capturedStateMap.delete(atom)
        if (capturedStateMap.size === 0) {
          this.stateListeners.delete(event)
        }
      }
    }
  }

  private onDispose(listener: () => void): () => void {
    this.disposeListeners.add(listener)
    return () => {
      this.disposeListeners.delete(listener)
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
          if (values.some(isFlow)) return null
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
      cleanup: (fn) => entry.cleanups.push(fn),
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
    } else if (entry.pendingSet && 'value' in entry.pendingSet) {
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
      cleanup: (fn) => entry.cleanups.push(fn),
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

    for (let i = 0; i < graph.bound.length; i++) {
      if (!ctx) throw new Error("Bound deps require an ExecutionContext")
      const [key, dep] = graph.bound[i]!
      const value = this.resolveBoundDep(dep, ctx, dependentAtom, resourcePath)
      if (isPromiseLike(value)) {
        parallel.push(Promise.resolve(value).then((boundValue) => {
          result[key] = boundValue
        }))
      } else {
        result[key] = value
      }
    }

    for (let i = 0; i < graph.tags.length; i++) {
      const [key, tagExecutor] = graph.tags[i]!
      switch (tagExecutor.mode) {
        case "required": {
          const value = ctx
            ? ctx.data.seekTag(tagExecutor.tag)
            : tagExecutor.tag.find(this.tags)
          if (value !== undefined) {
            result[key] = this.projectTagValue(value, ctx)
          } else if (tagExecutor.tag.hasDefault) {
            result[key] = this.projectTagValue(tagExecutor.tag.defaultValue, ctx)
          } else {
            throw new Error(`Tag "${tagExecutor.tag.label}" not found`)
          }
          break
        }
        case "optional": {
          const value = ctx
            ? ctx.data.seekTag(tagExecutor.tag)
            : tagExecutor.tag.find(this.tags)
          result[key] = this.projectTagValue(value ?? tagExecutor.tag.defaultValue, ctx)
          break
        }
        case "all": {
          const values = ctx
            ? this.collectFromHierarchy(ctx, tagExecutor.tag)
            : tagExecutor.tag.collect(this.tags)
          result[key] = values.map((value) => this.projectTagValue(value, ctx))
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

  private projectTagValue(value: unknown, ctx: Lite.ExecutionContext | undefined): unknown {
    if (!isFlow(value)) return value
    if (!ctx) throw new Error("Flow deps require an ExecutionContext")
    return this.createFlowHandle(value, ctx)
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
        const ready = Promise.resolve()
        return {
          flow,
          options: options as Lite.FlowPrepareOptions<Input>,
          key: (options as Lite.FlowPrepareOptions<Input>).key,
          ready,
          exec: async () => {
            await ready
            return this.execFlowHandle(flow, ctx, options)
          },
        }
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
    this.getEntry(dependentAtom)?.cleanups.push(unsub)
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
    dependent.entry.cleanups.push(unsub)
  }

  private bindBoundValue(value: unknown, ctx: Lite.ExecutionContext): unknown {
    if (value === undefined) return undefined
    if (typeof value === "function") {
      const fn = value as (ctx: Lite.ExecutionContext, ...args: unknown[]) => unknown
      return (...args: unknown[]) => fn(ctx, ...args)
    }
    if (typeof value !== "object" || value === null) {
      throw new Error("bound() deps must resolve to a function or object")
    }
    const source = value as Record<PropertyKey, unknown>
    const result: Record<PropertyKey, unknown> = {}
    for (const property of Reflect.ownKeys(source)) {
      if (!Object.prototype.propertyIsEnumerable.call(source, property)) continue
      const member = source[property]
      result[property] = typeof member === "function"
        ? (...args: unknown[]) => (member as (ctx: Lite.ExecutionContext, ...args: unknown[]) => unknown)(ctx, ...args)
        : member
    }
    return result
  }

  private resolveBoundTag(tagExecutor: Lite.TagExecutor<unknown, unknown>, ctx: Lite.ExecutionContext): unknown {
    switch (tagExecutor.mode) {
      case "required": {
        const value = ctx.data.seekTag(tagExecutor.tag)
        if (value !== undefined) return value
        if (tagExecutor.tag.hasDefault) return tagExecutor.tag.defaultValue
        throw new Error(`Tag "${tagExecutor.tag.label}" not found`)
      }
      case "optional": {
        const value = ctx.data.seekTag(tagExecutor.tag)
        return value ?? tagExecutor.tag.defaultValue
      }
      case "all":
        throw new Error("bound() tag deps support tags.required and tags.optional")
    }
  }

  private resolveBoundDep(
    dep: Lite.BoundDep<unknown>,
    ctx: Lite.ExecutionContext,
    dependentAtom: Lite.Atom<unknown> | undefined,
    resourcePath?: Set<Lite.Resource<unknown>>,
  ): unknown | Promise<unknown> {
    const source = dep.dep
    if (isAtom(source)) {
      const cachedEntry = this.cache.get(source)
      if (cachedEntry?.state === "resolved") {
        this.trackDependent(source, dependentAtom)
        return this.bindBoundValue(cachedEntry.value, ctx)
      }
      return this.resolve(source).then((value) => {
        this.trackDependent(source, dependentAtom)
        return this.bindBoundValue(value, ctx)
      })
    }
    if (isResource(source)) {
      assertExecutionContextImpl(ctx)
      return this.resolveResource(source, ctx, resourcePath).then((value) => this.bindBoundValue(value, ctx))
    }
    if (typeof source === "object" && source !== null && tagExecutorSymbol in source) {
      return this.bindBoundValue(this.resolveBoundTag(source as Lite.TagExecutor<unknown, unknown>, ctx), ctx)
    }
    throw new Error("bound() deps can wrap tags.required, tags.optional, atom, or resource")
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
      result[key] = await this.resolveResource(resource, ctx, resourcePath)
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

  private collectFromHierarchy<T>(ctx: Lite.ExecutionContext, tag: Lite.Tag<T, boolean>): T[] {
    const results: T[] = []
    let current: Lite.ExecutionContext | undefined = ctx

    while (current) {
      const value = current.data.getTag(tag)
      if (value !== undefined) {
        results.push(value)
      }
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
      this.onDispose(() => stream.close()),
    ]
    stream.onClose(() => {
      for (let i = unsubs.length - 1; i >= 0; i--) unsubs[i]!()
    })
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
    const unsub = handle.subscribe(() => {
      stream.push(handle.get())
    })
    const offDispose = this.onDispose(() => stream.close())
    stream.onClose(() => {
      offDispose()
      unsub()
    })
    return stream
  }

  resolveStream<T>(atom: Lite.Atom<StreamSource<T>>): AsyncIterable<T> {
    if (this.disposed) throw new Error("Scope is disposed")
    const presetValue = this.presets.get(atom as Lite.Atom<unknown>)
    if (isAtom(presetValue)) return this.resolveStream(presetValue as Lite.Atom<StreamSource<T>>)
    const hub = this.getStreamHub(atom)
    const stream = latest<T>()
    hub.views.add(stream)
    stream.onClose(() => {
      hub.views.delete(stream)
    })
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
        ownerCtx.assertOpen()
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
      entry.pendingSet = { value }
      return
    }

    if (this.invalidationQueue.length === 0 && !this.chainPromise) {
      entry.value = value
      entry.state = 'resolved'
      entry.hasValue = true
      entry.error = undefined
      entry.pendingInvalidate = false
      entry.resolvedPromise = undefined
      if (this.stateListeners.size) this.emitStateChange('resolved', atom)
      this.notifyEntry(entry as AtomEntry<unknown>, 'resolved')
      return
    }

    entry.pendingSet = { value }
    this.scheduleInvalidation(atom, entry)
  }

  scheduleUpdate<T>(atom: Lite.Atom<T>, fn: (prev: T) => T, cachedEntry?: AtomEntry<T>): void {
    const entry = cachedEntry ?? (this.cache.get(atom) as AtomEntry<T> | undefined)
    if (!entry || entry.state === 'idle') {
      throw new Error("Atom not resolved")
    }
    if (entry.state === 'failed' && entry.error) {
      throw entry.error
    }

    if (entry.state === 'resolving') {
      entry.pendingSet = { fn }
      return
    }

    if (this.invalidationQueue.length === 0 && !this.chainPromise) {
      entry.value = fn(entry.value as T)
      entry.state = 'resolved'
      entry.hasValue = true
      entry.error = undefined
      entry.pendingInvalidate = false
      entry.resolvedPromise = undefined
      if (this.stateListeners.size) this.emitStateChange('resolved', atom)
      this.notifyEntry(entry as AtomEntry<unknown>, 'resolved')
      return
    }

    entry.pendingSet = { fn }
    this.scheduleInvalidation(atom, entry)
  }

  private doInvalidateSequential<T>(atom: Lite.Atom<T>): void | Promise<void> {
    const entry = this.cache.get(atom) as AtomEntry<T> | undefined
    if (!entry) return

    const previousValue = entry.value
    const pendingSet = entry.pendingSet
    entry.pendingSet = undefined

    if (pendingSet) {
      entry.value = 'value' in pendingSet ? pendingSet.value : pendingSet.fn(previousValue as T)
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
        ctx.data.set(ctxTags[i]!.key, ctxTags[i]!.value)
      }
    }

    if (this.tags.length > 0) {
      for (let i = 0; i < this.tags.length; i++) {
        if (!ctx.data.seekHas(this.tags[i]!.key)) {
          ctx.data.set(this.tags[i]!.key, this.tags[i]!.value)
        }
      }
    }

    return ctx
  }
}

function assertCreateContextOptions(options: unknown): asserts options is Lite.CreateContextOptions | undefined {
  if (options === undefined) return
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("createContext() expects { tags, parent }")
  }

  const record = options as Record<string, unknown>
  const invalidKey = Object.keys(record).find((key) => key !== "tags" && key !== "parent")
  if (invalidKey) {
    throw new Error(`createContext() expects { tags, parent }; received "${invalidKey}"`)
  }
  if (record["tags"] !== undefined && !Array.isArray(record["tags"])) {
    throw new Error("createContext() expects { tags, parent }")
  }
}

class ExecutionContextImpl implements Lite.ExecutionContext {
  private cleanups: ((result: Lite.CloseResult) => MaybePromise<void>)[] = []
  private resources = new Map<Lite.Resource<unknown>, ResourceEntry<unknown>>()
  private resourceListeners = new Map<Lite.Resource<unknown>, ResourceListeners>()
  private resourceControllers = new Map<Lite.Resource<unknown>, ResourceControllerImpl<unknown>>()
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
    }
  ) {
    this.parent = options?.parent
    this._input = options?.input
    this._execName = options?.execName
    this._flowName = options?.flowName
    this.boundary = options?.boundary ?? true
  }

  get input(): unknown {
    return this._input
  }

  get name(): string | undefined {
    return this._execName ?? this._flowName
  }

  get data(): Lite.ContextData {
    if (!this._data) {
      this._data = new ContextDataImpl(this.parent?.data)
    }
    return this._data
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
    if (!this.parent || resource?.ownership === "current") return this
    assertExecutionContextImpl(this.parent)
    return this.parent
  }

  findResourceEntry<T>(resource: Lite.Resource<T>): { owner: ExecutionContextImpl; entry: ResourceEntry<T> } | undefined {
    let current: ExecutionContextImpl | undefined = this
    while (current) {
      const entry = current.resources.get(resource as Lite.Resource<unknown>) as ResourceEntry<T> | undefined
      if (entry) return { owner: current, entry }
      if (resource.ownership === "current" && current.boundary) return undefined
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
    this.resources.set(resource as Lite.Resource<unknown>, entry as ResourceEntry<unknown>)
    return entry
  }

  getLocalResourceEntry<T>(resource: Lite.Resource<T>): ResourceEntry<T> | undefined {
    return this.resources.get(resource as Lite.Resource<unknown>) as ResourceEntry<T> | undefined
  }

  controller<T>(resource: Lite.Resource<T>): Lite.ResourceController<T> {
    let ctrl = this.resourceControllers.get(resource as Lite.Resource<unknown>) as ResourceControllerImpl<T> | undefined
    if (!ctrl) {
      ctrl = new ResourceControllerImpl(resource, this)
      this.resourceControllers.set(resource as Lite.Resource<unknown>, ctrl as ResourceControllerImpl<unknown>)
    }
    return ctrl
  }

  private bindLatestToContextClose<T>(stream: Latest<T>): Latest<T> {
    stream.onClose(this.onClose(() => stream.close()))
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
    let listeners = this.resourceListeners.get(resource)
    if (!listeners) {
      listeners = {
        idle: new Set(),
        resolving: new Set(),
        resolved: new Set(),
        failed: new Set(),
        all: new Set(),
      }
      this.resourceListeners.set(resource, listeners)
    }
    return listeners
  }

  addResourceListener(
    resource: Lite.Resource<unknown>,
    event: Lite.ResourceControllerEvent,
    listener: () => void
  ): () => void {
    const owner = this.findResourceEntry(resource)?.owner ?? this.resourceOwner(resource)
    const listeners = owner.getResourceListeners(resource)
    const set = event === "*" ? listeners.all : listeners[event]
    set.add(listener)
    return () => {
      set.delete(listener)
    }
  }

  emitResourceState(resource: Lite.Resource<unknown>, state: AtomState): void {
    const listeners = this.resourceListeners.get(resource)
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
      get data() { return owner.data },
      exec: owner.exec.bind(owner) as Lite.ResourceContext["exec"],
      execStream: owner.execStream.bind(owner) as Lite.ResourceContext["execStream"],
      resolve: owner.resolve.bind(owner) as Lite.ResourceContext["resolve"],
      release: owner.release.bind(owner) as Lite.ResourceContext["release"],
      controller: owner.controller.bind(owner),
      changes: owner.changes.bind(owner) as Lite.ResourceContext["changes"],
      resolveStream: owner.resolveStream.bind(owner),
      onClose: owner.onClose.bind(owner),
      close: owner.close.bind(owner),
      fail: owner.fail.bind(owner),
      cleanup(fn: () => MaybePromise<void>) {
        owner.assertOpen()
        if (owner.getLocalResourceEntry(resource) !== entry) {
          throw new Error("Resource is released")
        }
        entry.cleanups.push(fn)
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
    const entry = this.resources.get(resource as Lite.Resource<unknown>)
    if (!entry) return
    this.resources.delete(resource as Lite.Resource<unknown>)
    if (entry.cleanups.length > 0) {
      await runCleanupsSafe(entry.cleanups)
      entry.cleanups = []
    }
    this.emitResourceState(resource, "idle")
  }

  async exec(options: ExecFlowRuntimeOptions | Lite.ExecFnOptions<unknown>): Promise<unknown> {
    this.assertOpen()

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
        boundary: false
      })

      this.seedTags(childCtx, options.tags)

      try {
        const runFn = async () => await childCtx.execFnInternal(options)
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
        return owner.iterateExecStream(options, result, settleResult!, failResult!, start)
      },
    } as Lite.FlowStream<unknown, unknown>
  }

  private seedTags(childCtx: ExecutionContextImpl, execTags?: Lite.Tagged<any>[], flowTags?: Lite.Tagged<any>[]): void {
    if (execTags) for (let i = 0; i < execTags.length; i++) childCtx.data.set(execTags[i]!.key, execTags[i]!.value)
    if (flowTags) for (let i = 0; i < flowTags.length; i++) {
      if (!childCtx.data.has(flowTags[i]!.key)) childCtx.data.set(flowTags[i]!.key, flowTags[i]!.value)
    }
  }

  private createChildInvocation(options: ExecFlowRuntimeOptions): MaybePromise<{
    flow: Lite.Flow<unknown, unknown, any, unknown>
    presetValue: unknown
    childCtx: ExecutionContextImpl
    streaming: boolean
  }> {
    this.assertOpen()
    const { flow, input, rawInput, name: execName, tags: execTags } = options
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
        boundary: false
      })

      this.seedTags(childCtx, execTags, flow.tags)

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
        await childCtx.close(error === abortError
          ? { ok: false, error, aborted: true }
          : { ok: false, error })
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
        abortError = new Error("Flow stream aborted")
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

  private async execFnInternal(options: Lite.ExecFnOptions<unknown>): Promise<unknown> {
    const { fn, params } = options
    return fn(this, ...params)
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

  onClose(fn: (result: Lite.CloseResult) => MaybePromise<void>): () => void {
    this.cleanups.push(fn)
    return () => {
      const index = this.cleanups.indexOf(fn)
      if (index >= 0) this.cleanups.splice(index, 1)
    }
  }

  close(result: Lite.CloseResult = { ok: true }): Promise<void> {
    if (this.closed) return Promise.resolve()

    this.closed = true

    if (this.resources.size === 0 && this.cleanups.length === 0) return Promise.resolve()

    return this.runCloseCleanups(result)
  }

  private async runCloseCleanups(result: Lite.CloseResult): Promise<void> {
    for (let i = this.cleanups.length - 1; i >= 0; i--) {
      try { await this.cleanups[i]?.(result) } catch {}
    }
    const resources = Array.from(this.resources.keys())
    for (let i = resources.length - 1; i >= 0; i--) {
      const entry = this.resources.get(resources[i]!)
      this.resources.delete(resources[i]!)
      if (entry && entry.cleanups.length > 0) {
        await runCleanupsSafe(entry.cleanups)
        entry.cleanups = []
      }
      this.emitResourceState(resources[i]!, "idle")
    }
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

import { controllerSymbol, tagExecutorSymbol, ParseError, type Lite, type MaybePromise, type AtomState } from "./types"
import { isAtom, isControllerDep } from "./atom"
import { classifyDeps, type DepsGraph } from "./deps-graph"
import { isFlow } from "./flow"
import { isResource } from "./resource"

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

// Cached snapshot arrays for notifyListeners. Rebuilt when the underlying
// Set's size changes (the common case: listener added or removed); reused
// across fires when the set is stable. Keyed by the Set itself so GC'd Sets
// release their snapshots automatically.
const listenerSnapshotCache = new WeakMap<Set<() => void>, { size: number, arr: (() => void)[] }>()

interface ResourceEntry<T> {
  state: AtomState
  value?: T
  hasValue: boolean
  error?: Error
  cleanups: (() => MaybePromise<void>)[]
  promise?: Promise<T>
  ext?: object
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

function assertExecutionContextImpl(ctx: Lite.ExecutionContext): asserts ctx is ExecutionContextImpl {
  if (!(ctx instanceof ExecutionContextImpl)) {
    throw new Error("Resource deps require an ExecutionContext")
  }
}

function isAtomControllerDep(dep: Lite.ControllerDep<unknown>): dep is Lite.AtomControllerDep<unknown> {
  return dep.atom !== undefined
}

function notifyListeners(listeners: Set<() => void> | undefined): void {
  if (!listeners?.size) return
  if (listeners.size === 1) {
    listeners.values().next().value!()
    return
  }
  let snap = listenerSnapshotCache.get(listeners)
  if (!snap || snap.size !== listeners.size) {
    snap = { size: listeners.size, arr: [...listeners] }
    listenerSnapshotCache.set(listeners, snap)
  }
  const arr = snap.arr
  const n = arr.length
  for (let i = 0; i < n; i++) arr[i]!()
}

class SelectHandleImpl<T, S> implements Lite.SelectHandle<S> {
  private listeners = new Set<() => void>()
  private currentValue: S
  private ctrlUnsub: (() => void) | null = null

  constructor(
    private ctrl: Lite.Controller<T>,
    private selector: (value: T) => S,
    private eq: (prev: S, next: S) => boolean
  ) {
    if (ctrl.state !== 'resolved') {
      throw new Error("Cannot select from unresolved atom")
    }

    this.currentValue = selector(ctrl.get())
    this.ctrlUnsub = ctrl.on('resolved', () => {
      const nextValue = this.selector(this.ctrl.get())
      if (!this.eq(this.currentValue, nextValue)) {
        this.currentValue = nextValue
        this.notifyListeners()
      }
    })
  }

  get(): S {
    return this.currentValue
  }

  subscribe(listener: () => void): () => void {
    if (!this.ctrlUnsub) {
      this.currentValue = this.selector(this.ctrl.get())
      this.ctrlUnsub = this.ctrl.on('resolved', () => {
        const nextValue = this.selector(this.ctrl.get())
        if (!this.eq(this.currentValue, nextValue)) {
          this.currentValue = nextValue
          this.notifyListeners()
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

  private notifyListeners(): void {
    notifyListeners(this.listeners)
  }

  dispose(): void {
    this.listeners.clear()
    this.cleanup()
  }

  private cleanup(): void {
    this.ctrlUnsub?.()
    this.ctrlUnsub = null
  }
}

class ControllerImpl<T> implements Lite.Controller<T> {
  readonly [controllerSymbol] = true
  // Cached reference to the entry in scope.cache. Eliminates a Map.get per
  // `.state` / `.get()` access on the hot path (scope-level notifyListeners
  // fires into handle listeners which then call `ctrl.get()`).
  // Invalidated by scope.release via clearEntryCache().
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

  /** @internal — called from Scope when the entry is released or replaced. */
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
    // Pass our cached entry ref (if any) so scheduleSet skips a Map.get.
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
  private presets = new Map<Lite.Atom<unknown> | Lite.Flow<unknown, unknown> | Lite.Resource<unknown>, unknown>()
  private resolving = new Set<Lite.Atom<unknown>>()
  private pending = new Map<Lite.Atom<unknown>, Promise<unknown>>()
  private stateListeners = new Map<AtomState, Map<Lite.Atom<unknown>, Set<() => void>>>()
  private invalidationQueue: Lite.Atom<unknown>[] = []
  private invalidationChain: Set<Lite.Atom<unknown>> | null = null
  private chainPromise: Promise<void> | null = null
  private chainError: unknown = null
  private initialized = false
  private disposed = false
  private controllers = new Map<Lite.Atom<unknown>, ControllerImpl<unknown>>()
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

    if (!this.invalidationQueue.includes(atom)) this.invalidationQueue.push(atom)

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
    // Inline notifyListeners for both phase-specific and allListeners sets.
    // Direct WeakMap lookup + iteration avoids 2 function dispatches per fire
    // (notifyEntry used to call notifyListeners twice).
    const phase = event === 'resolving' ? entry.resolvingListeners : entry.resolvedListeners
    const phSize = phase.size
    if (phSize === 1) {
      for (const fn of phase) { fn(); break }
    } else if (phSize > 1) {
      let snap = listenerSnapshotCache.get(phase)
      if (!snap || snap.size !== phSize) {
        snap = { size: phSize, arr: [...phase] }
        listenerSnapshotCache.set(phase, snap)
      }
      const arr = snap.arr
      for (let i = 0; i < phSize; i++) arr[i]!()
    }
    const all = entry.allListeners
    const aSize = all.size
    if (aSize === 1) {
      for (const fn of all) { fn(); break }
    } else if (aSize > 1) {
      let snap = listenerSnapshotCache.get(all)
      if (!snap || snap.size !== aSize) {
        snap = { size: aSize, arr: [...all] }
        listenerSnapshotCache.set(all, snap)
      }
      const arr = snap.arr
      for (let i = 0; i < aSize; i++) arr[i]!()
    }
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
            result[key] = value
          } else if (tagExecutor.tag.hasDefault) {
            result[key] = tagExecutor.tag.defaultValue
          } else {
            return null
          }
          break
        }
        case "optional":
          result[key] = tagExecutor.tag.find(this.tags) ?? tagExecutor.tag.defaultValue
          break
        case "all":
          result[key] = tagExecutor.tag.collect(this.tags)
          break
      }
    }

    return result
  }

  private tryResolveCurrentTick<T>(atom: Lite.Atom<T>): Promise<T> | null {
    if (this.resolveExts.length > 0) return null

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
      if (this.resolveExts.length === 0) {
        const raw = atom.deps ? factory(ctx, resolvedDeps) : factory(ctx)
        value = raw != null && typeof (raw as any).then === 'function' ? await (raw as Promise<T>) : raw as T
      } else {
        const doResolve = async () => atom.deps ? factory(ctx, resolvedDeps) : factory(ctx)
        const event: Lite.ResolveEvent = { kind: "atom", target: atom as Lite.Atom<unknown>, scope: this, ctx }
        value = await this.applyResolveExtensions(event, doResolve)
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

  private async applyResolveExtensions<T>(
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
          const value = ctx
            ? ctx.data.seekTag(tagExecutor.tag)
            : tagExecutor.tag.find(this.tags)
          if (value !== undefined) {
            result[key] = value
          } else if (tagExecutor.tag.hasDefault) {
            result[key] = tagExecutor.tag.defaultValue
          } else {
            throw new Error(`Tag "${tagExecutor.tag.label}" not found`)
          }
          break
        }
        case "optional": {
          const value = ctx
            ? ctx.data.seekTag(tagExecutor.tag)
            : tagExecutor.tag.find(this.tags)
          result[key] = value ?? tagExecutor.tag.defaultValue
          break
        }
        case "all": {
          result[key] = ctx
            ? this.collectFromHierarchy(ctx, tagExecutor.tag)
            : tagExecutor.tag.collect(this.tags)
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

  getFlowPreset<O, I>(flow: Lite.Flow<O, I>): Lite.PresetValue<O, I> | undefined {
    return this.presets.get(flow as Lite.Flow<unknown, unknown>) as Lite.PresetValue<O, I> | undefined
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

    const ownerCtx = receiverCtx.resourceOwner()
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
        if (this.resolveExts.length === 0) {
          return ownerCtx.runResourceFactory(resource, entry, factory)
        }
        const resourceCtx = ownerCtx.createResourceContext(resource, entry)
        const event: Lite.ResolveEvent = { kind: "resource", target: resource, ctx: resourceCtx }
        const doResolve = async () => factory(resourceCtx)
        return this.applyResolveExtensions(event, doResolve)
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

    if (this.resolveExts.length === 0) {
      return ownerCtx.runResourceFactory(resource, entry, (ctx) => resource.deps ? factory(ctx, resourceDeps) : factory(ctx))
    }
    const resourceCtx = ownerCtx.createResourceContext(resource, entry)
    const event: Lite.ResolveEvent = { kind: "resource", target: resource, ctx: resourceCtx }
    const doResolve = async () => resource.deps ? factory(resourceCtx, resourceDeps) : factory(resourceCtx)
    return this.applyResolveExtensions(event, doResolve)
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
    // Controller.set can pass its cached entry reference — avoids a Map.get
    // on the hot set path. Fall back to cache.get for external callers.
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

    // Fast path: no other chain work scheduled. Apply synchronously so the
    // new value is visible and listeners fire before returning from set().
    // Tests that rely on scope.flush() still work because the chain is empty.
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

    // Sync fast path mirroring scheduleSet.
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

    // Invalidate the controller's cached entry reference before dropping it
    // from the cache, so any subsequent .get() / .state access sees 'idle'.
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

    this.invalidationQueue.length = 0
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
    if (Array.isArray(options)) throw new Error("createContext() expects { tags }")
    const ctx = new ExecutionContextImpl(this, options)

    const ctxTags = options?.tags
    if (ctxTags && ctxTags.length > 0) {
      for (let i = 0; i < ctxTags.length; i++) {
        ctx.data.set(ctxTags[i]!.key, ctxTags[i]!.value)
      }
    }

    if (this.tags.length > 0) {
      for (let i = 0; i < this.tags.length; i++) {
        if (!ctx.data.has(this.tags[i]!.key)) {
          ctx.data.set(this.tags[i]!.key, this.tags[i]!.value)
        }
      }
    }

    return ctx
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
  readonly parent: Lite.ExecutionContext | undefined

  constructor(
    readonly scope: ScopeImpl,
    options?: Lite.CreateContextOptions & {
      parent?: Lite.ExecutionContext
      input?: unknown
      execName?: string
      flowName?: string
    }
  ) {
    this.parent = options?.parent
    this._input = options?.input
    this._execName = options?.execName
    this._flowName = options?.flowName
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

  resourceOwner(): ExecutionContextImpl {
    if (!this.parent) return this
    assertExecutionContextImpl(this.parent)
    return this.parent
  }

  findResourceEntry<T>(resource: Lite.Resource<T>): { owner: ExecutionContextImpl; entry: ResourceEntry<T> } | undefined {
    let current: ExecutionContextImpl | undefined = this
    while (current) {
      const entry = current.resources.get(resource as Lite.Resource<unknown>) as ResourceEntry<T> | undefined
      if (entry) return { owner: current, entry }
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
    const owner = this.findResourceEntry(resource)?.owner ?? this.resourceOwner()
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
      get ext() {
        entry.ext ??= {}
        return entry.ext
      },
      exec: owner.exec.bind(owner) as Lite.ResourceContext["exec"],
      resolve: owner.resolve.bind(owner) as Lite.ResourceContext["resolve"],
      release: owner.release.bind(owner) as Lite.ResourceContext["release"],
      controller: owner.controller.bind(owner),
      onClose: owner.onClose.bind(owner),
      close: owner.close.bind(owner),
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

  async exec(options: {
    flow: Lite.Flow<unknown, unknown>
    input?: unknown
    rawInput?: unknown
    name?: string
    tags?: Lite.Tagged<any>[]
  } | Lite.ExecFnOptions<unknown>): Promise<unknown> {
    this.assertOpen()

    if ("flow" in options) {
      const { flow, input, rawInput, name: execName, tags: execTags } = options

      const presetValue = this.scope.getFlowPreset(flow)
      if (presetValue !== undefined && isFlow(presetValue)) {
        return this.exec({ ...options, flow: presetValue })
      }

      const rawValue = rawInput !== undefined ? rawInput : input
      let parsedInput: unknown = rawValue
      if (flow.parse) {
        const label = execName ?? flow.name ?? "anonymous"
        try {
          parsedInput = await flow.parse(rawValue)
        } catch (err) {
          throw new ParseError(
            `Failed to parse flow input "${label}"`,
            "flow-input",
            label,
            err
          )
        }
      }

      const childCtx = new ExecutionContextImpl(this.scope, {
        parent: this,
        input: parsedInput,
        execName,
        flowName: flow.name
      })

      if (execTags && execTags.length > 0) {
        for (let i = 0; i < execTags.length; i++) {
          childCtx.data.set(execTags[i]!.key, execTags[i]!.value)
        }
      }

      const flowTags = flow.tags
      if (flowTags && flowTags.length > 0) {
        for (let i = 0; i < flowTags.length; i++) {
          if (!childCtx.data.has(flowTags[i]!.key)) {
            childCtx.data.set(flowTags[i]!.key, flowTags[i]!.value)
          }
        }
      }

      try {
        const runFlow = async () => presetValue !== undefined && typeof presetValue === 'function'
          ? await childCtx.execPresetFn(presetValue as (ctx: Lite.ExecutionContext) => unknown)
          : await childCtx.execFlowInternal(flow)
        const result = this.scope.execExts.length === 0
          ? await runFlow()
          : await childCtx.applyExecExtensions(flow, runFlow)
        await childCtx.close({ ok: true })
        return result
      } catch (error) {
        await childCtx.close({ ok: false, error })
        throw error
      }
    } else {
      const childCtx = new ExecutionContextImpl(this.scope, {
        parent: this,
        execName: options.name,
        flowName: options.fn.name || undefined,
        input: options.params
      })

      const execTags = options.tags
      if (execTags && execTags.length > 0) {
        for (let i = 0; i < execTags.length; i++) {
          childCtx.data.set(execTags[i]!.key, execTags[i]!.value)
        }
      }

      try {
        const runFn = () => childCtx.execFnInternal(options)
        const result = this.scope.execExts.length === 0
          ? await runFn()
          : await childCtx.applyExecExtensions(options.fn, runFn)
        await childCtx.close({ ok: true })
        return result
      } catch (error) {
        await childCtx.close({ ok: false, error })
        throw error
      }
    }
  }

  private execFlowInternal(flow: Lite.Flow<unknown, unknown>): MaybePromise<unknown> {
    const depsResult = this.scope.resolveDepsOptimistic(flow.deps, this, undefined)

    const factory = flow.factory as unknown as (
      ctx: Lite.ExecutionContext,
      deps?: Record<string, unknown>
    ) => MaybePromise<unknown>

    if (depsResult != null && typeof (depsResult as any).then === 'function') {
      return (depsResult as Promise<Record<string, unknown>>).then((resolvedDeps) => {
        return flow.deps ? factory(this, resolvedDeps) : factory(this)
      })
    }

    const resolvedDeps = depsResult as Record<string, unknown>

    return flow.deps ? factory(this, resolvedDeps) : factory(this)
  }

  private async execFnInternal(options: Lite.ExecFnOptions<unknown>): Promise<unknown> {
    const { fn, params } = options
    return fn(this, ...params)
  }

  private async execPresetFn(fn: (ctx: Lite.ExecutionContext) => MaybePromise<unknown>): Promise<unknown> {
    return fn(this)
  }

  private async applyExecExtensions(
    target: Lite.Flow<unknown, unknown> | ((ctx: Lite.ExecutionContext, ...args: unknown[]) => MaybePromise<unknown>),
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
 *   extensions: [loggingExtension],
 *   presets: [preset(dbAtom, testDb)]
 * })
 *
 * // Option 1: resolve() waits for ready internally
 * const db = await scope.resolve(dbAtom)
 *
 * // Option 2: explicit wait
 * await scope.ready
 * const db = await scope.resolve(dbAtom)
 * ```
 */
export function createScope(options?: Lite.ScopeOptions): Lite.Scope {
  return new ScopeImpl(options)
}

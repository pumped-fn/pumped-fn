import { controllerSymbol, tagExecutorSymbol } from "./symbols"
import type { Lite, MaybePromise, AtomState } from "./types"
import { isAtom, isControllerDep } from "./atom"
import { shallowEqual } from "./equality"
import { isFlow } from "./flow"
import { isResource } from "./resource"
import { ParseError } from "./errors"

const resourceKeys = new WeakMap<Lite.Resource<unknown>, symbol>()
let resourceKeyCounter = 0

function getResourceKey(resource: Lite.Resource<unknown>): symbol {
  let key = resourceKeys.get(resource)
  if (!key) {
    key = Symbol(`resource:${resource.name ?? resourceKeyCounter++}`)
    resourceKeys.set(resource, key)
  }
  return key
}

const inflightResources = new WeakMap<Lite.ContextData, Map<symbol, Promise<unknown>>>()
const resolvingResourcesMap = new WeakMap<Lite.ContextData, Set<symbol>>()

type ListenerEvent = 'resolving' | 'resolved' | '*'

class ContextDataImpl implements Lite.ContextData {
  private readonly map = new Map<string | symbol, unknown>()

  constructor(
    private readonly parentData?: Lite.ContextData
  ) {}

  // Raw Map operations
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

  // Tag-based operations
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
  listeners: Map<ListenerEvent, Set<() => void>>
  pendingInvalidate: boolean
  pendingSet?: { value: T } | { fn: (prev: T) => T }
  data?: ContextDataImpl
  dependents: Set<Lite.Atom<unknown>>
  gcScheduled: ReturnType<typeof setTimeout> | null
  resolvedPromise?: Promise<T>
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
    for (const listener of [...this.listeners]) {
      listener()
    }
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

  constructor(
    private atom: Lite.Atom<T>,
    private scope: ScopeImpl
  ) {}

  get state(): AtomState {
    const entry = this.scope.getEntry(this.atom)
    return entry?.state ?? 'idle'
  }

  get(): T {
    const entry = this.scope.getEntry(this.atom)
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
    this.scope.scheduleSet(this.atom, value)
  }

  update(fn: (prev: T) => T): void {
    this.scope.scheduleUpdate(this.atom, fn)
  }

  on(event: ListenerEvent, listener: () => void): () => void {
    return this.scope.addListener(this.atom, event, listener)
  }
}

class ScopeImpl implements Lite.Scope {
  private cache = new Map<Lite.Atom<unknown>, AtomEntry<unknown>>()
  private presets = new Map<Lite.Atom<unknown> | Lite.Flow<unknown, unknown>, unknown>()
  private resolving = new Set<Lite.Atom<unknown>>()
  private pending = new Map<Lite.Atom<unknown>, Promise<unknown>>()
  private stateListeners = new Map<AtomState, Map<Lite.Atom<unknown>, Set<() => void>>>()
  private invalidationQueue = new Set<Lite.Atom<unknown>>()
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

  private scheduleInvalidation<T>(atom: Lite.Atom<T>): void {
    const entry = this.cache.get(atom) as AtomEntry<T> | undefined
    if (!entry || entry.state === "idle") return

    if (entry.state === "resolving") {
      entry.pendingInvalidate = true
      return
    }

    this.invalidationQueue.add(atom)

    if (!this.chainPromise) {
      this.invalidationChain = new Set()
      this.chainError = null
      this.chainPromise = Promise.resolve().then(() =>
        this.processInvalidationChain().catch(error => {
          if (this.chainError === null) this.chainError = error
        })
      )
    }
  }

  private async processInvalidationChain(): Promise<void> {
    try {
      while (this.invalidationQueue.size > 0 && !this.disposed) {
        const atom = this.invalidationQueue.values().next().value as Lite.Atom<unknown>
        this.invalidationQueue.delete(atom)

        if (this.invalidationChain!.has(atom)) {
          const chainAtoms = Array.from(this.invalidationChain!)
          chainAtoms.push(atom)
          const path = chainAtoms
            .map(a => a.factory?.name || "<anonymous>")
            .join(" → ")
          throw new Error(`Infinite invalidation loop detected: ${path}`)
        }

        this.invalidationChain!.add(atom)
        await this.doInvalidateSequential(atom)
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
        listeners: new Map([
          ['resolving', new Set()],
          ['resolved', new Set()],
          ['*', new Set()],
        ]),
        pendingInvalidate: false,
        dependents: new Set(),
        gcScheduled: null,
      }
      this.cache.set(atom, entry as AtomEntry<unknown>)
    }
    return entry
  }

  addListener<T>(atom: Lite.Atom<T>, event: ListenerEvent, listener: () => void): () => void {
    this.cancelScheduledGC(atom)
    
    const entry = this.getOrCreateEntry(atom)
    const listeners = entry.listeners.get(event)!
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
      this.maybeScheduleGC(atom)
    }
  }

  private getSubscriberCount<T>(atom: Lite.Atom<T>): number {
    const entry = this.cache.get(atom)
    if (!entry) return 0
    let count = 0
    for (const listeners of entry.listeners.values()) {
      count += listeners.size
    }
    return count
  }

  private maybeScheduleGC<T>(atom: Lite.Atom<T>): void {
    if (!this.gcOptions.enabled) return
    if (atom.keepAlive) return
    
    const entry = this.cache.get(atom)
    if (!entry) return
    if (entry.state === 'idle') return
    
    const subscriberCount = this.getSubscriberCount(atom)
    if (subscriberCount > 0) return
    if (entry.dependents.size > 0) return
    
    if (entry.gcScheduled) return
    
    entry.gcScheduled = setTimeout(() => {
      this.executeGC(atom)
    }, this.gcOptions.graceMs)
  }

  private cancelScheduledGC<T>(atom: Lite.Atom<T>): void {
    const entry = this.cache.get(atom)
    if (entry?.gcScheduled) {
      clearTimeout(entry.gcScheduled)
      entry.gcScheduled = null
    }
  }

  private async executeGC<T>(atom: Lite.Atom<T>): Promise<void> {
    const entry = this.cache.get(atom)
    if (!entry) return
    
    entry.gcScheduled = null
    
    if (this.getSubscriberCount(atom) > 0) return
    if (entry.dependents.size > 0) return
    if (atom.keepAlive) return
    
    await this.release(atom)
    
    if (atom.deps) {
      for (const dep of Object.values(atom.deps)) {
        const depAtom = isAtom(dep) ? dep : isControllerDep(dep) ? dep.atom : null
        if (!depAtom) continue
        
        const depEntry = this.cache.get(depAtom)
        if (depEntry) {
          depEntry.dependents.delete(atom)
          this.maybeScheduleGC(depAtom)
        }
      }
    }
  }

  private notifyEntry(entry: AtomEntry<unknown>, event: 'resolving' | 'resolved'): void {
    const eventListeners = entry.listeners.get(event)
    if (eventListeners?.size) {
      for (const listener of [...eventListeners]) {
        listener()
      }
    }

    const allListeners = entry.listeners.get('*')
    if (allListeners?.size) {
      for (const listener of [...allListeners]) {
        listener()
      }
    }
  }

  private notifyEntryAll(entry: AtomEntry<unknown>): void {
    const allListeners = entry.listeners.get('*')
    if (allListeners?.size) {
      for (const listener of [...allListeners]) {
        listener()
      }
    }
  }

  private emitStateChange(state: AtomState, atom: Lite.Atom<unknown>): void {
    if (this.stateListeners.size === 0) return
    const stateMap = this.stateListeners.get(state)
    if (!stateMap) return
    const listeners = stateMap.get(atom)
    if (listeners?.size) {
      for (const listener of [...listeners]) {
        listener()
      }
    }
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

  resolve<T>(atom: Lite.Atom<T>): Promise<T> {
    if (this.disposed) return Promise.reject(new Error("Scope is disposed"))

    if (!this.initialized) {
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
      for (let i = entry.cleanups.length - 1; i >= 0; i--) {
        try { await entry.cleanups[i]?.() } catch {}
      }
      entry.cleanups = []
      entry.state = 'resolving'
      this.emitStateChange('resolving', atom)
      this.notifyEntry(entry as AtomEntry<unknown>, 'resolving')
    }

    const resolvedDeps = await this.resolveDeps(atom.deps, undefined, atom)

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
        value = atom.deps ? await factory(ctx, resolvedDeps) : await factory(ctx)
      } else {
        const doResolve = async () => atom.deps ? factory(ctx, resolvedDeps) : factory(ctx)
        const event: Lite.ResolveEvent = { kind: "atom", target: atom as Lite.Atom<unknown>, scope: this }
        value = await this.applyResolveExtensions(event, doResolve)
      }
      entry.state = 'resolved'
      entry.value = value
      entry.hasValue = true
      entry.error = undefined
      entry.resolvedPromise = Promise.resolve(value)
      this.emitStateChange('resolved', atom)
      this.notifyEntry(entry as AtomEntry<unknown>, 'resolved')

      if (entry.pendingInvalidate) {
        entry.pendingInvalidate = false
        this.invalidationChain?.delete(atom)
        this.scheduleInvalidation(atom)
      } else if (entry.pendingSet) {
        this.invalidationChain?.delete(atom)
        this.scheduleInvalidation(atom)
      }

      return value
    } catch (err) {
      entry.state = 'failed'
      entry.error = err instanceof Error ? err : new Error(String(err))
      entry.value = undefined
      entry.hasValue = false
      this.emitStateChange('failed', atom)
      this.notifyEntryAll(entry as AtomEntry<unknown>)

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

  async resolveDeps(
    deps: Record<string, Lite.Dependency> | undefined,
    ctx?: Lite.ExecutionContext,
    dependentAtom?: Lite.Atom<unknown>
  ): Promise<Record<string, unknown>> {
    if (!deps) return {}

    const result: Record<string, unknown> = {}
    const parallel: Promise<void>[] = []
    const deferredResources: [string, Lite.Resource<unknown>][] = []

    for (const key in deps) {
      const dep = deps[key]!
      if (isAtom(dep)) {
        const cachedEntry = this.cache.get(dep)
        if (cachedEntry?.state === 'resolved') {
          result[key] = cachedEntry.value
          if (dependentAtom) cachedEntry.dependents.add(dependentAtom)
        } else {
          parallel.push(
            this.resolve(dep).then(value => {
              result[key] = value
              if (dependentAtom) {
                const depEntry = this.getEntry(dep)
                if (depEntry) depEntry.dependents.add(dependentAtom)
              }
            })
          )
        }
      } else if (isControllerDep(dep)) {
        if (dep.watch) {
          if (!dependentAtom) throw new Error("controller({ watch: true }) is only supported in atom dependencies")
          if (!dep.resolve) throw new Error("controller({ watch: true }) requires resolve: true")
        }
        const ctrl = this.controller(dep.atom)
        if (dep.resolve) {
          const cachedCtrlEntry = this.cache.get(dep.atom)
          if (cachedCtrlEntry?.state === 'resolved') {
            result[key] = ctrl
            if (dependentAtom) cachedCtrlEntry.dependents.add(dependentAtom)
            if (dep.watch) {
              const eq = dep.eq ?? shallowEqual
              let prev = ctrl.get() as unknown
              const unsub = this.on("resolved", dep.atom, () => {
                const next = ctrl.get() as unknown
                if (!eq(prev, next)) {
                  this.scheduleInvalidation(dependentAtom!)
                }
                prev = next
              })
              const depEntry = this.getEntry(dependentAtom!)
              if (depEntry) depEntry.cleanups.push(unsub)
              else unsub()
            }
          } else {
            parallel.push(
              ctrl.resolve().then(() => {
                result[key] = ctrl
                if (dependentAtom) {
                  const depEntry = this.getEntry(dep.atom)
                  if (depEntry) depEntry.dependents.add(dependentAtom)
                }
                if (dep.watch) {
                  const eq = dep.eq ?? shallowEqual
                  let prev = ctrl.get() as unknown
                  const unsub = this.on("resolved", dep.atom, () => {
                    const next = ctrl.get() as unknown
                    if (!eq(prev, next)) {
                      this.scheduleInvalidation(dependentAtom!)
                    }
                    prev = next
                  })
                  const depEntry = this.getEntry(dependentAtom!)
                  if (depEntry) depEntry.cleanups.push(unsub)
                  else unsub()
                }
              })
            )
          }
        } else {
          result[key] = ctrl
          if (dependentAtom) {
            const depEntry = this.getEntry(dep.atom)
            if (depEntry) depEntry.dependents.add(dependentAtom)
          }
        }
      } else if (tagExecutorSymbol in (dep as object)) {
        const tagExecutor = dep as Lite.TagExecutor<unknown, boolean>

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
      } else if (isResource(dep)) {
        deferredResources.push([key, dep as Lite.Resource<unknown>])
      }
    }

    if (parallel.length === 1) await parallel[0]
    else if (parallel.length > 1) await Promise.all(parallel)

    for (const [key, resource] of deferredResources) {
      if (!ctx) {
        throw new Error("Resource deps require an ExecutionContext")
      }

      const resourceKey = getResourceKey(resource)
      const storeCtx = ctx.parent ?? ctx

      if (storeCtx.data.has(resourceKey)) {
        result[key] = storeCtx.data.get(resourceKey)
        continue
      }

      if (ctx.data.seekHas(resourceKey)) {
        result[key] = ctx.data.seek(resourceKey)
        continue
      }

      let flights = inflightResources.get(storeCtx.data)
      if (!flights) {
        flights = new Map()
        inflightResources.set(storeCtx.data, flights)
      }

      const inflight = flights.get(resourceKey)
      if (inflight) {
        result[key] = await inflight
        continue
      }

      let localResolvingResources = resolvingResourcesMap.get(storeCtx.data)
      if (!localResolvingResources) {
        localResolvingResources = new Set()
        resolvingResourcesMap.set(storeCtx.data, localResolvingResources)
      }

      if (localResolvingResources.has(resourceKey)) {
        throw new Error(`Circular resource dependency detected: ${resource.name ?? "anonymous"}`)
      }

      const resolve = async () => {
        localResolvingResources.add(resourceKey)
        try {
          const resourceDeps = await this.resolveDeps(resource.deps, ctx)

          const factory = resource.factory as (
            ctx: Lite.ExecutionContext,
            deps?: Record<string, unknown>
          ) => MaybePromise<unknown>

          let value: unknown
          if (this.resolveExts.length === 0) {
            value = resource.deps ? await factory(storeCtx, resourceDeps) : await factory(storeCtx)
          } else {
            const event: Lite.ResolveEvent = { kind: "resource", target: resource, ctx: storeCtx }
            const doResolve = async () => resource.deps ? factory(storeCtx, resourceDeps) : factory(storeCtx)
            value = await this.applyResolveExtensions(event, doResolve)
          }
          storeCtx.data.set(resourceKey, value)
          return value
        } finally {
          localResolvingResources.delete(resourceKey)
        }
      }

      const promise = resolve()
      flights.set(resourceKey, promise)

      try {
        result[key] = await promise
      } finally {
        flights.delete(resourceKey)
      }
    }

    return result
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

  scheduleSet<T>(atom: Lite.Atom<T>, value: T): void {
    const entry = this.cache.get(atom) as AtomEntry<T> | undefined
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

    entry.pendingSet = { value }
    this.scheduleInvalidation(atom)
  }

  scheduleUpdate<T>(atom: Lite.Atom<T>, fn: (prev: T) => T): void {
    const entry = this.cache.get(atom) as AtomEntry<T> | undefined
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

    entry.pendingSet = { fn }
    this.scheduleInvalidation(atom)
  }

  private async doInvalidateSequential<T>(atom: Lite.Atom<T>): Promise<void> {
    const entry = this.cache.get(atom) as AtomEntry<T> | undefined
    if (!entry) return
    if (entry.state === "idle") return

    const previousValue = entry.value
    const pendingSet = entry.pendingSet
    entry.pendingSet = undefined

    if (pendingSet) {
      entry.state = "resolving"
      entry.value = previousValue
      entry.error = undefined
      entry.pendingInvalidate = false
      this.emitStateChange("resolving", atom)
      this.notifyEntry(entry as AtomEntry<unknown>, "resolving")

      entry.value = 'value' in pendingSet ? pendingSet.value : pendingSet.fn(previousValue as T)
      entry.state = 'resolved'
      entry.hasValue = true
      entry.resolvedPromise = undefined
      this.emitStateChange('resolved', atom)
      this.notifyEntry(entry as AtomEntry<unknown>, 'resolved')
      this.invalidationChain?.delete(atom)
      return
    }

    for (let i = entry.cleanups.length - 1; i >= 0; i--) {
      try { await entry.cleanups[i]?.() } catch {}
    }
    entry.cleanups = []

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

    for (let i = entry.cleanups.length - 1; i >= 0; i--) {
      try { await entry.cleanups[i]?.() } catch {}
    }

    if (atom.deps) {
      for (const dep of Object.values(atom.deps)) {
        const depAtom = isAtom(dep) ? dep : isControllerDep(dep) ? dep.atom : null
        if (!depAtom) continue
        const depEntry = this.cache.get(depAtom)
        if (depEntry) {
          depEntry.dependents.delete(atom)
          this.maybeScheduleGC(depAtom)
        }
      }
    }

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

    this.invalidationQueue.clear()
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

  async exec(options: {
    flow: Lite.Flow<unknown, unknown>
    input?: unknown
    rawInput?: unknown
    name?: string
    tags?: Lite.Tagged<any>[]
  } | Lite.ExecFnOptions<unknown>): Promise<unknown> {
    if (this.closed) {
      throw new Error("ExecutionContext is closed")
    }

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
        const result = presetValue !== undefined && typeof presetValue === 'function'
          ? await childCtx.execPresetFn(flow, presetValue as (ctx: Lite.ExecutionContext) => unknown)
          : await childCtx.execFlowInternal(flow)
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

      try {
        const result = await childCtx.execFnInternal(options)
        await childCtx.close({ ok: true })
        return result
      } catch (error) {
        await childCtx.close({ ok: false, error })
        throw error
      }
    }
  }

  private async execFlowInternal(flow: Lite.Flow<unknown, unknown>): Promise<unknown> {
    const resolvedDeps = await this.scope.resolveDeps(flow.deps, this)

    const factory = flow.factory as unknown as (
      ctx: Lite.ExecutionContext,
      deps?: Record<string, unknown>
    ) => MaybePromise<unknown>

    if (this.scope.execExts.length === 0) {
      return flow.deps ? factory(this, resolvedDeps) : factory(this)
    }

    const doExec = async (): Promise<unknown> => flow.deps ? factory(this, resolvedDeps) : factory(this)
    return this.applyExecExtensions(flow, doExec)
  }

  private async execFnInternal(options: Lite.ExecFnOptions<unknown>): Promise<unknown> {
    const { fn, params } = options
    if (this.scope.execExts.length === 0) {
      return fn(this, ...params)
    }
    const doExec = () => Promise.resolve(fn(this, ...params))
    return this.applyExecExtensions(fn, doExec)
  }

  async execPresetFn(
    flow: Lite.Flow<unknown, unknown>,
    fn: (ctx: Lite.ExecutionContext) => MaybePromise<unknown>
  ): Promise<unknown> {
    if (this.scope.execExts.length === 0) {
      return fn(this)
    }
    const doExec = () => Promise.resolve(fn(this))
    return this.applyExecExtensions(flow, doExec)
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

  onClose(fn: (result: Lite.CloseResult) => MaybePromise<void>): void {
    this.cleanups.push(fn)
  }

  close(result: Lite.CloseResult = { ok: true }): Promise<void> {
    if (this.closed) return Promise.resolve()

    this.closed = true

    if (this.cleanups.length === 0) return Promise.resolve()

    return this.runCleanups(result)
  }

  private async runCleanups(result: Lite.CloseResult): Promise<void> {
    for (let i = this.cleanups.length - 1; i >= 0; i--) {
      try { await this.cleanups[i]?.(result) } catch {}
    }
  }
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

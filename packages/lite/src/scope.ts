import { controllerSymbol, tagExecutorSymbol } from "./symbols"
import type { Lite, MaybePromise, AtomState } from "./types"
import { isAtom, isControllerDep } from "./atom"

type ListenerEvent = 'resolving' | 'resolved' | '*'

class DataStoreImpl implements Lite.DataStore {
  private readonly map = new Map<symbol, unknown>()

  get<T, H extends boolean>(tag: Lite.Tag<T, H>): H extends true ? T : T | undefined {
    if (this.map.has(tag.key)) {
      return this.map.get(tag.key) as T
    }
    if (tag.hasDefault) {
      return tag.defaultValue as T
    }
    return undefined as H extends true ? T : T | undefined
  }

  set<T>(tag: Lite.Tag<T, boolean>, value: T): void {
    this.map.set(tag.key, value)
  }

  has(tag: Lite.Tag<unknown, boolean>): boolean {
    return this.map.has(tag.key)
  }

  delete(tag: Lite.Tag<unknown, boolean>): boolean {
    return this.map.delete(tag.key)
  }

  clear(): void {
    this.map.clear()
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
  data?: Lite.DataStore
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
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) {
        this.cleanup()
      }
    }
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private cleanup(): void {
    this.ctrlUnsub?.()
    this.ctrlUnsub = null
    this.listeners.clear()
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
    if (!entry || entry.state === 'idle') {
      throw new Error("Atom not resolved")
    }
    if (entry.state === 'failed' && entry.error) {
      throw entry.error
    }
    if (entry.state === 'resolving' && entry.hasValue) {
      return entry.value as T
    }
    if (entry.state === 'resolved' && entry.hasValue) {
      return entry.value as T
    }
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

  on(event: ListenerEvent, listener: () => void): () => void {
    return this.scope.addListener(this.atom, event, listener)
  }
}

class ScopeImpl implements Lite.Scope {
  private cache = new Map<Lite.Atom<unknown>, AtomEntry<unknown>>()
  private presets = new Map<Lite.Atom<unknown>, unknown | Lite.Atom<unknown>>()
  private resolving = new Set<Lite.Atom<unknown>>()
  private pending = new Map<Lite.Atom<unknown>, Promise<unknown>>()
  private stateListeners = new Map<AtomState, Map<Lite.Atom<unknown>, Set<() => void>>>()
  private invalidationQueue = new Set<Lite.Atom<unknown>>()
  private invalidationScheduled = false
  private invalidationChain: Set<Lite.Atom<unknown>> | null = null
  private chainPromise: Promise<void> | null = null
  private processingChain = false
  private currentlyInvalidating: Lite.Atom<unknown> | null = null
  private initialized = false
  readonly extensions: Lite.Extension[]
  readonly tags: Lite.Tagged<unknown>[]
  readonly ready: Promise<void>

  private scheduleInvalidation<T>(atom: Lite.Atom<T>): void {
    if (this.currentlyInvalidating === atom) {
      const entry = this.cache.get(atom)
      if (entry) {
        entry.pendingInvalidate = true
      }
      return
    }

    this.invalidationQueue.add(atom)

    if (!this.chainPromise) {
      this.invalidationChain = new Set()
      this.invalidationScheduled = true
      this.chainPromise = new Promise<void>((resolve, reject) => {
        queueMicrotask(() => {
          this.processInvalidationChain().then(resolve).catch(reject)
        })
      })
    }
  }

  private async processInvalidationChain(): Promise<void> {
    this.processingChain = true

    try {
      while (this.invalidationQueue.size > 0) {
        const atom = this.invalidationQueue.values().next().value as Lite.Atom<unknown>
        this.invalidationQueue.delete(atom)

        if (this.invalidationChain!.has(atom)) {
          const path = this.buildChainPath(atom)
          throw new Error(`Infinite invalidation loop detected: ${path}`)
        }

        this.invalidationChain!.add(atom)
        this.currentlyInvalidating = atom
        await this.doInvalidateSequential(atom)
        this.currentlyInvalidating = null
      }
    } finally {
      this.processingChain = false
      this.invalidationChain = null
      this.chainPromise = null
      this.invalidationScheduled = false
    }
  }

  private buildChainPath(loopAtom: Lite.Atom<unknown>): string {
    const atoms = Array.from(this.invalidationChain!)
    const labels = atoms.map((a, i) => `atom${i + 1}`)
    labels.push(labels[0] ?? "atom")
    return labels.join(" → ")
  }

  constructor(options?: Lite.ScopeOptions) {
    this.extensions = options?.extensions ?? []
    this.tags = options?.tags ?? []

    for (const p of options?.presets ?? []) {
      this.presets.set(p.atom, p.value)
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
      }
      this.cache.set(atom, entry as AtomEntry<unknown>)
    }
    return entry
  }

  addListener<T>(atom: Lite.Atom<T>, event: ListenerEvent, listener: () => void): () => void {
    const entry = this.getOrCreateEntry(atom)
    const listeners = entry.listeners.get(event)!
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  private notifyListeners<T>(atom: Lite.Atom<T>, event: 'resolving' | 'resolved'): void {
    const entry = this.cache.get(atom)
    if (!entry) return

    const eventListeners = entry.listeners.get(event)
    if (eventListeners) {
      for (const listener of eventListeners) {
        listener()
      }
    }

    const allListeners = entry.listeners.get('*')
    if (allListeners) {
      for (const listener of allListeners) {
        listener()
      }
    }
  }

  private notifyAllListeners<T>(atom: Lite.Atom<T>): void {
    const entry = this.cache.get(atom)
    if (!entry) return

    const allListeners = entry.listeners.get('*')
    if (allListeners) {
      for (const listener of allListeners) {
        listener()
      }
    }
  }

  private emitStateChange(state: AtomState, atom: Lite.Atom<unknown>): void {
    const stateMap = this.stateListeners.get(state)
    if (stateMap) {
      const listeners = stateMap.get(atom)
      if (listeners) {
        for (const listener of listeners) {
          listener()
        }
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

  async resolve<T>(atom: Lite.Atom<T>): Promise<T> {
    if (!this.initialized) {
      await this.ready
    }

    const entry = this.cache.get(atom) as AtomEntry<T> | undefined
    if (entry?.state === 'resolved') {
      return entry.value as T
    }

    const pendingPromise = this.pending.get(atom)
    if (pendingPromise) {
      return pendingPromise as Promise<T>
    }

    if (this.resolving.has(atom)) {
      throw new Error("Circular dependency detected")
    }

    const presetValue = this.presets.get(atom)
    if (presetValue !== undefined) {
      if (isAtom(presetValue)) {
        return this.resolve(presetValue as Lite.Atom<T>)
      }
      const newEntry = this.getOrCreateEntry(atom)
      newEntry.state = 'resolved'
      newEntry.value = presetValue as T
      newEntry.hasValue = true
      this.emitStateChange('resolved', atom)
      this.notifyListeners(atom, 'resolved')
      return newEntry.value
    }

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
      entry.state = 'resolving'
      this.emitStateChange('resolving', atom)
      this.notifyListeners(atom, 'resolving')
    }

    const resolvedDeps = await this.resolveDeps(atom.deps)

    const ctx: Lite.ResolveContext = {
      cleanup: (fn) => entry.cleanups.push(fn),
      invalidate: () => {
        this.scheduleInvalidation(atom)
      },
      scope: this,
      get data() {
        if (!entry.data) {
          entry.data = new DataStoreImpl()
        }
        return entry.data
      },
    }

    const factory = atom.factory as (
      ctx: Lite.ResolveContext,
      deps?: Record<string, unknown>
    ) => MaybePromise<T>

    const doResolve = async () => {
      if (atom.deps && Object.keys(atom.deps).length > 0) {
        return factory(ctx, resolvedDeps)
      } else {
        return factory(ctx)
      }
    }

    try {
      const value = await this.applyResolveExtensions(atom, doResolve)
      entry.state = 'resolved'
      entry.value = value
      entry.hasValue = true
      entry.error = undefined
      this.emitStateChange('resolved', atom)
      this.notifyListeners(atom, 'resolved')

      if (entry.pendingInvalidate) {
        entry.pendingInvalidate = false
        this.scheduleInvalidation(atom)
      }

      return value
    } catch (err) {
      entry.state = 'failed'
      entry.error = err instanceof Error ? err : new Error(String(err))
      entry.value = undefined
      entry.hasValue = false
      this.emitStateChange('failed', atom)
      this.notifyAllListeners(atom)

      if (entry.pendingInvalidate) {
        entry.pendingInvalidate = false
        this.scheduleInvalidation(atom)
      }

      throw entry.error
    }
  }

  private async applyResolveExtensions<T>(
    atom: Lite.Atom<T>,
    doResolve: () => Promise<T>
  ): Promise<T> {
    let next = doResolve

    for (let i = this.extensions.length - 1; i >= 0; i--) {
      const ext = this.extensions[i]
      if (ext?.wrapResolve) {
        const currentNext = next
        next = ext.wrapResolve.bind(ext, currentNext, atom, this) as () => Promise<T>
      }
    }

    return next()
  }

  async resolveDeps(
    deps: Record<string, Lite.Dependency> | undefined,
    tagSource?: Lite.Tagged<unknown>[]
  ): Promise<Record<string, unknown>> {
    if (!deps) return {}

    const result: Record<string, unknown> = {}
    const tags = tagSource ?? this.tags

    for (const [key, dep] of Object.entries(deps)) {
      if (isAtom(dep)) {
        result[key] = await this.resolve(dep)
      } else if (isControllerDep(dep)) {
        result[key] = new ControllerImpl(dep.atom, this)
      } else if (tagExecutorSymbol in (dep as object)) {
        const tagExecutor = dep as Lite.TagExecutor<unknown, boolean>

        switch (tagExecutor.mode) {
          case "required":
            result[key] = tagExecutor.tag.get(tags)
            break
          case "optional":
            result[key] = tagExecutor.tag.find(tags)
            break
          case "all":
            result[key] = tagExecutor.tag.collect(tags)
            break
        }
      }
    }

    return result
  }

  controller<T>(atom: Lite.Atom<T>): Lite.Controller<T> {
    return new ControllerImpl(atom, this)
  }

  select<T, S>(
    atom: Lite.Atom<T>,
    selector: (value: T) => S,
    options?: Lite.SelectOptions<S>
  ): Lite.SelectHandle<S> {
    const ctrl = this.controller(atom)
    const eq = options?.eq ?? ((a, b) => a === b)
    return new SelectHandleImpl(ctrl, selector, eq)
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

  private async doInvalidate<T>(atom: Lite.Atom<T>, entry: AtomEntry<T>): Promise<void> {
    const previousValue = entry.value
    for (let i = entry.cleanups.length - 1; i >= 0; i--) {
      const cleanup = entry.cleanups[i]
      if (cleanup) await cleanup()
    }
    entry.cleanups = []
    entry.state = 'resolving'
    entry.value = previousValue
    entry.error = undefined
    entry.pendingInvalidate = false
    this.pending.delete(atom)
    this.resolving.delete(atom)
    this.emitStateChange('resolving', atom)
    this.notifyListeners(atom, 'resolving')

    this.resolve(atom).catch(() => {})
  }

  private async doInvalidateSequential<T>(atom: Lite.Atom<T>): Promise<void> {
    const entry = this.cache.get(atom) as AtomEntry<T> | undefined
    if (!entry) return
    if (entry.state === "idle") return

    const previousValue = entry.value
    for (let i = entry.cleanups.length - 1; i >= 0; i--) {
      const cleanup = entry.cleanups[i]
      if (cleanup) await cleanup()
    }
    entry.cleanups = []
    entry.state = "resolving"
    entry.value = previousValue
    entry.error = undefined
    entry.pendingInvalidate = false
    this.pending.delete(atom)
    this.resolving.delete(atom)
    this.emitStateChange("resolving", atom)
    this.notifyListeners(atom, "resolving")

    await this.resolve(atom)
  }

  async release<T>(atom: Lite.Atom<T>): Promise<void> {
    const entry = this.cache.get(atom)
    if (!entry) return

    for (let i = entry.cleanups.length - 1; i >= 0; i--) {
      const cleanup = entry.cleanups[i]
      if (cleanup) await cleanup()
    }

    this.cache.delete(atom)
  }

  async dispose(): Promise<void> {
    for (const ext of this.extensions) {
      if (ext.dispose) {
        await ext.dispose(this)
      }
    }

    const atoms = Array.from(this.cache.keys())
    for (const atom of atoms) {
      await this.release(atom as Lite.Atom<unknown>)
    }
  }

  createContext(options?: Lite.CreateContextOptions): Lite.ExecutionContext {
    return new ExecutionContextImpl(this, options)
  }
}

class ExecutionContextImpl implements Lite.ExecutionContext {
  private cleanups: (() => MaybePromise<void>)[] = []
  private closed = false
  private _input: unknown = undefined
  private readonly baseTags: Lite.Tagged<unknown>[]

  constructor(
    readonly scope: ScopeImpl,
    options?: Lite.CreateContextOptions
  ) {
    const ctxTags = options?.tags
    this.baseTags = ctxTags?.length
      ? [...ctxTags, ...scope.tags]
      : scope.tags
  }

  get input(): unknown {
    return this._input
  }

  async exec<T>(options: Lite.ExecFlowOptions<T> | Lite.ExecFnOptions<T>): Promise<T> {
    if (this.closed) {
      throw new Error("ExecutionContext is closed")
    }

    if ("flow" in options) {
      return this.execFlow(options)
    } else {
      return this.execFn(options)
    }
  }

  private async execFlow<T>(options: Lite.ExecFlowOptions<T>): Promise<T> {
    const { flow, input, tags: execTags } = options

    const hasExtraTags = (execTags?.length ?? 0) > 0 || (flow.tags?.length ?? 0) > 0
    const allTags = hasExtraTags
      ? [...(execTags ?? []), ...this.baseTags, ...(flow.tags ?? [])]
      : this.baseTags

    const resolvedDeps = await this.scope.resolveDeps(flow.deps, allTags)

    this._input = input

    const factory = flow.factory as unknown as (
      ctx: Lite.ExecutionContext,
      deps?: Record<string, unknown>
    ) => MaybePromise<T>

    const doExec = async (): Promise<T> => {
      if (flow.deps && Object.keys(flow.deps).length > 0) {
        return factory(this, resolvedDeps)
      } else {
        return factory(this)
      }
    }

    return this.applyExecExtensions(flow, doExec)
  }

  private execFn<T>(options: Lite.ExecFnOptions<T>): Promise<T> {
    const { fn, params } = options
    const doExec = () => Promise.resolve(fn(...params))
    return this.applyExecExtensions(fn, doExec)
  }

  private async applyExecExtensions<T>(
    target: Lite.Flow<T, unknown> | ((...args: unknown[]) => MaybePromise<T>),
    doExec: () => Promise<T>
  ): Promise<T> {
    let next = doExec

    for (let i = this.scope.extensions.length - 1; i >= 0; i--) {
      const ext = this.scope.extensions[i]
      if (ext?.wrapExec) {
        const currentNext = next
        next = ext.wrapExec.bind(ext, currentNext, target, this) as () => Promise<T>
      }
    }

    return next()
  }

  onClose(fn: () => MaybePromise<void>): void {
    this.cleanups.push(fn)
  }

  async close(): Promise<void> {
    if (this.closed) return

    this.closed = true

    for (let i = this.cleanups.length - 1; i >= 0; i--) {
      const cleanup = this.cleanups[i]
      if (cleanup) await cleanup()
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

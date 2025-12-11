import { controllerSymbol, tagExecutorSymbol } from "./symbols"
import type { Lite, MaybePromise, AtomState } from "./types"
import { isAtom, isControllerDep } from "./atom"
import { ParseError } from "./errors"

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
  private presets = new Map<Lite.Atom<unknown>, unknown | Lite.Atom<unknown>>()
  private resolving = new Set<Lite.Atom<unknown>>()
  private pending = new Map<Lite.Atom<unknown>, Promise<unknown>>()
  private stateListeners = new Map<AtomState, Map<Lite.Atom<unknown>, Set<() => void>>>()
  private invalidationQueue = new Set<Lite.Atom<unknown>>()
  private invalidationScheduled = false
  private invalidationChain: Set<Lite.Atom<unknown>> | null = null
  private chainPromise: Promise<void> | null = null
  private initialized = false
  private controllers = new Map<Lite.Atom<unknown>, ControllerImpl<unknown>>()
  readonly extensions: Lite.Extension[]
  readonly tags: Lite.Tagged<unknown>[]
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
      this.invalidationScheduled = true
      this.chainPromise = new Promise<void>((resolve, reject) => {
        queueMicrotask(() => {
          this.processInvalidationChain().then(resolve).catch(reject)
        })
      })
    }
  }

  private async processInvalidationChain(): Promise<void> {
    try {
      while (this.invalidationQueue.size > 0) {
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
      this.invalidationScheduled = false
    }
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
          entry.data = new ContextDataImpl()
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
      this.notifyAllListeners(atom)

      if (entry.pendingInvalidate) {
        entry.pendingInvalidate = false
        this.invalidationChain?.delete(atom)
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
        const ctrl = new ControllerImpl(dep.atom, this)
        if (dep.resolve) {
          await ctrl.resolve()
        }
        result[key] = ctrl
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

  controller<T>(atom: Lite.Atom<T>): Lite.Controller<T>
  controller<T>(atom: Lite.Atom<T>, options: { resolve: true }): Promise<Lite.Controller<T>>
  controller<T>(atom: Lite.Atom<T>, options?: Lite.ControllerOptions): Lite.Controller<T> | Promise<Lite.Controller<T>>
  controller<T>(atom: Lite.Atom<T>, options?: Lite.ControllerOptions): Lite.Controller<T> | Promise<Lite.Controller<T>> {
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

    if (pendingSet) {
      if ('value' in pendingSet) {
        entry.value = pendingSet.value
      } else {
        entry.value = pendingSet.fn(previousValue as T)
      }
      entry.state = 'resolved'
      entry.hasValue = true
      this.emitStateChange('resolved', atom)
      this.notifyListeners(atom, 'resolved')
      return
    }

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
    this.controllers.delete(atom)
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

  async flush(): Promise<void> {
    if (this.chainPromise) {
      await this.chainPromise
    }
  }

  createContext(options?: Lite.CreateContextOptions): Lite.ExecutionContext {
    return new ExecutionContextImpl(this, options)
  }
}

class ExecutionContextImpl implements Lite.ExecutionContext {
  private cleanups: (() => MaybePromise<void>)[] = []
  private closed = false
  private readonly _input: unknown
  private readonly baseTags: Lite.Tagged<unknown>[]
  private _data: ContextDataImpl | undefined
  readonly parent: Lite.ExecutionContext | undefined

  constructor(
    readonly scope: ScopeImpl,
    options?: Lite.CreateContextOptions & {
      parent?: Lite.ExecutionContext
      input?: unknown
    }
  ) {
    this.parent = options?.parent
    this._input = options?.input
    const ctxTags = options?.tags
    this.baseTags = ctxTags?.length
      ? [...ctxTags, ...scope.tags]
      : scope.tags
  }

  get input(): unknown {
    return this._input
  }

  get data(): Lite.ContextData {
    if (!this._data) {
      this._data = new ContextDataImpl()
    }
    return this._data
  }

  async exec(options: {
    flow: Lite.Flow<unknown, unknown>
    input?: unknown
    rawInput?: unknown
    name?: string
    tags?: Lite.Tagged<unknown>[]
  } | Lite.ExecFnOptions<unknown>): Promise<unknown> {
    if (this.closed) {
      throw new Error("ExecutionContext is closed")
    }

    if ("flow" in options) {
      const { flow, input, rawInput, name: execName } = options
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
        tags: this.baseTags,
        input: parsedInput
      })

      try {
        return await childCtx.execFlowInternal(options)
      } finally {
        await childCtx.close()
      }
    } else {
      const childCtx = new ExecutionContextImpl(this.scope, {
        parent: this,
        tags: this.baseTags
      })

      try {
        return await childCtx.execFnInternal(options)
      } finally {
        await childCtx.close()
      }
    }
  }

  private async execFlowInternal(options: {
    flow: Lite.Flow<unknown, unknown>
    input?: unknown
    name?: string
    tags?: Lite.Tagged<unknown>[]
  }): Promise<unknown> {
    const { flow, tags: execTags } = options

    const hasExtraTags = (execTags?.length ?? 0) > 0 || (flow.tags?.length ?? 0) > 0
    const allTags = hasExtraTags
      ? [...(execTags ?? []), ...this.baseTags, ...(flow.tags ?? [])]
      : this.baseTags

    const resolvedDeps = await this.scope.resolveDeps(flow.deps, allTags)

    const factory = flow.factory as unknown as (
      ctx: Lite.ExecutionContext,
      deps?: Record<string, unknown>
    ) => MaybePromise<unknown>

    const doExec = async (): Promise<unknown> => {
      if (flow.deps && Object.keys(flow.deps).length > 0) {
        return factory(this, resolvedDeps)
      } else {
        return factory(this)
      }
    }

    return this.applyExecExtensions(flow, doExec)
  }

  private async execFnInternal(options: Lite.ExecFnOptions<unknown>): Promise<unknown> {
    const { fn, params } = options
    const doExec = () => Promise.resolve(fn(this, ...params))
    return this.applyExecExtensions(fn, doExec)
  }

  private async applyExecExtensions(
    target: Lite.Flow<unknown, unknown> | ((ctx: Lite.ExecutionContext, ...args: unknown[]) => MaybePromise<unknown>),
    doExec: () => Promise<unknown>
  ): Promise<unknown> {
    let next = doExec

    for (let i = this.scope.extensions.length - 1; i >= 0; i--) {
      const ext = this.scope.extensions[i]
      if (ext?.wrapExec) {
        const currentNext = next
        next = ext.wrapExec.bind(ext, currentNext, target, this) as () => Promise<unknown>
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

import { controllerSymbol, tagExecutorSymbol } from "./symbols"
import type { Lite, MaybePromise, AtomState } from "./types"
import { isAtom, isControllerDep } from "./atom"

interface AtomEntry<T> {
  state: AtomState
  value?: T
  error?: Error
  cleanups: (() => MaybePromise<void>)[]
  listeners: Set<() => void>
  pendingInvalidate: boolean
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
    if (!entry) {
      throw new Error("Atom not resolved")
    }
    if (entry.state === 'failed' && entry.error) {
      throw entry.error
    }
    if (entry.value === undefined) {
      throw new Error("Atom not resolved")
    }
    return entry.value as T
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

  on(listener: () => void): () => void {
    return this.scope.addListener(this.atom, listener)
  }
}

class ScopeImpl implements Lite.Scope {
  private cache = new Map<Lite.Atom<unknown>, AtomEntry<unknown>>()
  private presets = new Map<Lite.Atom<unknown>, unknown | Lite.Atom<unknown>>()
  private resolving = new Set<Lite.Atom<unknown>>()
  private pending = new Map<Lite.Atom<unknown>, Promise<unknown>>()
  private stateListeners = new Map<AtomState, Map<Lite.Atom<unknown>, Set<() => void>>>()
  readonly extensions: Lite.Extension[]
  readonly tags: Lite.Tagged<unknown>[]

  private scheduleInvalidation<T>(atom: Lite.Atom<T>): void {
    setTimeout(() => this.invalidate(atom), 0)
  }

  constructor(options?: Lite.ScopeOptions) {
    this.extensions = options?.extensions ?? []
    this.tags = options?.tags ?? []

    for (const p of options?.presets ?? []) {
      this.presets.set(p.atom, p.value)
    }
  }

  async init(): Promise<void> {
    for (const ext of this.extensions) {
      if (ext.init) {
        await ext.init(this)
      }
    }
  }

  getEntry<T>(atom: Lite.Atom<T>): AtomEntry<T> | undefined {
    return this.cache.get(atom) as AtomEntry<T> | undefined
  }

  private getOrCreateEntry<T>(atom: Lite.Atom<T>): AtomEntry<T> {
    let entry = this.cache.get(atom) as AtomEntry<T> | undefined
    if (!entry) {
      entry = {
        state: 'idle',
        cleanups: [],
        listeners: new Set(),
        pendingInvalidate: false,
      }
      this.cache.set(atom, entry as AtomEntry<unknown>)
    }
    return entry
  }

  addListener<T>(atom: Lite.Atom<T>, listener: () => void): () => void {
    const entry = this.getOrCreateEntry(atom)
    entry.listeners.add(listener)
    return () => {
      entry.listeners.delete(listener)
    }
  }

  private notifyListeners<T>(atom: Lite.Atom<T>): void {
    const entry = this.cache.get(atom)
    if (entry) {
      for (const listener of entry.listeners) {
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
    return () => {
      listeners!.delete(listener)
      if (listeners!.size === 0) {
        stateMap!.delete(atom)
      }
    }
  }

  async resolve<T>(atom: Lite.Atom<T>): Promise<T> {
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
      this.emitStateChange('resolved', atom)
      this.notifyListeners(atom)
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
    entry.state = 'resolving'
    this.emitStateChange('resolving', atom)
    this.notifyListeners(atom)

    const resolvedDeps = await this.resolveDeps(atom.deps)

    const ctx: Lite.ResolveContext = {
      cleanup: (fn) => entry.cleanups.push(fn),
      invalidate: () => {
        this.scheduleInvalidation(atom)
      },
      scope: this,
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
      entry.error = undefined
      this.emitStateChange('resolved', atom)
      this.notifyListeners(atom)

      if (entry.pendingInvalidate) {
        entry.pendingInvalidate = false
        this.scheduleInvalidation(atom)
      }

      return value
    } catch (err) {
      entry.state = 'failed'
      entry.error = err instanceof Error ? err : new Error(String(err))
      entry.value = undefined
      this.emitStateChange('failed', atom)
      this.notifyListeners(atom)

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
      const ext = this.extensions[i]!
      if (ext.wrapResolve) {
        const currentNext = next
        const wrap = ext.wrapResolve.bind(ext)
        next = () => wrap(currentNext, atom, this)
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

  invalidate<T>(atom: Lite.Atom<T>): void {
    const entry = this.cache.get(atom)
    if (!entry) return

    if (entry.state === 'resolving') {
      entry.pendingInvalidate = true
      return
    }

    this.doInvalidate(atom, entry as AtomEntry<T>)
  }

  private async doInvalidate<T>(atom: Lite.Atom<T>, entry: AtomEntry<T>): Promise<void> {
    for (let i = entry.cleanups.length - 1; i >= 0; i--) {
      await entry.cleanups[i]!()
    }
    entry.cleanups = []
    entry.state = 'idle'
    entry.error = undefined
    entry.pendingInvalidate = false

    this.resolve(atom).catch(() => {})
  }

  async release<T>(atom: Lite.Atom<T>): Promise<void> {
    const entry = this.cache.get(atom)
    if (!entry) return

    for (let i = entry.cleanups.length - 1; i >= 0; i--) {
      await entry.cleanups[i]!()
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
      const ext = this.scope.extensions[i]!
      if (ext.wrapExec) {
        const currentNext = next
        const wrap = ext.wrapExec.bind(ext)
        next = () => wrap(currentNext, target, this)
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
      await this.cleanups[i]!()
    }
  }
}

/**
 * Creates a DI container that manages Atom resolution, caching, and lifecycle.
 *
 * @param options - Optional configuration for extensions, presets, and tags
 * @returns A Promise that resolves to a Scope instance
 *
 * @example
 * ```typescript
 * const scope = await createScope({
 *   extensions: [loggingExtension],
 *   presets: [preset(dbAtom, testDb)]
 * })
 * const db = await scope.resolve(dbAtom)
 * ```
 */
export async function createScope(
  options?: Lite.ScopeOptions
): Promise<Lite.Scope> {
  const scope = new ScopeImpl(options)
  await scope.init()
  return scope
}

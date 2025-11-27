import { accessorSymbol } from "./symbols"
import type { Lite, MaybePromise } from "./types"
import { isAtom, isLazy } from "./atom"

interface ResolveState<T> {
  value: T
  cleanups: (() => MaybePromise<void>)[]
}

class AccessorImpl<T> implements Lite.Accessor<T> {
  readonly [accessorSymbol] = true

  constructor(
    private atom: Lite.Atom<T>,
    private scope: ScopeImpl
  ) {}

  get(): T {
    const state = this.scope.getState(this.atom)
    if (!state) {
      throw new Error("Atom not resolved")
    }
    return state.value
  }

  async resolve(): Promise<T> {
    return this.scope.resolve(this.atom)
  }

  async release(): Promise<void> {
    return this.scope.release(this.atom)
  }
}

class ScopeImpl implements Lite.Scope {
  private cache = new Map<Lite.Atom<unknown>, ResolveState<unknown>>()
  private presets = new Map<Lite.Atom<unknown>, unknown | Lite.Atom<unknown>>()
  private resolving = new Set<Lite.Atom<unknown>>()
  readonly extensions: Lite.Extension[]
  readonly tags: Lite.Tagged<unknown>[]

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

  getState<T>(atom: Lite.Atom<T>): ResolveState<T> | undefined {
    return this.cache.get(atom) as unknown as ResolveState<T> | undefined
  }

  async resolve<T>(atom: Lite.Atom<T>): Promise<T> {
    const cached = this.cache.get(atom)
    if (cached) {
      return cached.value as unknown as T
    }

    if (this.resolving.has(atom)) {
      throw new Error("Circular dependency detected")
    }

    const presetValue = this.presets.get(atom)
    if (presetValue !== undefined) {
      if (isAtom(presetValue)) {
        return this.resolve(presetValue as unknown as Lite.Atom<T>)
      }
      const state: ResolveState<T> = {
        value: presetValue as unknown as T,
        cleanups: [],
      }
      this.cache.set(atom, state)
      return state.value
    }

    this.resolving.add(atom)

    try {
      const resolvedDeps = await this.resolveDeps(atom.deps)
      const cleanups: (() => MaybePromise<void>)[] = []

      const ctx: Lite.ResolveContext = {
        cleanup: (fn) => cleanups.push(fn),
        scope: this,
      }

      let value: T
      const factory = atom.factory as unknown as (
        ctx: Lite.ResolveContext,
        deps?: Record<string, unknown>
      ) => MaybePromise<T>

      const doResolve = async () => {
        if (atom.deps && Object.keys(atom.deps).length > 0) {
          value = await factory(ctx, resolvedDeps)
        } else {
          value = await factory(ctx)
        }
        return value
      }

      value = await this.applyResolveExtensions(atom, doResolve)

      const state: ResolveState<T> = { value, cleanups }
      this.cache.set(atom, state)

      return value
    } finally {
      this.resolving.delete(atom)
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
      } else if (isLazy(dep)) {
        result[key] = new AccessorImpl(dep.atom, this)
      } else if ("mode" in dep && "tag" in dep) {
        const tagExecutor = dep as unknown as Lite.TagExecutor<unknown, boolean>

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

  accessor<T>(atom: Lite.Atom<T>): Lite.Accessor<T> {
    return new AccessorImpl(atom, this)
  }

  async release<T>(atom: Lite.Atom<T>): Promise<void> {
    const state = this.cache.get(atom)
    if (!state) return

    for (let i = state.cleanups.length - 1; i >= 0; i--) {
      await state.cleanups[i]!()
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
      await this.release(atom as unknown as Lite.Atom<unknown>)
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
    return Promise.resolve(fn(...params))
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

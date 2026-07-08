'use client'
'use no memo'

import { resource, type Lite } from '@pumped-fn/lite'
import { createStore, type PatchValue } from './store'

type ScopedValueActions = object
type ScopedValueDeps = Record<string, Lite.ResourceDependency>

type ScopedValueHelpers<State> = {
  readonly ctx: Lite.ExecutionContext
  get(): State
  getSnapshot(): State
  subscribe(listener: () => void): () => void
  set(value: State): void
  update(fn: (prev: State) => State): void
  patch(value: PatchValue<State>): void
}

type ScopedValueCloseHelpers<State> = {
  readonly ctx: Lite.ExecutionContext
  get(): State
}

interface ScopedValueAccess<State, Actions extends ScopedValueActions = {}> {
  readonly disposed: boolean
  readonly actions: Actions
  get(): State
  getSnapshot(): State
  subscribe(listener: () => void): () => void
  set(value: State): void
  update(fn: (prev: State) => State): void
  patch(value: PatchValue<State>): void
}

type ScopedValueView<State, Actions extends ScopedValueActions = {}> =
  ScopedValueAccess<State, Actions> & {
    readonly snapshot: State
  }

interface ScopedValueConfig<
  State,
  Deps extends ScopedValueDeps = {},
  Actions extends ScopedValueActions = {},
> {
  name?: string
  tags?: Lite.Tagged<any>[]
  deps?: Deps
  initial(ctx: Lite.ExecutionContext, deps: Lite.InferDeps<Deps>): State
  actions?(
    helpers: ScopedValueHelpers<State>,
    deps: Lite.InferDeps<Deps>
  ): Actions
  onClose?(
    helpers: ScopedValueCloseHelpers<State>,
    deps: Lite.InferDeps<Deps>,
    result: Lite.CloseResult
  ): void | Promise<void>
}

type ScopedValue<
  State,
  Actions extends ScopedValueActions = {},
> = Lite.Resource<ScopedValueAccess<State, Actions>> & {
  resolve(ctx: Lite.ExecutionContext): Promise<ScopedValueAccess<State, Actions>>
}

function scopedValue<
  State,
  const Deps extends ScopedValueDeps = {},
  Actions extends ScopedValueActions = {},
>(
  config: ScopedValueConfig<State, Deps, Actions>
): ScopedValue<State, Actions> {
  type Access = ScopedValueAccess<State, Actions>

  const createAccess = (
    ctx: Lite.ResourceContext,
    deps: Lite.InferDeps<Deps>
  ): Access => {
    const resolvedDeps = deps as Lite.InferDeps<Deps>
    const store = createStore(config.initial(ctx, resolvedDeps))
    const helpers: ScopedValueHelpers<State> = {
      ctx,
      get: store.get,
      getSnapshot: store.getSnapshot,
      subscribe: store.subscribe,
      set: store.set,
      update: store.update,
      patch: store.patch,
    }
    const actions = (config.actions?.(helpers, resolvedDeps) ?? {}) as Actions
    const access: Access = {
      get disposed() {
        return store.disposed
      },
      actions,
      get: store.get,
      getSnapshot: store.getSnapshot,
      subscribe: store.subscribe,
      set: store.set,
      update: store.update,
      patch: store.patch,
    }

    let disposed = false
    const closeAccess = async (result: Lite.CloseResult) => {
      if (disposed) return
      disposed = true
      try {
        await config.onClose?.({ ctx, get: store.get }, resolvedDeps, result)
      } finally {
        store.dispose()
      }
    }

    const offClose = ctx.onClose(closeAccess)
    ctx.cleanup(() => {
      offClose()
      return closeAccess({ ok: true })
    })

    return access
  }

  const base = config.deps
    ? resource({
        name: config.name,
        tags: config.tags,
        ownership: 'current',
        deps: config.deps,
        factory: (ctx, deps) => createAccess(ctx, deps as Lite.InferDeps<Deps>),
      })
    : resource({
        name: config.name,
        tags: config.tags,
        ownership: 'current',
        factory: (ctx) => createAccess(ctx, {} as Lite.InferDeps<Deps>),
  })

  const target = Object.create(base) as ScopedValue<State, Actions>
  Object.defineProperty(target, 'resolve', {
    enumerable: false,
    value: (ctx: Lite.ExecutionContext) => ctx.resolve(target),
  })

  return target
}

export { scopedValue }
export type {
  ScopedValue,
  ScopedValueAccess,
  ScopedValueActions,
  ScopedValueCloseHelpers,
  ScopedValueConfig,
  ScopedValueHelpers,
  ScopedValueView,
}

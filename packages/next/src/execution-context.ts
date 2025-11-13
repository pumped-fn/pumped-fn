import { type Core, type Extension, type ExecutionContext } from "./types"
import { type Tag } from "./tag-types"
import { Promised } from "./promises"

export class ExecutionContextImpl implements ExecutionContext.Context {
  readonly scope: Core.Scope
  readonly parent: ExecutionContext.Context | undefined
  readonly id: string
  readonly tagStore: Tag.Store
  readonly signal: AbortSignal
  readonly details: ExecutionContext.Details

  private tagData: Map<symbol, unknown>
  private abortController: AbortController

  constructor(config: {
    scope: Core.Scope
    parent?: ExecutionContext.Context
    details: Partial<ExecutionContext.Details>
    abortController?: AbortController
  }) {
    this.scope = config.scope
    this.parent = config.parent
    this.id = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `ctx-${Date.now()}-${Math.random()}`

    this.details = {
      name: config.details.name || "unnamed",
      startedAt: config.details.startedAt || Date.now(),
      completedAt: config.details.completedAt,
      error: config.details.error,
      metadata: config.details.metadata
    }

    this.abortController = config.abortController || new AbortController()
    this.signal = this.abortController.signal

    this.tagData = new Map<symbol, unknown>()
    this.tagStore = {
      get: (key: unknown) => {
        if (typeof key !== "symbol") return undefined
        if (this.tagData.has(key)) {
          return this.tagData.get(key)
        }
        return this.parent?.tagStore.get(key)
      },
      set: (key: unknown, value: unknown) => {
        if (typeof key !== "symbol") return undefined
        const prev = this.tagData.get(key as symbol)
        this.tagData.set(key as symbol, value)
        return prev
      }
    }
  }

  exec<T>(name: string, fn: (ctx: ExecutionContext.Context) => T): Promised<T> {
    const childCtx = new ExecutionContextImpl({
      scope: this.scope,
      parent: this,
      details: { name, startedAt: Date.now() }
    })

    const operation: Extension.ExecutionOperation = {
      kind: "execution",
      target: { type: "fn" },
      input: undefined,
      key: undefined,
      context: childCtx.tagStore,
      executionContext: childCtx
    }

    const executeCore = (): Promised<T> => {
      try {
        const result = fn(childCtx)
        if (result instanceof Promise) {
          return Promised.create(
            result.then(r => {
              childCtx.end()
              return r
            }).catch(error => {
              childCtx.details.error = error
              childCtx.end()
              throw error
            })
          )
        }
        childCtx.end()
        return Promised.create(Promise.resolve(result))
      } catch (error) {
        childCtx.details.error = error
        childCtx.end()
        throw error
      }
    }

    return (this.scope as any).wrapWithExtensions(executeCore, operation)
  }

  get<T>(tag: Tag.Tag<T, false> | Tag.Tag<T, true>): T {
    return tag.extractFrom(this.tagStore)
  }

  find<T>(tag: Tag.Tag<T, false>): T | undefined
  find<T>(tag: Tag.Tag<T, true>): T
  find<T>(tag: Tag.Tag<T, boolean>): T | undefined {
    return tag.readFrom(this.tagStore)
  }

  set<T>(tag: Tag.Tag<T, false> | Tag.Tag<T, true>, value: T): void {
    tag.injectTo(this.tagStore, value)
  }

  end(): void {
    if (!this.details.completedAt) {
      this.details.completedAt = Date.now()
    }
  }

  throwIfAborted(): void {
    if (this.signal.aborted) {
      throw new Error("Execution aborted")
    }
  }
}

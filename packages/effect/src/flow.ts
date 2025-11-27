import { flowSymbol } from "./symbols"
import type { Lite, MaybePromise } from "./types"

export interface FlowConfig<
  TOutput,
  TInput,
  D extends Record<string, Lite.Dependency>,
> {
  deps?: D
  factory: Lite.FlowFactory<TOutput, TInput, D>
  tags?: Lite.Tagged<unknown>[]
}

export function flow<TOutput, TInput = unknown>(config: {
  factory: (ctx: Lite.ExecutionContext) => MaybePromise<TOutput>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Flow<TOutput, TInput>

export function flow<
  TOutput,
  TInput,
  const D extends Record<string, Lite.Dependency>,
>(config: {
  deps: { [K in keyof D]: D[K] }
  factory: (
    ctx: Lite.ExecutionContext,
    deps: Lite.InferDeps<D>
  ) => MaybePromise<TOutput>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Flow<TOutput, TInput>

export function flow<
  TOutput,
  TInput,
  D extends Record<string, Lite.Dependency>,
>(config: FlowConfig<TOutput, TInput, D>): Lite.Flow<TOutput, TInput> {
  return {
    [flowSymbol]: true,
    factory: config.factory as Lite.FlowFactory<
      TOutput,
      TInput,
      Record<string, Lite.Dependency>
    >,
    deps: config.deps as Record<string, Lite.Dependency> | undefined,
    tags: config.tags,
  }
}

export function isFlow(value: unknown): value is Lite.Flow<unknown, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[flowSymbol] === true
  )
}

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

/**
 * Creates a short-lived execution unit that processes input and produces output.
 *
 * @param config - Configuration object containing factory function, optional dependencies, and tags
 * @returns A Flow instance that can be executed within an execution context
 *
 * @example
 * ```typescript
 * const processUser = flow({
 *   factory: async (ctx) => {
 *     const userId = ctx.input
 *     return await fetchUser(userId)
 *   }
 * })
 * ```
 */
export function flow<TOutput, TInput = unknown>(config: {
  deps?: undefined
  factory: (ctx: Lite.ExecutionContext) => MaybePromise<TOutput>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Flow<TOutput, TInput>

export function flow<
  TOutput,
  TInput,
  const D extends Record<string, Lite.Atom<unknown> | Lite.Lazy<unknown> | { mode: string }>,
>(config: {
  deps: D
  factory: (ctx: Lite.ExecutionContext, deps: Lite.InferDeps<D>) => MaybePromise<TOutput>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Flow<TOutput, TInput>

export function flow<
  TOutput,
  TInput,
  D extends Record<string, Lite.Dependency>,
>(config: FlowConfig<TOutput, TInput, D>): Lite.Flow<TOutput, TInput> {
  return {
    [flowSymbol]: true,
    factory: config.factory as unknown as Lite.FlowFactory<
      TOutput,
      TInput,
      Record<string, Lite.Dependency>
    >,
    deps: config.deps as unknown as Record<string, Lite.Dependency> | undefined,
    tags: config.tags,
  }
}

/**
 * Type guard to check if a value is a Flow.
 *
 * @param value - The value to check
 * @returns True if the value is a Flow, false otherwise
 *
 * @example
 * ```typescript
 * if (isFlow(value)) {
 *   await ctx.exec({ flow: value, input: data })
 * }
 * ```
 */
export function isFlow(value: unknown): value is Lite.Flow<unknown, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[flowSymbol] === true
  )
}

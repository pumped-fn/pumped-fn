import { flowSymbol, typedSymbol } from "./symbols"
import type { Lite, MaybePromise } from "./types"

/**
 * Type marker for flow input without runtime parsing.
 * Use this when you want typed input but don't need validation.
 *
 * @example
 * ```typescript
 * const myFlow = flow({
 *   parse: typed<{ name: string }>(),
 *   factory: (ctx) => {
 *     return ctx.input.name.toUpperCase()
 *   }
 * })
 * ```
 */
export function typed<T>(): Lite.Typed<T> {
  return { [typedSymbol]: true }
}

export interface FlowConfig<
  TOutput,
  TInput,
  D extends Record<string, Lite.Dependency>,
> {
  name?: string
  parse?: ((raw: unknown) => MaybePromise<TInput>) | Lite.Typed<TInput>
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
export function flow<TOutput>(config: {
  name?: string
  parse?: undefined
  deps?: undefined
  factory: (ctx: Lite.ExecutionContext) => MaybePromise<TOutput>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Flow<TOutput, unknown>

export function flow<TOutput, TInput>(config: {
  name?: string
  parse: (raw: unknown) => MaybePromise<TInput>
  deps?: undefined
  factory: (ctx: Lite.ExecutionContext<NoInfer<TInput>>) => MaybePromise<TOutput>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Flow<TOutput, TInput>

export function flow<TOutput, TInput>(config: {
  name?: string
  parse: Lite.Typed<TInput>
  deps?: undefined
  factory: (ctx: Lite.ExecutionContext<NoInfer<TInput>>) => MaybePromise<TOutput>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Flow<TOutput, TInput>

export function flow<
  TOutput,
  const D extends Record<string, Lite.Atom<unknown> | Lite.ControllerDep<unknown> | { mode: string }>,
>(config: {
  name?: string
  parse?: undefined
  deps: D
  factory: (ctx: Lite.ExecutionContext, deps: Lite.InferDeps<D>) => MaybePromise<TOutput>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Flow<TOutput, unknown>

export function flow<
  TOutput,
  TInput,
  const D extends Record<string, Lite.Atom<unknown> | Lite.ControllerDep<unknown> | { mode: string }>,
>(config: {
  name?: string
  parse: (raw: unknown) => MaybePromise<TInput>
  deps: D
  factory: (ctx: Lite.ExecutionContext<NoInfer<TInput>>, deps: Lite.InferDeps<D>) => MaybePromise<TOutput>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Flow<TOutput, TInput>

export function flow<
  TOutput,
  TInput,
  const D extends Record<string, Lite.Atom<unknown> | Lite.ControllerDep<unknown> | { mode: string }>,
>(config: {
  name?: string
  parse: Lite.Typed<TInput>
  deps: D
  factory: (ctx: Lite.ExecutionContext<NoInfer<TInput>>, deps: Lite.InferDeps<D>) => MaybePromise<TOutput>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Flow<TOutput, TInput>

export function flow<
  TOutput,
  TInput,
  D extends Record<string, Lite.Dependency>,
>(config: FlowConfig<TOutput, TInput, D>): Lite.Flow<TOutput, TInput> {
  const parse = config.parse
  const isTypedMarker =
    typeof parse === "object" && parse !== null && typedSymbol in parse

  return {
    [flowSymbol]: true,
    name: config.name,
    parse: isTypedMarker
      ? undefined
      : (parse as ((raw: unknown) => MaybePromise<TInput>) | undefined),
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

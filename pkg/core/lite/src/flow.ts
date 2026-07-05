import { flowSymbol, typedSymbol, FlowFault, type Lite, type MaybePromise } from "./types"
import { warmDepsGraph } from "./deps-graph"

/**
 * Type marker for flow input without runtime parsing.
 * Use this when you want typed input but don't need validation.
 *
 * @example
 * ```typescript
 * const shout = flow({
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
  Output,
  Input,
  D extends Record<string, Lite.Dependency>,
  Fault = never,
  Yield = never,
> {
  name?: string
  parse?: ((raw: unknown) => MaybePromise<Input>) | Lite.Typed<Input>
  deps?: D
  faults?: Lite.Typed<Fault>
  factory: Lite.FlowFactory<Output, Input, Fault, D, Yield>
  tags?: Lite.Tagged<any>[]
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
 *   parse: typed<string>(),
 *   factory: async (ctx) => {
 *     const userId = ctx.input
 *     return await fetchUser(userId)
 *   }
 * })
 * ```
 */
export function flow<Fault = never>(config: {
  name?: string
  parse?: undefined
  deps?: undefined
  faults?: Lite.Typed<Fault>
  factory: (ctx: Lite.ExecutionContext<Fault>) => never
  tags?: Lite.Tagged<any>[]
}): Lite.Flow<never, void, Fault>

export function flow<
  const D extends Record<string, Lite.ExecutionDependency>,
  Fault = never,
>(config: {
  name?: string
  parse?: undefined
  deps: D
  faults?: Lite.Typed<Fault>
  factory: (ctx: Lite.ExecutionContext<Fault>, deps: Lite.InferDeps<D>) => never
  tags?: Lite.Tagged<any>[]
}): Lite.Flow<never, void, Fault>

export function flow<Output, Yield, Fault = never>(config: {
  name?: string
  parse?: undefined
  deps?: undefined
  faults?: Lite.Typed<Fault>
  factory: (ctx: Lite.ExecutionContext<Fault>) => AsyncGenerator<Yield, Output, unknown>
  tags?: Lite.Tagged<any>[]
}): Lite.Flow<Output, void, Fault, Yield>

export function flow<Output, Yield, Input, Fault = never>(config: {
  name?: string
  parse: (raw: unknown) => MaybePromise<Input>
  deps?: undefined
  faults?: Lite.Typed<Fault>
  factory: (ctx: Lite.ExecutionContext<Fault> & { readonly input: NoInfer<Input> }) => AsyncGenerator<Yield, Output, unknown>
  tags?: Lite.Tagged<any>[]
}): Lite.Flow<Output, Input, Fault, Yield>

export function flow<Output, Yield, Input, Fault = never>(config: {
  name?: string
  parse: Lite.Typed<Input>
  deps?: undefined
  faults?: Lite.Typed<Fault>
  factory: (ctx: Lite.ExecutionContext<Fault> & { readonly input: NoInfer<Input> }) => AsyncGenerator<Yield, Output, unknown>
  tags?: Lite.Tagged<any>[]
}): Lite.Flow<Output, Input, Fault, Yield>

export function flow<
  Output,
  Yield,
  const D extends Record<string, Lite.ExecutionDependency>,
  Fault = never,
>(config: {
  name?: string
  parse?: undefined
  deps: D
  faults?: Lite.Typed<Fault>
  factory: (ctx: Lite.ExecutionContext<Fault>, deps: Lite.InferDeps<D>) => AsyncGenerator<Yield, Output, unknown>
  tags?: Lite.Tagged<any>[]
}): Lite.Flow<Output, void, Fault, Yield>

export function flow<
  Output,
  Yield,
  Input,
  const D extends Record<string, Lite.ExecutionDependency>,
  Fault = never,
>(config: {
  name?: string
  parse: (raw: unknown) => MaybePromise<Input>
  deps: D
  faults?: Lite.Typed<Fault>
  factory: (ctx: Lite.ExecutionContext<Fault> & { readonly input: NoInfer<Input> }, deps: Lite.InferDeps<D>) => AsyncGenerator<Yield, Output, unknown>
  tags?: Lite.Tagged<any>[]
}): Lite.Flow<Output, Input, Fault, Yield>

export function flow<
  Output,
  Yield,
  Input,
  const D extends Record<string, Lite.ExecutionDependency>,
  Fault = never,
>(config: {
  name?: string
  parse: Lite.Typed<Input>
  deps: D
  faults?: Lite.Typed<Fault>
  factory: (ctx: Lite.ExecutionContext<Fault> & { readonly input: NoInfer<Input> }, deps: Lite.InferDeps<D>) => AsyncGenerator<Yield, Output, unknown>
  tags?: Lite.Tagged<any>[]
}): Lite.Flow<Output, Input, Fault, Yield>

export function flow<Output, Fault = never>(config: {
  name?: string
  parse?: undefined
  deps?: undefined
  faults?: Lite.Typed<Fault>
  factory: (ctx: Lite.ExecutionContext<Fault>) => MaybePromise<Output>
  tags?: Lite.Tagged<any>[]
}): Lite.Flow<Output, void, Fault>

export function flow<Output, Input, Fault = never>(config: {
  name?: string
  parse: (raw: unknown) => MaybePromise<Input>
  deps?: undefined
  faults?: Lite.Typed<Fault>
  factory: (ctx: Lite.ExecutionContext<Fault> & { readonly input: NoInfer<Input> }) => MaybePromise<Output>
  tags?: Lite.Tagged<any>[]
}): Lite.Flow<Output, Input, Fault>

export function flow<Output, Input, Fault = never>(config: {
  name?: string
  parse: Lite.Typed<Input>
  deps?: undefined
  faults?: Lite.Typed<Fault>
  factory: (ctx: Lite.ExecutionContext<Fault> & { readonly input: NoInfer<Input> }) => MaybePromise<Output>
  tags?: Lite.Tagged<any>[]
}): Lite.Flow<Output, Input, Fault>

export function flow<
  Output,
  const D extends Record<string, Lite.ExecutionDependency>,
  Fault = never,
>(config: {
  name?: string
  parse?: undefined
  deps: D
  faults?: Lite.Typed<Fault>
  factory: (ctx: Lite.ExecutionContext<Fault>, deps: Lite.InferDeps<D>) => MaybePromise<Output>
  tags?: Lite.Tagged<any>[]
}): Lite.Flow<Output, void, Fault>

export function flow<
  Output,
  Input,
  const D extends Record<string, Lite.ExecutionDependency>,
  Fault = never,
>(config: {
  name?: string
  parse: (raw: unknown) => MaybePromise<Input>
  deps: D
  faults?: Lite.Typed<Fault>
  factory: (ctx: Lite.ExecutionContext<Fault> & { readonly input: NoInfer<Input> }, deps: Lite.InferDeps<D>) => MaybePromise<Output>
  tags?: Lite.Tagged<any>[]
}): Lite.Flow<Output, Input, Fault>

export function flow<
  Output,
  Input,
  const D extends Record<string, Lite.ExecutionDependency>,
  Fault = never,
>(config: {
  name?: string
  parse: Lite.Typed<Input>
  deps: D
  faults?: Lite.Typed<Fault>
  factory: (ctx: Lite.ExecutionContext<Fault> & { readonly input: NoInfer<Input> }, deps: Lite.InferDeps<D>) => MaybePromise<Output>
  tags?: Lite.Tagged<any>[]
}): Lite.Flow<Output, Input, Fault>

export function flow(config: any): Lite.Flow<any, any, any, any> {
  const parse = config.parse
  const isTypedMarker =
    typeof parse === "object" && parse !== null && typedSymbol in parse

  if (config.deps) warmDepsGraph(config.deps as unknown as Record<string, Lite.Dependency>)

  return {
    [flowSymbol]: true,
    name: config.name,
    parse: isTypedMarker
      ? undefined
      : (parse as ((raw: unknown) => MaybePromise<unknown>) | undefined),
    factory: config.factory as unknown as Lite.FlowFactory<
      unknown,
      unknown,
      unknown,
      Record<string, Lite.Dependency>,
      unknown
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
export function isFlow(value: unknown): value is Lite.Flow<unknown, unknown, never, never> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[flowSymbol] === true
  )
}

/**
 * Type guard narrowing an unknown error to the fault type declared by `flow`.
 *
 * Honesty note: the runtime check can only verify `error instanceof FlowFault`
 * and that `error.flow` matches the flow's name. It trusts the flow-name match
 * as a proxy for flow identity — it does not (cannot) verify that `error` was
 * actually thrown by this exact `flow` instance.
 *
 * @example
 * ```typescript
 * const pairPayment = flow({
 *   faults: typed<{ kind: "conflict"; id: string }>(),
 *   factory: (ctx) => ctx.fail({ kind: "conflict", id: "p1" }),
 * })
 *
 * async function run(ctx: Lite.ExecutionContext) {
 *   try {
 *     await ctx.exec({ flow: pairPayment })
 *   } catch (error) {
 *     if (isFault(pairPayment, error)) {
 *       // error.fault is typed as the fault union declared on pairPayment
 *     }
 *   }
 * }
 * ```
 */
export function isFault<F>(
  flow: Lite.Flow<any, any, F, any>,
  error: unknown
): error is FlowFault & { fault: F } {
  return error instanceof FlowFault && error.flow === (flow.name ?? "anonymous")
}

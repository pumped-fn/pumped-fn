import type { Core, Extension, Flow, Meta, StandardSchemaV1 } from "./types";
import { createExecutor } from "./executor";
import { createScope } from "./scope";
import { validate } from "./ssch";
import { accessor } from "./accessor";
import type { Accessor } from "./types";
import { custom } from "./ssch";
import { meta } from "./meta";

const ok = <S>(data: S): Flow.OK<S> => ({
  type: "ok",
  data,
  isOk(): this is Flow.OK<S> {
    return true;
  },
  isKo(): this is never {
    return false;
  },
});

const ko = <E>(data: E, options?: { cause?: unknown }): Flow.KO<E> => ({
  type: "ko",
  data,
  cause: options?.cause,
  isOk(): this is never {
    return false;
  },
  isKo(): this is Flow.KO<E> {
    return true;
  },
});

const flowDefinitionMeta = meta<Flow.Definition<any, any, any>>(
  "flow.definition",
  custom<Flow.Definition<any, any, any>>()
);

export const FlowExecutionContext: {
  depth: Accessor.AccessorWithDefault<number>;
  flowName: Accessor.Accessor<string | undefined>;
  parentFlowName: Accessor.Accessor<string | undefined>;
  isParallel: Accessor.AccessorWithDefault<boolean>;
} = {
  depth: accessor("flow.depth", custom<number>(), 0),
  flowName: accessor("flow.name", custom<string | undefined>()),
  parentFlowName: accessor("flow.parentName", custom<string | undefined>()),
  isParallel: accessor("flow.isParallel", custom<boolean>(), false),
};

class FlowDefinition<I, S, E> {
  constructor(
    public readonly name: string,
    public readonly version: string,
    public readonly input: StandardSchemaV1<I>,
    public readonly success: StandardSchemaV1<S>,
    public readonly error: StandardSchemaV1<E>,
    public readonly metas: Meta.Meta[] = []
  ) {}

  handler(
    handlerFn: (
      ctx: Flow.Context<I, S, E>,
      input: I
    ) => Promise<Flow.OutputLike<S, E>> | Flow.OutputLike<S, E>
  ): Core.Executor<Flow.NoDependencyHandler<I, S, E>>;

  handler<D extends Core.DependencyLike>(
    dependencies: D,
    handlerFn: (
      deps: Core.InferOutput<D>,
      ctx: Flow.Context<I, S, E>,
      input: I
    ) => Promise<Flow.OutputLike<S, E>> | Flow.OutputLike<S, E>
  ): Core.Executor<Flow.DependentHandler<D, I, S, E>>;

  handler<D extends Core.DependencyLike>(
    dependenciesOrHandler:
      | D
      | ((
          ctx: Flow.Context<I, S, E>,
          input: I
        ) => Promise<Flow.OutputLike<S, E>>)
      | Flow.OutputLike<S, E>,
    handlerFn?: (
      deps: Core.InferOutput<D>,
      ctx: Flow.Context<I, S, E>,
      input: I
    ) => Promise<Flow.OutputLike<S, E>> | Flow.OutputLike<S, E>
  ):
    | Core.Executor<Flow.NoDependencyHandler<I, S, E>>
    | Core.Executor<Flow.DependentHandler<D, I, S, E>> {
    if (typeof dependenciesOrHandler === "function") {
      const noDepsHandler = dependenciesOrHandler;
      return createExecutor(
        () => {
          const flowHandler = async (ctx: Flow.Context<I, S, E>) => {
            return noDepsHandler(ctx, ctx.input);
          };
          return flowHandler as Flow.NoDependencyHandler<I, S, E>;
        },
        undefined,
        [...this.metas, flowDefinitionMeta(this)]
      ) as Core.Executor<Flow.NoDependencyHandler<I, S, E>>;
    }
    const dependencies = dependenciesOrHandler;
    const dependentHandler = handlerFn!;
    return createExecutor(
      (deps: unknown) => {
        const flowHandler = async (ctx: Flow.Context<I, S, E>) => {
          return dependentHandler(deps as Core.InferOutput<D>, ctx, ctx.input);
        };
        return flowHandler as Flow.DependentHandler<D, I, S, E>;
      },
      dependencies as any,
      [...this.metas, flowDefinitionMeta(this)]
    ) as Core.Executor<Flow.DependentHandler<D, I, S, E>>;
  }
}

type DefineConfig<I, S, E> = {
  name: string;
  version?: string;
  input: StandardSchemaV1<I>;
  success: StandardSchemaV1<S>;
  error: StandardSchemaV1<E>;
  meta?: Meta.Meta[];
};

function define<I, S, E>(
  config: DefineConfig<I, S, E>
): FlowDefinition<I, S, E> {
  return new FlowDefinition(
    config.name,
    config.version || "1.0.0",
    config.input,
    config.success,
    config.error,
    config.meta
  );
}

class FlowContext<I, S, E>
  implements Flow.Context<I, S, E>, Accessor.DataStore
{
  private contextData = new Map<unknown, unknown>();

  constructor(
    public input: I,
    public readonly pod: Core.Pod,
    private extensions: Extension.Extension[],
    private parent?: FlowContext<any, any, any>
  ) {}

  initializeExecutionContext(flowName: string, isParallel: boolean = false) {
    const currentDepth = this.parent
      ? (FlowExecutionContext.depth.find(this.parent) || 0) + 1
      : 0;
    const parentFlowName = this.parent
      ? FlowExecutionContext.flowName.find(this.parent)
      : undefined;

    FlowExecutionContext.depth.set(this, currentDepth);
    FlowExecutionContext.flowName.set(this, flowName);
    FlowExecutionContext.parentFlowName.set(this, parentFlowName);
    FlowExecutionContext.isParallel.set(this, isParallel);
  }

  ok = (data: S): Flow.OK<S> => ok(data);
  ko = (data: E, options?: { cause?: unknown }): Flow.KO<E> =>
    ko(data, options);

  get(key: unknown): unknown {
    if (this.contextData.has(key)) {
      return this.contextData.get(key);
    }
    return this.parent?.get(key);
  }

  set(key: unknown, value: unknown): unknown | undefined {
    this.contextData.set(key, value);
    return value;
  }

  output = (success: boolean, value: any): any => {
    return success ? this.ok(value) : this.ko(value);
  };

  async execute<F extends Flow.UFlow>(
    flow: F,
    input: Flow.InferInput<F>
  ): Promise<Awaited<Flow.InferOutput<F>>>;

  async execute<I, O, E = unknown>(
    fn: Flow.FnExecutor<I, O>,
    input: I,
    errorMapper?: (error: unknown) => E
  ): Promise<Flow.OK<O> | Flow.KO<E>>;

  async execute<Args extends readonly unknown[], O, E = unknown>(
    fn: Flow.MultiFnExecutor<Args, O>,
    args: Args,
    errorMapper?: (error: unknown) => E
  ): Promise<Flow.OK<O> | Flow.KO<E>>;

  async execute(
    flowOrFn:
      | Flow.UFlow
      | Flow.FnExecutor<any, any>
      | Flow.MultiFnExecutor<any[], any>,
    input: any,
    errorMapperOrOpt?: ((error: unknown) => any) | Flow.Opt,
    opt?: Flow.Opt
  ): Promise<any> {
    let errorMapper: ((error: unknown) => any) | undefined;
    let actualOpt: Flow.Opt | undefined;

    if (typeof errorMapperOrOpt === "function") {
      errorMapper = errorMapperOrOpt as (error: unknown) => any;
      actualOpt = opt;
    } else {
      actualOpt = errorMapperOrOpt;
    }

    if (
      typeof flowOrFn === "function" &&
      !flowDefinitionMeta.find(flowOrFn as any)
    ) {
      try {
        let result: any;
        if (Array.isArray(input)) {
          result = await (flowOrFn as Flow.MultiFnExecutor<any[], any>)(
            ...input
          );
        } else {
          result = await (flowOrFn as Flow.FnExecutor<any, any>)(input);
        }
        return this.ok(result);
      } catch (error) {
        const mappedError = errorMapper ? errorMapper(error) : error;
        return this.ko(mappedError as any, { cause: error });
      }
    }

    const flow = flowOrFn as Flow.UFlow;
    const handler = await this.pod.resolve(flow);
    const definition = flowDefinitionMeta.find(flow);
    if (!definition) {
      throw new Error("Flow definition not found in executor metadata");
    }

    const childContext = new FlowContext<unknown, unknown, unknown>(
      input,
      this.pod,
      this.extensions,
      this
    );
    childContext.initializeExecutionContext(definition.name, false);

    return (await this.executeWithExtensions(
      handler,
      childContext,
      flow
    )) as any;
  }

  async executeParallel<
    T extends ReadonlyArray<
      [Flow.FnExecutor<any, any> | Flow.MultiFnExecutor<any[], any>, any]
    >
  >(
    items: { [K in keyof T]: T[K] },
    options?: Flow.ParallelExecutionOptions
  ): Promise<
    Flow.ParallelExecutionResult<{
      [K in keyof T]: T[K] extends [infer F, any]
        ? F extends Flow.FnExecutor<any, infer O>
          ? Flow.OK<O> | Flow.KO<unknown>
          : F extends Flow.MultiFnExecutor<any[], infer O>
          ? Flow.OK<O> | Flow.KO<unknown>
          : never
        : never;
    }>
  >;

  async executeParallel<T extends ReadonlyArray<[Flow.UFlow, any]>>(
    flows: { [K in keyof T]: T[K] },
    options?: Flow.ParallelExecutionOptions
  ): Promise<
    Flow.ParallelExecutionResult<{
      [K in keyof T]: T[K] extends [infer F, any]
        ? F extends Flow.UFlow
          ? Awaited<Flow.InferOutput<F>>
          : never
        : never;
    }>
  >;

  async executeParallel<
    T extends ReadonlyArray<
      [
        (
          | Flow.UFlow
          | Flow.FnExecutor<any, any>
          | Flow.MultiFnExecutor<any[], any>
        ),
        any
      ]
    >
  >(
    mixed: { [K in keyof T]: T[K] },
    options?: Flow.ParallelExecutionOptions
  ): Promise<
    Flow.ParallelExecutionResult<{
      [K in keyof T]: T[K] extends [infer F, any]
        ? F extends Flow.UFlow
          ? Awaited<Flow.InferOutput<F>>
          : F extends Flow.FnExecutor<any, infer O>
          ? Flow.OK<O> | Flow.KO<unknown>
          : F extends Flow.MultiFnExecutor<any[], infer O>
          ? Flow.OK<O> | Flow.KO<unknown>
          : never
        : never;
    }>
  >;

  async executeParallel(
    items: ReadonlyArray<
      [
        (
          | Flow.UFlow
          | Flow.FnExecutor<any, any>
          | Flow.MultiFnExecutor<any[], any>
        ),
        any
      ]
    >,
    options?: Flow.ParallelExecutionOptions
  ): Promise<any> {
    const mode = options?.mode || "all-settled";
    const errorMapper = options?.errorMapper;
    const onItemComplete = options?.onItemComplete;

    const executeItem = async (
      item: [
        (
          | Flow.UFlow
          | Flow.FnExecutor<any, any>
          | Flow.MultiFnExecutor<any[], any>
        ),
        any
      ],
      index: number
    ) => {
      const [flowOrFn, input] = item;

      try {
        let result: any;

        if (
          typeof flowOrFn === "function" &&
          !flowDefinitionMeta.find(flowOrFn as any)
        ) {
          try {
            if (Array.isArray(input)) {
              result = await (flowOrFn as Flow.MultiFnExecutor<any[], any>)(
                ...input
              );
            } else {
              result = await (flowOrFn as Flow.FnExecutor<any, any>)(input);
            }
            result = this.ok(result);
          } catch (error) {
            const mappedError = errorMapper ? errorMapper(error, index) : error;
            result = this.ko(mappedError as any, { cause: error });
          }
        } else {
          const flow = flowOrFn as Flow.UFlow;
          const childContext = new FlowContext<unknown, unknown, unknown>(
            input,
            this.pod,
            this.extensions,
            this
          );

          const handler = await this.pod.resolve(flow);
          const definition = flowDefinitionMeta.find(flow);
          if (!definition) {
            throw new Error("Flow definition not found in executor metadata");
          }
          childContext.initializeExecutionContext(definition.name, true);
          result = await this.executeWithExtensions(
            handler,
            childContext,
            flow
          );
        }

        onItemComplete?.(result, index);
        return result;
      } catch (error) {
        const mappedError = errorMapper ? errorMapper(error, index) : error;
        const koResult = this.ko(mappedError as any, { cause: error });
        onItemComplete?.(koResult, index);
        return koResult;
      }
    };

    let results: any[];

    if (mode === "race") {
      const promises = items.map((item, index) =>
        executeItem(item, index).then((result) => ({ result, index }))
      );
      const { result, index } = await Promise.race(promises);
      results = [result];
      onItemComplete?.(result, index);
    } else if (mode === "all") {
      results = [];
      for (let i = 0; i < items.length; i++) {
        const result = await executeItem(items[i], i);
        results.push(result);
        if (result.type === "ko") {
          break;
        }
      }
    } else {
      results = await Promise.all(
        items.map((item, index) => executeItem(item, index))
      );
    }

    const total =
      mode === "all" || mode === "race" ? results.length : items.length;
    const succeeded = results.filter((r) => r.type === "ok").length;
    const failed = results.filter((r) => r.type === "ko").length;

    let resultType: "all-ok" | "partial" | "all-ko";
    if (failed === 0) {
      resultType = "all-ok";
    } else if (succeeded === 0) {
      resultType = "all-ko";
    } else {
      resultType = "partial";
    }

    return {
      type: resultType,
      results: results as any,
      stats: {
        total,
        succeeded,
        failed,
      },
    };
  }

  private async executeWithExtensions<T>(
    handler: any,
    context: FlowContext<any, any, any>,
    flow: Flow.UFlow
  ): Promise<T> {
    const executeCore = async (): Promise<T> => handler(context);

    let executor = executeCore;
    for (const extension of [...this.extensions].reverse()) {
      if (extension.wrapExecute) {
        const currentExecutor = executor;
        executor = async () => {
          return extension.wrapExecute!(context, currentExecutor, {
            flowName: FlowExecutionContext.flowName.find(context),
            depth: FlowExecutionContext.depth.find(context) || 0,
            isParallel: FlowExecutionContext.isParallel.find(context) || false,
            parentFlowName: FlowExecutionContext.parentFlowName.find(context),
            flow,
          });
        };
      }
    }

    return executor();
  }
}

async function execute<I, S, E>(
  flow: Core.Executor<
    Flow.NoDependencyHandler<I, S, E> | Flow.DependentHandler<any, I, S, E>
  >,
  input: I,
  options?: {
    scope?: Core.Scope;
    extensions?: Extension.Extension[];
    initialContext?:
      | Array<[Accessor.Accessor<any> | Accessor.AccessorWithDefault<any>, any]>
      | Map<unknown, unknown>;
    presets?: Core.Preset<unknown>[];
  }
): Promise<Flow.OutputLike<S, E>> {
  const scope = options?.scope || createScope();
  const shouldDisposeScope = !options?.scope;

  const pod = scope.pod({ initialValues: options?.presets });

  try {
    const context = new FlowContext<I, S, E>(
      input,
      pod,
      options?.extensions || []
    );

    if (options?.initialContext) {
      if (Array.isArray(options.initialContext)) {
        for (const [accessor, value] of options.initialContext) {
          accessor.set(context, value);
        }
      } else if (options.initialContext instanceof Map) {
        for (const [key, value] of options.initialContext) {
          context.set(key, value);
        }
      }
    }

    for (const extension of options?.extensions || []) {
      await extension.initPod?.(pod, context);
    }

    const executeCore = async () => {
      const handler = await pod.resolve(flow);
      const definition = flowDefinitionMeta.find(flow);
      if (!definition) {
        throw new Error("Flow definition not found in executor metadata");
      }
      const validated = validate(definition.input, input);
      context.input = validated as I;

      context.initializeExecutionContext(definition.name, false);

      const result = await handler(context);

      if (result.type === "ok") {
        validate(definition.success, result.data);
      } else {
        validate(definition.error, result.data);
      }

      return result;
    };

    const definition = flowDefinitionMeta.find(flow);

    let executor = executeCore;
    for (const extension of [...(options?.extensions || [])].reverse()) {
      if (extension.wrapExecute) {
        const currentExecutor = executor;
        executor = () => {
          return extension.wrapExecute!(context, currentExecutor, {
            flowName:
              definition?.name || FlowExecutionContext.flowName.find(context),
            depth: FlowExecutionContext.depth.find(context) || 0,
            isParallel: FlowExecutionContext.isParallel.find(context) || false,
            parentFlowName: FlowExecutionContext.parentFlowName.find(context),
            flow,
          });
        };
      }
    }

    return await executor();
  } finally {
    for (const extension of options?.extensions || []) {
      await extension.disposePod?.(pod);
    }

    await scope.disposePod(pod);

    if (shouldDisposeScope) {
      await scope.dispose();
    }
  }
}

function flowImpl<I, S, E>(
  definition: DefineConfig<I, S, E>,
  handler: (
    ctx: Flow.Context<I, S, E>,
    input: I
  ) => Promise<Flow.OutputLike<S, E>> | Flow.OutputLike<S, E>
): Core.Executor<Flow.NoDependencyHandler<I, S, E>>;

function flowImpl<I, S, E, D extends Core.DependencyLike>(
  definition: DefineConfig<I, S, E>,
  dependencies: D,
  handler: (
    deps: Core.InferOutput<D>,
    ctx: Flow.Context<I, S, E>,
    input: I
  ) => Promise<Flow.OutputLike<S, E>> | Flow.OutputLike<S, E>
): Core.Executor<Flow.DependentHandler<D, I, S, E>>;

function flowImpl<I, S, E, D extends Core.DependencyLike>(
  definition: DefineConfig<I, S, E>,
  dependenciesOrHandler:
    | D
    | ((
        ctx: Flow.Context<I, S, E>,
        input: I
      ) => Promise<Flow.OutputLike<S, E>>),
  handlerFn?: (
    deps: Core.InferOutput<D>,
    ctx: Flow.Context<I, S, E>,
    input: I
  ) => Promise<Flow.OutputLike<S, E>> | Flow.OutputLike<S, E>
):
  | Core.Executor<Flow.NoDependencyHandler<I, S, E>>
  | Core.Executor<Flow.DependentHandler<D, I, S, E>> {
  const def = define(definition);

  if (typeof dependenciesOrHandler === "function") {
    return def.handler(dependenciesOrHandler);
  } else {
    return def.handler(dependenciesOrHandler, handlerFn!);
  }
}

function defineExtension(extension: Extension.Extension): Extension.Extension {
  return extension;
}

export const flow: typeof flowImpl & {
  define: typeof define;
  execute: typeof execute;
  extension: typeof defineExtension;
} = Object.assign(flowImpl, {
  define: define,
  execute: execute,
  extension: defineExtension,
});

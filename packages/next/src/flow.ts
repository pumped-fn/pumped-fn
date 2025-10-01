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
      dependencies as Core.UExecutor | ReadonlyArray<Core.UExecutor> | Record<string, Core.UExecutor>,
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

type FlowConfigWithHandler<I, S, E> = DefineConfig<I, S, E> & {
  handler: (
    ctx: Flow.Context<I, S, E>,
    input: I
  ) => Promise<Flow.OutputLike<S, E>> | Flow.OutputLike<S, E>;
};

type FlowConfigWithDeps<I, S, E, D extends Core.DependencyLike> = DefineConfig<I, S, E> & {
  dependencies: D;
  handler: (
    deps: Core.InferOutput<D>,
    ctx: Flow.Context<I, S, E>,
    input: I
  ) => Promise<Flow.OutputLike<S, E>> | Flow.OutputLike<S, E>;
};

type FlowConfigInferred<I, S, E> = {
  name: string;
  version?: string;
  input?: StandardSchemaV1<I>;
  success?: StandardSchemaV1<S>;
  error?: StandardSchemaV1<E>;
  meta?: Meta.Meta[];
  handler: (
    ctx: Flow.Context<I, S, E>,
    input: I
  ) => Promise<Flow.OutputLike<S, E>> | Flow.OutputLike<S, E>;
};

type FlowConfigInferredWithDeps<I, S, E, D extends Core.DependencyLike> = {
  name: string;
  version?: string;
  input?: StandardSchemaV1<I>;
  success?: StandardSchemaV1<S>;
  error?: StandardSchemaV1<E>;
  meta?: Meta.Meta[];
  dependencies: D;
  handler: (
    deps: Core.InferOutput<D>,
    ctx: Flow.Context<I, S, E>,
    input: I
  ) => Promise<Flow.OutputLike<S, E>> | Flow.OutputLike<S, E>;
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
  private journal = new Map<string, unknown>();
  public readonly pod: Core.Pod;

  constructor(
    public input: I,
    parentPodOrScope: Core.Pod | Core.Scope,
    private extensions: Extension.Extension[],
    private parent?: FlowContext<any, any, any>
  ) {
    if ('pod' in parentPodOrScope && typeof parentPodOrScope.pod === 'function') {
      this.pod = (parentPodOrScope as Core.Pod).pod();
    } else {
      this.pod = (parentPodOrScope as Core.Scope).pod();
    }
  }

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

  async run<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
    const flowName = FlowExecutionContext.flowName.find(this) || 'unknown';
    const depth = FlowExecutionContext.depth.find(this) || 0;
    const journalKey = `${flowName}:${depth}:${key}`;

    if (this.journal.has(journalKey)) {
      const entry = this.journal.get(journalKey);
      if (entry && typeof entry === 'object' && '__error' in entry) {
        throw (entry as { __error: boolean; error: unknown }).error;
      }
      return entry as T;
    }

    try {
      const result = await fn();
      this.journal.set(journalKey, result);
      return result;
    } catch (error) {
      this.journal.set(journalKey, { __error: true, error });
      throw error;
    }
  }

  async flow<F extends Flow.UFlow>(
    flow: F,
    input: Flow.InferInput<F>
  ): Promise<Flow.InferOutput<F>> {
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

    return (await this.executeWithExtensions<Flow.InferOutput<F>>(
      async (ctx) => handler(ctx) as Promise<Flow.InferOutput<F>>,
      childContext,
      flow
    )) as Flow.InferOutput<F>;
  }

  async parallel<T extends readonly [Flow.UFlow, any][]>(
    flows: [...T]
  ): Promise<Flow.ParallelExecutionResult<{
    [K in keyof T]: T[K] extends [infer F, any]
      ? F extends Flow.UFlow
        ? Awaited<Flow.InferOutput<F>>
        : never
      : never;
  }>> {
    const promises = flows.map(async ([flow, input], index) => {
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

      return this.executeWithExtensions(
        async (ctx) => handler(ctx),
        childContext,
        flow
      );
    });

    const results = await Promise.all(promises);

    const isOk = (r: unknown): r is Flow.OK<unknown> =>
      typeof r === "object" && r !== null && "type" in r && r.type === "ok";
    const isKo = (r: unknown): r is Flow.KO<unknown> =>
      typeof r === "object" && r !== null && "type" in r && r.type === "ko";

    const succeeded = results.filter(isOk).length;
    const failed = results.filter(isKo).length;

    return {
      type: failed === 0 ? "all-ok" : succeeded === 0 ? "all-ko" : "partial",
      results: results as Flow.ParallelExecutionResult<{
        [K in keyof T]: T[K] extends [infer F, any]
          ? F extends Flow.UFlow
            ? Awaited<Flow.InferOutput<F>>
            : never
          : never;
      }>["results"],
      stats: {
        total: results.length,
        succeeded,
        failed,
      },
    };
  }

  private async executeWithExtensions<T>(
    handler: (ctx: FlowContext<unknown, unknown, unknown>) => Promise<T>,
    context: FlowContext<unknown, unknown, unknown>,
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
  config: FlowConfigWithHandler<I, S, E>
): Core.Executor<Flow.NoDependencyHandler<I, S, E>>;

function flowImpl<I, S, E, D extends Core.DependencyLike>(
  config: FlowConfigWithDeps<I, S, E, D>
): Core.Executor<Flow.DependentHandler<D, I, S, E>>;

function flowImpl<I = unknown, S = unknown, E = unknown>(
  config: FlowConfigInferred<I, S, E>
): Core.Executor<Flow.NoDependencyHandler<I, S, E>>;

function flowImpl<I = unknown, S = unknown, E = unknown, D extends Core.DependencyLike = never>(
  config: FlowConfigInferredWithDeps<I, S, E, D>
): Core.Executor<Flow.DependentHandler<D, I, S, E>>;

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
  definitionOrConfig: DefineConfig<I, S, E> | FlowConfigWithHandler<I, S, E> | FlowConfigWithDeps<I, S, E, D> | FlowConfigInferred<I, S, E> | FlowConfigInferredWithDeps<I, S, E, D>,
  dependenciesOrHandler?:
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

  if ('handler' in definitionOrConfig) {
    const config = definitionOrConfig as FlowConfigWithHandler<I, S, E> | FlowConfigWithDeps<I, S, E, D> | FlowConfigInferred<I, S, E> | FlowConfigInferredWithDeps<I, S, E, D>;

    const hasInput = 'input' in config && config.input !== undefined;
    const hasSuccess = 'success' in config && config.success !== undefined;
    const hasError = 'error' in config && config.error !== undefined;

    const def = define({
      name: config.name,
      version: config.version,
      input: hasInput ? config.input! : custom<I>(),
      success: hasSuccess ? config.success! : custom<S>(),
      error: hasError ? config.error! : custom<E>(),
      meta: config.meta,
    });

    if ('dependencies' in config) {
      const depsConfig = config as FlowConfigWithDeps<I, S, E, D> | FlowConfigInferredWithDeps<I, S, E, D>;
      return def.handler(depsConfig.dependencies, depsConfig.handler);
    } else {
      const handlerConfig = config as FlowConfigWithHandler<I, S, E> | FlowConfigInferred<I, S, E>;
      return def.handler(handlerConfig.handler);
    }
  }

  const definition = definitionOrConfig as DefineConfig<I, S, E>;
  const def = define(definition);

  if (typeof dependenciesOrHandler === "function") {
    return def.handler(dependenciesOrHandler);
  } else {
    return def.handler(dependenciesOrHandler!, handlerFn!);
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

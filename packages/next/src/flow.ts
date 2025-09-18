import type { Core, Flow, Meta, StandardSchemaV1 } from "./types";
import { createExecutor } from "./executor";
import { createScope } from "./scope";
import { validate } from "./ssch";
import { type DataStore, Accessor, accessor } from "./accessor";
import { custom } from "./ssch";
import { meta } from "./meta";

const ok = <S>(data: S): Flow.OK<S> => ({
  type: "ok",
  data,
  isOk(): this is Flow.OK<S> { return true; },
  isKo(): this is never { return false; }
});

const ko = <E>(data: E): Flow.KO<E> => ({
  type: "ko",
  data,
  isOk(): this is never { return false; },
  isKo(): this is Flow.KO<E> { return true; }
});

const flowDefinitionMeta = meta<Flow.Definition<any, any, any>>(
  "flow.definition",
  custom<Flow.Definition<any, any, any>>()
);

export const FlowExecutionContext: {
  depth: Accessor<number>;
  flowName: Accessor<string | undefined>;
  parentFlowName: Accessor<string | undefined>;
  isParallel: Accessor<boolean>;
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
    public readonly meta: Meta.Meta[] = []
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
        [...this.meta, flowDefinitionMeta(this)]
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
      [...this.meta, flowDefinitionMeta(this)]
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

class FlowContext<I, S, E> implements Flow.Context<I, S, E>, DataStore {
  private contextData = new Map<unknown, unknown>();

  constructor(
    public input: I,
    public readonly pod: Core.Pod,
    private plugins: Flow.Plugin[],
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
  ko = (data: E): Flow.KO<E> => ko(data);

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
  ): Promise<Awaited<Flow.InferOutput<F>>> {
    const handler = await this.pod.resolve(flow);
    const definition = flowDefinitionMeta.find(flow);
    if (!definition) {
      throw new Error("Flow definition not found in executor metadata");
    }

    const childContext = new FlowContext<unknown, unknown, unknown>(
      input,
      this.pod,
      this.plugins,
      this
    );
    childContext.initializeExecutionContext(definition.name, false);

    return (await this.executeWithPlugins(handler, childContext)) as any;
  }

  async executeParallel<T extends ReadonlyArray<[Flow.UFlow, any]>>(
    flows: T
  ): Promise<{
    [K in keyof T]: T[K] extends [infer F, any]
      ? F extends Flow.UFlow
        ? Awaited<Flow.InferOutput<F>>
        : never
      : never;
  }> {
    const results = await Promise.all(
      flows.map(async ([flow, input]) => {
        const childContext = new FlowContext<unknown, unknown, unknown>(
          input,
          this.pod,
          this.plugins,
          this
        );

        const handler = await this.pod.resolve(flow);
        const definition = flowDefinitionMeta.find(flow);
        if (!definition) {
          throw new Error("Flow definition not found in executor metadata");
        }
        childContext.initializeExecutionContext(definition.name, true);
        return this.executeWithPlugins(handler, childContext);
      })
    );
    return results as any;
  }

  private async executeWithPlugins<T>(
    handler: any,
    context: FlowContext<any, any, any>
  ): Promise<T> {
    const executeCore = async (): Promise<T> => handler(context);

    let executor = executeCore;
    for (const plugin of [...this.plugins].reverse()) {
      if (plugin.wrap) {
        const currentExecutor = executor;
        executor = async () => {
          const execution = {
            flowName: FlowExecutionContext.flowName.find(context),
            depth: FlowExecutionContext.depth.find(context) || 0,
            isParallel: FlowExecutionContext.isParallel.find(context) || false,
            parentFlowName: FlowExecutionContext.parentFlowName.find(context)
          };
          return plugin.wrap!(context, currentExecutor, execution);
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
    plugins?: Flow.Plugin[];
    initialContext?: Array<[Accessor<any>, any]> | Map<unknown, unknown>;
    presets?: Core.Preset<unknown>[];
  }
): Promise<Flow.OutputLike<S, E>> {
  const scope = options?.scope || createScope();
  const shouldDisposeScope = !options?.scope;

  const pod = scope.pod(...(options?.presets || []));

  try {
    const context = new FlowContext<I, S, E>(
      input,
      pod,
      options?.plugins || []
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

    for (const plugin of options?.plugins || []) {
      await plugin.init?.(pod, context);
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
    for (const plugin of [...(options?.plugins || [])].reverse()) {
      if (plugin.wrap) {
        const currentExecutor = executor;
        executor = () => {
          const execution = {
            flowName: definition?.name || FlowExecutionContext.flowName.find(context),
            depth: FlowExecutionContext.depth.find(context) || 0,
            isParallel: FlowExecutionContext.isParallel.find(context) || false,
            parentFlowName: FlowExecutionContext.parentFlowName.find(context)
          };
          return plugin.wrap!(context, currentExecutor, execution);
        };
      }
    }

    return await executor();
  } finally {
    for (const plugin of options?.plugins || []) {
      await plugin.dispose?.(pod);
    }

    await scope.disposePod(pod);

    if (shouldDisposeScope) {
      await scope.dispose();
    }
  }
}

// Main flow function with namespace approach
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

function definePlugin(plugin: Flow.Plugin): Flow.Plugin {
  return plugin;
}

// Create flow namespace object
export const flow: typeof flowImpl & {
  define: typeof define;
  execute: typeof execute;
  plugin: typeof definePlugin;
} = Object.assign(flowImpl, {
  define: define,
  execute: execute,
  plugin: definePlugin,
});

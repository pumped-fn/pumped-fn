import type { Core, Extension, Flow, Meta, StandardSchemaV1 } from "./types";
import { createExecutor } from "./executor";
import { createScope } from "./scope";
import { validate } from "./ssch";
import { accessor } from "./accessor";
import type { Accessor } from "./types";
import { custom } from "./ssch";
import { meta } from "./meta";
import { FlowPromise } from "./promises";

const flowDefinitionMeta = meta<Flow.Definition<any, any>>(
  "flow.definition",
  custom<Flow.Definition<any, any>>()
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

class FlowDefinition<S, I> {
  constructor(
    public readonly name: string,
    public readonly version: string,
    public readonly input: StandardSchemaV1<I>,
    public readonly success: StandardSchemaV1<S>,
    public readonly metas: Meta.Meta[] = []
  ) {}

  handler(
    handlerFn: (ctx: Flow.Context, input: I) => Promise<S> | S
  ): Core.Executor<Flow.Handler<S, I>>;

  handler<D extends Core.DependencyLike>(
    dependencies: D,
    handlerFn: (
      deps: Core.InferOutput<D>,
      ctx: Flow.Context,
      input: I
    ) => Promise<S> | S
  ): Core.Executor<Flow.Handler<S, I>>;

  handler<D extends Core.DependencyLike>(
    dependenciesOrHandler:
      | D
      | ((ctx: Flow.Context, input: I) => Promise<S> | S),
    handlerFn?: (
      deps: Core.InferOutput<D>,
      ctx: Flow.Context,
      input: I
    ) => Promise<S> | S
  ): Core.Executor<Flow.Handler<S, I>> {
    if (typeof dependenciesOrHandler === "function") {
      const noDepsHandler = dependenciesOrHandler;
      return createExecutor(
        () => {
          const flowHandler = async (ctx: Flow.Context, input: I) => {
            return noDepsHandler(ctx, input);
          };
          return flowHandler as Flow.Handler<S, I>;
        },
        undefined,
        [...this.metas, flowDefinitionMeta(this)]
      ) as Core.Executor<Flow.Handler<S, I>>;
    }
    const dependencies = dependenciesOrHandler;
    const dependentHandler = handlerFn!;
    return createExecutor(
      (deps: unknown) => {
        const flowHandler = async (ctx: Flow.Context, input: I) => {
          return dependentHandler(deps as Core.InferOutput<D>, ctx, input);
        };

        return flowHandler as Flow.Handler<S, I>;
      },
      dependencies,
      [...this.metas, flowDefinitionMeta(this)]
    ) as Core.Executor<Flow.Handler<S, I>>;
  }
}

type DefineConfig<S, I> = {
  name: string;
  version?: string;
  input: StandardSchemaV1<I>;
  success: StandardSchemaV1<S>;
  meta?: Meta.Meta[];
};

type FlowConfigWithHandler<S, I> = DefineConfig<S, I> & {
  handler: (ctx: Flow.Context, input: I) => Promise<S> | S;
};

type FlowConfigWithDeps<S, I, D extends Core.DependencyLike> = DefineConfig<
  S,
  I
> & {
  dependencies: D;
  handler: (
    deps: Core.InferOutput<D>,
    ctx: Flow.Context,
    input: I
  ) => Promise<S> | S;
};

type FlowConfigInferred<S, I> = {
  name: string;
  version?: string;
  input?: StandardSchemaV1<I>;
  success?: StandardSchemaV1<S>;
  meta?: Meta.Meta[];
  handler: (ctx: Flow.Context, input: I) => Promise<S> | S;
};

type FlowConfigInferredWithDeps<S, I, D extends Core.DependencyLike> = {
  name: string;
  version?: string;
  input?: StandardSchemaV1<I>;
  success?: StandardSchemaV1<S>;
  meta?: Meta.Meta[];
  dependencies: D;
  handler: (
    deps: Core.InferOutput<D>,
    ctx: Flow.Context,
    input: I
  ) => Promise<S> | S;
};

function define<S, I>(config: DefineConfig<S, I>): FlowDefinition<S, I> {
  return new FlowDefinition(
    config.name,
    config.version || "1.0.0",
    config.input,
    config.success,
    config.meta
  );
}

class FlowContext implements Flow.Context {
  private contextData = new Map<unknown, unknown>();
  private journal = new Map<string, unknown>();
  public readonly pod: Core.Pod;
  private reversedExtensions: Extension.Extension[];

  constructor(
    parentPodOrScope: Core.Pod | Core.Scope,
    private extensions: Extension.Extension[],
    private parent?: FlowContext
  ) {
    this.pod = parentPodOrScope.pod();
    this.reversedExtensions = [...extensions].reverse();
  }

  initializeExecutionContext(flowName: string, isParallel: boolean = false) {
    const currentDepth = this.parent
      ? this.parent.get(FlowExecutionContext.depth) + 1
      : 0;
    const parentFlowName = this.parent
      ? this.parent.find(FlowExecutionContext.flowName)
      : undefined;

    this.set(FlowExecutionContext.depth, currentDepth);
    this.set(FlowExecutionContext.flowName, flowName);
    this.set(FlowExecutionContext.parentFlowName, parentFlowName);
    this.set(FlowExecutionContext.isParallel, isParallel);
  }

  get<T>(accessor: Accessor.Accessor<T> | Accessor.AccessorWithDefault<T>): T;
  get<T>(accessorOrKey: unknown): T | unknown {
    if (
      typeof accessorOrKey === "object" &&
      accessorOrKey !== null &&
      "get" in accessorOrKey
    ) {
      const accessor = accessorOrKey as
        | Accessor.Accessor<T>
        | Accessor.AccessorWithDefault<T>;
      return accessor.get(this);
    }
    const key = accessorOrKey;
    if (this.contextData.has(key)) {
      return this.contextData.get(key);
    }
    return this.parent?.get(key as any);
  }

  find<T>(accessor: Accessor.Accessor<T>): T | undefined;
  find<T>(accessor: Accessor.AccessorWithDefault<T>): T;
  find<T>(
    accessor: Accessor.Accessor<T> | Accessor.AccessorWithDefault<T>
  ): T | undefined {
    return accessor.find(this);
  }

  set<T>(
    accessor: Accessor.Accessor<T> | Accessor.AccessorWithDefault<T>,
    value: T
  ): void;
  set<T>(accessorOrKey: unknown, value: unknown): void | unknown {
    if (
      typeof accessorOrKey === "object" &&
      accessorOrKey !== null &&
      "set" in accessorOrKey
    ) {
      const accessor = accessorOrKey as
        | Accessor.Accessor<T>
        | Accessor.AccessorWithDefault<T>;
      accessor.set(this, value as T);
      return;
    }
    const key = accessorOrKey;
    this.contextData.set(key, value);
    return value;
  }

  run<T>(key: string, fn: () => Promise<T> | T): FlowPromise<T>;
  run<T, P extends readonly unknown[]>(
    key: string,
    fn: (...args: P) => Promise<T> | T,
    ...params: P
  ): FlowPromise<T>;

  run<T, P extends readonly unknown[]>(
    key: string,
    fn: ((...args: P) => Promise<T> | T) | (() => Promise<T> | T),
    ...params: P
  ): FlowPromise<T> {
    const flowName = this.find(FlowExecutionContext.flowName) || "unknown";
    const depth = this.get(FlowExecutionContext.depth);
    const journalKey = `${flowName}:${depth}:${key}`;

    const promise = (async () => {
      const isReplay = this.journal.has(journalKey);

      const executeCore = async () => {
        if (isReplay) {
          const entry = this.journal.get(journalKey);
          if (entry && typeof entry === "object" && "__error" in entry) {
            throw (entry as { __error: boolean; error: unknown }).error;
          }
          return entry as T;
        }

        try {
          const result =
            params.length > 0
              ? await (fn as (...args: P) => Promise<T> | T)(...params)
              : await (fn as () => Promise<T> | T)();
          this.journal.set(journalKey, result);
          return result;
        } catch (error) {
          this.journal.set(journalKey, { __error: true, error });
          throw error;
        }
      };

      let executor = executeCore;
      for (const extension of this.reversedExtensions) {
        if (extension.wrap) {
          const currentExecutor = executor;
          executor = async () => {
            return extension.wrap!(this, currentExecutor, {
              kind: "journal",
              key,
              flowName,
              depth,
              isReplay,
              pod: this.pod,
              params: params.length > 0 ? params : undefined,
            });
          };
        }
      }

      return executor();
    })();

    return new FlowPromise(this.pod, promise);
  }

  exec<F extends Flow.UFlow>(
    flow: F,
    input: Flow.InferInput<F>
  ): FlowPromise<Flow.InferOutput<F>>;

  exec<F extends Flow.UFlow>(
    key: string,
    flow: F,
    input: Flow.InferInput<F>
  ): FlowPromise<Flow.InferOutput<F>>;

  exec<F extends Flow.UFlow>(
    keyOrFlow: string | F,
    flowOrInput: F | Flow.InferInput<F>,
    inputOrUndefined?: Flow.InferInput<F>
  ): FlowPromise<Flow.InferOutput<F>> {
    if (typeof keyOrFlow === "string") {
      const key = keyOrFlow;
      const flow = flowOrInput as F;
      const input = inputOrUndefined as Flow.InferInput<F>;

      const parentFlowName = this.find(FlowExecutionContext.flowName);
      const depth = this.get(FlowExecutionContext.depth);
      const flowName = this.find(FlowExecutionContext.flowName) || "unknown";
      const journalKey = `${flowName}:${depth}:${key}`;

      const promise = (async () => {
        const executeCore = async () => {
          if (this.journal.has(journalKey)) {
            const entry = this.journal.get(journalKey);
            if (entry && typeof entry === "object" && "__error" in entry) {
              throw (entry as { __error: boolean; error: unknown }).error;
            }
            return entry as Flow.InferOutput<F>;
          }

          try {
            const handler = await this.pod.resolve(flow);
            const definition = flowDefinitionMeta.find(flow);
            if (!definition) {
              throw new Error("Flow definition not found in executor metadata");
            }

            const childContext = new FlowContext(
              this.pod,
              this.extensions,
              this
            );
            childContext.initializeExecutionContext(definition.name, false);

            const result = (await this.executeWithExtensions<
              Flow.InferOutput<F>
            >(
              async (ctx) =>
                handler(ctx, input) as Promise<Flow.InferOutput<F>>,
              childContext,
              flow,
              input
            )) as Flow.InferOutput<F>;

            this.journal.set(journalKey, result);
            return result;
          } catch (error) {
            this.journal.set(journalKey, { __error: true, error });
            throw error;
          }
        };

        const definition = flowDefinitionMeta.find(flow);
        if (!definition) {
          throw new Error("Flow definition not found in executor metadata");
        }

        let executor = executeCore;
        for (const extension of this.reversedExtensions) {
          if (extension.wrap) {
            const currentExecutor = executor;
            executor = async () => {
              return extension.wrap!(this, currentExecutor, {
                kind: "subflow",
                flow,
                definition,
                input,
                journalKey,
                parentFlowName,
                depth,
                pod: this.pod,
              });
            };
          }
        }

        return executor();
      })();

      return new FlowPromise(this.pod, promise);
    }

    const flow = keyOrFlow as F;
    const input = flowOrInput as Flow.InferInput<F>;

    const promise = (async () => {
      const parentFlowName = this.find(FlowExecutionContext.flowName);
      const depth = this.get(FlowExecutionContext.depth);

      const executeCore = async () => {
        const handler = await this.pod.resolve(flow);
        const definition = flowDefinitionMeta.find(flow);
        if (!definition) {
          throw new Error("Flow definition not found in executor metadata");
        }

        const childContext = new FlowContext(this.pod, this.extensions, this);
        childContext.initializeExecutionContext(definition.name, false);

        return (await this.executeWithExtensions<Flow.InferOutput<F>>(
          async (ctx) => handler(ctx, input) as Promise<Flow.InferOutput<F>>,
          childContext,
          flow,
          input
        )) as Flow.InferOutput<F>;
      };

      const definition = flowDefinitionMeta.find(flow);
      if (!definition) {
        throw new Error("Flow definition not found in executor metadata");
      }

      let executor = executeCore;
      for (const extension of this.reversedExtensions) {
        if (extension.wrap) {
          const currentExecutor = executor;
          executor = async () => {
            return extension.wrap!(this, currentExecutor, {
              kind: "subflow",
              flow,
              definition,
              input,
              journalKey: undefined,
              parentFlowName,
              depth,
              pod: this.pod,
            });
          };
        }
      }

      return executor();
    })();

    return new FlowPromise(this.pod, promise);
  }

  async parallel<T extends readonly FlowPromise<any>[]>(
    promises: [...T]
  ): Promise<
    Flow.ParallelResult<{
      [K in keyof T]: T[K] extends FlowPromise<infer R> ? R : never;
    }>
  > {
    const parentFlowName = this.find(FlowExecutionContext.flowName);
    const depth = this.get(FlowExecutionContext.depth);

    const executeCore = async () => {
      const results = await Promise.all(promises);

      return {
        results: results as Flow.ParallelResult<{
          [K in keyof T]: T[K] extends FlowPromise<infer R> ? R : never;
        }>["results"],
        stats: {
          total: results.length,
          succeeded: results.length,
          failed: 0,
        },
      };
    };

    let executor = executeCore;
    for (const extension of this.reversedExtensions) {
      if (extension.wrap) {
        const currentExecutor = executor;
        executor = async () => {
          return extension.wrap!(this, currentExecutor, {
            kind: "parallel",
            mode: "parallel",
            promiseCount: promises.length,
            depth,
            parentFlowName,
            pod: this.pod,
          });
        };
      }
    }

    return executor();
  }

  async parallelSettled<T extends readonly FlowPromise<any>[]>(
    promises: [...T]
  ): Promise<
    Flow.ParallelSettledResult<{
      [K in keyof T]: T[K] extends FlowPromise<infer R> ? R : never;
    }>
  > {
    const parentFlowName = this.find(FlowExecutionContext.flowName);
    const depth = this.get(FlowExecutionContext.depth);

    const executeCore = async () => {
      const results = await Promise.allSettled(promises);

      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;

      return {
        results: results as PromiseSettledResult<any>[],
        stats: {
          total: results.length,
          succeeded,
          failed,
        },
      };
    };

    let executor = executeCore;
    for (const extension of this.reversedExtensions) {
      if (extension.wrap) {
        const currentExecutor = executor;
        executor = async () => {
          return extension.wrap!(this, currentExecutor, {
            kind: "parallel",
            mode: "parallelSettled",
            promiseCount: promises.length,
            depth,
            parentFlowName,
            pod: this.pod,
          });
        };
      }
    }

    return executor();
  }

  private async executeWithExtensions<T>(
    handler: (ctx: FlowContext) => Promise<T>,
    context: FlowContext,
    flow: Flow.UFlow,
    input: unknown
  ): Promise<T> {
    const executeCore = async (): Promise<T> => handler(context);
    const definition = flowDefinitionMeta.find(flow);
    if (!definition) {
      throw new Error("Flow definition not found in executor metadata");
    }

    let executor = executeCore;
    for (const extension of this.reversedExtensions) {
      if (extension.wrap) {
        const currentExecutor = executor;
        executor = async () => {
          return extension.wrap!(context, currentExecutor, {
            kind: "execute",
            flow,
            definition,
            input,
            flowName: context.find(FlowExecutionContext.flowName),
            depth: context.get(FlowExecutionContext.depth),
            isParallel: context.get(FlowExecutionContext.isParallel),
            parentFlowName: context.find(FlowExecutionContext.parentFlowName),
          });
        };
      }
    }

    return executor();
  }
}

function execute<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>>,
  input: I,
  options?: {
    scope?: Core.Scope;
    extensions?: Extension.Extension[];
    initialContext?: Array<
      [Accessor.Accessor<any> | Accessor.AccessorWithDefault<any>, any]
    >;
    presets?: Core.Preset<unknown>[];
  }
): FlowPromise<S> {
  const scope = options?.scope || createScope();
  const shouldDisposeScope = !options?.scope;

  const pod = scope.pod({ initialValues: options?.presets });

  const promise = (async () => {
    try {
      const context = new FlowContext(pod, options?.extensions || []);

      if (options?.initialContext) {
        for (const [accessor, value] of options.initialContext) {
          accessor.set(context, value);
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

        context.initializeExecutionContext(definition.name, false);

        const result = await handler(context, validated);

        validate(definition.success, result);

        return result;
      };

      const definition = flowDefinitionMeta.find(flow);
      if (!definition) {
        throw new Error("Flow definition not found in executor metadata");
      }

      let executor = executeCore;
      for (const extension of [...(options?.extensions || [])].reverse()) {
        if (extension.wrap) {
          const currentExecutor = executor;
          executor = () => {
            return extension.wrap!(context, currentExecutor, {
              kind: "execute",
              flow,
              definition,
              input,
              flowName:
                definition.name || context.find(FlowExecutionContext.flowName),
              depth: context.get(FlowExecutionContext.depth),
              isParallel: context.get(FlowExecutionContext.isParallel),
              parentFlowName: context.find(FlowExecutionContext.parentFlowName),
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
  })();

  return new FlowPromise(pod, promise);
}

function flowImpl<I, S>(
  handler: (ctx: Flow.Context, input: I) => Promise<S> | S
): Core.Executor<Flow.Handler<S, I>>;

function flowImpl<I extends void, S>(
  handler: (ctx?: Flow.Context) => Promise<S> | S
): Core.Executor<Flow.Handler<S, I>>;

function flowImpl<D extends Core.DependencyLike, I, S>(
  dependencies: D,
  handler: (
    deps: Core.InferOutput<D>,
    ctx: Flow.Context,
    input: I
  ) => Promise<S> | S
): Core.Executor<Flow.Handler<S, I>>;

function flowImpl<S, I>(
  config: FlowConfigWithHandler<S, I>
): Core.Executor<Flow.Handler<S, I>>;

function flowImpl<S, I, D extends Core.DependencyLike>(
  config: FlowConfigWithDeps<S, I, D>
): Core.Executor<Flow.Handler<S, I>>;

function flowImpl<S = unknown, I = unknown>(
  config: FlowConfigInferred<S, I>
): Core.Executor<Flow.Handler<S, I>>;

function flowImpl<
  S = unknown,
  I = unknown,
  D extends Core.DependencyLike = never
>(
  config: FlowConfigInferredWithDeps<S, I, D>
): Core.Executor<Flow.Handler<S, I>>;

function flowImpl<S, I>(
  definition: DefineConfig<S, I>,
  handler: (ctx: Flow.Context, input: I) => Promise<S> | S
): Core.Executor<Flow.Handler<S, I>>;

function flowImpl<S, I, D extends Core.DependencyLike>(
  definition: DefineConfig<S, I>,
  dependencies: D,
  handler: (
    deps: Core.InferOutput<D>,
    ctx: Flow.Context,
    input: I
  ) => Promise<S> | S
): Core.Executor<Flow.Handler<S, I>>;

function flowImpl<S, I, D extends Core.DependencyLike>(
  dependencies: D,
  definition: DefineConfig<S, I>,
  handler: (
    deps: Core.InferOutput<D>,
    ctx: Flow.Context,
    input: I
  ) => Promise<S> | S
): Core.Executor<Flow.Handler<S, I>>;

function flowImpl<S, I>(definition: DefineConfig<S, I>): FlowDefinition<S, I>;

function flowImpl<S, I, D extends Core.DependencyLike>(
  definitionOrConfigOrDepsOrHandler:
    | DefineConfig<S, I>
    | FlowConfigWithHandler<S, I>
    | FlowConfigWithDeps<S, I, D>
    | FlowConfigInferred<S, I>
    | FlowConfigInferredWithDeps<S, I, D>
    | D
    | ((ctx: Flow.Context, input: I) => Promise<S> | S)
    | ((ctx?: Flow.Context) => Promise<S> | S),
  dependenciesOrHandler?:
    | D
    | ((ctx: Flow.Context, input: I) => Promise<S> | S)
    | ((
        deps: Core.InferOutput<D>,
        ctx: Flow.Context,
        input: I
      ) => Promise<S> | S),
  handlerFn?: (
    deps: Core.InferOutput<D>,
    ctx: Flow.Context,
    input: I
  ) => Promise<S> | S
): Core.Executor<Flow.Handler<S, I>> | FlowDefinition<S, I> {
  if (typeof definitionOrConfigOrDepsOrHandler === "function") {
    const handler = definitionOrConfigOrDepsOrHandler as (
      ctx: Flow.Context,
      input: I
    ) => Promise<S> | S;
    const def = define({
      name: "anonymous",
      version: "1.0.0",
      input: custom<I>(),
      success: custom<S>(),
    });
    return def.handler(handler);
  }

  const firstArg = definitionOrConfigOrDepsOrHandler as
    | DefineConfig<S, I>
    | FlowConfigWithHandler<S, I>
    | FlowConfigWithDeps<S, I, D>
    | FlowConfigInferred<S, I>
    | FlowConfigInferredWithDeps<S, I, D>
    | D;

  if (
    !("name" in firstArg) &&
    dependenciesOrHandler &&
    typeof dependenciesOrHandler === "object" &&
    "name" in dependenciesOrHandler &&
    handlerFn
  ) {
    const dependencies = firstArg as D;
    const definition = dependenciesOrHandler as unknown as Partial<
      DefineConfig<S, I>
    > & { name: string };

    const hasInput = "input" in definition && definition.input !== undefined;
    const hasSuccess =
      "success" in definition && definition.success !== undefined;

    const def = define({
      name: definition.name,
      version: definition.version,
      input: hasInput ? definition.input! : custom<I>(),
      success: hasSuccess ? definition.success! : custom<S>(),
      meta: definition.meta,
    });

    return def.handler(dependencies, handlerFn);
  }

  if (typeof dependenciesOrHandler === "function" && !("name" in firstArg)) {
    const dependencies = firstArg as D;
    const handler = dependenciesOrHandler as (
      deps: Core.InferOutput<D>,
      ctx: Flow.Context,
      input: I
    ) => Promise<S> | S;
    const def = define({
      name: "anonymous",
      version: "1.0.0",
      input: custom<I>(),
      success: custom<S>(),
    });
    return def.handler(dependencies, handler);
  }

  if ("handler" in firstArg) {
    const config = firstArg as
      | FlowConfigWithHandler<S, I>
      | FlowConfigWithDeps<S, I, D>
      | FlowConfigInferred<S, I>
      | FlowConfigInferredWithDeps<S, I, D>;

    const hasInput = "input" in config && config.input !== undefined;
    const hasSuccess = "success" in config && config.success !== undefined;

    const def = define({
      name: config.name,
      version: config.version,
      input: hasInput ? config.input! : custom<I>(),
      success: hasSuccess ? config.success! : custom<S>(),
      meta: config.meta,
    });

    if ("dependencies" in config) {
      const depsConfig = config as
        | FlowConfigWithDeps<S, I, D>
        | FlowConfigInferredWithDeps<S, I, D>;
      return def.handler(depsConfig.dependencies, depsConfig.handler);
    } else {
      const handlerConfig = config as
        | FlowConfigWithHandler<S, I>
        | FlowConfigInferred<S, I>;
      return def.handler(handlerConfig.handler);
    }
  }

  const definition = firstArg as
    | DefineConfig<S, I>
    | Partial<DefineConfig<S, I>>;

  const hasInput = "input" in definition && definition.input !== undefined;
  const hasSuccess =
    "success" in definition && definition.success !== undefined;

  const def = define({
    name: definition.name || "anonymous",
    version: definition.version,
    input: hasInput ? definition.input! : custom<I>(),
    success: hasSuccess ? definition.success! : custom<S>(),
    meta: definition.meta,
  });

  if (!dependenciesOrHandler) {
    return def;
  }

  if (typeof dependenciesOrHandler === "function") {
    return def.handler(
      dependenciesOrHandler as (ctx: Flow.Context, input: I) => Promise<S> | S
    );
  } else {
    return def.handler(dependenciesOrHandler as D, handlerFn!);
  }
}

export const flow: typeof flowImpl & {
  define: typeof define;
  execute: typeof execute;
} = Object.assign(flowImpl, {
  define: define,
  execute: execute,
});

import type { Core, Extension, Flow, Meta, StandardSchemaV1 } from "./types";
import { createExecutor, isExecutor } from "./executor";
import { createScope } from "./scope";
import { validate } from "./ssch";
import { type Tag } from "./tag-types";
import { tag } from "./tag";
import { custom } from "./ssch";
import { Promised } from "./promises";

function isErrorEntry(
  entry: unknown
): entry is { __error: true; error: unknown } {
  return typeof entry === "object" && entry !== null && "__error" in entry;
}

function wrapWithExtensions<T>(
  extensions: Extension.Extension[] | undefined,
  baseExecutor: () => Promised<T>,
  dataStore: Tag.Store,
  operation: Extension.Operation
): () => Promised<T> {
  if (!extensions || extensions.length === 0) {
    return baseExecutor;
  }
  let executor = baseExecutor;
  for (let i = extensions.length - 1; i >= 0; i--) {
    const extension = extensions[i];
    if (extension.wrap) {
      const current = executor;
      executor = () => {
        const result = extension.wrap!(dataStore, current, operation);
        return result instanceof Promised ? result : Promised.create(result);
      };
    }
  }
  return executor;
}

const flowDefinitionMeta = tag(custom<Flow.Definition<any, any>>(), {
  label: "flow.definition",
}) as Meta.MetaFn<Flow.Definition<any, any>>;

export const flowMeta: {
  depth: Tag.Tag<number, true>;
  flowName: Tag.Tag<string | undefined, false>;
  parentFlowName: Tag.Tag<string | undefined, false>;
  isParallel: Tag.Tag<boolean, true>;
  journal: Tag.Tag<ReadonlyMap<string, unknown>, false>;
} = {
  depth: tag(custom<number>(), { label: "flow.depth", default: 0 }),
  flowName: tag(custom<string | undefined>(), { label: "flow.name" }),
  parentFlowName: tag(custom<string | undefined>(), { label: "flow.parentName" }),
  isParallel: tag(custom<boolean>(), { label: "flow.isParallel", default: false }),
  journal: tag(custom<ReadonlyMap<string, unknown>>(), { label: "flow.journal" }),
};

class FlowDefinition<S, I> {
  constructor(
    public readonly name: string,
    public readonly version: string,
    public readonly input: StandardSchemaV1<I>,
    public readonly output: StandardSchemaV1<S>,
    public readonly metas: Meta.Meta[] = []
  ) {}

  handler(
    handlerFn: (ctx: Flow.Context, input: I) => Promise<S> | S
  ): Flow.Flow<I, S>;

  handler<D extends Core.DependencyLike>(
    dependencies: D,
    handlerFn: (
      deps: Core.InferOutput<D>,
      ctx: Flow.Context,
      input: I
    ) => Promise<S> | S
  ): Flow.Flow<I, S>;

  handler<D extends Core.DependencyLike>(
    dependenciesOrHandler:
      | D
      | ((ctx: Flow.Context, input: I) => Promise<S> | S),
    handlerFn?: (
      deps: Core.InferOutput<D>,
      ctx: Flow.Context,
      input: I
    ) => Promise<S> | S
  ): Flow.Flow<I, S> {
    if (typeof dependenciesOrHandler === "function") {
      const noDepsHandler = dependenciesOrHandler;
      const executor = createExecutor(
        () => {
          const flowHandler = async (ctx: Flow.Context, input: I) => {
            return noDepsHandler(ctx, input);
          };
          return flowHandler as Flow.Handler<S, I>;
        },
        undefined,
        [...this.metas, flowDefinitionMeta(this)]
      ) as Flow.Flow<I, S>;
      executor.definition = this;
      return executor;
    }
    const dependencies = dependenciesOrHandler;
    const dependentHandler = handlerFn!;
    const executor = createExecutor(
      (deps: unknown) => {
        const flowHandler = async (ctx: Flow.Context, input: I) => {
          return dependentHandler(deps as Core.InferOutput<D>, ctx, input);
        };

        return flowHandler as Flow.Handler<S, I>;
      },
      dependencies,
      [...this.metas, flowDefinitionMeta(this)]
    ) as Flow.Flow<I, S>;
    executor.definition = this;
    return executor;
  }
}

type DefineConfig<S, I> = {
  name: string;
  version?: string;
  input: StandardSchemaV1<I>;
  output: StandardSchemaV1<S>;
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
  output?: StandardSchemaV1<S>;
  meta?: Meta.Meta[];
  handler: (ctx: Flow.Context, input: I) => Promise<S> | S;
};

type FlowConfigInferredWithDeps<S, I, D extends Core.DependencyLike> = {
  name: string;
  version?: string;
  input?: StandardSchemaV1<I>;
  output?: StandardSchemaV1<S>;
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
    config.output,
    config.meta
  );
}

class FlowContext implements Flow.Context {
  private contextData = new Map<unknown, unknown>();
  private journal: Map<string, unknown> | null = null;
  public readonly scope: Core.Scope;
  private reversedExtensions: Extension.Extension[];
  public readonly metas: Meta.Meta[] | undefined;

  constructor(
    scope: Core.Scope,
    private extensions: Extension.Extension[],
    meta?: Meta.Meta[],
    private parent?: FlowContext
  ) {
    this.scope = scope;
    this.reversedExtensions = [...extensions].reverse();
    this.metas = meta;
  }

  resolve<T>(executor: Core.Executor<T>): Promised<T> {
    return this.scope.resolve(executor);
  }

  accessor<T>(executor: Core.Executor<T>): Core.Accessor<T> {
    return this.scope.accessor(executor);
  }

  private wrapWithExtensions<T>(
    baseExecutor: () => Promised<T>,
    operation: Extension.Operation
  ): () => Promised<T> {
    let executor = baseExecutor;
    for (const extension of this.reversedExtensions) {
      if (extension.wrap) {
        const current = executor;
        executor = () => {
          const result = extension.wrap!(this, current, operation);
          return result instanceof Promised ? result : Promised.create(result);
        };
      }
    }
    return executor;
  }

  initializeExecutionContext(flowName: string, isParallel: boolean = false) {
    const currentDepth = this.parent ? this.parent.get(flowMeta.depth) + 1 : 0;
    const parentFlowName = this.parent
      ? this.parent.find(flowMeta.flowName)
      : undefined;

    this.set(flowMeta.depth, currentDepth);
    this.set(flowMeta.flowName, flowName);
    this.set(flowMeta.parentFlowName, parentFlowName);
    this.set(flowMeta.isParallel, isParallel);
  }

  get<T>(accessor: Tag.Tag<T, false> | Tag.Tag<T, true>): T;
  get<T>(accessorOrKey: unknown): T | unknown {
    if (
      typeof accessorOrKey === "object" &&
      accessorOrKey !== null &&
      "get" in accessorOrKey
    ) {
      const accessor = accessorOrKey as Tag.Tag<T, false> | Tag.Tag<T, true>;
      return accessor.get(this);
    }
    const key = accessorOrKey;
    if (this.contextData.has(key)) {
      return this.contextData.get(key);
    }
    if (this.parent) {
      return (this.parent.get as (key: unknown) => unknown)(key);
    }
    return undefined;
  }

  find<T>(accessor: Tag.Tag<T, false>): T | undefined;
  find<T>(accessor: Tag.Tag<T, true>): T;
  find<T>(accessor: Tag.Tag<T, false> | Tag.Tag<T, true>): T | undefined {
    return accessor.find(this);
  }

  set<T>(accessor: Tag.Tag<T, false> | Tag.Tag<T, true>, value: T): void;
  set<T>(accessorOrKey: unknown, value: unknown): void | unknown {
    if (
      typeof accessorOrKey === "object" &&
      accessorOrKey !== null &&
      "set" in accessorOrKey
    ) {
      const accessor = accessorOrKey as Tag.Tag<T, false> | Tag.Tag<T, true>;
      accessor.set(this, value as T);
      return;
    }
    const key = accessorOrKey;
    this.contextData.set(key, value);
    return value;
  }

  run<T>(key: string, fn: () => Promise<T> | T): Promised<T>;
  run<T, P extends readonly unknown[]>(
    key: string,
    fn: (...args: P) => Promise<T> | T,
    ...params: P
  ): Promised<T>;

  run<T, P extends readonly unknown[]>(
    key: string,
    fn: ((...args: P) => Promise<T> | T) | (() => Promise<T> | T),
    ...params: P
  ): Promised<T> {
    if (!this.journal) {
      this.journal = new Map();
    }

    const flowName = this.find(flowMeta.flowName) || "unknown";
    const depth = this.get(flowMeta.depth);
    const journalKey = `${flowName}:${depth}:${key}`;

    const promise = (async () => {
      const journal = this.journal!;
      const isReplay = journal.has(journalKey);

      const executeCore = (): Promised<T> => {
        if (isReplay) {
          const entry = journal.get(journalKey);
          if (isErrorEntry(entry)) {
            throw entry.error;
          }
          return Promised.create(Promise.resolve(entry as T));
        }

        return Promised.try(async () => {
          const result =
            params.length > 0
              ? await (fn as (...args: P) => Promise<T> | T)(...params)
              : await (fn as () => Promise<T> | T)();
          journal.set(journalKey, result);
          return result;
        }).catch((error) => {
          journal.set(journalKey, { __error: true, error });
          throw error;
        });
      };

      const executor = this.wrapWithExtensions(executeCore, {
        kind: "journal",
        key,
        flowName,
        depth,
        isReplay,
        context: this,
        params: params.length > 0 ? params : undefined,
      });

      return executor();
    })();

    return Promised.create(promise);
  }

  exec<F extends Flow.UFlow>(
    flow: F,
    input: Flow.InferInput<F>
  ): Promised<Flow.InferOutput<F>>;

  exec<F extends Flow.UFlow>(
    key: string,
    flow: F,
    input: Flow.InferInput<F>
  ): Promised<Flow.InferOutput<F>>;

  exec<F extends Flow.UFlow>(
    keyOrFlow: string | F,
    flowOrInput: F | Flow.InferInput<F>,
    inputOrUndefined?: Flow.InferInput<F>
  ): Promised<Flow.InferOutput<F>> {
    if (typeof keyOrFlow === "string") {
      if (!this.journal) {
        this.journal = new Map();
      }

      const key = keyOrFlow;
      const flow = flowOrInput as F;
      const input = inputOrUndefined as Flow.InferInput<F>;

      const parentFlowName = this.find(flowMeta.flowName);
      const depth = this.get(flowMeta.depth);
      const flowName = this.find(flowMeta.flowName) || "unknown";
      const journalKey = `${flowName}:${depth}:${key}`;

      const promise = (async () => {
        const journal = this.journal!;
        const executeCore = (): Promised<Flow.InferOutput<F>> => {
          if (journal.has(journalKey)) {
            const entry = journal.get(journalKey);
            if (isErrorEntry(entry)) {
              throw entry.error;
            }
            return Promised.create(Promise.resolve(entry as Flow.InferOutput<F>));
          }

          return Promised.try(async () => {
            const handler = await this.scope.resolve(flow);
            const definition = flowDefinitionMeta.find(flow);
            if (!definition) {
              throw new Error("Flow definition not found in executor metadata");
            }

            const childContext = new FlowContext(
              this.scope,
              this.extensions,
              undefined,
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

            journal.set(journalKey, result);
            return result;
          }).catch((error) => {
            journal.set(journalKey, { __error: true, error });
            throw error;
          });
        };

        const definition = flowDefinitionMeta.find(flow);
        if (!definition) {
          throw new Error("Flow definition not found in executor metadata");
        }

        const executor = this.wrapWithExtensions(executeCore, {
          kind: "subflow",
          flow,
          definition,
          input,
          journalKey,
          parentFlowName,
          depth,
          context: this,
        });

        return executor();
      })();

      return Promised.create(promise);
    }

    const flow = keyOrFlow as F;
    const input = flowOrInput as Flow.InferInput<F>;

    const promise = (async () => {
      const parentFlowName = this.find(flowMeta.flowName);
      const depth = this.get(flowMeta.depth);

      const executeCore = (): Promised<Flow.InferOutput<F>> => {
        return this.scope.resolve(flow).map(async (handler) => {
          const definition = flowDefinitionMeta.find(flow);
          if (!definition) {
            throw new Error("Flow definition not found in executor metadata");
          }

          const childContext = new FlowContext(this.scope, this.extensions, undefined, this);
          childContext.initializeExecutionContext(definition.name, false);

          return (await this.executeWithExtensions<Flow.InferOutput<F>>(
            async (ctx) => handler(ctx, input) as Promise<Flow.InferOutput<F>>,
            childContext,
            flow,
            input
          )) as Flow.InferOutput<F>;
        });
      };

      const definition = flowDefinitionMeta.find(flow);
      if (!definition) {
        throw new Error("Flow definition not found in executor metadata");
      }

      const executor = this.wrapWithExtensions(executeCore, {
        kind: "subflow",
        flow,
        definition,
        input,
        journalKey: undefined,
        parentFlowName,
        depth,
        context: this,
      });

      return executor();
    })();

    return Promised.create(promise);
  }

  parallel<T extends readonly Promised<any>[]>(
    promises: [...T]
  ): Promised<
    Flow.ParallelResult<{
      [K in keyof T]: T[K] extends Promised<infer R> ? R : never;
    }>
  > {
    const parentFlowName = this.find(flowMeta.flowName);
    const depth = this.get(flowMeta.depth);

    const promise = (async () => {
      const executeCore = (): Promised<{
        results: Flow.ParallelResult<{
          [K in keyof T]: T[K] extends Promised<infer R> ? R : never;
        }>["results"];
        stats: { total: number; succeeded: number; failed: number };
      }> => {
        return Promised.create(Promise.all(promises).then((results) => ({
          results: results as Flow.ParallelResult<{
            [K in keyof T]: T[K] extends Promised<infer R> ? R : never;
          }>["results"],
          stats: {
            total: results.length,
            succeeded: results.length,
            failed: 0,
          },
        })));
      };

      const executor = this.wrapWithExtensions(executeCore, {
        kind: "parallel",
        mode: "parallel",
        promiseCount: promises.length,
        depth,
        parentFlowName,
        context: this,
      });

      return executor();
    })();

    return Promised.create(promise);
  }

  parallelSettled<T extends readonly Promised<any>[]>(
    promises: [...T]
  ): Promised<
    Flow.ParallelSettledResult<{
      [K in keyof T]: T[K] extends Promised<infer R> ? R : never;
    }>
  > {
    const parentFlowName = this.find(flowMeta.flowName);
    const depth = this.get(flowMeta.depth);

    const promise = (async () => {
      const executeCore = (): Promised<{
        results: PromiseSettledResult<any>[];
        stats: { total: number; succeeded: number; failed: number };
      }> => {
        return Promised.create(Promise.allSettled(promises).then((results) => {
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
        }));
      };

      const executor = this.wrapWithExtensions(executeCore, {
        kind: "parallel",
        mode: "parallelSettled",
        promiseCount: promises.length,
        depth,
        parentFlowName,
        context: this,
      });

      return executor();
    })();

    return Promised.create(promise);
  }

  private executeWithExtensions<T>(
    handler: (ctx: FlowContext) => Promise<T>,
    context: FlowContext,
    flow: Flow.UFlow,
    input: unknown
  ): Promised<T> {
    const executeCore = (): Promised<T> => Promised.create(handler(context));
    const definition = flowDefinitionMeta.find(flow);
    if (!definition) {
      throw new Error("Flow definition not found in executor metadata");
    }

    const executor = context.wrapWithExtensions(executeCore, {
      kind: "execute",
      flow,
      definition,
      input,
      flowName: context.find(flowMeta.flowName),
      depth: context.get(flowMeta.depth),
      isParallel: context.get(flowMeta.isParallel),
      parentFlowName: context.find(flowMeta.parentFlowName),
    });

    return executor();
  }

  createSnapshot(): Flow.ExecutionData {
    const contextDataSnapshot = new Map(this.contextData);
    if (this.journal) {
      contextDataSnapshot.set(flowMeta.journal.key, new Map(this.journal));
    }

    const dataStore = {
      get: (key: unknown) => contextDataSnapshot.get(key),
      set: (_key: unknown, _value: unknown) => {
        throw new Error("Cannot set values on execution snapshot");
      },
    };

    return {
      context: {
        get<T>(accessor: Tag.Tag<T, false> | Tag.Tag<T, true>): T {
          return accessor.get(dataStore);
        },
        find<T>(accessor: Tag.Tag<T, false> | Tag.Tag<T, true>): T | undefined {
          return accessor.find(dataStore);
        },
      },
    };
  }
}

function execute<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>> | Flow.Flow<I, S>,
  input: I,
  options: {
    scope?: Core.Scope;
    extensions?: Extension.Extension[];
    initialContext?: Array<[Tag.Tag<any, false> | Tag.Tag<any, true>, any]>;
    scopeMeta?: Meta.Meta[];
    meta?: Meta.Meta[];
    details: true;
  }
): Promised<Flow.ExecutionDetails<S>>;

function execute<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>> | Flow.Flow<I, S>,
  input: I,
  options?: {
    scope?: Core.Scope;
    extensions?: Extension.Extension[];
    initialContext?: Array<[Tag.Tag<any, false> | Tag.Tag<any, true>, any]>;
    scopeMeta?: Meta.Meta[];
    meta?: Meta.Meta[];
    details?: false;
  }
): Promised<S>;

function execute<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>> | Flow.Flow<I, S>,
  input: I,
  options?: {
    scope?: Core.Scope;
    extensions?: Extension.Extension[];
    initialContext?: Array<[Tag.Tag<any, false> | Tag.Tag<any, true>, any]>;
    scopeMeta?: Meta.Meta[];
    meta?: Meta.Meta[];
    details?: boolean;
  }
): Promised<S> | Promised<Flow.ExecutionDetails<S>> {
  const scope = options?.scope || createScope({ meta: options?.scopeMeta });
  const shouldDisposeScope = !options?.scope;

  let resolveSnapshot!: (snapshot: Flow.ExecutionData | undefined) => void;
  const snapshotPromise = new Promise<Flow.ExecutionData | undefined>(
    (resolve) => {
      resolveSnapshot = resolve;
    }
  );

  const promise = (async () => {
    const context = new FlowContext(scope, options?.extensions || [], options?.meta);

    try {
      if (options?.initialContext) {
        for (const [accessor, value] of options.initialContext) {
          accessor.set(context, value);
        }
      }

      const executeCore = (): Promised<S> => {
        return scope.resolve(flow).map(async (handler) => {
          const definition = flowDefinitionMeta.find(flow);
          if (!definition) {
            throw new Error("Flow definition not found in executor metadata");
          }
          const validated = validate(definition.input, input);

          context.initializeExecutionContext(definition.name, false);

          const result = await handler(context, validated);

          validate(definition.output, result);

          return result;
        });
      };

      const definition = flowDefinitionMeta.find(flow);
      if (!definition) {
        throw new Error("Flow definition not found in executor metadata");
      }

      const executor = wrapWithExtensions(
        options?.extensions,
        executeCore,
        context,
        {
          kind: "execute",
          flow,
          definition,
          input,
          flowName: definition.name || context.find(flowMeta.flowName),
          depth: context.get(flowMeta.depth),
          isParallel: context.get(flowMeta.isParallel),
          parentFlowName: context.find(flowMeta.parentFlowName),
        }
      );

      const result = await executor();
      resolveSnapshot(context.createSnapshot());
      return result;
    } catch (error) {
      resolveSnapshot(context.createSnapshot());
      throw error;
    } finally {
      if (shouldDisposeScope) {
        await scope.dispose();
      }
    }
  })();

  if (options?.details) {
    const detailsPromise = Promised.try(async (): Promise<Flow.ExecutionDetails<S>> => {
      const [result, ctx] = await Promise.all([promise, snapshotPromise]);
      if (!ctx) {
        throw new Error("Execution context not available");
      }
      return { success: true as const, result, ctx };
    }).catch(async (error) => {
      const ctx = await snapshotPromise;
      if (!ctx) {
        throw new Error("Execution context not available");
      }
      return { success: false as const, error, ctx };
    });

    return Promised.create(detailsPromise, snapshotPromise);
  }

  return Promised.create(promise, snapshotPromise);
}

function flowImpl<I, S>(
  handler: (ctx: Flow.Context, input: I) => Promise<S> | S
): Flow.Flow<I, S>;

function flowImpl<I extends void, S>(
  handler: (ctx?: Flow.Context) => Promise<S> | S
): Flow.Flow<I, S>;

function flowImpl<D extends Core.DependencyLike, I, S>(
  dependencies: D,
  handler: (
    deps: Core.InferOutput<D>,
    ctx: Flow.Context,
    input: I
  ) => Promise<S> | S
): Flow.Flow<I, S>;

function flowImpl<S, I>(
  config: FlowConfigWithHandler<S, I>
): Flow.Flow<I, S>;

function flowImpl<S, I, D extends Core.DependencyLike>(
  config: FlowConfigWithDeps<S, I, D>
): Flow.Flow<I, S>;

function flowImpl<S = unknown, I = unknown>(
  config: FlowConfigInferred<S, I>
): Flow.Flow<I, S>;

function flowImpl<
  S = unknown,
  I = unknown,
  D extends Core.DependencyLike = never
>(
  config: FlowConfigInferredWithDeps<S, I, D>
): Flow.Flow<I, S>;

function flowImpl<S, I>(
  definition: DefineConfig<S, I>,
  handler: (ctx: Flow.Context, input: I) => Promise<S> | S
): Flow.Flow<I, S>;

function flowImpl<S, I, D extends Core.DependencyLike>(
  definition: DefineConfig<S, I>,
  dependencies: D,
  handler: (
    deps: Core.InferOutput<D>,
    ctx: Flow.Context,
    input: I
  ) => Promise<S> | S
): Flow.Flow<I, S>;

function flowImpl<S, I, D extends Core.DependencyLike>(
  dependencies: D,
  definition: DefineConfig<S, I>,
  handler: (
    deps: Core.InferOutput<D>,
    ctx: Flow.Context,
    input: I
  ) => Promise<S> | S
): Flow.Flow<I, S>;

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
): Flow.Flow<I, S> | FlowDefinition<S, I> {
  if (typeof definitionOrConfigOrDepsOrHandler === "function") {
    const handler = definitionOrConfigOrDepsOrHandler as (
      ctx: Flow.Context,
      input: I
    ) => Promise<S> | S;
    const def = define({
      name: "anonymous",
      version: "1.0.0",
      input: custom<I>(),
      output: custom<S>(),
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
    const hasOutput =
      "output" in definition && definition.output !== undefined;

    const def = define({
      name: definition.name,
      version: definition.version,
      input: hasInput ? definition.input! : custom<I>(),
      output: hasOutput ? definition.output! : custom<S>(),
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
      output: custom<S>(),
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
    const hasOutput = "output" in config && config.output !== undefined;

    const def = define({
      name: config.name,
      version: config.version,
      input: hasInput ? config.input! : custom<I>(),
      output: hasOutput ? config.output! : custom<S>(),
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
  const hasOutput =
    "output" in definition && definition.output !== undefined;

  const def = define({
    name: definition.name || "anonymous",
    version: definition.version,
    input: hasInput ? definition.input! : custom<I>(),
    output: hasOutput ? definition.output! : custom<S>(),
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

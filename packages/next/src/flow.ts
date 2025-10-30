import type { Core, Extension, Flow, StandardSchemaV1 } from "./types";
import { createExecutor, isExecutor } from "./executor";
import { createScope, type ScopeOption } from "./scope";
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
  scope: Core.Scope,
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
        const result = extension.wrap!(scope, current, operation);
        return result instanceof Promised ? result : Promised.create(result);
      };
    }
  }
  return executor;
}

const flowDefinitionMeta: Tag.Tag<Flow.Definition<any, any>, false> = tag(custom<Flow.Definition<any, any>>(), {
  label: "flow.definition",
});

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
    public readonly tags: Tag.Tagged[] = []
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
        [...this.tags, flowDefinitionMeta(this)]
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
      [...this.tags, flowDefinitionMeta(this)]
    ) as Flow.Flow<I, S>;
    executor.definition = this;
    return executor;
  }
}

type DefineConfig<S, I> = {
  name?: string;
  version?: string;
  input: StandardSchemaV1<I>;
  output: StandardSchemaV1<S>;
  tags?: Tag.Tagged[];
};

function define<S, I>(config: DefineConfig<S, I>): FlowDefinition<S, I> {
  return new FlowDefinition(
    config.name || "anonymous",
    config.version || "1.0.0",
    config.input,
    config.output,
    config.tags || []
  );
}

class FlowContext implements Flow.Context {
  private contextData = new Map<unknown, unknown>();
  private journal: Map<string, unknown> | null = null;
  public readonly scope: Core.Scope;
  private reversedExtensions: Extension.Extension[];
  public readonly tags: Tag.Tagged[] | undefined;

  constructor(
    scope: Core.Scope,
    private extensions: Extension.Extension[],
    tags?: Tag.Tagged[],
    private parent?: FlowContext | undefined
  ) {
    this.scope = scope;
    this.reversedExtensions = [...extensions].reverse();
    this.tags = tags;
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
          const result = extension.wrap!(this.scope, current, operation);
          return result instanceof Promised ? result : Promised.create(result);
        };
      }
    }
    return executor;
  }

  initializeExecutionContext(flowName: string, isParallel: boolean = false): void {
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
    if (this.tags && typeof key === "symbol") {
      const tagged = this.tags.find((m: Tag.Tagged) => m.key === key);
      if (tagged) {
        return tagged.value;
      }
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
      accessorOrKey !== null &&
      accessorOrKey !== undefined &&
      (typeof accessorOrKey === "object" || typeof accessorOrKey === "function") &&
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
      tags: this.tags,
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
    scope: Core.Scope;
    executionTags?: Tag.Tagged[];
    details: true;
  }
): Promised<Flow.ExecutionDetails<S>>;

function execute<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>> | Flow.Flow<I, S>,
  input: I,
  options?: {
    scope: Core.Scope;
    executionTags?: Tag.Tagged[];
    details?: false;
  }
): Promised<S>;

function execute<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>> | Flow.Flow<I, S>,
  input: I,
  options: Omit<ScopeOption, 'tags'> & {
    scopeTags?: Tag.Tagged[];
    executionTags?: Tag.Tagged[];
    details: true;
  }
): Promised<Flow.ExecutionDetails<S>>;

function execute<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>> | Flow.Flow<I, S>,
  input: I,
  options?: Omit<ScopeOption, 'tags'> & {
    scopeTags?: Tag.Tagged[];
    executionTags?: Tag.Tagged[];
    details?: false;
  }
): Promised<S>;

function execute<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>> | Flow.Flow<I, S>,
  input: I,
  options?:
    | {
        scope: Core.Scope;
        executionTags?: Tag.Tagged[];
        details?: boolean;
      }
    | (Omit<ScopeOption, 'tags'> & {
        scopeTags?: Tag.Tagged[];
        executionTags?: Tag.Tagged[];
        details?: boolean;
      })
): Promised<S> | Promised<Flow.ExecutionDetails<S>> {
  if (options && 'scope' in options) {
    if (options.details === true) {
      return options.scope.exec(flow, input, {
        tags: options.executionTags,
        details: true,
      });
    }
    return options.scope.exec(flow, input, {
      tags: options.executionTags,
    });
  }

  const scope = options
    ? createScope({
        initialValues: options.initialValues,
        registry: options.registry,
        extensions: options.extensions,
        tags: options.scopeTags,
      })
    : createScope();

  const shouldDisposeScope = true;

  if (options?.details === true) {
    const result = scope.exec(flow, input, {
      tags: options.executionTags,
      details: true,
    });
    if (shouldDisposeScope) {
      return Promised.create(
        result.then((r) => scope.dispose().then(() => r)),
        result.ctx()
      ) as Promised<Flow.ExecutionDetails<S>>;
    }
    return result;
  }

  const result = scope.exec(flow, input, {
    tags: options?.executionTags,
  });
  if (shouldDisposeScope) {
    return Promised.create(
      result.then((r) => scope.dispose().then(() => r)),
      result.ctx()
    ) as Promised<S>;
  }
  return result;
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
  config: DefineConfig<S, I>
): FlowDefinition<S, I>;

function flowImpl<S, I>(
  config: DefineConfig<S, I>,
  handler: (ctx: Flow.Context, input: I) => Promise<S> | S
): Flow.Flow<I, S>;

function flowImpl<S, I, D extends Core.DependencyLike>(
  config: DefineConfig<S, I>,
  dependencies: D,
  handler: (
    deps: Core.InferOutput<D>,
    ctx: Flow.Context,
    input: I
  ) => Promise<S> | S
): Flow.Flow<I, S>;

function flowImpl<S, I, D extends Core.DependencyLike>(
  first:
    | DefineConfig<S, I>
    | D
    | ((ctx: Flow.Context, input: I) => Promise<S> | S)
    | ((ctx?: Flow.Context) => Promise<S> | S),
  second?:
    | D
    | ((ctx: Flow.Context, input: I) => Promise<S> | S)
    | ((
        deps: Core.InferOutput<D>,
        ctx: Flow.Context,
        input: I
      ) => Promise<S> | S),
  third?: (
    deps: Core.InferOutput<D>,
    ctx: Flow.Context,
    input: I
  ) => Promise<S> | S
): Flow.Flow<I, S> | FlowDefinition<S, I> {
  if (typeof first === "function") {
    const handler = first as (ctx: Flow.Context, input: I) => Promise<S> | S;
    const def = define({
      input: custom<I>(),
      output: custom<S>(),
    });
    return def.handler(handler);
  }

  if (isExecutor(first)) {
    if (typeof second !== "function") {
      throw new Error("flow(deps, handler) requires handler as second argument");
    }
    const dependencies = first as D;
    const handler = second as (
      deps: Core.InferOutput<D>,
      ctx: Flow.Context,
      input: I
    ) => Promise<S> | S;
    const def = define({
      input: custom<I>(),
      output: custom<S>(),
    });
    return def.handler(dependencies, handler);
  }

  if (typeof first === "object" && first !== null) {
    const hasInputOutput = "input" in first && "output" in first;

    if (hasInputOutput) {
      const config = first as DefineConfig<S, I>;

      if ("handler" in config || "dependencies" in config) {
        throw new Error("Config object cannot contain 'handler' or 'dependencies' properties. Use flow(config, handler) or flow(config, deps, handler) instead.");
      }

      const def = define(config);

      if (!second) {
        return def;
      }

      if (typeof second === "function") {
        return def.handler(second as (ctx: Flow.Context, input: I) => Promise<S> | S);
      }

      if (isExecutor(second)) {
        if (!third) {
          throw new Error("flow(config, deps, handler) requires handler as third argument");
        }
        return def.handler(second as D, third);
      }

      throw new Error("Invalid flow() call: second argument must be handler function or dependencies");
    }

    const isValidDependencyObject = (obj: object): boolean => {
      const values = Object.values(obj);
      if (values.length === 0) {
        return true;
      }
      return values.every(value =>
        typeof value === "function" || isExecutor(value)
      );
    };

    if (!isValidDependencyObject(first)) {
      throw new Error("Invalid flow() call: first argument must be either a config object with 'input' and 'output' properties, or a valid dependency object containing executors/functions");
    }

    if (typeof second === "function") {
      const dependencies = first as D;
      const handler = second as (
        deps: Core.InferOutput<D>,
        ctx: Flow.Context,
        input: I
      ) => Promise<S> | S;
      const def = define({
        input: custom<I>(),
        output: custom<S>(),
      });
      return def.handler(dependencies, handler);
    }

    throw new Error("Invalid flow() call: object dependencies require handler function as second argument");
  }

  throw new Error("Invalid flow() call: first argument must be handler, dependencies, or config object");
}

export const flow: typeof flowImpl & {
  execute: typeof execute;
} = Object.assign(flowImpl, {
  execute: execute,
});

export { FlowContext, flowDefinitionMeta, wrapWithExtensions };

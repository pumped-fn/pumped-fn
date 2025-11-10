import type { Core, Extension, Flow, StandardSchemaV1 } from "./types";
import { createExecutor, isExecutor } from "./executor";
import { createScope, type ScopeOption } from "./scope";
import { validate } from "./ssch";
import { type Tag } from "./tag-types";
import { tag } from "./tag";
import { custom } from "./ssch";
import { Promised } from "./promises";
import { createAbortWithTimeout } from "./internal/abort-utils";
import { createJournalKey, checkJournalReplay, isErrorEntry } from "./internal/journal-utils";

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

namespace ExecConfig {
  export type Flow<F extends Flow.UFlow> = {
    type: "flow";
    flow: F;
    input: Flow.InferInput<F>;
    key?: string;
    timeout?: number;
    retry?: number;
    tags?: Tag.Tagged[];
  };

  export type Fn<T> = {
    type: "fn";
    fn: (...args: any[]) => T | Promise<T>;
    params: any[];
    key?: string;
    timeout?: number;
    retry?: number;
    tags?: Tag.Tagged[];
  };

  export type Normalized<T = any> = Flow<any> | Fn<T>;
}

class FlowContext implements Flow.Context {
  private contextData = new Map<unknown, unknown>();
  private journal: Map<string, unknown> | null = null;
  public readonly scope: Core.Scope;
  private reversedExtensions: Extension.Extension[];
  public readonly tags: Tag.Tagged[] | undefined;
  private abortController: AbortController;

  constructor(
    scope: Core.Scope,
    private extensions: Extension.Extension[],
    tags?: Tag.Tagged[],
    private parent?: FlowContext | undefined,
    abortController?: AbortController
  ) {
    this.scope = scope;
    this.reversedExtensions = [...extensions].reverse();
    this.tags = tags;
    this.abortController = abortController || new AbortController();
  }

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  throwIfAborted(): void {
    if (this.signal.aborted) {
      throw new Error("Flow execution cancelled");
    }
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
      "extractFrom" in accessorOrKey
    ) {
      const accessor = accessorOrKey as Tag.Tag<T, false> | Tag.Tag<T, true>;
      return accessor.extractFrom(this);
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
    return accessor.readFrom(this);
  }

  set<T>(accessor: Tag.Tag<T, false> | Tag.Tag<T, true>, value: T): void;
  set<T>(accessorOrKey: unknown, value: unknown): void | unknown {
    if (
      accessorOrKey !== null &&
      accessorOrKey !== undefined &&
      (typeof accessorOrKey === "object" || typeof accessorOrKey === "function") &&
      "injectTo" in accessorOrKey
    ) {
      const accessor = accessorOrKey as Tag.Tag<T, false> | Tag.Tag<T, true>;
      accessor.injectTo(this, value as T);
      return;
    }
    const key = accessorOrKey;
    this.contextData.set(key, value);
    return value;
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

  exec<F extends Flow.UFlow>(config: {
    flow: F;
    input: Flow.InferInput<F>;
    key?: string;
    timeout?: number;
    retry?: number;
    tags?: Tag.Tagged[];
  }): Promised<Flow.InferOutput<F>>;

  exec<T>(config: {
    fn: () => T | Promise<T>;
    params?: never;
    key?: string;
    timeout?: number;
    retry?: number;
    tags?: Tag.Tagged[];
  }): Promised<T>;

  exec<Fn extends (...args: any[]) => any>(config: {
    fn: Fn;
    params: Parameters<Fn>;
    key?: string;
    timeout?: number;
    retry?: number;
    tags?: Tag.Tagged[];
  }): Promised<ReturnType<Fn>>;

  exec<F extends Flow.UFlow>(
    keyOrFlowOrConfig: string | F | { flow?: F; fn?: any; input?: Flow.InferInput<F>; params?: any[]; key?: string; timeout?: number; retry?: number; tags?: Tag.Tagged[] },
    flowOrInput?: F | Flow.InferInput<F>,
    inputOrUndefined?: Flow.InferInput<F>
  ): Promised<any> {
    this.throwIfAborted();

    const config = this.parseExecOverloads(keyOrFlowOrConfig, flowOrInput, inputOrUndefined);
    const { controller, timeoutId } = createAbortWithTimeout(config.timeout, this.signal);

    const executeWithCleanup = async <T>(executor: () => Promise<T>): Promise<T> => {
      try {
        return await executor();
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    };

    if (config.type === "fn") {
      if (config.key) {
        if (!this.journal) {
          this.journal = new Map();
        }

        const flowName = this.find(flowMeta.flowName) || "unknown";
        const depth = this.get(flowMeta.depth);
        const journalKey = createJournalKey(flowName, depth, config.key);

        return Promised.create(
          executeWithCleanup(async () => await this.executeJournaledFn(config.fn, config.params, journalKey, flowName, depth))
        );
      } else {
        return Promised.try(() => executeWithCleanup(() => config.fn(...config.params)));
      }
    }

    if (config.key) {
      if (!this.journal) {
        this.journal = new Map();
      }

      const parentFlowName = this.find(flowMeta.flowName);
      const depth = this.get(flowMeta.depth);
      const journalKey = createJournalKey(parentFlowName || "unknown", depth, config.key);
      const journal = this.journal as Map<string, Flow.InferOutput<F> | { __error: true; error: unknown }>;

      const definition = flowDefinitionMeta.readFrom(config.flow);
      if (!definition) {
        throw new Error("Flow definition not found");
      }

      const executeCore = (): Promised<Flow.InferOutput<F>> => {
        return this.scope.resolve(config.flow).map(async (handler) => {
          const { isReplay, value } = checkJournalReplay<Flow.InferOutput<F>>(journal, journalKey);

          if (isReplay) {
            return value!;
          }

          this.throwIfAborted();

          const validated = validate(definition.input, config.input);
          const childContext = new FlowContext(this.scope, this.extensions, config.tags, this, controller);
          childContext.initializeExecutionContext(definition.name, false);

          try {
            const result = (await this.executeWithExtensions<Flow.InferOutput<F>>(
              async (ctx) => (handler as Flow.Handler<Flow.InferOutput<F>, Flow.InferInput<F>>)(ctx, validated) as Promise<Flow.InferOutput<F>>,
              childContext,
              config.flow,
              config.input
            )) as Flow.InferOutput<F>;
            validate(definition.output, result);
            journal.set(journalKey, result);
            return result;
          } catch (error) {
            journal.set(journalKey, { __error: true, error });
            throw error;
          }
        });
      };

      const executor = this.wrapWithExtensions(executeCore, {
        kind: "subflow",
        flow: config.flow,
        definition,
        input: config.input,
        journalKey,
        parentFlowName,
        depth,
        context: this,
      });

      return Promised.create(executeWithCleanup(async () => await executor()));
    }

    return Promised.create(
      executeWithCleanup(async () => await this.executeSubflow(config.flow, config.input, config.tags))
    );
  }

  private parseExecOverloads<F extends Flow.UFlow>(
    keyOrFlowOrConfig: string | F | { flow?: F; fn?: any; input?: Flow.InferInput<F>; params?: any[]; key?: string; timeout?: number; retry?: number; tags?: Tag.Tagged[] },
    flowOrInput?: F | Flow.InferInput<F>,
    inputOrUndefined?: Flow.InferInput<F>
  ): ExecConfig.Normalized {
    if (typeof keyOrFlowOrConfig === "object" && keyOrFlowOrConfig !== null && !("factory" in keyOrFlowOrConfig)) {
      const config = keyOrFlowOrConfig;

      if ("flow" in config) {
        return {
          type: "flow",
          flow: config.flow as F,
          input: config.input as Flow.InferInput<F>,
          key: config.key,
          timeout: config.timeout,
          retry: config.retry,
          tags: config.tags,
        };
      } else if ("fn" in config) {
        return {
          type: "fn",
          fn: config.fn,
          params: "params" in config ? config.params || [] : [],
          key: config.key,
          timeout: config.timeout,
          retry: config.retry,
          tags: config.tags,
        };
      } else {
        throw new Error("Invalid config: must have either 'flow' or 'fn'");
      }
    }

    const keyOrFlow = keyOrFlowOrConfig as string | F;

    if (typeof keyOrFlow === "string") {
      return {
        type: "flow",
        flow: flowOrInput as F,
        input: inputOrUndefined as Flow.InferInput<F>,
        key: keyOrFlow,
        timeout: undefined,
        retry: undefined,
        tags: undefined,
      };
    }

    return {
      type: "flow",
      flow: keyOrFlow as F,
      input: flowOrInput as Flow.InferInput<F>,
      key: undefined,
      timeout: undefined,
      retry: undefined,
      tags: undefined,
    };
  }

  private executeJournaledFn<T>(
    fn: (...args: any[]) => T | Promise<T>,
    params: any[],
    journalKey: string,
    flowName: string,
    depth: number
  ): Promised<T> {
    const journal = this.journal! as Map<string, unknown>;
    const { isReplay, value } = checkJournalReplay<T>(journal as Map<string, T | { __error: true; error: unknown }>, journalKey);

    if (isReplay) {
      return Promised.create(Promise.resolve(value!));
    }

    const executeCore = (): Promised<T> => {
      return Promised.try(async () => {
        const result = await fn(...params);
        journal.set(journalKey, result);
        return result;
      }).catch((error) => {
        journal.set(journalKey, { __error: true, error });
        throw error;
      });
    };

    const executor = this.wrapWithExtensions(executeCore, {
      kind: "journal",
      key: journalKey.split(":")[2],
      flowName,
      depth,
      isReplay,
      context: this,
      params: params.length > 0 ? params : undefined,
    });

    return Promised.create(executor());
  }

  private executeSubflow<F extends Flow.UFlow>(
    flow: F,
    input: Flow.InferInput<F>,
    tags?: Tag.Tagged[]
  ): Promised<Flow.InferOutput<F>> {
    const parentFlowName = this.find(flowMeta.flowName);
    const depth = this.get(flowMeta.depth);

    const executeCore = (): Promised<Flow.InferOutput<F>> => {
      return this.scope.resolve(flow).map(async (handler) => {
        const definition = flowDefinitionMeta.readFrom(flow);
        if (!definition) {
          throw new Error("Flow definition not found in executor metadata");
        }

        const childContext = new FlowContext(this.scope, this.extensions, tags, this);
        childContext.initializeExecutionContext(definition.name, false);

        return (await this.executeWithExtensions<Flow.InferOutput<F>>(
          async (ctx) => handler(ctx, input) as Promise<Flow.InferOutput<F>>,
          childContext,
          flow,
          input
        )) as Flow.InferOutput<F>;
      });
    };

    const definition = flowDefinitionMeta.readFrom(flow);
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

    return Promised.create(executor());
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
    const definition = flowDefinitionMeta.readFrom(flow);
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
          return accessor.extractFrom(dataStore);
        },
        find<T>(accessor: Tag.Tag<T, false> | Tag.Tag<T, true>): T | undefined {
          return accessor.readFrom(dataStore);
        },
      },
    };
  }
}

/**
 * Executes flow with input, creating or using existing scope.
 * @param flow - Flow executor to run
 * @param input - Input value for flow
 * @param options - Scope config or existing scope + execution options
 * @example flow.execute(myFlow, { userId: 1 })
 */
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
    const execution = options.scope.exec({
      flow,
      input,
      tags: options.executionTags,
    });

    if (options.details === true) {
      return Promised.create(
        execution.result.then(async (r) => {
          const ctx = await execution.result.ctx();
          if (!ctx) {
            throw new Error("Execution context not available");
          }
          return { success: true as const, result: r, ctx };
        }).catch(async (error) => {
          const ctx = await execution.result.ctx();
          if (!ctx) {
            throw new Error("Execution context not available");
          }
          return { success: false as const, error, ctx };
        })
      );
    }
    return execution.result;
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
  const execution = scope.exec({
    flow,
    input,
    tags: options?.executionTags,
  });

  if (options?.details === true) {
    if (shouldDisposeScope) {
      return Promised.create(
        execution.result.then(async (r) => {
          await scope.dispose();
          const ctx = await execution.result.ctx();
          if (!ctx) {
            throw new Error("Execution context not available");
          }
          return { success: true as const, result: r, ctx };
        }).catch(async (error) => {
          await scope.dispose();
          const ctx = await execution.result.ctx();
          if (!ctx) {
            throw new Error("Execution context not available");
          }
          return { success: false as const, error, ctx };
        })
      );
    }
    return Promised.create(
      execution.result.then(async (r) => {
        const ctx = await execution.result.ctx();
        if (!ctx) {
          throw new Error("Execution context not available");
        }
        return { success: true as const, result: r, ctx };
      }).catch(async (error) => {
        const ctx = await execution.result.ctx();
        if (!ctx) {
          throw new Error("Execution context not available");
        }
        return { success: false as const, error, ctx };
      })
    );
  }

  if (shouldDisposeScope) {
    return Promised.create(
      execution.result.then((r) => scope.dispose().then(() => r)),
      execution.result.ctx()
    ) as Promised<S>;
  }
  return execution.result;
}

/**
 * Creates flow executor.
 * @example
 * // No deps, simple handler
 * flow((ctx, input: number) => input * 2)
 *
 * // With dependencies
 * flow([dbExecutor], ([db], ctx, input) => db.query(input))
 *
 * // With schema validation
 * flow({ input: z.number(), output: z.string() }, (ctx, n) => String(n))
 */
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

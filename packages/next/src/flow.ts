import type { Core, Extension, Flow, StandardSchemaV1 } from "./types";
import { createExecutor, isExecutor } from "./executor";
import { createScope, type ScopeOption } from "./scope";
import { validate } from "./ssch";
import { type Tag } from "./tag-types";
import { tag } from "./tag";
import { custom } from "./ssch";
import { Promised } from "./promises";
import { createAbortWithTimeout } from "./internal/abort-utils";
import {
  createJournalKey,
  checkJournalReplay,
  type JournalEntry,
} from "./internal/journal-utils";
import { ExecutionContextImpl } from "./execution-context";
import { isTag, isTagged } from "./tag-executors";
import { mergeFlowTags } from "./tags/merge";

const flowDefinitionMeta: Tag.Tag<Flow.Definition<any, any>, false> = tag(
  custom<Flow.Definition<any, any>>(),
  {
    label: "flow.definition",
  }
);

export const flowMeta: {
  depth: Tag.Tag<number, true>;
  flowName: Tag.Tag<string | undefined, false>;
  parentFlowName: Tag.Tag<string | undefined, false>;
  isParallel: Tag.Tag<boolean, true>;
  journal: Tag.Tag<ReadonlyMap<string, unknown>, false>;
} = {
  depth: tag(custom<number>(), { label: "flow.depth", default: 0 }),
  flowName: tag(custom<string | undefined>(), { label: "flow.name" }),
  parentFlowName: tag(custom<string | undefined>(), {
    label: "flow.parentName",
  }),
  isParallel: tag(custom<boolean>(), {
    label: "flow.isParallel",
    default: false,
  }),
  journal: tag(custom<ReadonlyMap<string, unknown>>(), {
    label: "flow.journal",
  }),
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
    const hasDependencies = typeof dependenciesOrHandler !== "function";

    const factory = hasDependencies
      ? (((deps: unknown, _controller: Core.Controller) => {
          const flowHandler = async (ctx: Flow.Context, input: I) => {
            return handlerFn!(deps as Core.InferOutput<D>, ctx, input);
          };
          return flowHandler as Flow.Handler<S, I>;
        }) as Core.DependentFn<Flow.Handler<S, I>, unknown>)
      : ((() => {
          const noDepsHandler = dependenciesOrHandler as (
            ctx: Flow.Context,
            input: I
          ) => Promise<S> | S;
          const flowHandler = async (ctx: Flow.Context, input: I) => {
            return noDepsHandler(ctx, input);
          };
          return flowHandler as Flow.Handler<S, I>;
        }) as Core.NoDependencyFn<Flow.Handler<S, I>>);

    const dependencies = hasDependencies
      ? (dependenciesOrHandler as
          | Core.UExecutor
          | ReadonlyArray<Core.UExecutor>
          | Record<string, Core.UExecutor>)
      : undefined;

    const executor = createExecutor(factory, dependencies, [
      ...this.tags,
      flowDefinitionMeta(this),
    ]) as Flow.Flow<I, S>;

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

const attachDependencies = <S, I, D2 extends Core.DependencyLike>(
  def: FlowDefinition<S, I>,
  dependencies: D2,
  handler: (
    deps: Core.InferOutput<D2>,
    ctx: Flow.Context,
    input: I
  ) => Promise<S> | S
): Flow.Flow<I, S> => {
  return def.handler(dependencies, handler);
};

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

type UnwrappedExecutor<T> = {
  executor: () => Promised<T>;
  operation: Extension.Operation;
};

type NormalizedExecuteOptions = {
  scope: Core.Scope;
  disposeScope: boolean;
  executionTags?: Tag.Tagged[];
  details: boolean;
};

const normalizeExecuteOptions = (
  options?:
    | {
        scope: Core.Scope;
        executionTags?: Tag.Tagged[];
        details?: boolean;
      }
    | (Omit<ScopeOption, "tags"> & {
        scopeTags?: Tag.Tagged[];
        executionTags?: Tag.Tagged[];
        details?: boolean;
      })
): NormalizedExecuteOptions => {
  if (options && "scope" in options) {
    return {
      scope: options.scope,
      disposeScope: false,
      executionTags: options.executionTags,
      details: options.details === true,
    };
  }

  const scope = options
    ? createScope({
        initialValues: options.initialValues,
        registry: options.registry,
        extensions: options.extensions,
        tags: options.scopeTags,
      })
    : createScope();

  return {
    scope,
    disposeScope: true,
    executionTags: options?.executionTags,
    details: options?.details === true,
  };
};

const createExecutionDetailsResult = <S>(
  execution: Flow.Execution<S>,
  scopeToDispose?: Core.Scope
): Promised<Flow.ExecutionDetails<S>> => {
  const dispose = scopeToDispose
    ? async () => {
        await scopeToDispose.dispose();
      }
    : async () => {};

  return Promised.create(
    execution.result
      .then(async (result) => {
        await dispose();
        const ctx = await execution.result.ctx();
        if (!ctx) {
          throw new Error("Execution context not available");
        }
        return { success: true as const, result, ctx };
      })
      .catch(async (error) => {
        await dispose();
        const ctx = await execution.result.ctx();
        if (!ctx) {
          throw new Error("Execution context not available");
        }
        return { success: false as const, error, ctx };
      })
  );
};

type ContextConfig = {
  parent: FlowContext;
  tags?: Tag.Tagged[];
  abortController?: AbortController;
  flowName: string;
  isParallel: boolean;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const hasInputOutput = (
  value: Record<string, unknown>
): value is DefineConfig<unknown, unknown> => {
  return "input" in value && "output" in value;
};

const isDefineConfig = (value: unknown): value is DefineConfig<any, any> => {
  return isPlainObject(value) && hasInputOutput(value);
};

const isDependencyCandidate = (value: unknown): boolean => {
  return typeof value === "function" || isExecutor(value);
};

const isDependencyCollection = (
  value: unknown
): value is Core.DependencyLike => {
  if (!value) {
    return false;
  }
  if (isExecutor(value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.length === 0 || value.every(isDependencyCandidate);
  }
  if (!isPlainObject(value)) {
    return false;
  }
  if (hasInputOutput(value)) {
    return false;
  }
  const entries = Object.values(value);
  if (entries.length === 0) {
    return true;
  }
  return entries.every(isDependencyCandidate);
};

const createChildContext = (config: ContextConfig): FlowContext => {
  const childCtx = new FlowContext(
    config.parent.scope,
    config.parent['extensions'],
    config.tags,
    config.parent,
    config.abortController
  );
  childCtx.initializeExecutionContext(config.flowName, config.isParallel);
  return childCtx;
};

const executeFlowHandler = async <S, I>(
  handler: Flow.Handler<S, I>,
  definition: Flow.Definition<S, I>,
  input: I,
  context: FlowContext
): Promise<S> => {
  const validated = validate(definition.input, input);
  const result = await handler(context, validated);
  validate(definition.output, result);
  return result;
};

const getOperationKey = (journalKey?: string): string | undefined => {
  if (!journalKey) {
    return undefined;
  }
  const parts = journalKey.split(":");
  return parts.length > 2 ? parts[2] : undefined;
};

const ensureJournalStore = <T>(
  ctx: FlowContext
): Map<string, JournalEntry<T>> => {
  if (!ctx["journal"]) {
    ctx["journal"] = new Map();
  }
  return ctx["journal"] as Map<string, JournalEntry<T>>;
};

const runWithJournal = async <T>(
  ctx: FlowContext,
  journalKey: string,
  executor: () => Promise<T>
): Promise<T> => {
  const journal = ensureJournalStore<T>(ctx);
  const { isReplay, value } = checkJournalReplay(journal, journalKey);

  if (isReplay) {
    return value!;
  }

  ctx.throwIfAborted();

  try {
    const result = await executor();
    journal.set(journalKey, result);
    return result;
  } catch (error) {
    journal.set(journalKey, { __error: true, error });
    throw error;
  }
};

const createFlowExecutionDescriptor = <F extends Flow.UFlow>(
  config: ExecConfig.Flow<F>,
  parentCtx: FlowContext,
  controller: AbortController
): UnwrappedExecutor<Flow.InferOutput<F>> => {
  const definition = flowDefinitionMeta.readFrom(config.flow);
  if (!definition) {
    throw new Error("Flow definition not found");
  }

  const childCtx = createChildContext({
    parent: parentCtx,
    tags: mergeFlowTags(definition.tags, config.tags),
    abortController: controller,
    flowName: definition.name,
    isParallel: false,
  });

  const journalKey = config.key
    ? createJournalKey(
        parentCtx.find(flowMeta.flowName) || "unknown",
        parentCtx.get(flowMeta.depth),
        config.key
      )
    : undefined;

  return {
    executor: () =>
      parentCtx.scope.resolve(config.flow).map(async (handler) => {
        const runHandler = () =>
          executeFlowHandler(
            handler as Flow.Handler<Flow.InferOutput<F>, Flow.InferInput<F>>,
            definition,
            config.input,
            childCtx
          );

        if (!journalKey) {
          return runHandler();
        }

        return runWithJournal(parentCtx, journalKey, runHandler);
      }),
    operation: {
      kind: "execution",
      target: { type: "flow", flow: config.flow, definition },
      input: config.input,
      key: getOperationKey(journalKey),
      context: childCtx,
    },
  };
};

const createFnExecutionDescriptor = <T>(
  config: ExecConfig.Fn<T>,
  parentCtx: FlowContext
): UnwrappedExecutor<T> => {
  const journalKey = config.key
    ? createJournalKey(
        parentCtx.find(flowMeta.flowName) || "unknown",
        parentCtx.get(flowMeta.depth),
        config.key
      )
    : undefined;

  const runFn = () => Promise.resolve(config.fn(...config.params));

  return {
    executor: () => {
      if (!journalKey) {
        return Promised.create(runFn());
      }
      return Promised.create(runWithJournal(parentCtx, journalKey, runFn));
    },
    operation: {
      kind: "execution",
      target: {
        type: "fn",
        params: config.params.length > 0 ? config.params : undefined,
      },
      input: undefined,
      key: getOperationKey(journalKey),
      context: parentCtx,
    },
  };
};

const createExecutionDescriptor = (
  config: ExecConfig.Normalized,
  parentCtx: FlowContext,
  controller: AbortController
): UnwrappedExecutor<any> => {
  if (config.type === "flow") {
    return createFlowExecutionDescriptor(config, parentCtx, controller);
  }
  return createFnExecutionDescriptor(config, parentCtx);
};

const executeAndWrap = <T>(
  unwrapped: UnwrappedExecutor<T>,
  ctx: FlowContext
): Promised<T> => {
  const wrapped = ctx['wrapWithExtensions'](unwrapped.executor, unwrapped.operation);
  return Promised.create(wrapped());
};

const executeWithTimeout = async <T>(
  executor: () => Promised<T>,
  timeout: number | undefined,
  timeoutId: NodeJS.Timeout | null,
  controller: AbortController
): Promise<T> => {
  if (!timeout) {
    return await executor();
  }

  const abortPromise = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => {
      reject(controller.signal.reason || new Error('Operation aborted'));
    }, { once: true });
  });

  try {
    return await Promise.race([executor(), abortPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

class FlowContext extends ExecutionContextImpl implements Flow.Context {
  private journal: Map<string, unknown> | null = null;
  private reversedExtensions: Extension.Extension[];
  private contextData: Map<unknown, unknown>;
  public readonly tags: Tag.Tagged[] | undefined;

  constructor(
    scope: Core.Scope,
    private extensions: Extension.Extension[],
    tags?: Tag.Tagged[],
    parent?: FlowContext | undefined,
    abortController?: AbortController
  ) {
    super({
      scope,
      parent,
      details: { name: "flow-context" },
      abortController
    });
    this.reversedExtensions = [...extensions].reverse();
    this.contextData = new Map<unknown, unknown>();
    this.tags = tags;
    if (tags) {
      tags.forEach(tagged => {
        this.tagStore.set(tagged.key, tagged.value);
      });
    }
  }

  private wrapWithExtensions<T>(
    baseExecutor: () => Promised<T>,
    operation: Extension.Operation
  ): () => Promised<T> {
    let executor = baseExecutor as () => Promised<unknown>;
    for (const extension of this.reversedExtensions) {
      if (extension.wrap) {
        const current = executor;
        executor = () => {
          const result = extension.wrap!(this.scope, current, operation);
          return result instanceof Promised ? result : Promised.create(result);
        };
      }
    }
    return executor as () => Promised<T>;
  }

  initializeExecutionContext(
    flowName: string,
    isParallel: boolean = false
  ): void {
    const parentDepth = this.parent ? this.parent.get(flowMeta.depth) : undefined;
    const currentDepth = parentDepth !== undefined ? parentDepth + 1 : 0;
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
      (typeof accessorOrKey === "object" || typeof accessorOrKey === "function") &&
      accessorOrKey !== null &&
      "extractFrom" in accessorOrKey
    ) {
      const accessor = accessorOrKey as Tag.Tag<T, false> | Tag.Tag<T, true>;
      const key = (accessor as any).key as symbol;
      let value = this.tagStore.get(key);
      if (value !== undefined) {
        return value;
      }
      if (this.scope.tags) {
        const tagged = this.scope.tags.find((m: Tag.Tagged) => m.key === key);
        if (tagged) {
          return tagged.value;
        }
      }
      if ((accessor as any).default !== undefined) {
        return (accessor as any).default;
      }
      throw new Error(`Value not found for key: ${key.toString()}`);
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
    if (this.scope.tags && typeof key === "symbol") {
      const tagged = this.scope.tags.find((m: Tag.Tagged) => m.key === key);
      if (tagged) {
        return tagged.value;
      }
    }
    if (this.parent) {
      return (this.parent.get as (key: unknown) => unknown)(key);
    }
    return undefined;
  }

  set<T>(accessor: Tag.Tag<T, false> | Tag.Tag<T, true>, value: T): void;
  set<T>(accessorOrKey: unknown, value: unknown): void | unknown {
    if (
      accessorOrKey !== null &&
      accessorOrKey !== undefined &&
      (typeof accessorOrKey === "object" ||
        typeof accessorOrKey === "function") &&
      "injectTo" in accessorOrKey
    ) {
      const accessor = accessorOrKey as Tag.Tag<T, false> | Tag.Tag<T, true>;
      super.set(accessor, value as T);
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
    keyOrFlowOrConfig:
      | string
      | F
      | {
          flow?: F;
          fn?: any;
          input?: Flow.InferInput<F>;
          params?: any[];
          key?: string;
          timeout?: number;
          retry?: number;
          tags?: Tag.Tagged[];
        },
    flowOrInput?: F | Flow.InferInput<F>,
    inputOrUndefined?: Flow.InferInput<F>
  ): Promised<any> {
    this.throwIfAborted();

    const config = this.parseExecOverloads(
      keyOrFlowOrConfig,
      flowOrInput,
      inputOrUndefined
    );
    const { controller, timeoutId } = createAbortWithTimeout(
      config.timeout,
      this.signal
    );

    const descriptor = createExecutionDescriptor(config, this, controller);
    const wrapped = () => executeAndWrap(descriptor, this);

    return Promised.create(
      executeWithTimeout(wrapped, config.timeout, timeoutId, controller)
    );
  }

  private parseExecOverloads<F extends Flow.UFlow>(
    keyOrFlowOrConfig:
      | string
      | F
      | {
          flow?: F;
          fn?: any;
          input?: Flow.InferInput<F>;
          params?: any[];
          key?: string;
          timeout?: number;
          retry?: number;
          tags?: Tag.Tagged[];
        },
    flowOrInput?: F | Flow.InferInput<F>,
    inputOrUndefined?: Flow.InferInput<F>
  ): ExecConfig.Normalized {
    if (
      typeof keyOrFlowOrConfig === "object" &&
      keyOrFlowOrConfig !== null &&
      !("factory" in keyOrFlowOrConfig)
    ) {
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
        return Promised.create(
          Promise.all(promises).then((results) => ({
            results: results as Flow.ParallelResult<{
              [K in keyof T]: T[K] extends Promised<infer R> ? R : never;
            }>["results"],
            stats: {
              total: results.length,
              succeeded: results.length,
              failed: 0,
            },
          }))
        );
      };

      const executor = this.wrapWithExtensions(executeCore, {
        kind: "execution",
        target: {
          type: "parallel",
          mode: "parallel",
          count: promises.length,
        },
        input: promises,
        key: undefined,
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
        return Promised.create(
          Promise.allSettled(promises).then((results) => {
            const succeeded = results.filter(
              (r) => r.status === "fulfilled"
            ).length;
            const failed = results.filter(
              (r) => r.status === "rejected"
            ).length;

            return {
              results: results as PromiseSettledResult<any>[],
              stats: {
                total: results.length,
                succeeded,
                failed,
              },
            };
          })
        );
      };

      const executor = this.wrapWithExtensions(executeCore, {
        kind: "execution",
        target: {
          type: "parallel",
          mode: "parallelSettled",
          count: promises.length,
        },
        input: promises,
        key: undefined,
        context: this,
      });

      return executor();
    })();

    return Promised.create(promise);
  }

  resetJournal(keyPattern?: string): void {
    if (!this.journal) {
      return;
    }

    if (keyPattern === undefined) {
      this.journal.clear();
      return;
    }

    const keysToDelete: string[] = [];
    for (const key of this.journal.keys()) {
      const parts = key.split(":");
      if (parts.length >= 3) {
        const userKey = parts.slice(2).join(":");
        if (userKey.includes(keyPattern)) {
          keysToDelete.push(key);
        }
      }
    }

    for (const key of keysToDelete) {
      this.journal.delete(key);
    }
  }


  createSnapshot(): Flow.ExecutionData {
    let snapshotData: Map<unknown, unknown> | null = null;

    const getSnapshot = () => {
      if (!snapshotData) {
        snapshotData = new Map(this.contextData);
        if (this.journal) {
          snapshotData.set(flowMeta.journal.key, new Map(this.journal));
        }
      }
      return snapshotData;
    };

    const snapshotContext = this;
    const dataStore = {
      get: (key: unknown) => {
        const snapshot = getSnapshot();
        if (snapshot.has(key)) {
          return snapshot.get(key);
        }
        return snapshotContext.tagStore.get(key);
      },
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
  options: Omit<ScopeOption, "tags"> & {
    scopeTags?: Tag.Tagged[];
    executionTags?: Tag.Tagged[];
    details: true;
  }
): Promised<Flow.ExecutionDetails<S>>;

function execute<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>> | Flow.Flow<I, S>,
  input: I,
  options?: Omit<ScopeOption, "tags"> & {
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
    | (Omit<ScopeOption, "tags"> & {
        scopeTags?: Tag.Tagged[];
        executionTags?: Tag.Tagged[];
        details?: boolean;
      })
): Promised<S> | Promised<Flow.ExecutionDetails<S>> {
  const normalized = normalizeExecuteOptions(options);
  const execution = normalized.scope.exec({
    flow,
    input,
    tags: normalized.executionTags,
  });

  if (normalized.details) {
    return createExecutionDetailsResult(
      execution,
      normalized.disposeScope ? normalized.scope : undefined
    );
  }

  if (normalized.disposeScope) {
    return Promised.create(
      execution.result
        .then((r) => normalized.scope.dispose().then(() => r))
        .catch(async (error) => {
          await normalized.scope.dispose();
          throw error;
        }),
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

function flowImpl<D extends Core.DependencyLike, I, S>(
  dependencies: D,
  handler: (
    deps: Core.InferOutput<D>,
    ctx: Flow.Context,
    input: I
  ) => Promise<S> | S
): Flow.Flow<I, S>;

function flowImpl<I, S>(
  handler: (ctx: Flow.Context, input: I) => Promise<S> | S,
  ...tags: Tag.Tagged[]
): Flow.Flow<I, S>;

function flowImpl<D extends Core.DependencyLike, I, S>(
  dependencies: D,
  handler: (
    deps: Core.InferOutput<D>,
    ctx: Flow.Context,
    input: I
  ) => Promise<S> | S,
  ...tags: Tag.Tagged[]
): Flow.Flow<I, S>;

function flowImpl<S, I>(config: DefineConfig<S, I>): FlowDefinition<S, I>;

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
    | ((ctx: Flow.Context, input: I) => Promise<S> | S),
  second?:
    | D
    | ((ctx: Flow.Context, input: I) => Promise<S> | S)
    | ((
        deps: Core.InferOutput<D>,
        ctx: Flow.Context,
        input: I
      ) => Promise<S> | S)
    | Tag.Tagged,
  third?:
    | ((
        deps: Core.InferOutput<D>,
        ctx: Flow.Context,
        input: I
      ) => Promise<S> | S)
    | Tag.Tagged,
  ...rest: Tag.Tagged[]
): Flow.Flow<I, S> | FlowDefinition<S, I> {
  const allTags: Tag.Tagged[] = [];

  const isHandlerOnly = typeof first === "function";
  const hasDeps = isDependencyCollection(first);

  if (isHandlerOnly || (hasDeps && typeof second === "function")) {
    const tagParams = hasDeps
      ? [third, ...rest].filter(t => t !== undefined)
      : [second, third, ...rest].filter(t => t !== undefined);

    for (const item of tagParams) {
      if (!isTagged(item)) {
        throw new Error("Invalid tag: expected Tag.Tagged from tag()");
      }
      allTags.push(item);
    }
  }

  if (typeof first === "function") {
    if (isTag(first)) {
      throw new Error("flow(handler) requires handler function");
    }
    const handler = first as (ctx: Flow.Context, input: I) => Promise<S> | S;
    const def = define({
      input: custom<I>(),
      output: custom<S>(),
      tags: allTags.length > 0 ? allTags : undefined,
    });
    return def.handler(handler);
  }

  if (isDependencyCollection(first)) {
    if (typeof second !== "function" || isTag(second)) {
      throw new Error(
        "flow(deps, handler) requires handler as second argument"
      );
    }
    const handler = second as (
      deps: Core.InferOutput<D>,
      ctx: Flow.Context,
      input: I
    ) => Promise<S> | S;
    const def = define({
      input: custom<I>(),
      output: custom<S>(),
      tags: allTags.length > 0 ? allTags : undefined,
    });
    return attachDependencies(def, first, handler);
  }

  if (isDefineConfig(first)) {
    const config = first as DefineConfig<S, I>;

    if ("handler" in config || "dependencies" in config) {
      throw new Error(
        "Config object cannot contain 'handler' or 'dependencies' properties. Use flow(config, handler) or flow(config, deps, handler) instead."
      );
    }

    const def = define(config);

    if (!second) {
      return def;
    }

    if (typeof second === "function") {
      if (isTag(second)) {
        throw new Error(
          "flow(config, handler) requires handler function"
        );
      }
      return def.handler(
        second as (ctx: Flow.Context, input: I) => Promise<S> | S
      );
    }

    if (isExecutor(second)) {
      if (
        !third ||
        typeof third !== "function" ||
        isTag(third)
      ) {
        throw new Error(
          "flow(config, deps, handler) requires handler as third argument"
        );
      }
      return attachDependencies(def, second, third);
    }

    throw new Error(
      "Invalid flow() call: second argument must be handler function or dependencies"
    );
  }

  if (isPlainObject(first)) {
    throw new Error(
      "Invalid flow() call: first argument must be either a config object with 'input' and 'output' properties, or a valid dependency object containing executors/functions"
    );
  }

  throw new Error(
    "Invalid flow() call: first argument must be handler, dependencies, or config object"
  );
}

export const flow: typeof flowImpl & {
  execute: typeof execute;
} = Object.assign(flowImpl, {
  execute: execute,
});

export { FlowContext, flowDefinitionMeta };

import {
  isLazyExecutor,
  isReactiveExecutor,
  isStaticExecutor,
  isMainExecutor,
  isExecutor,
  isPreset,
} from "./executor";
import {
  Core,
  Extension,
  executorSymbol,
  type Flow,
  type ExecutionContext,
  type Escapable,
} from "./types";
import {
  ExecutorResolutionError,
  FactoryExecutionError,
  DependencyResolutionError,
} from "./errors";
import { type Tag, tagSymbol, isTag, isTagExecutor, mergeFlowTags } from "./tag";
import { Promised, validate, isThenable } from "./primitives";
import * as errors from "./errors";
import { flow as flowApi, FlowExecutionImpl } from "./flow";
import { flowDefinitionMeta, ExecutionContextImpl } from "./execution-context";
import { getMetadata, NOOP_CONTROLLER } from "./sucrose";

export type ResolvableItem = Core.UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown> | Escapable<unknown>;
type ResolveFn = (item: ResolvableItem) => Promise<unknown>;

export async function resolveShape<T extends ResolvableItem | ReadonlyArray<ResolvableItem> | Record<string, ResolvableItem> | undefined>(
  scope: Core.Scope,
  shape: T,
  resolveFn?: ResolveFn
): Promise<any> {
  if (shape === undefined) {
    return undefined;
  }

  const unwrapTarget = (item: ResolvableItem): Core.Executor<unknown> | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown> => {
    if (isTagExecutor(item)) {
      return item;
    }

    if (isTag(item)) {
      return item;
    }

    const executor = !isExecutor(item) ? (item as Escapable<unknown>).escape() : item;

    if (isLazyExecutor(executor) || isReactiveExecutor(executor) || isStaticExecutor(executor)) {
      return executor.executor;
    }

    return executor as Core.Executor<unknown>;
  };

  const scopeWithProtectedMethods = scope as Core.Scope & {
    resolveTag(tag: Tag.Tag<unknown, boolean>): Promise<unknown>;
    resolveTagExecutor(tagExec: Tag.TagExecutor<unknown>): Promise<unknown>;
  };

  const resolveItem = resolveFn
    ? resolveFn
    : async (item: ResolvableItem) => {
        if (isTagExecutor(item)) {
          return scopeWithProtectedMethods.resolveTagExecutor(item);
        }

        if (isTag(item)) {
          return scopeWithProtectedMethods.resolveTag(item);
        }

        const target = unwrapTarget(item);
        return await scope.resolve(target as Core.Executor<unknown>);
      };

  if (Array.isArray(shape)) {
    const promises = [];
    for (const item of shape) {
      promises.push(resolveItem(item));
    }
    return await Promise.all(promises);
  }

  if (typeof shape === "object") {
    if (executorSymbol in shape) {
      return await resolveItem(shape as Core.UExecutor);
    }

    if ("escape" in shape) {
      const unwrapped = (shape as unknown as Escapable<unknown>).escape();
      return await resolveItem(unwrapped);
    }

    const entries = Object.entries(shape);
    const promises = entries.map(([_, item]) => resolveItem(item));
    const resolvedValues = await Promise.all(promises);

    const results: Record<string, unknown> = {};
    for (let i = 0; i < entries.length; i++) {
      results[entries[i][0]] = resolvedValues[i];
    }
    return results;
  }

  return undefined;
}

function applyExtensions<T>(
  extensions: Extension.Extension[] | undefined,
  baseExecutor: () => Promised<T>,
  scope: Core.Scope,
  operation: Extension.Operation
): () => Promised<T> {
  if (!extensions || extensions.length === 0) {
    return baseExecutor;
  }
  let executor = baseExecutor as () => Promised<unknown>;
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
  return executor as () => Promised<T>;
}

type ExecutorState = {
  accessor: Core.Accessor<unknown>;
  value?: Core.ResolveState<unknown>;
  cleanups?: Set<Core.Cleanup>;
  onUpdateCallbacks?: Set<OnUpdateFn>;
  onUpdateExecutors?: Set<UE>;
  onErrors?: Set<Core.ErrorCallback<unknown>>;
  resolutionChain?: Set<UE>;
  resolutionDepth?: number;
  updateQueue?: Promise<void>;
};

type CacheEntry = ExecutorState;

type UE = Core.Executor<unknown>;
type OnUpdateFn = (accessor: Core.Accessor<unknown>) => void | Promise<void>;

interface ReplacerResult {
  dependencies:
    | undefined
    | Core.UExecutor
    | Core.UExecutor[]
    | Record<string, Core.UExecutor>;
  immediateValue?: unknown;
  effectiveExecutor: Core.Executor<unknown>;
}

const NOT_SET = Symbol("accessor-value-not-set");

class AccessorImpl implements Core.Accessor<unknown> {
  public tags: Tag.Tagged[] | undefined;
  private scope: BaseScope;
  private requestor: UE;
  private executionContext: ExecutionContext.Context | undefined;
  private currentPromise: Promise<unknown> | null = null;
  private currentPromised: Promised<unknown> | null = null;
  private contextResolvedValue: unknown = NOT_SET;
  public resolve: (force?: boolean) => Promised<unknown>;

  constructor(
    scope: BaseScope,
    requestor: UE,
    tags: Tag.Tagged[] | undefined,
    executionContext?: ExecutionContext.Context
  ) {
    this.scope = scope;
    this.requestor = requestor;
    this.tags = tags;
    this.executionContext = executionContext;

    this.resolve = this.createResolveFunction();

    if (!executionContext) {
      const state = this.scope["getOrCreateState"](requestor);
      if (!state.accessor) {
        state.accessor = this;
      }
    }
  }

  private async resolveCore(): Promise<unknown> {
    const { dependencies, immediateValue, effectiveExecutor } = this.processReplacer();

    if (immediateValue !== undefined) {
      await new Promise<void>((resolve) => queueMicrotask(resolve));

      if (!this.executionContext) {
        const state = this.scope["getOrCreateState"](this.requestor);
        state.accessor = this;
        state.value = {
          kind: "resolved",
          value: immediateValue,
          promised: Promised.create(Promise.resolve(immediateValue)),
        };
      } else {
        this.contextResolvedValue = immediateValue;
      }

      return immediateValue;
    }

    const meta = getMetadata(effectiveExecutor)

    const resolvedDependencies = dependencies === undefined
      ? undefined
      : await this.scope["~resolveDependencies"](
          dependencies,
          this.requestor,
          this.executionContext
        );

    const result = await this.executeFactory(
      resolvedDependencies,
      effectiveExecutor
    );

    const processedResult = await this.processChangeEvents(result);

    if (!this.executionContext) {
      const state = this.scope["getOrCreateState"](this.requestor);
      state.accessor = this;
      state.value = {
        kind: "resolved",
        value: processedResult,
        promised: Promised.create(Promise.resolve(processedResult)),
      };
    } else {
      this.contextResolvedValue = processedResult;
    }

    this.scope["~removeFromResolutionChain"](this.requestor);
    this.currentPromise = null;
    this.currentPromised = null;

    return processedResult;
  }

  private async resolveWithErrorHandling(): Promise<unknown> {
    try {
      return await this.resolveCore();
    } catch (error) {
      if (this.executionContext) {
        this.contextResolvedValue = NOT_SET;
      }

      const { enhancedError, originalError } =
        this.enhanceResolutionError(error);

      const state = this.scope["getOrCreateState"](this.requestor);
      state.accessor = this;
      state.value = {
        kind: "rejected",
        error: originalError,
        enhancedError: enhancedError,
      };

      this.scope["~removeFromResolutionChain"](this.requestor);
      this.scope["~triggerError"](enhancedError, this.requestor);
      this.currentPromise = null;
      this.currentPromised = null;

      throw enhancedError;
    }
  }

  private createResolveFunction() {
    return (force: boolean = false): Promised<unknown> => {
      this.scope["~ensureNotDisposed"]();

      if (!this.executionContext) {
        const entry = this.scope["cache"].get(this.requestor);
        const cached = entry?.value;

        if (cached && !force) {
          return this.handleCachedState(cached);
        }
      }

      if (this.currentPromise && !force) {
        if (!this.currentPromised) {
          this.currentPromised = Promised.create(this.currentPromise);
        }
        return this.currentPromised;
      }

      this.scope["~addToResolutionChain"](this.requestor, this.requestor);

      this.currentPromise = this.resolveWithErrorHandling();

      if (!this.executionContext) {
        const state = this.scope["getOrCreateState"](this.requestor);
        state.accessor = this;
        state.value = { kind: "pending", promise: this.currentPromise };
      }

      this.currentPromised = Promised.create(this.currentPromise);
      return this.currentPromised;
    };
  }

  private handleCachedState(
    cached: Core.ResolveState<unknown>
  ): Promised<unknown> | never {
    if (cached.kind === "resolved") {
      return cached.promised;
    }

    if (cached.kind === "rejected") {
      throw cached.error;
    }

    if (!this.currentPromised) {
      this.currentPromised = Promised.create(cached.promise);
    }
    return this.currentPromised;
  }

  private processReplacer(): ReplacerResult {
    const replacer = this.scope["initialValues"].find(
      (item) => item.executor === this.requestor
    );

    if (!replacer) {
      return {
        dependencies: this.requestor.dependencies,
        effectiveExecutor: this.requestor,
      };
    }

    const value = replacer.value;

    if (!isExecutor(value)) {
      return {
        dependencies: this.requestor.dependencies,
        immediateValue: value,
        effectiveExecutor: this.requestor,
      };
    }

    return {
      dependencies: value.dependencies,
      effectiveExecutor: value as Core.Executor<unknown>,
    };
  }

  private async executeFactory(
    resolvedDependencies: unknown,
    effectiveExecutor: Core.Executor<unknown>
  ): Promise<unknown> {
    const meta = getMetadata(effectiveExecutor)

    if (!meta) {
      throw new Error("Executor metadata not found. Executors must be created using sucrose compilation.")
    }

    const { inference, controllerFactory, callSite, original } = meta
    const { dependencyShape } = inference
    const usesController = controllerFactory !== "none"

    const controller = usesController
      ? (controllerFactory as Exclude<typeof controllerFactory, "none">)(
          this.scope,
          this.requestor,
          (fn: Core.Cleanup) => {
            const state = this.scope["getOrCreateState"](this.requestor)
            const cleanups = this.scope["ensureCleanups"](state)
            cleanups.add(fn)
          }
        )
      : NOOP_CONTROLLER

    try {
      let factoryResult: unknown

      if (dependencyShape === "none" && !usesController) {
        factoryResult = (original as () => unknown)()
      } else if (dependencyShape === "none" && usesController) {
        factoryResult = (original as (ctl: Core.Controller) => unknown)(controller)
      } else if (!usesController) {
        factoryResult = (original as (deps: unknown) => unknown)(resolvedDependencies)
      } else {
        factoryResult = (original as (deps: unknown, ctl: Core.Controller) => unknown)(resolvedDependencies, controller)
      }

      if (isThenable(factoryResult)) {
        try {
          return await factoryResult
        } catch (asyncError) {
          const executorName = errors.getExecutorName(this.requestor)
          const dependencyChain = [executorName]

          throw errors.createFactoryError(
            executorName,
            dependencyChain,
            asyncError,
            callSite
          )
        }
      }

      return factoryResult
    } catch (syncError) {
      const executorName = errors.getExecutorName(this.requestor)
      const dependencyChain = [executorName]

      throw errors.createFactoryError(
        executorName,
        dependencyChain,
        syncError,
        callSite
      )
    }
  }

  private createControllerLegacy(): Core.Controller {
    return {
      cleanup: (cleanup: Core.Cleanup) => {
        const state = this.scope["getOrCreateState"](this.requestor)
        const cleanups = this.scope["ensureCleanups"](state)
        cleanups.add(cleanup)
      },
      release: () => this.scope.release(this.requestor),
      reload: () =>
        this.scope.resolve(this.requestor, true).map(() => undefined),
      scope: this.scope,
    }
  }

  private async processChangeEvents(result: unknown): Promise<unknown> {
    let currentValue = result;
    const events = this.scope["onEvents"].resolve;

    for (const event of events) {
      const updated = await event(
        "resolve",
        this.requestor,
        currentValue,
        this.scope
      );

      if (updated !== undefined && updated.executor === this.requestor) {
        currentValue = updated.value;
      }
    }

    return currentValue;
  }

  private enhanceResolutionError(error: unknown): {
    enhancedError: ExecutorResolutionError;
    originalError: unknown;
  } {
    if (
      error &&
      typeof error === "object" &&
      "executorName" in error &&
      "dependencyChain" in error &&
      "code" in error
    ) {
      return {
        enhancedError: error as ExecutorResolutionError,
        originalError: error,
      };
    }

    const executorName = errors.getExecutorName(this.requestor);
    const dependencyChain = [executorName];
    const meta = getMetadata(this.requestor);
    const callSite = meta?.callSite;

    const enhancedError = errors.createSystemError(
      executorName,
      dependencyChain,
      error,
      callSite
    );

    return {
      enhancedError,
      originalError: error,
    };
  }

  lookup(): undefined | Core.ResolveState<unknown> {
    this.scope["~ensureNotDisposed"]();
    const cacheEntry = this.scope["cache"].get(this.requestor);
    if (!cacheEntry) {
      return undefined;
    }
    return cacheEntry.value || undefined;
  }

  get(): unknown {
    this.scope["~ensureNotDisposed"]();

    if (this.executionContext && this.contextResolvedValue !== NOT_SET) {
      return this.contextResolvedValue;
    }

    const cacheEntry = this.scope["cache"].get(this.requestor)?.value;

    if (!cacheEntry || cacheEntry.kind === "pending") {
      throw new Error("Executor is not resolved");
    }

    if (cacheEntry.kind === "rejected") {
      throw cacheEntry.enhancedError || cacheEntry.error;
    }

    return cacheEntry.value;
  }

  release(soft: boolean = false): Promised<void> {
    return this.scope.release(this.requestor, soft);
  }

  update(updateFn: unknown | ((current: unknown) => unknown)): Promised<void> {
    return this.scope.update(this.requestor, updateFn);
  }

  set(value: unknown): Promised<void> {
    return this.scope.update(this.requestor, value);
  }

  subscribe(cb: (value: unknown) => void): Core.Cleanup {
    this.scope["~ensureNotDisposed"]();
    return this.scope.onUpdate(this.requestor, cb);
  }
}

function getExecutor(e: Core.UExecutor): Core.AnyExecutor {
  if (isLazyExecutor(e) || isReactiveExecutor(e) || isStaticExecutor(e)) {
    return e.executor;
  }

  return e as Core.AnyExecutor;
}

class BaseScope implements Core.Scope {
  protected disposed: boolean = false;
  protected cache: Map<UE, ExecutorState> = new Map();
  protected executions: Map<string, { execution: Flow.Execution<unknown>; startTime: number }> = new Map();
  protected onEvents: {
    readonly resolve: Set<Core.ResolveCallback>;
    readonly release: Set<Core.ReleaseCallback>;
    readonly error: Set<Core.GlobalErrorCallback>;
  } = {
    resolve: new Set<Core.ResolveCallback>(),
    release: new Set<Core.ReleaseCallback>(),
    error: new Set<Core.GlobalErrorCallback>(),
  } as const;
  private isDisposing = false;

  private readonly CIRCULAR_CHECK_THRESHOLD = 15;

  protected extensions: Extension.Extension[] = [];
  protected registry: Core.Executor<unknown>[] = [];
  protected initialValues: Core.Preset<unknown>[] = [];
  public tags: Tag.Tagged[] | undefined;

  private static readonly emptyDataStore: Tag.Store = {
    get: () => undefined,
    set: () => undefined,
  };

  constructor(options?: ScopeOption) {
    if (options?.registry) {
      this.registry = [...options.registry];
    }

    if (options?.initialValues) {
      this.initialValues = options.initialValues;
    }

    if (options?.tags) {
      this.tags = options.tags;
    }

    if (options?.extensions) {
      for (const extension of options.extensions) {
        this.useExtension(extension);
      }
    }
  }

  createExecution(details?: Partial<ExecutionContext.Details> & { tags?: Tag.Tagged[] }): ExecutionContext.Context {
    this["~ensureNotDisposed"]();
    const context = new ExecutionContextImpl({
      scope: this,
      extensions: this.extensions,
      details: details || {},
      tags: details?.tags
    });

    context["~emitLifecycleOperation"]('create').catch((err) => {
      console.error('Extension error during context creation:', err)
    })

    return context;
  }

  protected getOrCreateState(executor: UE): ExecutorState {
    let state = this.cache.get(executor);
    if (!state) {
      state = { accessor: null as any };
      this.cache.set(executor, state);
    }
    return state;
  }

  protected ensureCleanups(state: ExecutorState): Set<Core.Cleanup> {
    if (!state.cleanups) {
      state.cleanups = new Set();
    }
    return state.cleanups;
  }

  protected ensureCallbacks(state: ExecutorState): Set<OnUpdateFn> {
    if (!state.onUpdateCallbacks) {
      state.onUpdateCallbacks = new Set();
    }
    return state.onUpdateCallbacks;
  }

  protected ensureExecutors(state: ExecutorState): Set<UE> {
    if (!state.onUpdateExecutors) {
      state.onUpdateExecutors = new Set();
    }
    return state.onUpdateExecutors;
  }

  protected ensureErrors(
    state: ExecutorState
  ): Set<Core.ErrorCallback<unknown>> {
    if (!state.onErrors) {
      state.onErrors = new Set();
    }
    return state.onErrors;
  }

  protected ensureResolutionChain(state: ExecutorState): Set<UE> {
    if (!state.resolutionChain) {
      state.resolutionChain = new Set();
    }
    return state.resolutionChain;
  }

  protected "~checkCircularDependency"(
    executor: UE,
    resolvingExecutor: UE
  ): void {
    const state = this.cache.get(resolvingExecutor);
    const currentChain = state?.resolutionChain;
    if (currentChain && currentChain.has(executor)) {
      const chainArray = Array.from(currentChain);
      const dependencyChain = errors.buildDependencyChain(chainArray);
      const meta = getMetadata(executor);
      const callSite = meta?.callSite;

      throw errors.createDependencyError(
        errors.getExecutorName(executor),
        dependencyChain,
        errors.getExecutorName(executor),
        undefined,
        callSite
      );
    }
  }

  protected "~addToResolutionChain"(executor: UE, resolvingExecutor: UE): void {
    const state = this.getOrCreateState(resolvingExecutor);
    const chain = this.ensureResolutionChain(state);
    chain.add(executor);
  }

  protected "~removeFromResolutionChain"(executor: UE): void {
    const state = this.cache.get(executor);
    if (state) {
      delete state.resolutionDepth;
      delete state.resolutionChain;
    }
  }

  protected "~propagateResolutionChain"(
    fromExecutor: UE,
    toExecutor: UE
  ): void {
    const fromState = this.cache.get(fromExecutor);
    if (fromState?.resolutionChain) {
      const toState = this.getOrCreateState(toExecutor);
      const newChain = new Set(fromState.resolutionChain);
      newChain.add(fromExecutor);
      toState.resolutionChain = newChain;
    }
  }

  protected async "~triggerCleanup"(e: UE): Promise<void> {
    const state = this.cache.get(e);
    if (state?.cleanups) {
      for (const c of Array.from(state.cleanups.values()).reverse()) {
        await c();
      }
      delete state.cleanups;
    }
  }

  protected async "~triggerUpdate"(e: UE): Promise<void> {
    const state = this.cache.get(e);
    if (!state) {
      throw new Error("Executor is not yet resolved");
    }

    if (state.onUpdateExecutors) {
      for (const t of Array.from(state.onUpdateExecutors.values())) {
        const depState = this.cache.get(t);
        if (depState?.cleanups) {
          this["~triggerCleanup"](t);
        }

        await depState!.accessor.resolve(true);

        if (depState!.onUpdateExecutors || depState!.onUpdateCallbacks) {
          await this["~triggerUpdate"](t);
        }
      }
    }

    if (state.onUpdateCallbacks) {
      for (const cb of Array.from(state.onUpdateCallbacks.values())) {
        await cb(state.accessor);
      }
    }
  }

  protected async "~triggerError"(
    error:
      | ExecutorResolutionError
      | FactoryExecutionError
      | DependencyResolutionError,
    executor: UE
  ): Promise<void> {
    const state = this.cache.get(executor);
    if (state?.onErrors) {
      for (const callback of Array.from(state.onErrors.values())) {
        try {
          await callback(error, executor, this);
        } catch (callbackError) {
          console.error("Error in error callback:", callbackError);
        }
      }
    }

    for (const callback of Array.from(this.onEvents.error.values())) {
      try {
        await callback(error, executor, this);
      } catch (callbackError) {
        console.error("Error in global error callback:", callbackError);
      }
    }

    for (const extension of this.extensions) {
      if (extension.onError) {
        try {
          extension.onError(error, this);
        } catch (extensionError) {
          console.error("Error in extension error handler:", extensionError);
        }
      }
    }
  }

  protected async "~resolveExecutor"(
    ie: Core.UExecutor,
    ref: UE
  ): Promise<unknown> {
    const e = getExecutor(ie);

    if (e === ref) {
      const executorName = errors.getExecutorName(e);
      const meta = getMetadata(e);
      const callSite = meta?.callSite;
      throw errors.createDependencyError(
        executorName,
        [executorName],
        executorName,
        undefined,
        callSite
      );
    }

    const refState = this.cache.get(ref);
    const currentDepth = (refState?.resolutionDepth ?? 0) + 1;

    const state = this.getOrCreateState(e);
    state.resolutionDepth = currentDepth;

    if (currentDepth > this.CIRCULAR_CHECK_THRESHOLD) {
      this["~checkCircularDependency"](e, ref);
      this["~propagateResolutionChain"](ref, e);
    }

    const a = this["~makeAccessor"](e);

    if (isLazyExecutor(ie)) {
      return a;
    }

    if (isReactiveExecutor(ie)) {
      const parentState = this.getOrCreateState(ie.executor);
      const executors = this.ensureExecutors(parentState);
      executors.add(ref);
    }

    await a.resolve(false);
    if (isStaticExecutor(ie)) {
      return a;
    }

    return a.get();
  }

  protected async resolveTag(
    tag: Tag.Tag<unknown, boolean>,
    executionContext?: ExecutionContext.Context
  ): Promise<unknown> {
    const source = executionContext || this;
    const hasDefault = tag.default !== undefined;

    if (hasDefault) {
      return await tag.readFrom(source);
    } else {
      return await tag.extractFrom(source);
    }
  }

  protected async resolveTagExecutor(
    tagExec: Tag.TagExecutor<unknown>,
    executionContext?: ExecutionContext.Context
  ): Promise<unknown> {
    const source = executionContext || this;

    switch (tagExec[tagSymbol]) {
      case "required":
        return await tagExec.tag.extractFrom(source);
      case "optional":
        return await tagExec.tag.readFrom(source);
      case "all":
        return await tagExec.tag.collectFrom(source);
    }
  }

  protected async "~resolveDependencies"(
    ie:
      | undefined
      | Core.UExecutor
      | ReadonlyArray<Core.UExecutor>
      | Record<string, Core.UExecutor>,
    ref: UE,
    executionContext?: ExecutionContext.Context
  ): Promise<unknown> {
    return resolveShape(
      this as unknown as Core.Scope,
      ie,
      async (item) => {
        if (isTagExecutor(item)) {
          return this.resolveTagExecutor(item as Tag.TagExecutor<unknown>, executionContext);
        }

        if (isTag(item)) {
          return this.resolveTag(item as Tag.Tag<unknown, boolean>, executionContext);
        }

        return this["~resolveExecutor"](item as Core.UExecutor, ref);
      }
    );
  }

  protected "~ensureNotDisposed"(): void {
    if (this.disposed) {
      throw new Error("Scope is disposed");
    }
  }

  protected wrapWithExtensions<T>(
    baseExecutor: () => Promised<T>,
    operation: Extension.Operation
  ): () => Promised<T> {
    return applyExtensions(this.extensions, baseExecutor, this, operation);
  }

  protected "~makeAccessor"(
    e: Core.UExecutor,
    executionContext?: ExecutionContext.Context
  ): Core.Accessor<unknown> {
    let requestor =
      isLazyExecutor(e) || isReactiveExecutor(e) || isStaticExecutor(e)
        ? e.executor
        : (e as UE);

    if (!executionContext) {
      const cachedAccessor = this.cache.get(requestor);
      if (cachedAccessor && cachedAccessor.accessor) {
        return cachedAccessor.accessor;
      }
    }

    const accessor = new AccessorImpl(this, requestor, e.tags, executionContext);
    return accessor;
  }

  accessor<T>(executor: Core.Executor<T>): Core.Accessor<T> {
    this["~ensureNotDisposed"]();
    return this["~makeAccessor"](executor) as Core.Accessor<T>;
  }

  entries(): Array<[UE, Core.Accessor<unknown>]> {
    return Array.from(this.cache.entries()).map(([executor, entry]) => {
      return [executor, entry.accessor];
    });
  }

  registeredExecutors(): Core.Executor<unknown>[] {
    this["~ensureNotDisposed"]();
    return [...this.registry];
  }

  /**
   * Resolves an executor and returns its value.
   *
   * When executionContext is provided:
   * - Tag resolution uses execution context instead of scope
   * - Scope cache is bypassed to ensure context isolation
   * - Resolved values are stored separately per context
   *
   * @internal
   */
  resolve<T>(
    executor: Core.Executor<T>,
    force: boolean = false,
    executionContext?: ExecutionContext.Context
  ): Promised<T> {
    this["~ensureNotDisposed"]();

    const accessor = this["~makeAccessor"](executor, executionContext);

    const coreResolve = (): Promised<T> => {
      return accessor.resolve(force).map(() => accessor.get() as T);
    };

    const resolver = this.wrapWithExtensions(coreResolve, {
      kind: "resolve",
      executor,
      scope: this,
      operation: "resolve",
    });

    return resolver();
  }

  resolveAccessor<T>(
    executor: Core.Executor<T>,
    force: boolean = false
  ): Promised<Core.Accessor<T>> {
    this["~ensureNotDisposed"]();
    const accessor = this["~makeAccessor"](executor);
    return accessor.resolve(force).map(() => accessor as Core.Accessor<T>);
  }

  run<T, D extends Core.DependencyLike>(
    dependencies: D,
    callback: (deps: Core.InferOutput<D>) => T | Promise<T>
  ): Promised<T>;
  run<T, D extends Core.DependencyLike, Args extends readonly unknown[]>(
    dependencies: D,
    callback: (deps: Core.InferOutput<D>, ...args: Args) => T | Promise<T>,
    args: Args
  ): Promised<T>;
  run<T, D extends Core.DependencyLike, Args extends readonly unknown[]>(
    dependencies: D,
    callback: (deps: Core.InferOutput<D>, ...args: Args) => T | Promise<T>,
    args?: Args
  ): Promised<T> {
    this["~ensureNotDisposed"]();

    const dummyExecutor = {
      [executorSymbol]: "main" as const,
      factory: undefined,
      dependencies,
      tags: {},
    } as unknown as UE;

    return Promised.create(
      (async () => {
        const deps = dependencies as
          | Core.UExecutor
          | Core.UExecutor[]
          | Record<string, Core.UExecutor>
          | undefined;

        const resolvedDeps = await this["~resolveDependencies"](
          deps,
          dummyExecutor
        );

        if (args !== undefined && args.length > 0) {
          return await callback(resolvedDeps as Core.InferOutput<D>, ...args);
        }
        return await callback(
          resolvedDeps as Core.InferOutput<D>,
          ...([] as unknown as Args)
        );
      })()
    );
  }

  update<T>(e: Core.Executor<T>, u: T | ((current: T) => T)): Promised<void> {
    if (this.isDisposing) {
      return Promised.create(Promise.resolve());
    }

    this["~ensureNotDisposed"]();

    const state = this.getOrCreateState(e);
    const previousQueue = state.updateQueue || Promise.resolve();

    const coreUpdate = (): Promised<void> => {
      return Promised.create(
        (async () => {
          await previousQueue;

          this["~triggerCleanup"](e);
          const accessor = this["~makeAccessor"](e);

          let value: T | undefined;

          if (typeof u === "function") {
            const fn = u as (current: T) => T;
            value = fn(accessor.get() as T);
          } else {
            value = u;
          }

          const events = this.onEvents.resolve;
          for (const event of events) {
            const updated = await event("update", e, value, this);
            if (updated !== undefined && e === updated.executor) {
              value = updated.value as T;
            }
          }

          const currentState = this.getOrCreateState(e);
          currentState.accessor = accessor;
          currentState.value = {
            kind: "resolved",
            value,
            promised: Promised.create(Promise.resolve(value)),
          };

          await this["~triggerUpdate"](e);
        })()
      );
    };

    const baseUpdater = (): Promised<T> => {
      return coreUpdate().map(() => this.accessor(e).get() as T);
    };

    const updater = this.wrapWithExtensions(baseUpdater, {
      kind: "resolve",
      operation: "update",
      executor: e,
      scope: this,
    });

    const updatePromise = updater().map(() => undefined);
    state.updateQueue = updatePromise.toPromise();

    return updatePromise;
  }

  set<T>(e: Core.Executor<T>, value: T): Promised<void> {
    return this.update(e, value);
  }

  release(e: Core.Executor<unknown>, s: boolean = false): Promised<void> {
    this["~ensureNotDisposed"]();

    const coreRelease = async (): Promise<void> => {
      const state = this.cache.get(e);
      if (!state && !s) {
        throw new Error("Executor is not yet resolved");
      }

      await this["~triggerCleanup"](e);
      const events = this.onEvents.release;
      for (const event of events) {
        await event("release", e, this);
      }

      if (state?.onUpdateExecutors) {
        for (const t of Array.from(state.onUpdateExecutors.values())) {
          await this.release(t, true);
        }
      }

      this.cache.delete(e);
    };

    return Promised.create(coreRelease());
  }

  dispose(): Promised<void> {
    this["~ensureNotDisposed"]();
    this.isDisposing = true;

    return Promised.create(
      (async () => {
        const extensionDisposeEvents = this.extensions.map(
          (ext) => ext.dispose?.(this) ?? Promise.resolve()
        );
        await Promise.all(extensionDisposeEvents);

        const currents = this.cache.keys();
        for (const current of currents) {
          await this.release(current, true);
        }

        this.disposed = true;
        this.cache.clear();
        this.onEvents.resolve.clear();
        this.onEvents.release.clear();
        this.onEvents.error.clear();
        this.executions.clear();
      })()
    );
  }

  onUpdate<T>(
    e: Core.Executor<T>,
    cb: (a: Core.Accessor<T>) => void | Promise<void>
  ): Core.Cleanup {
    this["~ensureNotDisposed"]();
    if (this.isDisposing) {
      throw new Error("Cannot register update callback on a disposing scope");
    }

    const state = this.getOrCreateState(e as UE);
    const callbacks = this.ensureCallbacks(state);
    callbacks.add(cb as OnUpdateFn);

    return () => {
      this["~ensureNotDisposed"]();

      const state = this.cache.get(e as UE);
      if (state?.onUpdateCallbacks) {
        state.onUpdateCallbacks.delete(cb as OnUpdateFn);
        if (state.onUpdateCallbacks.size === 0) {
          delete state.onUpdateCallbacks;
        }
      }
    };
  }

  onResolve(callback: Core.ResolveCallback): Core.Cleanup {
    this["~ensureNotDisposed"]();
    if (this.isDisposing) {
      throw new Error("Cannot register update callback on a disposing scope");
    }

    this.onEvents["resolve"].add(callback);
    return () => {
      this["~ensureNotDisposed"]();
      this.onEvents["resolve"].delete(callback);
    };
  }

  onRelease(cb: Core.ReleaseCallback): Core.Cleanup {
    this["~ensureNotDisposed"]();
    if (this.isDisposing) {
      throw new Error("Cannot register update callback on a disposing scope");
    }

    this.onEvents["release"].add(cb);
    return () => {
      this["~ensureNotDisposed"]();
      this.onEvents["release"].delete(cb);
    };
  }

  onError<T>(
    executor: Core.Executor<T>,
    callback: Core.ErrorCallback<T>
  ): Core.Cleanup;
  onError(callback: Core.GlobalErrorCallback): Core.Cleanup;
  onError<T>(
    executorOrCallback: Core.Executor<T> | Core.GlobalErrorCallback,
    callback?: Core.ErrorCallback<T>
  ): Core.Cleanup {
    this["~ensureNotDisposed"]();
    if (this.isDisposing) {
      throw new Error("Cannot register error callback on a disposing scope");
    }

    if (typeof executorOrCallback === "function") {
      this.onEvents["error"].add(executorOrCallback);
      return () => {
        this["~ensureNotDisposed"]();
        this.onEvents["error"].delete(executorOrCallback);
      };
    }

    if (callback) {
      const executor = executorOrCallback;
      const state = this.getOrCreateState(executor as UE);
      const errorCallbacks = this.ensureErrors(state);
      errorCallbacks.add(callback as Core.ErrorCallback<unknown>);

      return () => {
        this["~ensureNotDisposed"]();
        const state = this.cache.get(executor as UE);
        if (state?.onErrors) {
          state.onErrors.delete(callback as Core.ErrorCallback<unknown>);
          if (state.onErrors.size === 0) {
            delete state.onErrors;
          }
        }
      };
    }

    throw new Error("Invalid arguments for onError");
  }

  useExtension(extension: Extension.Extension): Core.Cleanup {
    this["~ensureNotDisposed"]();
    if (this.isDisposing) {
      throw new Error("Cannot register extension on a disposing scope");
    }

    this.extensions.push(extension);
    extension.init?.(this);

    return () => {
      this["~ensureNotDisposed"]();
      const idx = this.extensions.indexOf(extension);
      if (idx !== -1) {
        this.extensions.splice(idx, 1);
      }
    };
  }

  use(extension: Extension.Extension): Core.Cleanup {
    return this.useExtension(extension);
  }

  exec<S, I>(config: {
    flow: Core.Executor<Flow.Handler<S, I>>;
    input?: I;
    timeout?: number;
    tags?: Tag.Tagged[];
  }): Flow.Execution<S>;

  exec<S, D extends Core.DependencyLike>(config: {
    dependencies: D;
    fn: (deps: Core.InferOutput<D>) => S | Promise<S>;
    timeout?: number;
    tags?: Tag.Tagged[];
  }): Flow.Execution<S>;

  exec<S, I, D extends Core.DependencyLike>(config: {
    dependencies: D;
    fn: (deps: Core.InferOutput<D>, input: I) => S | Promise<S>;
    input: I;
    timeout?: number;
    tags?: Tag.Tagged[];
  }): Flow.Execution<S>;

  exec<S, I = undefined>(
    config:
      | { flow: Core.Executor<Flow.Handler<S, I>>; input?: I; timeout?: number; tags?: Tag.Tagged[] }
      | { dependencies: Core.DependencyLike; fn: (...args: any[]) => S | Promise<S>; input?: any; timeout?: number; tags?: Tag.Tagged[] }
  ): Flow.Execution<S> {
    this["~ensureNotDisposed"]();
    const executionId = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `exec-${Date.now()}-${Math.random()}`;
    const abortController = new AbortController();

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (config.timeout) {
      timeoutId = setTimeout(() => {
        if (!abortController.signal.aborted) {
          abortController.abort(new Error(`Flow execution timeout after ${config.timeout}ms`));
        }
      }, config.timeout);
    }

    let flowPromise: Promised<S>;
    let flowName: string | undefined;

    if ("flow" in config) {
      flowPromise = this["~executeFlow"](config.flow, config.input as I, config.tags, abortController);
      const definition = flowDefinitionMeta.readFrom(config.flow);
      flowName = definition?.name;
    } else {
      flowPromise = Promised.create(
        (async () => {
          const deps = await this["~resolveDependencies"](
            config.dependencies as Core.UExecutor | Core.UExecutor[] | Record<string, Core.UExecutor> | undefined,
            { [executorSymbol]: "main" as const } as any
          );

          if ("input" in config) {
            return config.fn(deps, config.input);
          } else {
            return config.fn(deps);
          }
        })()
      );
      flowName = undefined;
    }

    const statusTracking = {
      promise: flowPromise,
      timeoutId: timeoutId ?? null,
      abortController,
    };

    const execution = new FlowExecutionImpl<S>({
      id: executionId,
      flowName,
      abort: abortController,
      result: flowPromise,
      ctx: null,
      statusTracking,
    });

    this.executions.set(executionId, { execution, startTime: Date.now() });

    flowPromise.finally(() => {
      this.executions.delete(executionId);
    });

    execution["~setStatus"]("running");

    return execution;
  }

  private "~executeFlow"<S, I>(
    flow: Core.Executor<Flow.Handler<S, I>>,
    input: I,
    executionTags?: Tag.Tagged[],
    abortController?: AbortController
  ): Promised<S> {
    let resolveSnapshot!: (snapshot: Flow.ExecutionData | undefined) => void;
    const snapshotPromise = new Promise<Flow.ExecutionData | undefined>(
      (resolve) => {
        resolveSnapshot = resolve;
      }
    );

    const promise = (async () => {
      const definition = flowDefinitionMeta.readFrom(flow);
      if (!definition) {
        throw new Error("Flow definition not found in executor metadata");
      }

      const context = new ExecutionContextImpl({
        scope: this,
        extensions: this.extensions,
        tags: mergeFlowTags(definition.tags, executionTags),
        abortController,
        details: { name: definition.name }
      });
      context.initializeExecutionContext(definition.name, false);

      try {
        const executeCore = (): Promised<S> => {
          return this.resolve(flow, false, context).map(async (handler) => {
            const validated = validate(definition.input, input);

            const result = await handler(context, validated);

            validate(definition.output, result);

            return result;
          });
        };

        const executor = this.wrapWithExtensions(
          executeCore,
          {
            kind: "execution",
            name: definition.name,
            mode: "sequential",
            input,
            key: undefined,
            context,
            flow,
            definition,
          }
        );

        const result = await executor();
        context.end();
        await context.close();
        resolveSnapshot(context.createSnapshot());
        return result;
      } catch (error) {
        context.details.error = error;
        context.end();
        await context.close().catch((closeErr) => {
          console.error('Error closing context after flow failure:', closeErr);
        });
        resolveSnapshot(context.createSnapshot());
        throw error;
      }
    })();

    return Promised.create(promise, snapshotPromise);
  }
}

export type ScopeOption = {
  initialValues?: Core.Preset<unknown>[];
  registry?: Core.Executor<unknown>[];
  extensions?: Extension.Extension[];
  tags?: Tag.Tagged[];
};

/**
 * Creates new scope for resolving executors.
 * @param opt - Options: initialValues, registry, extensions, tags
 * @example createScope({ initialValues: [preset(configExecutor, dev)] })
 */
export function createScope(): Core.Scope;
export function createScope(opt: ScopeOption): Core.Scope;
export function createScope(...presets: Core.Preset<unknown>[]): Core.Scope;

export function createScope(
  ...opt: [ScopeOption | undefined] | Core.Preset<unknown>[]
): Core.Scope {
  if (opt.at(0) === undefined) {
    return new BaseScope();
  }

  if (opt.length === 1 && !isPreset(opt[0])) {
    return new BaseScope(opt[0]);
  }

  return new BaseScope({
    initialValues: opt as Core.Preset<unknown>[],
  });
}

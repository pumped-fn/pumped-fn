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
  ExecutorResolutionError,
  FactoryExecutionError,
  DependencyResolutionError,
  ErrorContext,
  executorSymbol,
  type Flow,
} from "./types";
import { Promised } from "./promises";
import * as errors from "./errors";
import { flow as flowApi } from "./flow";

type ExecutorState = {
  accessor: Core.Accessor<unknown>;
  value?: Core.ResolveState<unknown>;
  cleanups?: Set<Core.Cleanup>;
  onUpdateCallbacks?: Set<OnUpdateFn>;
  onUpdateExecutors?: Set<UE>;
  onErrors?: Set<Core.ErrorCallback<unknown>>;
  resolutionChain?: Set<UE>;
  resolutionDepth?: number;
};

type CacheEntry = ExecutorState;

type UE = Core.Executor<unknown>;
type OnUpdateFn = (accessor: Core.Accessor<unknown>) => void | Promise<void>;

interface ReplacerResult {
  factory: Core.NoDependencyFn<unknown> | Core.DependentFn<unknown, unknown>;
  dependencies:
    | undefined
    | Core.UExecutor
    | Core.UExecutor[]
    | Record<string, Core.UExecutor>;
  immediateValue?: unknown;
}

class AccessorImpl implements Core.Accessor<unknown> {
  public tags: import("./tag-types").Tag.Tagged[] | undefined;
  private scope: BaseScope;
  private requestor: UE;
  private currentPromise: Promise<unknown> | null = null;
  private currentPromised: Promised<unknown> | null = null;
  public resolve: (force?: boolean) => Promised<unknown>;

  constructor(scope: BaseScope, requestor: UE, tags: import("./tag-types").Tag.Tagged[] | undefined) {
    this.scope = scope;
    this.requestor = requestor;
    this.tags = tags;

    this.resolve = this.createResolveFunction();

    const state = this.scope["getOrCreateState"](requestor);
    if (!state.accessor) {
      state.accessor = this;
    }
  }

  private async resolveCore(): Promise<unknown> {
    const { factory, dependencies, immediateValue } =
      this.processReplacer();

    if (immediateValue !== undefined) {
      await new Promise<void>((resolve) => queueMicrotask(resolve));

      const state = this.scope["getOrCreateState"](this.requestor);
      state.accessor = this;
      state.value = {
        kind: "resolved",
        value: immediateValue,
        promised: Promised.create(Promise.resolve(immediateValue)),
      };

      return immediateValue;
    }

    const controller = this.createController();

    const resolvedDependencies = await this.scope["~resolveDependencies"](
      dependencies,
      this.requestor
    );

    const result = await this.executeFactory(
      factory,
      resolvedDependencies,
      controller
    );

    const processedResult = await this.processChangeEvents(result);

    const state = this.scope["getOrCreateState"](this.requestor);
    state.accessor = this;
    state.value = {
      kind: "resolved",
      value: processedResult,
      promised: Promised.create(Promise.resolve(processedResult)),
    };

    this.scope["~removeFromResolutionChain"](this.requestor);
    this.currentPromise = null;
    this.currentPromised = null;

    return processedResult;
  }

  private async resolveWithErrorHandling(): Promise<unknown> {
    try {
      return await this.resolveCore();
    } catch (error) {
      const { enhancedError, errorContext, originalError } =
        this.enhanceResolutionError(error);

      const state = this.scope["getOrCreateState"](this.requestor);
      state.accessor = this;
      state.value = {
        kind: "rejected",
        error: originalError,
        context: errorContext,
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

      const entry = this.scope["cache"].get(this.requestor);
      const cached = entry?.value;

      if (cached && !force) {
        return this.handleCachedState(cached);
      }

      if (this.currentPromise && !force) {
        if (!this.currentPromised) {
          this.currentPromised = Promised.create(this.currentPromise);
        }
        return this.currentPromised;
      }

      this.scope["~addToResolutionChain"](this.requestor, this.requestor);

      this.currentPromise = this.resolveWithErrorHandling();

      const state = this.scope["getOrCreateState"](this.requestor);
      state.accessor = this;
      state.value = { kind: "pending", promise: this.currentPromise };

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
        factory: this.requestor.factory!,
        dependencies: this.requestor.dependencies,
      };
    }

    const value = replacer.value;

    if (!isExecutor(value)) {
      return {
        factory: this.requestor.factory!,
        dependencies: this.requestor.dependencies,
        immediateValue: value,
      };
    }

    return {
      factory: value.factory!,
      dependencies: value.dependencies,
    };
  }

  private async executeFactory(
    factory: Core.NoDependencyFn<unknown> | Core.DependentFn<unknown, unknown>,
    resolvedDependencies: unknown,
    controller: Core.Controller
  ): Promise<unknown> {
    try {
      const factoryResult =
        factory.length >= 2
          ? (factory as Core.DependentFn<unknown, unknown>)(
              resolvedDependencies,
              controller
            )
          : (factory as Core.NoDependencyFn<unknown>)(controller);

      if (factoryResult instanceof Promise) {
        try {
          return await factoryResult;
        } catch (asyncError) {
          const executorName = errors.getExecutorName(this.requestor);
          const dependencyChain = [executorName];

          throw errors.createFactoryError(
            errors.codes.FACTORY_ASYNC_ERROR,
            executorName,
            dependencyChain,
            asyncError,
            {
              dependenciesResolved: resolvedDependencies !== undefined,
              factoryType: typeof factory,
              isAsyncFactory: true,
            }
          );
        }
      }

      return factoryResult;
    } catch (syncError) {
      const executorName = errors.getExecutorName(this.requestor);
      const dependencyChain = [executorName];

      throw errors.createFactoryError(
        errors.codes.FACTORY_THREW_ERROR,
        executorName,
        dependencyChain,
        syncError,
        {
          dependenciesResolved: resolvedDependencies !== undefined,
          factoryType: typeof factory,
          isAsyncFactory: false,
        }
      );
    }
  }

  private async processChangeEvents(result: unknown): Promise<unknown> {
    let currentValue = result;
    const events = this.scope["onEvents"].change;

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
    errorContext: ErrorContext;
    originalError: unknown;
  } {
    if (
      error &&
      typeof error === "object" &&
      "context" in error &&
      "code" in error &&
      error.context &&
      error.code
    ) {
      return {
        enhancedError: error as ExecutorResolutionError,
        errorContext: error.context as ErrorContext,
        originalError: error,
      };
    }

    const executorName = errors.getExecutorName(this.requestor);
    const dependencyChain = [executorName];

    const enhancedError = errors.createSystemError(
      errors.codes.INTERNAL_RESOLUTION_ERROR,
      executorName,
      dependencyChain,
      error,
      {
        errorType: error?.constructor?.name || "UnknownError",
        resolutionPhase: "post-factory",
        hasOriginalContext: false,
      }
    );

    return {
      enhancedError,
      errorContext: enhancedError.context,
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

  update(
    updateFn: unknown | ((current: unknown) => unknown)
  ): Promised<void> {
    return this.scope.update(this.requestor, updateFn);
  }

  set(value: unknown): Promised<void> {
    return this.scope.update(this.requestor, value);
  }

  subscribe(cb: (value: unknown) => void): Core.Cleanup {
    this.scope["~ensureNotDisposed"]();
    return this.scope.onUpdate(this.requestor, cb);
  }

  private createController(): Core.Controller {
    return {
      cleanup: (cleanup: Core.Cleanup) => {
        const state = this.scope["getOrCreateState"](this.requestor);
        const cleanups = this.scope["ensureCleanups"](state);
        cleanups.add(cleanup);
      },
      release: () => this.scope.release(this.requestor),
      reload: () => this.scope.resolve(this.requestor, true).map(() => undefined),
      scope: this.scope,
    };
  }
}

function getExecutor(e: Core.UExecutor): Core.Executor<unknown> {
  if (isLazyExecutor(e) || isReactiveExecutor(e) || isStaticExecutor(e)) {
    return e.executor;
  }

  return e as Core.Executor<unknown>;
}

class BaseScope implements Core.Scope {
  protected disposed: boolean = false;
  protected cache: Map<UE, ExecutorState> = new Map();
  protected onEvents: {
    readonly change: Set<Core.ChangeCallback>;
    readonly release: Set<Core.ReleaseCallback>;
    readonly error: Set<Core.GlobalErrorCallback>;
  } = {
    change: new Set<Core.ChangeCallback>(),
    release: new Set<Core.ReleaseCallback>(),
    error: new Set<Core.GlobalErrorCallback>(),
  } as const;
  private isDisposing = false;

  private readonly CIRCULAR_CHECK_THRESHOLD = 15;

  protected extensions: Extension.Extension[] = [];
  private reversedExtensions: Extension.Extension[] = [];
  protected registry: Core.Executor<unknown>[] = [];
  protected initialValues: Core.Preset<unknown>[] = [];
  public tags: import("./tag-types").Tag.Tagged[] | undefined;

  private static readonly emptyDataStore: import("./tag-types").Tag.Store = {
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

  protected ensureErrors(state: ExecutorState): Set<Core.ErrorCallback<unknown>> {
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

      throw errors.createDependencyError(
        errors.codes.CIRCULAR_DEPENDENCY,
        errors.getExecutorName(executor),
        dependencyChain,
        errors.getExecutorName(executor),
        undefined,
        {
          circularPath:
            dependencyChain.join(" -> ") +
            " -> " +
            errors.getExecutorName(executor),
          detectedAt: errors.getExecutorName(resolvingExecutor),
        }
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
      throw errors.createDependencyError(
        errors.codes.CIRCULAR_DEPENDENCY,
        executorName,
        [executorName],
        executorName,
        undefined,
        { circularPath: `${executorName} -> ${executorName}`, detectedAt: executorName }
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

  protected async "~resolveDependencies"(
    ie:
      | undefined
      | Core.UExecutor
      | Core.UExecutor[]
      | Record<string, Core.UExecutor>,
    ref: UE
  ): Promise<undefined | unknown | unknown[] | Record<string, unknown>> {
    if (ie === undefined) {
      return undefined;
    }

    if (isExecutor(ie)) {
      return this["~resolveExecutor"](ie, ref);
    }

    if (Array.isArray(ie)) {
      return await Promise.all(
        ie.map((item) => this["~resolveDependencies"](item, ref))
      );
    }

    const keys = Object.keys(ie);
    const promises = keys.map((k) => this["~resolveDependencies"](ie[k], ref));
    const values = await Promise.all(promises);

    const r: Record<string, unknown> = Object.create(null);
    keys.forEach((k, i) => {
      r[k] = values[i];
    });

    return r;
  }

  protected "~ensureNotDisposed"(): void {
    if (this.disposed) {
      throw new Error("Scope is disposed");
    }
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
          const result = extension.wrap!<T>(this, current, operation);
          return result instanceof Promised ? result : Promised.create(result);
        };
      }
    }
    return executor;
  }

  protected "~makeAccessor"(e: Core.UExecutor): Core.Accessor<unknown> {
    let requestor =
      isLazyExecutor(e) || isReactiveExecutor(e) || isStaticExecutor(e)
        ? e.executor
        : (e as UE);

    const cachedAccessor = this.cache.get(requestor);
    if (cachedAccessor && cachedAccessor.accessor) {
      return cachedAccessor.accessor;
    }

    const accessor = new AccessorImpl(this, requestor, e.tags);
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

  resolve<T>(
    executor: Core.Executor<T>,
    force: boolean = false
  ): Promised<T> {
    this["~ensureNotDisposed"]();

    const coreResolve = (): Promised<T> => {
      const accessor = this["~makeAccessor"](executor);
      return accessor.resolve(force).map(() => accessor.get() as T);
    };

    const resolver = this.wrapWithExtensions(
      coreResolve,
      {
        kind: "resolve",
        executor,
        scope: this,
        operation: "resolve",
      }
    );

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

  update<T>(
    e: Core.Executor<T>,
    u: T | ((current: T) => T)
  ): Promised<void> {
    if (this.isDisposing) {
      return Promised.create(Promise.resolve());
    }

    this["~ensureNotDisposed"]();

    const coreUpdate = (): Promised<void> => {
      return Promised.create((async () => {
        this["~triggerCleanup"](e);
        const accessor = this["~makeAccessor"](e);
      
        let value: T | undefined;
      
        if (typeof u === "function") {
          const fn = u as (current: T) => T;
          value = fn(accessor.get() as T);
        } else {
          value = u;
        }
      
        const events = this.onEvents.change;
        for (const event of events) {
          const updated = await event("update", e, value, this);
          if (updated !== undefined && e === updated.executor) {
            value = updated.value as T;
          }
        }

        const state = this.getOrCreateState(e);
        state.accessor = accessor;
        state.value = {
          kind: "resolved",
          value,
          promised: Promised.create(Promise.resolve(value)),
        };
      
        await this["~triggerUpdate"](e);
      })());
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

    return updater().map(() => undefined);
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

    return Promised.create((async () => {
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
      this.onEvents.change.clear();
      this.onEvents.release.clear();
      this.onEvents.error.clear();
    })());
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

  onChange(callback: Core.ChangeCallback): Core.Cleanup {
    this["~ensureNotDisposed"]();
    if (this.isDisposing) {
      throw new Error("Cannot register update callback on a disposing scope");
    }

    this.onEvents["change"].add(callback);
    return () => {
      this["~ensureNotDisposed"]();
      this.onEvents["change"].delete(callback);
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
    this.reversedExtensions.unshift(extension);
    extension.init?.(this);

    return () => {
      this["~ensureNotDisposed"]();
      const idx = this.extensions.indexOf(extension);
      if (idx !== -1) {
        this.extensions.splice(idx, 1);
        this.reversedExtensions.splice(this.reversedExtensions.length - 1 - idx, 1);
      }
    };
  }

  use(extension: Extension.Extension): Core.Cleanup {
    return this.useExtension(extension);
  }

  exec<S, I = undefined>(
    flow: Core.Executor<Flow.Handler<S, I>>,
    input?: I,
    options?: {
      extensions?: Extension.Extension[];
      initialContext?: Array<
        [import("./tag-types").Tag.Tag<any, false> | import("./tag-types").Tag.Tag<any, true>, any]
      >;
      presets?: Core.Preset<unknown>[];
      tags?: import("./tag-types").Tag.Tagged[];
      details?: false;
    }
  ): Promised<S>;

  exec<S, I = undefined>(
    flow: Core.Executor<Flow.Handler<S, I>>,
    input: I | undefined,
    options: {
      extensions?: Extension.Extension[];
      initialContext?: Array<
        [import("./tag-types").Tag.Tag<any, false> | import("./tag-types").Tag.Tag<any, true>, any]
      >;
      presets?: Core.Preset<unknown>[];
      tags?: import("./tag-types").Tag.Tagged[];
      details: true;
    }
  ): Promised<Flow.ExecutionDetails<S>>;

  exec<S, I = undefined>(
    flow: Core.Executor<Flow.Handler<S, I>>,
    input?: I,
    options?: {
      extensions?: Extension.Extension[];
      initialContext?: Array<
        [import("./tag-types").Tag.Tag<any, false> | import("./tag-types").Tag.Tag<any, true>, any]
      >;
      presets?: Core.Preset<unknown>[];
      tags?: import("./tag-types").Tag.Tagged[];
      details?: boolean;
    }
  ): Promised<S> | Promised<Flow.ExecutionDetails<S>> {
    this["~ensureNotDisposed"]();

    if (options?.details === true) {
      return flowApi.execute(flow, input as I, {
        scope: this,
        extensions: options.extensions,
        initialContext: options.initialContext,
        tags: options.tags,
        details: true,
      });
    }

    return flowApi.execute(flow, input as I, {
      scope: this,
      extensions: options?.extensions,
      initialContext: options?.initialContext,
      tags: options?.tags,
      details: false,
    });
  }
}

export type ScopeOption = {
  initialValues?: Core.Preset<unknown>[];
  registry?: Core.Executor<unknown>[];
  extensions?: Extension.Extension[];
  tags?: import("./tag-types").Tag.Tagged[];
};

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

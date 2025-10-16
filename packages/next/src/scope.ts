import {
  isLazyExecutor,
  isReactiveExecutor,
  isStaticExecutor,
  isMainExecutor,
  isExecutor,
  isPreset,
} from "./executor";
import {
  type Accessor,
  Core,
  Extension,
  Meta,
  ExecutorResolutionError,
  FactoryExecutionError,
  DependencyResolutionError,
  ErrorContext,
  type Flow,
} from "./types";
import { Promised } from "./promises";
import * as errors from "./errors";
import { flow as flowApi } from "./flow";

type CacheEntry = {
  accessor: Core.Accessor<unknown>;
  value?: Core.ResolveState<unknown>;
};

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
  public metas: Meta.Meta[] | undefined;
  private scope: BaseScope;
  private requestor: UE;
  private currentPromise: Promise<unknown> | null = null;
  private currentPromised: Promised<unknown> | null = null;
  private cachedResolvedPromised: Promised<unknown> | null = null;
  public resolve: (force?: boolean) => Promised<unknown>;

  constructor(scope: BaseScope, requestor: UE, metas: Meta.Meta[] | undefined) {
    this.scope = scope;
    this.requestor = requestor;
    this.metas = metas;

    this.resolve = this.createResolveFunction();

    const existing = this.scope["cache"].get(requestor);
    if (!existing || !existing.accessor) {
      this.scope["cache"].set(requestor, {
        accessor: this,
        value: existing?.value,
      });
    }
  }

  private async resolveCore(): Promise<unknown> {
    const { factory, dependencies, immediateValue } =
      this.processReplacer();

    if (immediateValue !== undefined) {
      await new Promise<void>((resolve) => queueMicrotask(resolve));

      this.scope["cache"].set(this.requestor, {
        accessor: this,
        value: {
          kind: "resolved",
          value: immediateValue,
          promised: Promised.create(Promise.resolve(immediateValue)),
        },
      });

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

    this.scope["cache"].set(this.requestor, {
      accessor: this,
      value: {
        kind: "resolved",
        value: processedResult,
        promised: Promised.create(Promise.resolve(processedResult)),
      },
    });

    this.scope["~removeFromResolutionChain"](this.requestor);
    this.currentPromise = null;
    this.currentPromised = null;
    this.cachedResolvedPromised = null;

    return processedResult;
  }

  private async resolveWithErrorHandling(): Promise<unknown> {
    try {
      return await this.resolveCore();
    } catch (error) {
      const { enhancedError, errorContext, originalError } =
        this.enhanceResolutionError(error);

      this.scope["cache"].set(this.requestor, {
        accessor: this,
        value: {
          kind: "rejected",
          error: originalError,
          context: errorContext,
          enhancedError: enhancedError,
        },
      });

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

      this.scope["cache"].set(this.requestor, {
        accessor: this,
        value: { kind: "pending", promise: this.currentPromise },
      });

      this.currentPromised = Promised.create(this.currentPromise);
      return this.currentPromised;
    };
  }

  private handleCachedState(
    cached: Core.ResolveState<unknown>
  ): Promised<unknown> | never {
    if (cached.kind === "resolved") {
      if (cached.promised) {
        return cached.promised;
      }
      if (!this.cachedResolvedPromised) {
        this.cachedResolvedPromised = Promised.create(Promise.resolve(cached.value));
      }
      return this.cachedResolvedPromised;
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
        const currentSet =
          this.scope["cleanups"].get(this.requestor) ?? new Set();
        this.scope["cleanups"].set(this.requestor, currentSet);
        currentSet.add(cleanup);
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
  protected cache: Map<UE, CacheEntry> = new Map();
  protected cleanups: Map<UE, Set<Core.Cleanup>> = new Map<
    UE,
    Set<Core.Cleanup>
  >();
  protected onUpdateCallbacks: Map<UE, Set<OnUpdateFn>> = new Map<
    UE,
    Set<OnUpdateFn>
  >();
  protected onUpdateExecutors: Map<UE, Set<UE>> = new Map<UE, Set<UE>>();
  protected onEvents: {
    readonly change: Set<Core.ChangeCallback>;
    readonly release: Set<Core.ReleaseCallback>;
    readonly error: Set<Core.GlobalErrorCallback>;
  } = {
    change: new Set<Core.ChangeCallback>(),
    release: new Set<Core.ReleaseCallback>(),
    error: new Set<Core.GlobalErrorCallback>(),
  } as const;
  protected onErrors: Map<UE, Set<Core.ErrorCallback<unknown>>> = new Map<
    UE,
    Set<Core.ErrorCallback<unknown>>
  >();
  protected isPod: boolean;
  private isDisposing = false;

  private resolutionChain: Map<UE, Set<UE>> = new Map();

  protected extensions: Extension.Extension[] = [];
  private reversedExtensions: Extension.Extension[] = [];
  protected registry: Core.Executor<unknown>[] = [];
  protected initialValues: Core.Preset<unknown>[] = [];
  public metas: Meta.Meta[] | undefined;

  private static readonly emptyDataStore: Accessor.DataStore = {
    get: () => undefined,
    set: () => undefined,
  };

  constructor(options?: ScopeOption) {
    this.isPod = options?.pod || false;
    if (options?.registry) {
      this.registry = [...options.registry];
    }

    if (options?.initialValues) {
      this.initialValues = options.initialValues;
    }

    if (options?.meta) {
      this.metas = options.meta;
    }

    if (options?.extensions) {
      for (const extension of options.extensions) {
        this.useExtension(extension);
      }
    }
  }

  protected "~checkCircularDependency"(
    executor: UE,
    resolvingExecutor: UE
  ): void {
    const currentChain = this.resolutionChain.get(resolvingExecutor);
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
    const currentChain =
      this.resolutionChain.get(resolvingExecutor) || new Set();
    currentChain.add(executor);
    this.resolutionChain.set(resolvingExecutor, currentChain);
  }

  protected "~removeFromResolutionChain"(executor: UE): void {
    this.resolutionChain.delete(executor);
  }

  protected "~propagateResolutionChain"(
    fromExecutor: UE,
    toExecutor: UE
  ): void {
    const fromChain = this.resolutionChain.get(fromExecutor);
    if (fromChain) {
      const newChain = new Set(fromChain);
      newChain.add(fromExecutor);
      this.resolutionChain.set(toExecutor, newChain);
    }
  }

  protected async "~triggerCleanup"(e: UE): Promise<void> {
    const cs = this.cleanups.get(e);
    if (cs) {
      for (const c of Array.from(cs.values()).reverse()) {
        await c();
      }
    }
  }

  protected async "~triggerUpdate"(e: UE): Promise<void> {
    const ce = this.cache.get(e);
    if (!ce) {
      throw new Error("Executor is not yet resolved");
    }

    const executors = this.onUpdateExecutors.get(e);
    if (executors) {
      for (const t of Array.from(executors.values())) {
        if (this.cleanups.has(t)) {
          this["~triggerCleanup"](t);
        }

        const a = this.cache.get(t);
        await a!.accessor.resolve(true);

        if (this.onUpdateExecutors.has(t) || this.onUpdateCallbacks.has(t)) {
          await this["~triggerUpdate"](t);
        }
      }
    }

    const callbacks = this.onUpdateCallbacks.get(e);
    if (callbacks) {
      for (const cb of Array.from(callbacks.values())) {
        await cb(ce.accessor);
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
    const executorCallbacks = this.onErrors.get(executor);
    if (executorCallbacks) {
      for (const callback of Array.from(executorCallbacks.values())) {
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

    this["~checkCircularDependency"](e, ref);

    this["~propagateResolutionChain"](ref, e);

    const a = this["~makeAccessor"](e);

    if (isLazyExecutor(ie)) {
      return a;
    }

    if (isReactiveExecutor(ie)) {
      const c = this.onUpdateExecutors.get(ie.executor) ?? new Set();
      this.onUpdateExecutors.set(ie.executor, c);
      c.add(ref);
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
    dataStore: Accessor.DataStore,
    operation: Extension.Operation
  ): () => Promised<T> {
    let executor = baseExecutor;
    for (const extension of this.reversedExtensions) {
      if (extension.wrap) {
        const current = executor;
        executor = () => {
          const result = extension.wrap!<T>(dataStore, current, operation);
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

    const accessor = new AccessorImpl(this, requestor, e.metas);
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
      BaseScope.emptyDataStore,
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

        this.cache.set(e, {
          accessor,
          value: {
            kind: "resolved",
            value,
            promised: Promised.create(Promise.resolve(value)),
          },
        });
      
        await this["~triggerUpdate"](e);
      })());
    };

    const baseUpdater = (): Promised<T> => {
      return coreUpdate().map(() => this.accessor(e).get() as T);
    };

    const updater = this.wrapWithExtensions(baseUpdater, BaseScope.emptyDataStore, {
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
      const ce = this.cache.get(e);
      if (!ce && !s) {
        throw new Error("Executor is not yet resolved");
      }

      await this["~triggerCleanup"](e);
      const events = this.onEvents.release;
      for (const event of events) {
        await event("release", e, this);
      }

      const executors = this.onUpdateExecutors.get(e);
      if (executors) {
        for (const t of Array.from(executors.values())) {
          await this.release(t, true);
        }
        this.onUpdateExecutors.delete(e);
      }

      this.onUpdateCallbacks.delete(e);

      this.cache.delete(e);
    };

    return Promised.create(coreRelease());
  }

  dispose(): Promised<void> {
    this["~ensureNotDisposed"]();
    this.isDisposing = true;

    return Promised.create((async () => {
      for (const pod of this.pods) {
        await this.disposePod(pod);
      }

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
      this.cleanups.clear();
      this.onUpdateCallbacks.clear();
      this.onUpdateExecutors.clear();
      this.onEvents.change.clear();
      this.onEvents.release.clear();
      this.onEvents.error.clear();
      this.onErrors.clear();
      this.resolutionChain.clear();
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

    const ou = this.onUpdateCallbacks.get(e) ?? new Set();
    this.onUpdateCallbacks.set(e, ou);
    ou.add(cb as OnUpdateFn);

    return () => {
      this["~ensureNotDisposed"]();

      const ou = this.onUpdateCallbacks.get(e);
      if (ou) {
        ou.delete(cb as OnUpdateFn);
        if (ou.size === 0) {
          this.onUpdateCallbacks.delete(e);
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
      const errorCallbacks = this.onErrors.get(executor) ?? new Set();
      this.onErrors.set(executor, errorCallbacks);
      errorCallbacks.add(callback as Core.ErrorCallback<unknown>);

      return () => {
        this["~ensureNotDisposed"]();
        const callbacks = this.onErrors.get(executor);
        if (callbacks) {
          callbacks.delete(callback as Core.ErrorCallback<unknown>);
          if (callbacks.size === 0) {
            this.onErrors.delete(executor);
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

  private pods: Set<Core.Pod> = new Set();

  pod(...preset: Core.Preset<unknown>[]): Core.Pod;
  pod(options: PodOption): Core.Pod;
  pod(...args: Core.Preset<unknown>[] | [PodOption]): Core.Pod {
    this["~ensureNotDisposed"]();
    if (this.isDisposing) {
      throw new Error("Cannot register update callback on a disposing scope");
    }

    let podOptions: PodOption;

    if (args.length === 1 && !isPreset(args[0])) {
      podOptions = args[0] as PodOption;
    } else {
      podOptions = { initialValues: args as Core.Preset<unknown>[] };
    }

    const pod = new Pod(this, podOptions);
    this.pods.add(pod);
    return pod;
  }

  disposePod(pod: Core.Pod): Promised<void> {
    this["~ensureNotDisposed"]();
    if (this.isDisposing) {
      return Promised.create(Promise.resolve());
    }

    return pod.dispose().map(() => {
      this.pods.delete(pod);
    });
  }

  exec<S, I = undefined>(
    flow: Core.Executor<Flow.Handler<S, I>>,
    input?: I,
    options?: {
      extensions?: Extension.Extension[];
      initialContext?: Array<
        [Accessor.Accessor<any> | Accessor.AccessorWithDefault<any>, any]
      >;
      presets?: Core.Preset<unknown>[];
      meta?: Meta.Meta[];
      details?: false;
    }
  ): Promised<S>;

  exec<S, I = undefined>(
    flow: Core.Executor<Flow.Handler<S, I>>,
    input: I | undefined,
    options: {
      extensions?: Extension.Extension[];
      initialContext?: Array<
        [Accessor.Accessor<any> | Accessor.AccessorWithDefault<any>, any]
      >;
      presets?: Core.Preset<unknown>[];
      meta?: Meta.Meta[];
      details: true;
    }
  ): Promised<Flow.ExecutionDetails<S>>;

  exec<S, I = undefined>(
    flow: Core.Executor<Flow.Handler<S, I>>,
    input?: I,
    options?: {
      extensions?: Extension.Extension[];
      initialContext?: Array<
        [Accessor.Accessor<any> | Accessor.AccessorWithDefault<any>, any]
      >;
      presets?: Core.Preset<unknown>[];
      meta?: Meta.Meta[];
      details?: boolean;
    }
  ): Promised<S> | Promised<Flow.ExecutionDetails<S>> {
    this["~ensureNotDisposed"]();

    if (options?.details === true) {
      return flowApi.execute(flow, input as I, {
        scope: this,
        extensions: options.extensions,
        initialContext: options.initialContext,
        presets: options.presets,
        meta: options.meta,
        details: true,
      });
    }

    return flowApi.execute(flow, input as I, {
      scope: this,
      extensions: options?.extensions,
      initialContext: options?.initialContext,
      presets: options?.presets,
      meta: options?.meta,
      details: false,
    });
  }
}

export type ScopeOption = {
  pod?: boolean;
  initialValues?: Core.Preset<unknown>[];
  registry?: Core.Executor<unknown>[];
  extensions?: Extension.Extension[];
  meta?: Meta.Meta[];
};

export type PodOption = {
  initialValues?: Core.Preset<unknown>[];
  extensions?: Extension.Extension[];
  meta?: Meta.Meta[];
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

class Pod extends BaseScope implements Core.Pod {
  private parentScope: BaseScope;

  constructor(scope: BaseScope, option?: PodOption) {
    super({
      pod: true,
      initialValues: option?.initialValues,
      extensions: option?.extensions
        ? [...(scope["extensions"] || []), ...option.extensions]
        : [...(scope["extensions"] || [])],
      meta: option?.meta,
    });
    this.parentScope = scope;
  }


  resolve<T>(executor: Core.Executor<T>, force?: boolean): Promised<T> {
    if (this.cache.has(executor)) {
      return super.resolve(executor, force);
    }

    const replacer = this.initialValues.find(
      (item) => item.executor === executor
    );

    if (replacer) {
      return super.resolve(executor, force);
    }

    if (this.parentScope["cache"].has(executor)) {
      const { value } = this.parentScope["cache"].get(executor)!;
      const accessor = super["~makeAccessor"](executor);

      this["cache"].set(executor, {
        accessor,
        value,
      });

      if (value) {
        if (value.kind === "rejected") {
          throw value.error;
        }

        if (value.kind === "resolved") {
          return Promised.create(Promise.resolve(value.value as T));
        }

        if (value.kind === "pending") {
          return Promised.create(value.promise as Promise<T>);
        }
      }
    }

    if (this["~hasDependencyWithPreset"](executor)) {
      return super.resolve(executor, force);
    }

    return super.resolve(executor, force);
  }

  private "~hasDependencyWithPreset"(executor: Core.Executor<any>): boolean {
    if (!executor.dependencies) return false;

    const checkDependency = (dep: Core.UExecutor): boolean => {
      const actualExecutor = getExecutor(dep);

      const hasPreset = this.initialValues.some(
        (item) => item.executor === actualExecutor
      );
      if (hasPreset) return true;

      if (actualExecutor.dependencies) {
        return this["~hasDependencyWithPreset"](actualExecutor);
      }

      return false;
    };

    const deps = executor.dependencies;
    if (Array.isArray(deps)) {
      return deps.some(checkDependency);
    } else if (typeof deps === "object" && deps !== null && !isExecutor(deps)) {
      return Object.values(deps).some(checkDependency);
    } else {
      return checkDependency(deps);
    }
  }

  protected async "~resolveExecutor"(
    ie: Core.UExecutor,
    ref: UE
  ): Promise<unknown> {
    if (isReactiveExecutor(ie)) {
      throw new Error("Reactive executors cannot be used in pod");
    }

    const e = getExecutor(ie);

    if (isLazyExecutor(ie)) {
      this["~checkCircularDependency"](e, ref);
      this["~propagateResolutionChain"](ref, e);
      const a = this["~makeAccessor"](e);
      return a;
    }

    if (isStaticExecutor(ie)) {
      this["~checkCircularDependency"](e, ref);
      this["~propagateResolutionChain"](ref, e);
      await this.resolve(e);
      const a = this["~makeAccessor"](e);
      return a;
    }

    this["~checkCircularDependency"](e, ref);
    this["~propagateResolutionChain"](ref, e);

    return await this.resolve(e);
  }

  dispose(): Promised<void> {
    return Promised.create((async () => {
      const extensionDisposeEvents = this.extensions.map(
        (ext) => ext.disposePod?.(this) ?? Promise.resolve()
      );
      await Promise.all(extensionDisposeEvents);
    
      await super.dispose();
    })());
  }

}

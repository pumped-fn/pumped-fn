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
  Meta,
  ExecutorResolutionError, 
  FactoryExecutionError, 
  DependencyResolutionError 
} from "./types";
import {
  isGenerator,
  isAsyncGenerator,
  collectFromGenerator,
} from "./generator-utils";
import {
  ErrorCodes,
  createFactoryError,
  createDependencyError,
  createSystemError,
  getExecutorName,
  buildDependencyChain,
} from "./error-codes";

type CacheEntry = {
  accessor: Core.Accessor<unknown>;
  value: Core.ResolveState<unknown>;
};

type UE = Core.Executor<unknown>;
type OnUpdateFn = (accessor: Core.Accessor<unknown>) => void | Promise<void>;

class AccessorImpl implements Core.Accessor<unknown> {
  public metas: Meta.Meta[] | undefined;
  private scope: BaseScope;
  private requestor: UE;
  private currentPromise: Promise<unknown> | null = null;
  public resolve: (force?: boolean) => Promise<unknown>;

  constructor(scope: BaseScope, requestor: UE, metas: Meta.Meta[] | undefined) {
    this.scope = scope;
    this.requestor = requestor;
    this.metas = metas;
    
    // Create bound resolve function to maintain promise identity
    this.resolve = this.createResolveFunction();
    
    // Cache this accessor immediately
    const existing = this.scope['cache'].get(requestor);
    if (!existing || !existing.accessor) {
      this.scope['cache'].set(requestor, {
        accessor: this,
        value: existing?.value || undefined as any
      });
    }
  }

  private createResolveFunction() {
    return (force: boolean = false): Promise<unknown> => {
      this.scope["~ensureNotDisposed"]();

      const entry = this.scope['cache'].get(this.requestor);
      const cached = entry?.value;

      if (cached && !force) {
        if (cached.kind === "resolved") {
          return Promise.resolve(cached.value);
        } else if (cached.kind === "rejected") {
          throw cached.error;
        } else {
          return cached.promise;
        }
      }

      if (this.currentPromise && !force) {
        return this.currentPromise;
      }

      this.currentPromise = new Promise((resolve, reject) => {
        const replacer = this.scope['initialValues'].find(
          (item) => item.executor === this.requestor
        );

        let factory = this.requestor.factory;
        let dependencies = this.requestor.dependencies;
        if (replacer) {
          const value = replacer.value;

          if (!isExecutor(value)) {
            return setTimeout(() => {
              this.scope['cache'].set(this.requestor, {
                accessor: this,
                value: { kind: "resolved", value: replacer.value },
              });
              resolve(replacer.value);
            }, 0);
          }

          factory = value.factory as any;
          dependencies = value.dependencies;
        }

        const controller = this.createController();

        this.scope["~resolveDependencies"](dependencies, this.requestor)
          .then((dependencies) => {
            try {
              const factoryResult = factory(dependencies as any, controller);
              
              if (factoryResult instanceof Promise) {
                return factoryResult.catch((asyncError) => {
                  const executorName = getExecutorName(this.requestor);
                  const dependencyChain = [executorName];
                  
                  const factoryError = createFactoryError(
                    ErrorCodes.FACTORY_ASYNC_ERROR,
                    executorName,
                    dependencyChain,
                    asyncError,
                    {
                      dependenciesResolved: dependencies !== undefined,
                      factoryType: typeof factory,
                      isAsyncFactory: true,
                    }
                  );
                  
                  throw factoryError;
                });
              }
              
              return factoryResult;
            } catch (error) {
              const executorName = getExecutorName(this.requestor);
              const dependencyChain = [executorName];
              
              const factoryError = createFactoryError(
                ErrorCodes.FACTORY_THREW_ERROR,
                executorName,
                dependencyChain,
                error,
                {
                  dependenciesResolved: dependencies !== undefined,
                  factoryType: typeof factory,
                  isAsyncFactory: false,
                }
              );
              
              throw factoryError;
            }
          })
          .then(async (result) => {
            let current = result;

            if (isGenerator(result) || isAsyncGenerator(result)) {
              try {
                const { returned } = await collectFromGenerator(result);
                current = returned;
              } catch (generatorError) {
                const executorName = getExecutorName(this.requestor);
                const dependencyChain = [executorName];
                
                const factoryError = createFactoryError(
                  ErrorCodes.FACTORY_GENERATOR_ERROR,
                  executorName,
                  dependencyChain,
                  generatorError,
                  {
                    generatorType: isGenerator(result) ? 'sync' : 'async',
                    factoryType: typeof factory,
                  }
                );
                
                throw factoryError;
              }
            }

            const events = this.scope['onEvents'].change;
            for (const event of events) {
              const updated = await event("resolve", this.requestor, current, this.scope);
              if (updated !== undefined && updated.executor === this.requestor) {
                current = updated.value;
              }
            }

            this.scope['cache'].set(this.requestor, {
              accessor: this,
              value: { kind: "resolved", value: current },
            });

            this.currentPromise = null;
            resolve(current);
          })
          .catch((error) => {
            let enhancedError = error;
            let errorContext = undefined;
            
            if (error?.context && error?.code) {
              enhancedError = error;
              errorContext = error.context;
            } else {
              const executorName = getExecutorName(this.requestor);
              const dependencyChain = [executorName];
              
              enhancedError = createSystemError(
                ErrorCodes.INTERNAL_RESOLUTION_ERROR,
                executorName,
                dependencyChain,
                error,
                {
                  errorType: error?.constructor?.name || 'UnknownError',
                  resolutionPhase: 'post-factory',
                }
              );
              errorContext = enhancedError.context;
            }

            this.scope['cache'].set(this.requestor, {
              accessor: this,
              value: { 
                kind: "rejected", 
                error,
                context: errorContext,
                enhancedError: enhancedError
              },
            });

            this.scope["~triggerError"](enhancedError, this.requestor);
            this.currentPromise = null;
            reject(enhancedError);
          });
      });

      this.scope['cache'].set(this.requestor, {
        accessor: this,
        value: { kind: "pending", promise: this.currentPromise },
      });

      return this.currentPromise;
    };
  }

  lookup(): undefined | Core.ResolveState<unknown> {
    this.scope["~ensureNotDisposed"]();
    const cacheEntry = this.scope['cache'].get(this.requestor);
    if (!cacheEntry) {
      return undefined;
    }
    return cacheEntry.value || undefined;
  }

  get(): unknown {
    this.scope["~ensureNotDisposed"]();
    const cacheEntry = this.scope['cache'].get(this.requestor)?.value;

    if (!cacheEntry || cacheEntry.kind === "pending") {
      throw new Error("Executor is not resolved");
    }

    if (cacheEntry.kind === "rejected") {
      throw cacheEntry.enhancedError || cacheEntry.error;
    }

    return cacheEntry.value;
  }


  async release(soft: boolean = false): Promise<void> {
    this.scope.release(this.requestor, soft);
  }

  async update(updateFn: unknown | ((current: unknown) => unknown)): Promise<void> {
    return this.scope.update(this.requestor, updateFn);
  }

  async set(value: unknown): Promise<void> {
    return this.scope.update(this.requestor, value);
  }

  subscribe(cb: (value: unknown) => void): Core.Cleanup {
    this.scope["~ensureNotDisposed"]();
    return this.scope.onUpdate(this.requestor, cb);
  }

  private createController(): Core.Controller {
    return {
      cleanup: (cleanup: Core.Cleanup) => {
        const currentSet = this.scope['cleanups'].get(this.requestor) ?? new Set();
        this.scope['cleanups'].set(this.requestor, currentSet);
        currentSet.add(cleanup);
      },
      release: async () => this.scope.release(this.requestor),
      reload: async () => {
        await this.scope.resolve(this.requestor, true);
      },
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
  protected cleanups = new Map<UE, Set<Core.Cleanup>>();
  protected onUpdates = new Map<UE, Set<OnUpdateFn | UE>>();
  protected onEvents = {
    change: new Set<Core.ChangeCallback>(),
    release: new Set<Core.ReleaseCallback>(),
    error: new Set<Core.GlobalErrorCallback>(),
  } as const;
  protected onErrors = new Map<UE, Set<Core.ErrorCallback<unknown>>>();
  protected isPod: boolean;
  private isDisposing = false;

  protected plugins: Core.Plugin[] = [];
  protected registry: Core.Executor<unknown>[] = [];
  protected initialValues: Core.Preset<unknown>[] = [];

  constructor(options?: ScopeOption) {
    this.isPod = options?.pod || false;
    if (options?.registry) {
      this.registry = [...options.registry];
    }

    if (options?.initialValues) {
      this.initialValues = options.initialValues;
    }

    if (options?.plugins) {
      for (const plugin of options.plugins) {
        this.use(plugin);
      }
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

    const ou = this.onUpdates.get(e);
    if (ou) {
      for (const t of Array.from(ou.values())) {
        if (isMainExecutor(t)) {
          if (this.cleanups.has(t)) {
            this["~triggerCleanup"](t);
          }

          const a = this.cache.get(t);
          await a!.accessor.resolve(true);

          if (this.onUpdates.has(t)) {
            await this["~triggerUpdate"](t);
          }
        } else {
          await t(ce.accessor);
        }
      }
    }
  }

  protected async "~triggerError"(
    error: ExecutorResolutionError | FactoryExecutionError | DependencyResolutionError,
    executor: UE
  ): Promise<void> {
    // Trigger per-executor error callbacks
    const executorCallbacks = this.onErrors.get(executor);
    if (executorCallbacks) {
      for (const callback of Array.from(executorCallbacks.values())) {
        try {
          await callback(error, executor, this);
        } catch (callbackError) {
          // Don't let callback errors break the error handling flow
          console.error('Error in error callback:', callbackError);
        }
      }
    }

    // Trigger global error callbacks
    for (const callback of Array.from(this.onEvents.error.values())) {
      try {
        await callback(error, executor, this);
      } catch (callbackError) {
        // Don't let callback errors break the error handling flow
        console.error('Error in global error callback:', callbackError);
      }
    }

    // Trigger plugin error handlers
    for (const plugin of this.plugins) {
      if (plugin.onError) {
        try {
          await plugin.onError(error, executor, this);
        } catch (pluginError) {
          // Don't let plugin errors break the error handling flow
          console.error('Error in plugin error handler:', pluginError);
        }
      }
    }
  }

  protected async "~resolveExecutor"(
    ie: Core.UExecutor,
    ref: UE
  ): Promise<unknown> {
    const e = getExecutor(ie);
    const a = this["~makeAccessor"](e);

    if (isLazyExecutor(ie)) {
      return a;
    }

    if (isReactiveExecutor(ie)) {
      const c = this.onUpdates.get(ie.executor) ?? new Set();
      this.onUpdates.set(ie.executor, c);
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

    const r: Record<string, unknown> = {};
    for (const k of Object.keys(ie)) {
      const t = ie[k];
      const rd = await this["~resolveDependencies"](t, ref);

      r[k] = rd;
    }

    return r;
  }

  protected "~ensureNotDisposed"(): void {
    if (this.disposed) {
      throw new Error("Scope is disposed");
    }
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

  async resolve<T>(
    executor: Core.Executor<T>,
    force: boolean = false
  ): Promise<T> {
    this["~ensureNotDisposed"]();

    const accessor = this["~makeAccessor"](executor);
    await accessor.resolve(force);
    return accessor.get() as T;
  }

  async resolveAccessor<T>(
    executor: Core.Executor<T>,
    force: boolean = false
  ): Promise<Core.Accessor<T>> {
    this["~ensureNotDisposed"]();
    const accessor = this["~makeAccessor"](executor);
    await accessor.resolve(force);
    return accessor as Core.Accessor<T>;
  }

  async update<T>(
    e: Core.Executor<T>,
    u: T | ((current: T) => T)
  ): Promise<void> {
    if (this.isDisposing) {
      return;
    }

    this["~ensureNotDisposed"]();
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
        value = updated.value as any;
      }
    }

    this.cache.set(e, {
      accessor,
      value: { kind: "resolved", value },
    });

    await this["~triggerUpdate"](e);
  }

  async set<T>(e: Core.Executor<T>, value: T): Promise<void> {
    return this.update(e, value);
  }

  async release(e: Core.Executor<unknown>, s: boolean = false): Promise<void> {
    this["~ensureNotDisposed"]();

    const ce = this.cache.get(e);
    if (!ce && !s) {
      throw new Error("Executor is not yet resolved");
    }

    await this["~triggerCleanup"](e);
    const events = this.onEvents.release;
    for (const event of events) {
      await event("release", e, this);
    }

    const ou = this.onUpdates.get(e);
    if (ou) {
      for (const t of Array.from(ou.values())) {
        if (isMainExecutor(t)) {
          await this.release(t, true);
        }
      }

      this.onUpdates.delete(e);
    }

    this.cache.delete(e);
  }

  async dispose(): Promise<void> {
    this["~ensureNotDisposed"]();
    this.isDisposing = true;

    for (const pod of this.pods) {
      await this.disposePod(pod);
    }

    const disposeEvents = this.plugins.map(
      (m) => m.dispose?.(this) ?? Promise.resolve()
    );
    await Promise.all(disposeEvents);

    const currents = this.cache.keys();
    for (const current of currents) {
      await this.release(current, true);
    }

    this.disposed = true;
    this.cache.clear();
    this.cleanups.clear();
    this.onUpdates.clear();
    this.onEvents.change.clear();
    this.onEvents.release.clear();
    this.onEvents.error.clear();
    this.onErrors.clear();
  }

  onUpdate<T>(
    e: Core.Executor<T>,
    cb: (a: Core.Accessor<T>) => void | Promise<void>
  ): Core.Cleanup {
    this["~ensureNotDisposed"]();
    if (this.isDisposing) {
      throw new Error("Cannot register update callback on a disposing scope");
    }

    const ou = this.onUpdates.get(e) ?? new Set();
    this.onUpdates.set(e, ou);
    ou.add(cb as any);

    return () => {
      this["~ensureNotDisposed"]();

      const ou = this.onUpdates.get(e);
      if (ou) {
        ou.delete(cb as any);
        if (ou.size === 0) {
          this.onUpdates.delete(e);
        }
      }
    };
  }

  onChange(callback: Core.ChangeCallback): Core.Cleanup {
    this["~ensureNotDisposed"]();
    if (this.isDisposing) {
      throw new Error("Cannot register update callback on a disposing scope");
    }

    this.onEvents["change"].add(callback as any);
    return () => {
      this["~ensureNotDisposed"]();
      this.onEvents["change"].delete(callback as any);
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

  onError<T>(executor: Core.Executor<T>, callback: Core.ErrorCallback<T>): Core.Cleanup;
  onError(callback: Core.GlobalErrorCallback): Core.Cleanup;
  onError<T>(
    executorOrCallback: Core.Executor<T> | Core.GlobalErrorCallback,
    callback?: Core.ErrorCallback<T>
  ): Core.Cleanup {
    this["~ensureNotDisposed"]();
    if (this.isDisposing) {
      throw new Error("Cannot register error callback on a disposing scope");
    }

    // Global error handler
    if (typeof executorOrCallback === 'function') {
      this.onEvents["error"].add(executorOrCallback);
      return () => {
        this["~ensureNotDisposed"]();
        this.onEvents["error"].delete(executorOrCallback);
      };
    }

    // Per-executor error handler
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

  use(plugin: Core.Plugin): Core.Cleanup {
    this["~ensureNotDisposed"]();
    if (this.isDisposing) {
      throw new Error("Cannot register update callback on a disposing scope");
    }

    this.plugins.push(plugin);
    plugin.init?.(this, { registry: this.registry });

    return () => {
      this["~ensureNotDisposed"]();
      this.plugins = this.plugins.filter((m) => m !== plugin);
    };
  }

  private pods: Set<Core.Pod> = new Set();

  pod(...preset: Core.Preset<unknown>[]): Core.Pod {
    this["~ensureNotDisposed"]();
    if (this.isDisposing) {
      throw new Error("Cannot register update callback on a disposing scope");
    }

    const pod = new Pod(this, { initialValues: preset });
    this.pods.add(pod);
    return pod;
  }

  async disposePod(pod: Core.Pod): Promise<void> {
    this["~ensureNotDisposed"]();
    if (this.isDisposing) {
      return;
    }

    await pod.dispose();
    this.pods.delete(pod);
  }
}

export type ScopeOption = {
  pod?: boolean;
  initialValues?: Core.Preset<unknown>[];
  registry?: Core.Executor<unknown>[];
  plugins?: Core.Plugin[];
};

export function createScope(): Core.Scope;
export function createScope(opt: ScopeOption): Core.Scope;

/**
 * @deprecated
 *
 * Use the version with ScopeOption instead
 * @param presets
 */
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

export function plugin(m: Core.Plugin): Core.Plugin {
  return m;
}

class Pod extends BaseScope implements Core.Pod {
  private parentScope: BaseScope;

  constructor(scope: BaseScope, option?: ScopeOption) {
    super(option);
    this.parentScope = scope;
  }

  /**
   * Expect to resolve everything in pod. Unless it's already resolved in the main
   * @param executor
   * @param force
   * @returns
   */
  async resolve<T>(executor: Core.Executor<T>, force?: boolean): Promise<T> {
    if (this.cache.has(executor)) {
      return super.resolve(executor, force);
    }

    if (this.parentScope["cache"].has(executor)) {
      const { value } = this.parentScope["cache"].get(executor)!;
      const accessor = super["~makeAccessor"](executor);

      this["cache"].set(executor, {
        accessor,
        value,
      });

      if (value.kind === "rejected") {
        throw value.error;
      }

      if (value.kind === "resolved") {
        return value.value as T;
      }

      if (value.kind === "pending") {
        return (await value.promise) as T;
      }
    }

    return await super.resolve(executor, force);
  }

  protected async "~resolveExecutor"(
    ie: Core.UExecutor,
    ref: UE
  ): Promise<unknown> {
    if (isReactiveExecutor(ie)) {
      throw new Error("Reactive executors cannot be used in pod");
    }

    const t = getExecutor(ie);
    const a = this["~makeAccessor"](t);

    if (this.parentScope["cache"].has(t)) {
      const { value } = this.parentScope["cache"].get(t)!;
      this["cache"].set(t, {
        accessor: a,
        value,
      });
    }

    return await super["~resolveExecutor"](ie, ref);
  }
}

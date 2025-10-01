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
  Meta,
  ExecutorResolutionError,
  FactoryExecutionError,
  DependencyResolutionError,
  ErrorContext,
} from "./types";
import * as errors from "./error-codes";

type CacheEntry = {
  accessor: Core.Accessor<unknown>;
  value: Core.ResolveState<unknown>;
};

type UE = Core.Executor<unknown>;
type OnUpdateFn = (accessor: Core.Accessor<unknown>) => void | Promise<void>;

interface ReplacerResult {
  factory: Core.NoDependencyFn<unknown> | Core.DependentFn<unknown, unknown>;
  dependencies: undefined | Core.UExecutor | Core.UExecutor[] | Record<string, Core.UExecutor>;
  immediateValue?: unknown;
}

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

    this.resolve = this.createResolveFunction();

    const existing = this.scope["cache"].get(requestor);
    if (!existing || !existing.accessor) {
      this.scope["cache"].set(requestor, {
        accessor: this,
        value: existing?.value || (undefined as any),
      });
    }
  }

  private createResolveFunction() {
    return (force: boolean = false): Promise<unknown> => {
      this.scope["~ensureNotDisposed"]();

      const entry = this.scope["cache"].get(this.requestor);
      const cached = entry?.value;

      if (cached && !force) {
        return this.handleCachedState(cached);
      }

      if (this.currentPromise && !force) {
        return this.currentPromise;
      }

      this.scope["~addToResolutionChain"](this.requestor, this.requestor);

      this.currentPromise = (async () => {
        try {
          const { factory, dependencies, immediateValue } = this.processReplacer();

          if (immediateValue !== undefined) {
            await new Promise<void>(resolve => queueMicrotask(resolve));

            this.scope["cache"].set(this.requestor, {
              accessor: this,
              value: { kind: "resolved", value: immediateValue },
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
            value: { kind: "resolved", value: processedResult },
          });

          this.scope["~removeFromResolutionChain"](this.requestor);
          this.currentPromise = null;

          return processedResult;

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

          throw enhancedError;
        }
      })();

      this.scope["cache"].set(this.requestor, {
        accessor: this,
        value: { kind: "pending", promise: this.currentPromise },
      });

      return this.currentPromise;
    };
  }

  private handleCachedState(cached: Core.ResolveState<unknown>): Promise<unknown> | never {
    if (cached.kind === "resolved") {
      return Promise.resolve(cached.value);
    }

    if (cached.kind === "rejected") {
      throw cached.error;
    }

    return cached.promise;
  }

  private processReplacer(): ReplacerResult {
    const replacer = this.scope["initialValues"].find(
      (item) => item.executor === this.requestor
    );

    if (!replacer) {
      return {
        factory: this.requestor.factory!,
        dependencies: this.requestor.dependencies
      };
    }

    const value = replacer.value;

    if (!isExecutor(value)) {
      return {
        factory: this.requestor.factory!,
        dependencies: this.requestor.dependencies,
        immediateValue: value
      };
    }

    return {
      factory: value.factory!,
      dependencies: value.dependencies
    };
  }

  private async executeFactory(
    factory: Core.NoDependencyFn<unknown> | Core.DependentFn<unknown, unknown>,
    resolvedDependencies: unknown,
    controller: Core.Controller
  ): Promise<unknown> {
    try {
      const factoryResult = factory.length >= 2
        ? (factory as Core.DependentFn<unknown, unknown>)(resolvedDependencies, controller)
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
      typeof error === 'object' &&
      'context' in error &&
      'code' in error &&
      error.context &&
      error.code
    ) {
      return {
        enhancedError: error as ExecutorResolutionError,
        errorContext: error.context as ErrorContext,
        originalError: error
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
        hasOriginalContext: false
      }
    );

    return {
      enhancedError,
      errorContext: enhancedError.context,
      originalError: error
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

  async release(soft: boolean = false): Promise<void> {
    this.scope.release(this.requestor, soft);
  }

  async update(
    updateFn: unknown | ((current: unknown) => unknown)
  ): Promise<void> {
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
        const currentSet =
          this.scope["cleanups"].get(this.requestor) ?? new Set();
        this.scope["cleanups"].set(this.requestor, currentSet);
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
  protected cleanups: Map<UE, Set<Core.Cleanup>> = new Map<UE, Set<Core.Cleanup>>();
  protected onUpdates: Map<UE, Set<OnUpdateFn | UE>> = new Map<UE, Set<OnUpdateFn | UE>>();
  protected onEvents: {
    readonly change: Set<Core.ChangeCallback>;
    readonly release: Set<Core.ReleaseCallback>;
    readonly error: Set<Core.GlobalErrorCallback>;
  } = {
    change: new Set<Core.ChangeCallback>(),
    release: new Set<Core.ReleaseCallback>(),
    error: new Set<Core.GlobalErrorCallback>(),
  } as const;
  protected onErrors: Map<UE, Set<Core.ErrorCallback<unknown>>> = new Map<UE, Set<Core.ErrorCallback<unknown>>>();
  protected isPod: boolean;
  private isDisposing = false;

  private resolutionChain: Map<UE, Set<UE>> = new Map();

  protected extensions: Extension.Extension[] = [];
  protected registry: Core.Executor<unknown>[] = [];
  protected initialValues: Core.Preset<unknown>[] = [];
  public metas: Meta.Meta[] | undefined;

  constructor(options?: ScopeOption) {
    this.isPod = options?.pod || false;
    if (options?.registry) {
      this.registry = [...options.registry];
    }

    if (options?.initialValues) {
      this.initialValues = options.initialValues;
    }

    if (options?.extensions) {
      for (const extension of options.extensions) {
        this.useExtension(extension);
      }
    }

    if (options?.meta) {
      this.metas = options.meta;
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

  registeredExecutors(): Core.Executor<unknown>[] {
    this["~ensureNotDisposed"]();
    return [...this.registry];
  }

  async resolve<T>(
    executor: Core.Executor<T>,
    force: boolean = false
  ): Promise<T> {
    this["~ensureNotDisposed"]();

    const coreResolve = async (): Promise<T> => {
      const accessor = this["~makeAccessor"](executor);
      await accessor.resolve(force);
      return accessor.get() as T;
    };

    let resolver = coreResolve;

    for (const extension of [...this.extensions].reverse()) {
      if (extension.wrapResolve) {
        const currentResolver = resolver;
        resolver = () =>
          extension.wrapResolve!(currentResolver, {
            operation: "resolve",
            executor,
            scope: this,
          }) as any;
      }
    }

    return resolver();
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

    const coreUpdate = async (): Promise<void> => {
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
    };

    let updater = async (): Promise<T> => {
      await coreUpdate();
      return this.accessor(e).get() as T;
    };

    for (const extension of [...this.extensions].reverse()) {
      if (extension.wrapResolve) {
        const currentUpdater = updater;
        updater = () =>
          extension.wrapResolve!(currentUpdater, {
            operation: "update",
            executor: e,
            scope: this,
          }) as any;
      }
    }

    await updater();
  }

  async set<T>(e: Core.Executor<T>, value: T): Promise<void> {
    return this.update(e, value);
  }

  async release(e: Core.Executor<unknown>, s: boolean = false): Promise<void> {
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
    };

    return coreRelease();
  }

  async dispose(): Promise<void> {
    this["~ensureNotDisposed"]();
    this.isDisposing = true;

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
    this.onUpdates.clear();
    this.onEvents.change.clear();
    this.onEvents.release.clear();
    this.onEvents.error.clear();
    this.onErrors.clear();
    this.resolutionChain.clear();
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
    extension.init?.(this);

    return () => {
      this["~ensureNotDisposed"]();
      this.extensions = this.extensions.filter((e) => e !== extension);
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
  extensions?: Extension.Extension[];
  meta?: Meta.Meta[];
};

export type PodOption = {
  initialValues?: Core.Preset<unknown>[];
  extensions?: Extension.Extension[];
  meta?: Meta.Meta[];
  parentPod?: Pod;
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
  private parentPod?: Pod;
  private childPods: Set<Pod> = new Set();

  constructor(scope: BaseScope, option?: PodOption) {
    const actualParentScope = option?.parentPod || scope;

    super({
      pod: true,
      initialValues: option?.initialValues,
      extensions: option?.extensions
        ? [...(actualParentScope["extensions"] || []), ...option.extensions]
        : [...(actualParentScope["extensions"] || [])],
      meta: option?.meta,
    });
    this.parentScope = scope;
    this.parentPod = option?.parentPod;
  }

  pod(...preset: Core.Preset<unknown>[]): Core.Pod;
  pod(options: PodOption): Core.Pod;
  pod(...args: Core.Preset<unknown>[] | [PodOption]): Core.Pod {
    this["~ensureNotDisposed"]();

    let podOptions: PodOption;
    if (args.length === 1 && !isPreset(args[0])) {
      podOptions = args[0] as PodOption;
    } else {
      podOptions = { initialValues: args as Core.Preset<unknown>[] };
    }

    const childPod = new Pod(this.parentScope, {
      ...podOptions,
      parentPod: this
    });

    this.childPods.add(childPod);
    return childPod;
  }

  async resolve<T>(executor: Core.Executor<T>, force?: boolean): Promise<T> {
    if (this.cache.has(executor)) {
      return super.resolve(executor, force);
    }

    const replacer = this.initialValues.find(
      (item) => item.executor === executor
    );

    if (replacer) {
      return await super.resolve(executor, force);
    }

    if (this["~hasDependencyWithPreset"](executor)) {
      return await super.resolve(executor, force);
    }

    let currentParent = this.parentPod;
    while (currentParent) {
      if (currentParent["cache"].has(executor)) {
        const { value } = currentParent["cache"].get(executor)!;
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
      currentParent = currentParent.parentPod;
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
    } else if (typeof deps === "object" && deps !== null) {
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

    const t = getExecutor(ie);

    this["~checkCircularDependency"](t, ref);

    this["~propagateResolutionChain"](ref, t);

    const a = this["~makeAccessor"](t);

    const replacer = this.initialValues.find((item) => item.executor === t);

    if (!replacer && this.parentScope["cache"].has(t)) {
      const { value } = this.parentScope["cache"].get(t)!;
      this["cache"].set(t, {
        accessor: a,
        value,
      });
    }

    return await super["~resolveExecutor"](ie, ref);
  }

  async dispose(): Promise<void> {
    for (const childPod of this.childPods) {
      await childPod.dispose();
    }
    this.childPods.clear();

    if (this.parentPod) {
      this.parentPod.childPods.delete(this);
    }

    const extensionDisposeEvents = this.extensions.map(
      (ext) => ext.disposePod?.(this) ?? Promise.resolve()
    );
    await Promise.all(extensionDisposeEvents);

    await super.dispose();
  }

  getDepth(): number {
    let depth = 0;
    let current = this.parentPod;
    while (current) {
      depth++;
      current = current.parentPod;
    }
    return depth;
  }

  getRootPod(): Pod {
    let current: Pod = this;
    while (current.parentPod) {
      current = current.parentPod;
    }
    return current;
  }
}

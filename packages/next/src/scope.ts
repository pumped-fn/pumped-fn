import {
  isLazyExecutor,
  isReactiveExecutor,
  isStaticExecutor,
} from "./executor";
import { Core, executorSymbol } from "./types";

export interface ScopeInner {
  "~findAffectedTargets"(
    target: Core.Executor<unknown>,
    updateSet?: Set<Core.Executor<unknown>>
  ): Set<Core.Executor<unknown>>;

  "~resolveDependencies"(
    e:
      | undefined
      | Core.BaseExecutor<unknown>
      | Core.BaseExecutor<unknown>[]
      | Record<string, Core.BaseExecutor<unknown>>,
    ref: Core.Executor<unknown>
  ): Promise<undefined | unknown | unknown[] | Record<string, unknown>>;

  getCache(): Map<Core.Executor<unknown>, Core.Accessor<unknown>>;
  getValueCache(): Map<Core.Executor<unknown>, unknown>;
  getReactiveness(): Map<Core.Executor<unknown>, Set<Core.Executor<unknown>>>;
}

export function isExecutor<T>(input: unknown): input is Core.BaseExecutor<T> {
  return typeof input === "object" && input !== null && executorSymbol in input;
}

type Value =
  | { kind: "resolving"; promise: Promise<unknown> }
  | { kind: "resolved"; value: unknown }
  | { kind: "rejected"; error: unknown };

class Scope implements Core.Scope, ScopeInner {
  private isDisposed: boolean = false;
  private cache: Map<Core.Executor<unknown>, Core.Accessor<unknown>> =
    new Map();
  private valueCache: Map<Core.Executor<unknown>, Value> = new Map();
  private reactiveness = new Map<
    Core.Executor<unknown>,
    Set<Core.Executor<unknown>>
  >();
  private cleanups = new Map<Core.Executor<unknown>, Set<Core.Cleanup>>();
  private onUpdates = new Map<
    Core.Executor<unknown>,
    Set<(accessor: Core.Accessor<unknown>) => void | Promise<void>>
  >();

  private "~appendReactive"(
    reactive: Core.Executor<unknown>,
    ref: Core.Executor<unknown>
  ) {
    const currentSet = this.reactiveness.get(reactive) ?? new Set();
    this.reactiveness.set(reactive, currentSet);

    currentSet.add(ref);
  }

  async "~resolveDependencies"(
    e:
      | undefined
      | Core.BaseExecutor<unknown>
      | Core.BaseExecutor<unknown>[]
      | Record<string, Core.BaseExecutor<unknown>>,
    ref: Core.Executor<unknown>
  ): Promise<undefined | unknown | unknown[] | Record<string, unknown>> {
    if (e === undefined) {
      return undefined;
    }

    if (isExecutor(e)) {
      if (isLazyExecutor(e)) {
        return this["~resolveLazy"](e);
      }

      const staticResult = await this["~resolveStatic"](
        e as Core.Executor<unknown>
      );

      if (isReactiveExecutor(e)) {
        this["~appendReactive"](e.executor, ref);
      }

      await staticResult.resolve(false);
      if (isStaticExecutor(e)) {
        return staticResult;
      }

      return staticResult.get();
    }

    if (Array.isArray(e)) {
      return await Promise.all(
        e.map((item) => this["~resolveDependencies"](item, ref))
      );
    }

    const result: Record<string, unknown> = {};
    for (const key of Object.keys(e)) {
      const target = e[key];
      const resolvedResult = await this["~resolveDependencies"](target, ref);

      result[key] = resolvedResult;
    }

    return result;
  }

  private "~resolveLazy"(e: Core.Lazy<unknown>): Core.Accessor<unknown> {
    if (this.isDisposed) {
      throw new Error("Scope is disposed");
    }

    const cached = this.cache.get(e.executor);
    if (cached) {
      return cached;
    }

    const accessor = this["~makeAccessor"](e.executor);

    return accessor;
  }

  private async "~resolveStatic"(
    e: Core.Executor<unknown>
  ): Promise<Core.Accessor<unknown>> {
    const cached = this.cache.get(e);
    if (cached) {
      return cached;
    }

    const accessor = this["~makeAccessor"](e, true);
    return accessor;
  }

  private "~makeController"(e: Core.Executor<unknown>): Core.Controller {
    return {
      cleanup: (cleanup: Core.Cleanup) => {
        const currentSet = this.cleanups.get(e) ?? new Set();
        this.cleanups.set(e, currentSet);

        currentSet.add(cleanup);
      },
      release: async () => {
        this.release(e);
      },
      scope: this,
    };
  }

  private "~makeAccessor"(
    e: Core.BaseExecutor<unknown>,
    eager: boolean = false
  ): Core.Accessor<unknown> {
    const accessor = {} as Core.Accessor<unknown>;
    const requestor =
      isLazyExecutor(e) || isReactiveExecutor(e) || isStaticExecutor(e)
        ? e.executor
        : (e as Core.Executor<unknown>);

    const cachedAccessor = this.cache.get(requestor);
    if (cachedAccessor) {
      return cachedAccessor;
    }

    const factory = requestor.factory;
    const controller = this["~makeController"](requestor);

    const resolve = async (force: boolean): Promise<unknown> => {
      if (this.isDisposed) {
        throw new Error("Scope is disposed");
      }

      const cached = this.valueCache.get(requestor);
      if (cached && !force) {
        if (cached.kind === "resolved") {
          return cached.value;
        } else if (cached.kind === "rejected") {
          throw cached.error;
        } else {
          return cached.promise;
        }
      }

      const promise = new Promise((resolve, reject) => {
        this["~resolveDependencies"](requestor.dependencies, requestor)
          .then((dependencies) => factory(dependencies as any, controller))
          .then((result) => {
            this.valueCache.set(requestor, { kind: "resolved", value: result });
            resolve(result);
          })
          .catch((error) => {
            this.valueCache.set(requestor, { kind: "rejected", error });
            reject(error);
          });
      });

      this.valueCache.set(requestor, { kind: "resolving", promise });
      this.cache.set(requestor, accessor);
      return promise;
    };

    if (!isLazyExecutor(e) || eager) {
      resolve(false);
    }

    return Object.assign(accessor, {
      get: () => {
        if (this.isDisposed) {
          throw new Error("Scope is disposed");
        }

        const valueCached = this.valueCache.get(requestor);

        if (!valueCached || valueCached.kind === "resolving") {
          throw new Error("Executor not found");
        }

        if (valueCached.kind === "rejected") {
          throw valueCached.error;
        }

        return valueCached.value;
      },
      lookup: () => {
        if (this.isDisposed) {
          throw new Error("Scope is disposed");
        }

        return this.valueCache.get(requestor);
      },
      metas: e.metas,
      resolve,
      release: async (soft: boolean = false) => {
        this.release(requestor, soft);
      },
      update: (updateFn: unknown | ((current: unknown) => unknown)) => {
        return this.update(requestor, updateFn);
      },
    } satisfies Partial<Core.Accessor<unknown>>);
  }

  accessor<T>(executor: Core.Executor<T>): Core.Accessor<T> {
    if (this.isDisposed) {
      throw new Error("Scope is disposed");
    }

    return this["~makeAccessor"](executor, false) as Core.Accessor<T>;
  }

  async resolve<T>(executor: Core.Executor<T>): Promise<T> {
    if (this.isDisposed) {
      throw new Error("Scope is disposed");
    }

    const cached = this.valueCache.get(executor);
    if (cached) {
      if (cached.kind === "resolved") {
        return cached.value as T;
      } else if (cached.kind === "rejected") {
        throw cached.error;
      } else {
        return (await cached.promise) as T;
      }
    }

    const accessor = this["~makeAccessor"](executor, true);
    await accessor.resolve(false);

    return accessor.get() as T;
  }

  async resolveAccessor<T>(
    executor: Core.Executor<T>
  ): Promise<Core.Accessor<T>> {
    if (this.isDisposed) {
      throw new Error("Scope is disposed");
    }

    const cachedAccessor = this.cache.get(executor);
    if (!cachedAccessor) {
      const accessor = this["~makeAccessor"](executor, true);
      await accessor.resolve();

      return accessor as Core.Accessor<T>;
    }

    await cachedAccessor.resolve();
    return cachedAccessor as Core.Accessor<T>;
  }

  "~findAffectedTargets"(
    target: Core.Executor<unknown>,
    updateSet: Set<Core.Executor<unknown>> = new Set()
  ): Set<Core.Executor<unknown>> {
    const triggerTargets = this.reactiveness.get(target);

    if (triggerTargets && triggerTargets.size > 0) {
      for (const target of triggerTargets) {
        if (updateSet.has(target)) {
          updateSet.delete(target);
        }
        updateSet.add(target);

        if (this.reactiveness.has(target)) {
          this["~findAffectedTargets"](target, updateSet);
        }
      }
    }

    return updateSet;
  }

  async update<T>(
    executor: Core.Executor<T>,
    updateFn: T | ((current: T) => T)
  ): Promise<void> {
    if (this.isDisposed) {
      throw new Error("Scope is disposed");
    }

    const cached = this.cache.get(executor);
    if (!cached) {
      throw new Error("Executor is not yet resolved");
    }

    const current = (await cached.resolve(false)) as T;
    const cleanups = this.cleanups.get(executor);
    if (cleanups) {
      for (const cleanup of Array.from(cleanups.values()).reverse()) {
        await cleanup();
      }
    }

    if (typeof updateFn === "function") {
      const fn = updateFn as (current: T) => T;
      const newValue = fn(current);
      this.valueCache.set(executor, { kind: "resolved", value: newValue });
    } else {
      this.valueCache.set(executor, {
        kind: "resolved",
        value: updateFn,
      });
    }

    const onUpdateSet = this.onUpdates.get(executor);
    if (onUpdateSet) {
      for (const callback of Array.from(onUpdateSet.values())) {
        await callback(cached);
      }
    }

    const updateSet = this["~findAffectedTargets"](executor);
    for (const target of updateSet) {
      const cached = this.cache.get(target);

      if (cached) {
        const cleanups = this.cleanups.get(target);
        if (cleanups) {
          for (const cleanup of Array.from(cleanups.values()).reverse()) {
            await cleanup();
          }
        }

        await cached.resolve(true);

        const onUpdateSet = this.onUpdates.get(target);
        if (onUpdateSet) {
          for (const callback of Array.from(onUpdateSet.values())) {
            await callback(cached);
          }
        }
      }
    }
  }

  async reset<T>(executor: Core.Executor<T>): Promise<void> {
    if (this.isDisposed) {
      throw new Error("Scope is disposed");
    }

    await this.release(executor, true);
    await this.resolve(executor);
  }

  async release(
    executor: Core.Executor<any>,
    soft: boolean = false
  ): Promise<void> {
    if (this.isDisposed) {
      throw new Error("Scope is disposed");
    }

    const cached = this.cache.get(executor);
    if (!cached && !soft) {
      throw new Error("Executor is not yet resolved");
    }

    const affectedTargets = this["~findAffectedTargets"](executor);
    for (const target of affectedTargets) {
      await this.release(target, true);
    }

    const cleanups = this.cleanups.get(executor);
    if (cleanups) {
      for (const cleanup of Array.from(cleanups.values()).reverse()) {
        await cleanup();
      }
    }

    this.cache.delete(executor);
    this.valueCache.delete(executor);
    this.reactiveness.delete(executor);
    this.onUpdates.delete(executor);
  }

  async dispose(): Promise<void> {
    const currents = this.cache.keys();
    for (const current of currents) {
      await this.release(current, true);
    }

    this.isDisposed = true;
    this.cache.clear();
    this.valueCache.clear();
    this.reactiveness.clear();
    this.cleanups.clear();
  }

  onUpdate<T>(
    executor: Core.Executor<T>,
    callback: (accessor: Core.Accessor<T>) => void | Promise<void>
  ): Core.Cleanup {
    if (this.isDisposed) {
      throw new Error("scope is disposed");
    }

    const onUpdateSet = this.onUpdates.get(executor) ?? new Set();
    this.onUpdates.set(executor, onUpdateSet);
    onUpdateSet.add(callback as any);

    return () => {
      if (this.isDisposed) {
        throw new Error("scope is disposed");
      }

      const currentSet = this.onUpdates.get(executor);
      if (currentSet) {
        currentSet.delete(callback as any);
        if (currentSet.size === 0) {
          this.onUpdates.delete(executor);
        }
      }
    };
  }

  getCache(): Map<Core.Executor<unknown>, Core.Accessor<unknown>> {
    return this.cache;
  }

  getValueCache(): Map<Core.Executor<unknown>, unknown> {
    return this.valueCache;
  }

  getReactiveness(): Map<Core.Executor<unknown>, Set<Core.Executor<unknown>>> {
    return this.reactiveness;
  }
}

export function createScope(): Core.Scope {
  return new Scope();
}

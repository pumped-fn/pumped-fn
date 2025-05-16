import {
  isLazyExecutor,
  isReactiveExecutor,
  isStaticExecutor,
  isExecutor,
} from "./executor";
import { Core } from "./types";

export interface ScopeInner {
  "~findAffectedTargets"(target: UE, updateSet?: Set<UE>): Set<UE>;

  "~resolveDependencies"(
    e:
      | undefined
      | Core.BaseExecutor<unknown>
      | Core.BaseExecutor<unknown>[]
      | Record<string, Core.BaseExecutor<unknown>>,
    ref: UE
  ): Promise<undefined | unknown | unknown[] | Record<string, unknown>>;

  getCache(): Map<UE, CacheEntry>;
  getReactiveness(): Map<UE, Set<UE>>;
}

type Value =
  | { kind: "resolving"; promise: Promise<unknown> }
  | { kind: "resolved"; value: unknown }
  | { kind: "rejected"; error: unknown };

type CacheEntry = {
  accessor: Core.Accessor<unknown>;
  value: Value | undefined;
};

type UE = Core.Executor<unknown>;

class Scope implements Core.Scope, ScopeInner {
  private isDisposed: boolean = false;

  private cache: Map<UE, CacheEntry> = new Map();

  private reactiveness = new Map<UE, Set<UE>>();

  private cleanups = new Map<UE, Set<Core.Cleanup>>();
  private onUpdates = new Map<
    UE,
    Set<(accessor: Core.Accessor<unknown>) => void | Promise<void>>
  >();

  private "~appendReactive"(reactive: UE, ref: UE) {
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
    ref: UE
  ): Promise<undefined | unknown | unknown[] | Record<string, unknown>> {
    if (e === undefined) {
      return undefined;
    }

    if (isExecutor(e)) {
      if (isLazyExecutor(e)) {
        return this["~resolveLazy"](e);
      }

      const staticResult = await this["~resolveStatic"](e as UE);

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
      return cached.accessor;
    }

    const accessor = this["~makeAccessor"](e.executor);

    return accessor;
  }

  private async "~resolveStatic"(e: UE): Promise<Core.Accessor<unknown>> {
    const cached = this.cache.get(e);
    if (cached) {
      return cached.accessor;
    }

    const accessor = this["~makeAccessor"](e, true);
    return accessor;
  }

  private "~makeController"(e: UE): Core.Controller {
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
    const requestor =
      isLazyExecutor(e) || isReactiveExecutor(e) || isStaticExecutor(e)
        ? e.executor
        : (e as UE);

    const cachedAccessor = this.cache.get(requestor);
    if (cachedAccessor) {
      return cachedAccessor.accessor;
    }

    const accessor = {} as Core.Accessor<unknown>;
    const factory = requestor.factory;
    const controller = this["~makeController"](requestor);

    const resolve = (force: boolean): Promise<unknown> => {
      if (this.isDisposed) {
        throw new Error("Scope is disposed");
      }

      const entry = this.cache.get(requestor);
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

      const promise = new Promise((resolve, reject) => {
        this["~resolveDependencies"](requestor.dependencies, requestor)
          .then((dependencies) => factory(dependencies as any, controller))
          .then((result) => {
            this.cache.set(requestor, {
              accessor,
              value: { kind: "resolved", value: result },
            });

            resolve(result);
          })
          .catch((error) => {
            this.cache.set(requestor, {
              accessor,
              value: { kind: "rejected", error },
            });

            reject(error);
          });
      });

      this.cache.set(requestor, {
        accessor,
        value: { kind: "resolving", promise },
      });
      return promise;
    };

    this.cache.set(requestor, { accessor, value: undefined });

    if (!isLazyExecutor(e) || eager) {
      resolve(false);
    }

    return Object.assign(accessor, {
      get: () => {
        if (this.isDisposed) {
          throw new Error("Scope is disposed");
        }

        const valueCached = this.cache.get(requestor)?.value;

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

        return this.cache.get(requestor)?.value;
      },
      metas: e.metas,
      resolve,
      release: async (soft: boolean = false) => {
        this.release(requestor, soft);
      },
      update: (updateFn: unknown | ((current: unknown) => unknown)) => {
        return this.update(requestor, updateFn);
      },
      subscribe: (cb: (value: unknown) => void) => {
        if (this.isDisposed) {
          throw new Error("Scope is disposed");
        }

        return this.onUpdate(requestor, cb);
      },
    } satisfies Partial<Core.Accessor<unknown>>);
  }

  accessor<T>(executor: Core.Executor<T>): Core.Accessor<T> {
    if (this.isDisposed) {
      throw new Error("Scope is disposed");
    }

    return this["~makeAccessor"](executor, false) as Core.Accessor<T>;
  }

  async resolve<T>(
    executor: Core.Executor<T>,
    force: boolean = false
  ): Promise<T> {
    if (this.isDisposed) {
      throw new Error("Scope is disposed");
    }

    const accessor = this["~makeAccessor"](executor, true);
    await accessor.resolve(force);

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

    await cachedAccessor.accessor.resolve();

    return cachedAccessor.accessor as Core.Accessor<T>;
  }

  "~findAffectedTargets"(target: UE, updateSet: Set<UE> = new Set()): Set<UE> {
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

    const current = (await cached.accessor.resolve(false)) as T;
    const cleanups = this.cleanups.get(executor);
    if (cleanups) {
      for (const cleanup of Array.from(cleanups.values()).reverse()) {
        await cleanup();
      }
    }

    if (typeof updateFn === "function") {
      const fn = updateFn as (current: T) => T;
      const newValue = fn(current);
      this.cache.set(executor, {
        ...cached,
        value: { kind: "resolved", value: newValue },
      });
    } else {
      this.cache.set(executor, {
        ...cached,
        value: { kind: "resolved", value: updateFn },
      });
    }

    const onUpdateSet = this.onUpdates.get(executor);
    if (onUpdateSet) {
      for (const callback of Array.from(onUpdateSet.values())) {
        await callback(cached.accessor);
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

        await cached.accessor.resolve(true);

        const onUpdateSet = this.onUpdates.get(target);
        if (onUpdateSet) {
          for (const callback of Array.from(onUpdateSet.values())) {
            await callback(cached.accessor);
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
    await this.resolve(executor, true);
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

  getCache(): Map<UE, CacheEntry> {
    return this.cache;
  }

  getReactiveness(): Map<UE, Set<UE>> {
    return this.reactiveness;
  }
}

export function createScope(): Core.Scope {
  return new Scope();
}

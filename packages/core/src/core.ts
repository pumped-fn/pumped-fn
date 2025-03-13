import {
  Cleanup,
  Executor,
  executorSymbol,
  getAccessor,
  GetAccessor,
  InferOutput,
  isExecutor,
  MutableExecutor,
  Scope,
} from "./types";

export interface ScopeInner {
  getValues(): Map<Executor<unknown>, Container>;
  getDependencyMap(): Map<Executor<unknown>, Set<Executor<unknown>>>;
  getCleanups(): Map<Executor<unknown> | null, Cleanup>;
}

export const createScope = (): Scope => {
  return new BaseScope();
};

export const errors = {
  scopeDisposed: () => new Error("Scope is disposed"),
  unResolved: () => new Error("Executor is not resolved"),
  notMutableExecutor: () => new Error("Reference executor is not mutable"),
  executorIsBeingResolved: () => new Error("Executor is being resolved"),
};

type ResolvedContainer = { kind: "resolved"; value: unknown };
type PendingContainer = { kind: "pending"; promise: Promise<unknown> };
type UpdatingContainer = { kind: "updating"; promise: Promise<unknown>; value: unknown };

type Container = ResolvedContainer | PendingContainer | UpdatingContainer;

class BaseScope implements Scope, ScopeInner {
  #disposed = false;
  #values = new Map<Executor<unknown>, Container>();
  #dependencyMap = new Map<Executor<unknown>, Set<Executor<unknown>>>();
  #cleanups = new Map<Executor<unknown> | null, Cleanup>();
  #listeners = new Map<Executor<unknown>, Set<(value: unknown) => void>>();

  #ensureNotDisposed() {
    if (this.#disposed) {
      throw errors.scopeDisposed();
    }
  }

  #makeGetAccessor<T>(executor: Executor<T>): GetAccessor<T> {
    return getAccessor(() => {
      this.#ensureNotDisposed();

      const container = this.#values.get(executor);
      if (container === undefined) {
        throw errors.unResolved();
      }

      if (container.kind === "pending") {
        throw errors.unResolved();
      }

      return container.value as T;
    });
  }

  get isDisposed(): boolean {
    return this.#disposed;
  }

  get<T>(executor: Executor<T>): GetAccessor<T> | undefined {
    this.#ensureNotDisposed();

    const container = this.#values.get(executor);
    if (container === undefined) {
      return undefined;
    }

    if (container.kind === "resolved") {
      return this.#makeGetAccessor(executor as Executor<T>);
    }
  }

  async #resolveDependencyArray(dependencies: Executor<unknown>[], reactive = false): Promise<unknown[]> {
    const result: unknown[] = [];
    for (const dep of dependencies) {
      const value = (await this.resolve(dep)).get();
      result.push(reactive ? getAccessor(() => value) : value);
    }

    return result;
  }

  async #resolveDependencyObject(
    dependencies: Record<string, Executor<unknown>>,
    reactive = false,
  ): Promise<Record<string, unknown>> {
    const result = {} as Record<string, unknown>;
    for (const [key, dep] of Object.entries(dependencies)) {
      const value = (await this.resolve(dep)).get();
      result[key] = reactive ? getAccessor(() => value) : value;
    }

    return result;
  }

  async #resolveDependency(
    dependencies: Executor<unknown> | Executor<unknown>[] | Record<string, Executor<unknown>> | undefined,
    reactive = false,
  ): Promise<unknown[] | Record<string, unknown> | unknown | undefined> {
    if (!dependencies) return undefined;

    if (isExecutor(dependencies)) {
      const resolved = await this.resolve(dependencies);

      return reactive ? resolved : resolved.get();
    }

    return Array.isArray(dependencies)
      ? await this.#resolveDependencyArray(dependencies, reactive)
      : await this.#resolveDependencyObject(dependencies, reactive);
  }

  #trackDependencies(executor: Executor<unknown>): void {
    if (executor.dependencies === undefined) return;

    if (isExecutor(executor.dependencies)) {
      const currentSet = this.#dependencyMap.get(executor.dependencies);
      if (currentSet === undefined) {
        this.#dependencyMap.set(executor.dependencies, new Set([executor]));
      } else {
        currentSet.add(executor);
      }

      return;
    }

    for (const dependency of Object.values(executor.dependencies)) {
      const currentSet = this.#dependencyMap.get(dependency);
      if (currentSet === undefined) {
        this.#dependencyMap.set(dependency, new Set([executor]));
      } else {
        currentSet.add(executor);
      }
    }
  }

  async #evalute<T>(executor: Executor<T>): Promise<GetAccessor<Awaited<T>>> {
    this.#ensureNotDisposed();
    const container = this.#values.get(executor) || ({ kind: "pending", promise: null as unknown } as Container);

    const willResolve = new Promise(async (resolve, reject) => {
      try {
        const dependencies = await this.#resolveDependency(
          executor.dependencies,
          executor[executorSymbol].kind === "reactive",
        );

        if (
          executor[executorSymbol].kind !== "reactive" &&
          executor[executorSymbol].kind !== "reactive-resource" &&
          executor[executorSymbol].kind !== "reference"
        ) {
          this.#trackDependencies(executor);
        }

        const value = await executor.factory(dependencies, this);

        if (executor[executorSymbol].kind === "resource" || executor[executorSymbol].kind === "reactive-resource") {
          const [_, cleanup] = value as [unknown, Cleanup];
          this.#cleanups.set(executor, cleanup);
        } else if (executor[executorSymbol].kind === "effect") {
          this.#cleanups.set(executor, value as Cleanup);
        }

        if (executor[executorSymbol].kind === "resource") {
          const [resource] = value as [unknown, Cleanup];
          Object.assign(container, { kind: "resolved", value: resource });
        } else {
          Object.assign(container, { kind: "resolved", value });
        }

        this.#triggerEvent(executor, value);

        resolve(this.#makeGetAccessor(executor));
      } catch (error) {
        this.#values.delete(executor);
        reject(error);
      } finally {
        if (executor[executorSymbol].kind === "reference") {
          this.release(executor);
        }
      }
    });

    Object.assign(container, { promise: willResolve });
    this.#values.set(executor, container);

    return (await willResolve) as Promise<GetAccessor<Awaited<T>>>;
  }

  async #reevaluateDependencies(executor: Executor<unknown>): Promise<void> {
    const dependents = this.#dependencyMap.get(executor);

    if (dependents !== undefined) {
      for (const dependent of dependents) {
        const cleanup = this.#cleanups.get(dependent);
        if (cleanup !== undefined) {
          await cleanup();
        }

        await this.#evalute(dependent);
        await this.#reevaluateDependencies(dependent);
      }
    }
  }

  async resolve<T extends Executor<unknown>>(executor: T): Promise<GetAccessor<InferOutput<T>>> {
    this.#ensureNotDisposed();

    const container = this.#values.get(executor);
    if (container !== undefined) {
      if (container.kind === "resolved") {
        return this.#makeGetAccessor(executor) as GetAccessor<InferOutput<T>>;
      }

      return container.promise as Promise<GetAccessor<InferOutput<T>>>;
    }

    return this.#evalute(executor) as Promise<GetAccessor<InferOutput<T>>>;
  }

  async update<T>(executor: MutableExecutor<T>, updateFn: T | ((current: T) => T)): Promise<void> {
    this.#ensureNotDisposed();

    if (executor[executorSymbol].kind !== "mutable") {
      throw errors.notMutableExecutor();
    }

    let container = this.#values.get(executor);
    if (container === undefined) {
      await this.resolve(executor);
      container = this.#values.get(executor)!;
    }

    if (container.kind === "pending") {
      throw errors.executorIsBeingResolved();
    }

    if (container.kind === "updating") {
      await container.promise;
    }

    const currentCleanup = this.#cleanups.get(executor);
    if (currentCleanup !== undefined) {
      await currentCleanup();
    }

    const promise = Promise.resolve()
      .then(() => {
        const value = typeof updateFn === "function" ? (updateFn as (current: T) => T)(container.value as T) : updateFn;
        Object.assign(container, { kind: "resolved", value });

        return value;
      })
      .then(async (value) => {
        await this.#reevaluateDependencies(executor);
        this.#triggerEvent(executor, value as unknown);
      });

    Object.assign(container, { kind: "updating", promise, value: container.value });

    return await promise;
  }

  async reset<T>(executor: Executor<T>): Promise<void> {
    this.#ensureNotDisposed();
    const container = this.#values.get(executor);
    if (container === undefined) {
      throw errors.unResolved();
    }

    if (container.kind === "pending" || container.kind === "updating") {
      await container.promise;
    }

    const currentCleanup = this.#cleanups.get(executor);
    if (currentCleanup !== undefined) {
      await currentCleanup();
    }

    const promise = this.#evalute(executor)
      .then(async (value) => {
        await this.#reevaluateDependencies(executor);
        return value;
      })
      .then((value) => {
        Object.assign(container, { kind: "resolved", value });
        this.#triggerEvent(executor, value as unknown);
      });

    Object.assign(container, { kind: "updating", promise });

    return await promise;
  }

  async release(executor: Executor<any>, soft: boolean = false): Promise<void> {
    this.#ensureNotDisposed();

    const container = this.#values.get(executor);
    if (container === undefined) {
      if (soft) return;

      throw errors.unResolved();
    }

    if (container.kind === "pending" || container.kind === "updating") {
      await container.promise;
    }

    const currentCleanup = this.#cleanups.get(executor);
    if (currentCleanup !== undefined) {
      await currentCleanup();
    }

    this.#values.delete(executor);
    this.#cleanups.delete(executor);

    const dependents = this.#dependencyMap.get(executor);
    if (dependents !== undefined) {
      for (const dependent of dependents) {
        await this.release(dependent, soft);
      }
    }

    const dependencyEntries = this.#dependencyMap.entries();
    for (const [key, set] of dependencyEntries) {
      set.delete(executor);
      if (set.size === 0) {
        this.#dependencyMap.delete(key);
      }
    }

    this.#dependencyMap.delete(executor);
  }

  async dispose(): Promise<void> {
    this.#ensureNotDisposed();
    await Promise.all(
      Array.from(this.#values.keys())
        .reverse()
        .map((executor) => this.release(executor, true)),
    );

    this.#cleanups.clear();
    this.#listeners.clear();

    this.#values.clear();
    this.#dependencyMap.clear();

    queueMicrotask(() => {
      this.#disposed = true;
    });
  }

  #triggerEvent<T>(executor: Executor<T>, value: T) {
    const listeners = this.#listeners.get(executor);
    if (listeners !== undefined) {
      listeners.forEach((listener) => listener(value));
    }
  }

  on<T>(executor: Executor<T>, listener: (value: T) => void): Cleanup {
    this.#ensureNotDisposed();

    let listeners = this.#listeners.get(executor);
    if (listeners === undefined) {
      listeners = new Set();
      this.#listeners.set(executor, listeners);
    }

    listeners.add(listener as (value: unknown) => void);
    return () => {
      listeners?.delete(listener as (value: unknown) => void);
    };
  }

  once<T>(executor: Executor<T>): Promise<void> {
    this.#ensureNotDisposed();
    return new Promise((resolve) => {
      const cleanup = this.on(executor, () => {
        cleanup();
        resolve();
      });
    });
  }

  addCleanup(cleanup: Cleanup): Cleanup {
    this.#cleanups.set(null, cleanup);

    return () => {
      this.#cleanups.delete(null);
    };
  }

  /** SCOPE INNER */
  getValues(): Map<Executor<unknown>, Container> {
    return this.#values;
  }

  getDependencyMap(): Map<Executor<unknown>, Set<Executor<unknown>>> {
    return this.#dependencyMap;
  }

  getCleanups(): Map<Executor<unknown> | null, Cleanup> {
    return this.#cleanups;
  }
}

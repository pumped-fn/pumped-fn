import {
  isLazyExecutor,
  isReactiveExecutor,
  isStaticExecutor,
  isMainExecutor,
  isExecutor,
} from "./executor";
import { Core } from "./types";

type CacheEntry = {
  accessor: Core.Accessor<unknown>;
  value: Core.ResolveState<unknown>;
};

type UE = Core.Executor<unknown>;
type OnUpdateFn = (accessor: Core.Accessor<unknown>) => void | Promise<void>;

function getExecutor(e: Core.UExecutor): Core.Executor<unknown> {
  if (isLazyExecutor(e) || isReactiveExecutor(e) || isStaticExecutor(e)) {
    return e.executor;
  }

  return e as Core.Executor<unknown>;
}

class Scope implements Core.Scope {
  private disposed: boolean = false;
  private cache: Map<UE, CacheEntry> = new Map();
  private cleanups = new Map<UE, Set<Core.Cleanup>>();
  private onUpdates = new Map<UE, Set<OnUpdateFn | UE>>();

  constructor(...presets: Core.Preset<unknown>[]) {
    for (const preset of presets) {
      const accessor = this["~makeAccessor"](preset.executor);

      this.cache.set(preset.executor, {
        accessor,
        value: { kind: "resolved", value: preset.value },
      });
    }
  }

  private async "~triggerCleanup"(e: UE): Promise<void> {
    const cs = this.cleanups.get(e);
    if (cs) {
      for (const c of Array.from(cs.values()).reverse()) {
        await c();
      }
    }
  }

  private async "~triggerUpdate"(e: UE): Promise<void> {
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

  private async "~resolveExecutor"(
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

  private async "~resolveDependencies"(
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

  private "~ensureNotDisposed"(): void {
    if (this.disposed) {
      throw new Error("Scope is disposed");
    }
  }

  private "~makeAccessor"(e: Core.UExecutor): Core.Accessor<unknown> {
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
    const controller = {
      cleanup: (cleanup: Core.Cleanup) => {
        const currentSet = this.cleanups.get(requestor) ?? new Set();
        this.cleanups.set(requestor, currentSet);

        currentSet.add(cleanup);
      },
      release: async () => this.release(requestor),
      scope: this,
    };

    const resolve = (force: boolean): Promise<unknown> => {
      this["~ensureNotDisposed"]();

      const entry = this.cache.get(requestor)!;
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
        value: { kind: "pending", promise },
      });
      return promise;
    };

    return Object.assign(accessor, {
      get: () => {
        this["~ensureNotDisposed"]();

        const cacheEntry = this.cache.get(requestor)?.value;

        if (!cacheEntry || cacheEntry.kind === "pending") {
          throw new Error("Executor is not resolved");
        }

        if (cacheEntry.kind === "rejected") {
          throw cacheEntry.error;
        }

        return cacheEntry.value;
      },
      lookup: () => {
        this["~ensureNotDisposed"]();

        const cacheEntry = this.cache.get(requestor);

        if (!cacheEntry) {
          return undefined;
        }

        return cacheEntry.value;
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
        this["~ensureNotDisposed"]();
        return this.onUpdate(requestor, cb);
      },
    } satisfies Partial<Core.Accessor<unknown>>);
  }

  accessor<T>(executor: Core.Executor<T>): Core.Accessor<T> {
    this["~ensureNotDisposed"]();
    return this["~makeAccessor"](executor) as Core.Accessor<T>;
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
    this["~ensureNotDisposed"]();
    this["~triggerCleanup"](e);
    const accessor = this["~makeAccessor"](e);

    if (typeof u === "function") {
      const fn = u as (current: T) => T;
      const n = fn(accessor.get() as T);
      this.cache.set(e, {
        accessor,
        value: { kind: "resolved", value: n },
      });
    } else {
      this.cache.set(e, {
        accessor,
        value: { kind: "resolved", value: u },
      });
    }

    await this["~triggerUpdate"](e);
  }

  async release(e: Core.Executor<unknown>, s: boolean = false): Promise<void> {
    this["~ensureNotDisposed"]();

    const ce = this.cache.get(e);
    if (!ce && !s) {
      throw new Error("Executor is not yet resolved");
    }

    await this["~triggerCleanup"](e);

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
    const currents = this.cache.keys();
    for (const current of currents) {
      await this.release(current, true);
    }

    this.disposed = true;
    this.cache.clear();
    this.cleanups.clear();
  }

  onUpdate<T>(
    e: Core.Executor<T>,
    cb: (a: Core.Accessor<T>) => void | Promise<void>
  ): Core.Cleanup {
    this["~ensureNotDisposed"]();

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
}

export function createScope(...presets: Core.Preset<unknown>[]): Core.Scope {
  return new Scope(...presets);
}

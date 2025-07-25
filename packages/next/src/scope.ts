import {
  isLazyExecutor,
  isReactiveExecutor,
  isStaticExecutor,
  isMainExecutor,
  isExecutor,
} from "./executor";
import { Core, Meta } from "./types";
import {
  isGenerator,
  isAsyncGenerator,
  collectFromGenerator,
} from "./generator-utils";
import { meta } from "./meta";
import { custom } from "./ssch";

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

class BaseScope implements Core.Scope {
  protected disposed: boolean = false;
  protected cache: Map<UE, CacheEntry> = new Map();
  protected cleanups = new Map<UE, Set<Core.Cleanup>>();
  protected onUpdates = new Map<UE, Set<OnUpdateFn | UE>>();
  protected onEvents = {
    change: new Set<Core.ChangeCallback>(),
    release: new Set<Core.ReleaseCallback>(),
  } as const;
  protected isPod: boolean;
  private isDisposing = false;

  protected middlewares: Core.Middleware[] = [];

  constructor(options: {
    initialValues: Core.Preset<unknown>[];
    pod: boolean;
  }) {
    this.isPod = options.pod;
    for (const preset of options.initialValues) {
      const accessor = this["~makeAccessor"](preset.executor);

      this.cache.set(preset.executor, {
        accessor,
        value: { kind: "resolved", value: preset.value },
      });
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

  protected async "~resolveExecutor"(
    ie: Core.UExecutor,
    ref: UE
  ): Promise<unknown> {
    const e = getExecutor(ie);
    const isPodOnly = podOnlyMeta.find(e);

    if (!this.isPod && isPodOnly) {
      throw new Error(
        "Pod-only executors cannot be resolved in the main scope"
      );
    }

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
    const requestor =
      isLazyExecutor(e) || isReactiveExecutor(e) || isStaticExecutor(e)
        ? e.executor
        : (e as UE);

    if (podOnlyMeta.find(requestor) && this.isPod === false) {
      throw new Error(
        "Cannot resolve pod-only executor outside of a pod scope"
      );
    }

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
          .then(async (result) => {
            let current = result;

            // Handle generator results
            if (isGenerator(result) || isAsyncGenerator(result)) {
              const { returned } = await collectFromGenerator(result);
              current = returned;
            }

            const events = this.onEvents.change;
            for (const event of events) {
              const updated = event("resolve", requestor, current, this);
              if (updated !== undefined && updated.executor === requestor) {
                current = updated.value;
              }
            }

            this.cache.set(requestor, {
              accessor,
              value: { kind: "resolved", value: current },
            });

            resolve(current);
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
      const updated = event("update", e, value, this);
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

    const disposeEvents = this.middlewares.map(
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

  use(middleware: Core.Middleware): Core.Cleanup {
    this["~ensureNotDisposed"]();
    if (this.isDisposing) {
      throw new Error("Cannot register update callback on a disposing scope");
    }

    this.middlewares.push(middleware);

    middleware.init?.(this);

    return () => {
      this["~ensureNotDisposed"]();
      this.middlewares = this.middlewares.filter((m) => m !== middleware);
    };
  }

  private pods: Set<Core.Pod> = new Set();

  pod(...preset: Core.Preset<unknown>[]): Core.Pod {
    this["~ensureNotDisposed"]();
    if (this.isDisposing) {
      throw new Error("Cannot register update callback on a disposing scope");
    }

    const pod = new Pod(this, ...preset);
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

const podOnlyMeta: Meta.MetaFn<boolean> = meta(
  "pumped-fn/space-only",
  custom<boolean>()
);

export const podOnly: Meta.Meta<boolean> = podOnlyMeta(true);

export function createScope(...presets: Core.Preset<unknown>[]): Core.Scope {
  return new BaseScope({
    pod: false,
    initialValues: presets,
  });
}

export function middleware(m: Core.Middleware): Core.Middleware {
  return m;
}

class Pod extends BaseScope implements Core.Pod {
  private parentScope: BaseScope;

  constructor(scope: BaseScope, ...presets: Core.Preset<unknown>[]) {
    super({
      pod: true,
      initialValues: presets,
    });
    this.parentScope = scope;
  }

  async resolve<T>(executor: Core.Executor<T>, force?: boolean): Promise<T> {
    const isPodOnly = podOnlyMeta.find(executor);

    if (isPodOnly) {
      return super.resolve(executor, force);
    }

    const accessor = this["~makeAccessor"](executor);
    if (accessor.lookup()) {
      return accessor.get() as T;
    }

    const value = await this.parentScope.resolve(executor, force);
    this["cache"].set(executor, {
      accessor,
      value: { kind: "resolved", value },
    });

    return value;
  }

  protected async "~resolveExecutor"(
    ie: Core.UExecutor,
    ref: UE
  ): Promise<unknown> {
    if (isReactiveExecutor(ie)) {
      throw new Error("Reactive executors cannot be used in pod");
    }

    const isPodOnly = podOnlyMeta.find(ie);

    if (isPodOnly) {
      return super["~resolveExecutor"](ie, ref);
    } else {
      const t = getExecutor(ie);
      const value = await this.parentScope["~resolveExecutor"](ie, ref);
      const currentAccessor = this["~makeAccessor"](t);

      this.cache.set(t, {
        accessor: currentAccessor,
        value: { kind: "resolved", value },
      });

      return value;
    }
  }
}

import { Core, createScope } from "@pumped-fn/core-next";
import { createContext, useContext, useRef, useSyncExternalStore } from "react";

type ValueEntry = { kind: "value"; value: Core.Accessor<unknown> };
type ErrorEntry = { kind: "error"; error: unknown };
type PendingEntry = { kind: "pending"; promise: Promise<unknown> };
type Entry = ValueEntry | ErrorEntry | PendingEntry;

const isErrorEntry = (entry: Entry): entry is ErrorEntry => entry.kind === "error";
const isPendingEntry = (entry: Entry): entry is PendingEntry => entry.kind === "pending";

type CacheEntry = [Core.Executor<unknown>, Entry];

class ScopeContainer {
  #scope: Core.Scope;
  #cache: CacheEntry[] = [];

  constructor(scope?: Core.Scope) {
    this.#scope = scope ?? createScope();
  }

  get scope() {
    return this.#scope;
  }

  getResolved(executor: Core.Executor<unknown>): CacheEntry {
    const maybeEntry = this.#cache.find(([e]) => e === executor);

    if (maybeEntry) {
      return maybeEntry;
    }

    const cacheEntry: CacheEntry = [
      executor,
      {
        kind: "pending",
        promise: this.#scope
          .resolveAccessor(executor)
          .then((value) => {
            cacheEntry[1] = { kind: "value", value };
          })
          .catch((error) => {
            cacheEntry[1] = { kind: "error", error };
          }),
      },
    ];

    this.#cache.push(cacheEntry);
    return cacheEntry;
  }

  static create(scope?: Core.Scope) {
    return new ScopeContainer(scope);
  }
}

const scopeContainerContext = createContext<ScopeContainer | undefined>(undefined);

export function useScope() {
  const context = useContext(scopeContainerContext);
  if (context === undefined) {
    throw new Error("useScope must be used within a ScopeProvider");
  }
  return context;
}

export function ScopeProvider({ children, scope }: { children: React.ReactNode; scope?: Core.Scope }) {
  return (
    <scopeContainerContext.Provider value={ScopeContainer.create(scope)}>{children}</scopeContainerContext.Provider>
  );
}

type PendingState<T> = { state: "pending"; promise: Promise<T> };
type ResolvedState<T> = { state: "resolved"; value: T };
type ErrorState<T> = { state: "error"; error: T };

export type ResolveState<T> = PendingState<T> | ResolvedState<T> | ErrorState<T>;

type UseResolveOption<T> = {
  snapshot?: (value: T) => T;
  equality?: (thisValue: T, thatValue: T) => boolean;
};

export function useResolve<T extends Core.BaseExecutor<unknown>>(executor: T): Awaited<T>;
export function useResolve<T extends Core.BaseExecutor<unknown>, K>(
  executor: T,
  selector: (value: Core.InferOutput<T>) => K,
  options?: UseResolveOption<T>,
): K;

export function useResolve<T, K>(
  executor: Core.Executor<T>,
  selector?: (value: Awaited<T>) => K,
  options?: UseResolveOption<T>,
): K {
  const scope = useScope();

  const [_, entry] = scope.getResolved(executor);

  if (isPendingEntry(entry)) {
    throw entry.promise;
  }

  if (isErrorEntry(entry)) {
    throw entry.error;
  }

  const valueRef = useRef<any>();
  if (!valueRef.current) {
    const value = selector ? selector(entry.value.get() as Awaited<T>) : entry.value.get();
      valueRef.current = options?.snapshot ? options.snapshot(value as any) : value;
  }

  return useSyncExternalStore(
    (cb) =>
      scope.scope.onUpdate(executor, (next) => {
        const equalityFn = options?.equality ?? Object.is;
        const value = selector ? selector(next as Awaited<T>) : next;

        if (!equalityFn(valueRef.current, value as any)) {
          valueRef.current = options?.snapshot ? options.snapshot(value as any) : value;
          cb();
          return;
        }
      }),
    () => valueRef.current,
    () => valueRef.current,
  );
}

export function useResolveMany<T extends Array<unknown>>(
  ...executors: { [K in keyof T]: Core.Executor<T[K]> }
): { [K in keyof T]: Awaited<T[K]> } {
  const scope = useScope();
  const entries = [] as CacheEntry[];

  for (const executor of executors) {
    entries.push(scope.getResolved(executor));
  }

  const resolvedRef = useRef<ValueEntry[]>(undefined as unknown as []);
  if (!resolvedRef.current) {
    resolvedRef.current = [];
  }

  for (const entry of entries) {
    const state = entry[1];

    if (isPendingEntry(state)) {
      throw state.promise;
    }

    if (isErrorEntry(state)) {
      throw state.error;
    }

    resolvedRef.current.push(state);
  }

  const resultRef = useRef<{ [K in keyof T]: Awaited<T[K]> }>(
    undefined as unknown as { [K in keyof T]: Awaited<T[K]> },
  );

  if (!resultRef.current) {
    resultRef.current = resolvedRef.current.map((entry) => entry.value.get()) as any;
  }

  return useSyncExternalStore(
    (cb) => {
      const cleanups = [] as Core.Cleanup[];
      for (let i = 0; i < entries.length; i++) {
        const cleanup = scope.scope.onUpdate(executors[i], () => {
          resultRef.current = resolvedRef.current.map((entry) => entry.value.get()) as any
          cb();
        });

        cleanups.push(cleanup);
      }

      return () => {
        for (const cleanup of cleanups) {
          cleanup();
        }
      };
    },
    () => resultRef.current,
    () => resultRef.current,
  );
}

export function useUpdate<T>(executor: Core.Executor<T>): (updateFn: T | ((current: T) => T)) => void {
  const scope = useScope();

  return (updateFn: T | ((current: T) => T)) => {
    scope.scope.update(executor, updateFn);
  };
}

export function useReset(executor: Core.Executor<unknown>): () => void {
  const scope = useScope();

  return () => {
    scope.scope.reset(executor);
  };
}

export function useRelease(executor: Core.Executor<unknown>): () => void {
  const scope = useScope();

  return () => {
    scope.scope.release(executor);
  };
}

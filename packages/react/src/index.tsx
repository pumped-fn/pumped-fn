import {
  Core,
  createScope,
  isLazyExecutor,
  isReactiveExecutor,
  isStaticExecutor,
} from "@pumped-fn/core-next";
import React, {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";

type ValueEntry = { kind: "value"; value: Core.Accessor<unknown> };
type ErrorEntry = { kind: "error"; error: unknown };
type PendingEntry = { kind: "pending"; promise: Promise<unknown> };
type Entry = ValueEntry | ErrorEntry | PendingEntry;

const isErrorEntry = (entry: Entry): entry is ErrorEntry =>
  entry.kind === "error";
const isPendingEntry = (entry: Entry): entry is PendingEntry =>
  entry.kind === "pending";

type CacheEntry = [Core.Executor<unknown>, Entry];

class ScopeContainer {
  #scope: Core.Scope;
  #cache: CacheEntry[] = [];

  constructor(scope?: Core.Scope) {
    this.#scope = scope ?? createScope();
  }

  get scope(): Core.Scope {
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

  static create(scope?: Core.Scope): ScopeContainer {
    return new ScopeContainer(scope);
  }
}

const scopeContainerContext = createContext<ScopeContainer | undefined>(
  undefined
);

export function useScope(): ScopeContainer {
  const context = useContext(scopeContainerContext);
  if (context === undefined) {
    throw new Error("useScope must be used within a ScopeProvider");
  }
  return context;
}

export function ScopeProvider({
  children,
  scope,
}: {
  children: React.ReactNode;
  scope?: Core.Scope;
}) {
  const scopeRef = useRef<ScopeContainer | undefined>(undefined);

  if (!scopeRef.current) {
    const _scope = scope ?? createScope();
    scopeRef.current = ScopeContainer.create(_scope);
  }

  return (
    <scopeContainerContext.Provider value={scopeRef.current}>
      {children}
    </scopeContainerContext.Provider>
  );
}

type UseResolveOption<T> = {
  snapshot?: (value: T) => T;
  equality?: (thisValue: T, thatValue: T) => boolean;
};

export function useResolve<T extends Core.BaseExecutor<unknown>>(
  executor: T
): Core.InferOutput<T>;
export function useResolve<T extends Core.BaseExecutor<unknown>, K>(
  executor: T,
  selector: (value: Core.InferOutput<T>) => K,
  options?: UseResolveOption<T>
): K;

export function useResolve<T, K>(
  executor: Core.BaseExecutor<T>,
  selector?: (value: Awaited<T>) => K,
  options?: UseResolveOption<T>
): K {
  const scope = useScope();
  const target =
    isLazyExecutor(executor) ||
    isReactiveExecutor(executor) ||
    isStaticExecutor(executor)
      ? executor.executor
      : (executor as Core.Executor<unknown>);

  const [_, entry] = scope.getResolved(target);
  const valueRef = useRef<any>();

  if (isPendingEntry(entry)) {
    throw entry.promise;
  }

  if (isErrorEntry(entry)) {
    throw entry.error;
  }

  if (!valueRef.current) {
    const rawValue = entry.value.get();
    const value = selector ? selector(rawValue as Awaited<T>) : rawValue;

    valueRef.current = options?.snapshot
      ? options.snapshot(value as any)
      : value;
  }

  let isRendering = false;

  return useSyncExternalStore(
    (cb) => {
      if (isReactiveExecutor(executor)) {
        return scope.scope.onUpdate(target, (next) => {
          const equalityFn = options?.equality ?? Object.is;
          const value = selector
            ? selector(next.get() as Awaited<T>)
            : next.get();

          if (!equalityFn(valueRef.current, value as any)) {
            valueRef.current = options?.snapshot
              ? options.snapshot(value as any)
              : value;

            if (!isRendering) {
              startTransition(() => cb());
              isRendering = true;
            }

            return;
          }
        });
      }
      return () => {};
    },
    () => valueRef.current,
    () => valueRef.current
  );
}

export function useResolveMany<T extends Array<Core.BaseExecutor<unknown>>>(
  ...executors: { [K in keyof T]: T[K] }
): { [K in keyof T]: Core.InferOutput<T[K]> } {
  const scope = useScope();
  const entries = [] as CacheEntry[];

  for (const executor of executors) {
    const target =
      isLazyExecutor(executor) ||
      isReactiveExecutor(executor) ||
      isStaticExecutor(executor)
        ? executor.executor
        : (executor as Core.Executor<unknown>);
    entries.push(scope.getResolved(target));
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

  const resultRef = useRef<{ [K in keyof T]: Core.InferOutput<T[K]> }>(
    undefined as unknown as { [K in keyof T]: Core.InferOutput<T[K]> }
  );

  if (!resultRef.current) {
    resultRef.current = resolvedRef.current.map((entry) =>
      entry.value.get()
    ) as any;
  }

  let isRendering = false;

  return useSyncExternalStore(
    (cb) => {
      const cleanups = [] as Core.Cleanup[];
      for (let i = 0; i < entries.length; i++) {
        const executor = executors[i];

        if (isReactiveExecutor(executor)) {
          const target = executor.executor;
          const cleanup = scope.scope.onUpdate(target, () => {
            resultRef.current = resolvedRef.current.map((entry) =>
              entry.value.get()
            ) as any;

            if (!isRendering) {
              startTransition(() => cb());
              isRendering = true;
            }
          });

          cleanups.push(cleanup);
        }
      }

      return () => {
        for (const cleanup of cleanups) {
          cleanup();
        }
      };
    },
    () => resultRef.current,
    () => resultRef.current
  );
}

export function useUpdate<T>(
  executor: Core.Executor<T>
): (updateFn: T | ((current: T) => T)) => void {
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

export type ResolveProps<T> = {
  e: Core.Executor<T>;
  children: (props: T) => React.ReactNode | React.ReactNode[];
};

export function Resolve<T>(props: ResolveProps<T>) {
  const value = useResolve(props.e);
  return props.children(value);
}

export function Resolves<T extends Core.BaseExecutor<unknown>[]>(props: {
  e: { [K in keyof T]: T[K] };
  children: (props: { [K in keyof T]: Core.InferOutput<T[K]> }) =>
    | React.ReactNode
    | React.ReactNode[];
}) {
  const values = useResolveMany(...props.e);
  return props.children(values);
}

export function Reselect<T, K>(props: {
  e: Core.Executor<T>;
  selector: (value: T) => K;
  children: (props: K) => React.ReactNode | React.ReactNode[];
  equality?: (thisValue: T, thatValue: T) => boolean;
}) {
  const value = useResolve(props.e.reactive, props.selector, {
    equality: props.equality as any,
  });
  return props.children(value);
}

export function Reactives<T extends Core.Executor<unknown>[]>(props: {
  e: { [K in keyof T]: T[K] };
  children: (props: { [K in keyof T]: Core.InferOutput<T[K]> }) =>
    | React.ReactNode
    | React.ReactNode[];
}) {
  const values = useResolveMany(...props.e.map((e) => e.reactive));
  return props.children(values as any);
}

export function Effect(props: { e: Core.Executor<unknown>[] }) {
  const scope = useScope();

  useEffect(() => {
    for (const e of props.e) {
      scope.scope.resolve(e);
    }

    return () => {
      for (const e of props.e) {
        scope.scope.release(e, true);
      }
    };
  }, [scope, ...props.e]);
  return null;
}

export const pumped = {
  Effect,
  Reactives,
  Resolve,
  Resolves,
  Reselect,
};

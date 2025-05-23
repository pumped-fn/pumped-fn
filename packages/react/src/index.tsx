import {
  Core,
  createScope,
  isLazyExecutor,
  isReactiveExecutor,
  isStaticExecutor,
} from "@pumped-fn/core-next";
import { createProxy, isChanged } from "proxy-compare";
import React, {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

const isErrorEntry = (
  entry: Core.ResolveState<unknown>
): entry is Core.RejectedState => entry.kind === "rejected";

const isPendingEntry = (
  entry: Core.ResolveState<unknown>
): entry is Core.PendingState<unknown> => entry.kind === "pending";

const scopeContainerContext = createContext<Core.Scope | undefined>(undefined);

export function useScope(): Core.Scope {
  const context = useContext(scopeContainerContext);
  if (context === undefined) {
    throw new Error("useScope must be used within a ScopeProvider");
  }
  return context;
}

export function ScopeProvider({
  children,
  scope,
  presets = [],
}: {
  children: React.ReactNode;
} & (
  | { scope: Core.Scope; presets?: Core.Preset<unknown>[] }
  | { scope?: undefined; presets?: undefined }
)) {
  const _scope = useMemo(() => {
    return scope ?? createScope(...presets);
  }, [scope, ...presets]);

  return (
    <scopeContainerContext.Provider value={_scope}>
      {children}
    </scopeContainerContext.Provider>
  );
}

type ResolveKit = {
  proxies: Array<unknown>;
  weakmaps: WeakMap<object, any>[];
  resolved: Array<unknown>;
  accessors: Array<Core.Accessor<unknown>>;
};

export function useResolves<T extends Array<Core.BaseExecutor<unknown>>>(
  ...executors: { [K in keyof T]: T[K] }
): { [K in keyof T]: Core.InferOutput<T[K]> } {
  const scope = useScope();

  const resolveKitRef = useRef<ResolveKit>(undefined as unknown as ResolveKit);
  if (!resolveKitRef.current) {
    const kit = {
      proxies: [],
      resolved: [],
      weakmaps: [],
      accessors: [],
    } as ResolveKit;

    for (const executor of executors) {
      const target =
        isLazyExecutor(executor) ||
        isReactiveExecutor(executor) ||
        isStaticExecutor(executor)
          ? executor.executor
          : (executor as Core.Executor<unknown>);

      const accessor = scope.accessor(target);

      let state = accessor.lookup() as Core.ResolveState<unknown>;

      if (!state) {
        accessor.resolve();
        state = accessor.lookup()!;
      }

      if (isPendingEntry(state)) {
        throw state.promise;
      }

      if (isErrorEntry(state)) {
        throw state.error;
      }

      kit.accessors.push(accessor);

      const changeCheck = new WeakMap<object, unknown>();
      kit.weakmaps.push(changeCheck);

      kit.resolved.push(state.value);
      kit.proxies.push(createProxy(state.value, changeCheck));
    }

    resolveKitRef.current = kit;
  }

  return useSyncExternalStore(
    (cb) => {
      const cleanups = [] as Core.Cleanup[];
      for (let i = 0; i < resolveKitRef.current.resolved.length; i++) {
        const executor = executors[i];

        if (isReactiveExecutor(executor)) {
          const target = executor.executor;

          const cleanup = scope.onUpdate(target, (next) => {
            const nextValue = next.get();

            if (
              isChanged(
                resolveKitRef.current.resolved[i],
                nextValue,
                resolveKitRef.current.weakmaps[i]
              )
            ) {
              startTransition(() => {
                resolveKitRef.current.resolved =
                  resolveKitRef.current.accessors.map((a) => a.get());

                resolveKitRef.current.proxies =
                  resolveKitRef.current.resolved.map(
                    (value, i) =>
                      createProxy(
                        value,
                        resolveKitRef.current.weakmaps[i]
                      ) as unknown
                  );

                cb();
              });
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
    () => resolveKitRef.current.proxies as any,
    () => resolveKitRef.current.proxies as any
  );
}

export function useUpdate<T>(
  executor: Core.Executor<T>
): (updateFn: T | ((current: T) => T)) => void {
  const scope = useScope();

  return (updateFn: T | ((current: T) => T)) => {
    scope.update(executor, updateFn);
  };
}

export function useRelease(executor: Core.Executor<unknown>): () => void {
  const scope = useScope();

  return () => {
    scope.release(executor);
  };
}

export type ResolveProps<T> = {
  e: Core.Executor<T>;
  children: (props: T) => React.ReactNode | React.ReactNode[];
};

export function Resolves<T extends Core.BaseExecutor<unknown>[]>(props: {
  e: { [K in keyof T]: T[K] };
  children: (props: { [K in keyof T]: Core.InferOutput<T[K]> }) =>
    | React.ReactNode
    | React.ReactNode[];
}) {
  const values = useResolves(...props.e);
  return props.children(values);
}

export function useResolve<T extends Core.BaseExecutor<unknown>, K>(
  e: T,
  selector: (value: Core.InferOutput<T>) => K,
  options?: {
    equality?: (thisValue: K, thatValue: K) => boolean;
    snapshot?: (value: K) => K;
  }
): K {
  const equality = options?.equality ?? Object.is;

  const [value] = useResolves(e);
  const ref = useRef<K>(undefined as K);

  const nextValue = useMemo(() => {
    const k = selector(value);
    if (!ref.current || !equality(ref.current, k)) {
      ref.current = options?.snapshot ? options.snapshot(k) : k;
    }

    return ref.current;
  }, [value, selector, equality, options?.snapshot]);

  return nextValue;
}

export function Reselect<T, K>(props: {
  e: Core.Executor<T>;
  selector: (value: T) => K;
  children: (props: K) => React.ReactNode | React.ReactNode[];
  options?: {
    equality?: (thisValue: K, thatValue: K) => boolean;
    snapshot?: (value: K) => K;
  };
}) {
  const value = useResolve(props.e, props.selector, props.options);
  return props.children(value);
}

export function Reactives<T extends Core.Executor<unknown>[]>(props: {
  e: { [K in keyof T]: T[K] };
  children: (props: { [K in keyof T]: Core.InferOutput<T[K]> }) =>
    | React.ReactNode
    | React.ReactNode[];
}) {
  const values = useResolves(...props.e.map((e) => e.reactive));
  return props.children(values as any);
}

export function Effect(props: { e: Core.Executor<unknown>[] }) {
  const scope = useScope();

  useEffect(() => {
    for (const e of props.e) {
      scope.resolve(e);
    }

    return () => {
      for (const e of props.e) {
        scope.release(e, true);
      }
    };
  }, [scope, ...props.e]);
  return null;
}

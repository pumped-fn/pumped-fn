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
  useId,
} from "react";
import { 
  createTracker, 
  createDependencyGraph, 
  createAccessorCache,
  Tracker,
  DependencyGraph,
  AccessorCache,
  TrackingResult
} from "./proxy-tracking";

type ValueEntry = { kind: "value"; value: Core.Accessor<unknown> };
type ErrorEntry = { kind: "error"; error: unknown };
type PendingEntry = { kind: "pending"; promise: Promise<unknown> };
type Entry = ValueEntry | ErrorEntry | PendingEntry;

const isErrorEntry = (entry: Entry): entry is ErrorEntry =>
  entry.kind === "error";
const isPendingEntry = (entry: Entry): entry is PendingEntry =>
  entry.kind === "pending";

type CacheEntry = [Core.Executor<unknown>, Entry];

// Context for tracking component relationships
interface TrackingContext {
  parentId: string | null;
  registerChild: (childId: string) => void;
  unregisterChild: (childId: string) => void;
}

const TrackingContext = createContext<TrackingContext>({
  parentId: null,
  registerChild: () => {},
  unregisterChild: () => {},
});

class EnhancedScopeContainer {
  #scope: Core.Scope;
  #cache: CacheEntry[] = [];
  #tracker: Tracker;
  #dependencyGraph: DependencyGraph;
  #accessorCache: AccessorCache;
  #subscribers = new Map<string, Set<() => void>>();

  constructor(scope?: Core.Scope) {
    this.#scope = scope ?? createScope();
    this.#tracker = createTracker();
    this.#dependencyGraph = createDependencyGraph();
    this.#accessorCache = createAccessorCache();
  }

  get scope(): Core.Scope {
    return this.#scope;
  }

  get tracker(): Tracker {
    return this.#tracker;
  }

  get dependencyGraph(): DependencyGraph {
    return this.#dependencyGraph;
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
            // Cache the accessor for future use
            this.#accessorCache.set(executor, value);
          })
          .catch((error) => {
            cacheEntry[1] = { kind: "error", error };
          }),
      },
    ];

    this.#cache.push(cacheEntry);
    return cacheEntry;
  }

  /**
   * Subscribe to changes in a tracked value
   */
  subscribe(id: string, callback: () => void): () => void {
    if (!this.#subscribers.has(id)) {
      this.#subscribers.set(id, new Set());
    }
    
    this.#subscribers.get(id)!.add(callback);
    
    return () => {
      const callbacks = this.#subscribers.get(id);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.#subscribers.delete(id);
        }
      }
    };
  }

  /**
   * Notify subscribers of changes
   */
  notifySubscribers(id: string): void {
    const callbacks = this.#subscribers.get(id);
    if (callbacks) {
      for (const callback of callbacks) {
        callback();
      }
    }
    
    // Also notify any components that depend on this one
    const affectedNodes = this.#dependencyGraph.getAffectedNodes(id);
    for (const nodeId of affectedNodes) {
      const nodeCallbacks = this.#subscribers.get(nodeId);
      if (nodeCallbacks) {
        for (const callback of nodeCallbacks) {
          callback();
        }
      }
    }
  }

  /**
   * Register a parent-child relationship for tracking propagation
   */
  registerRelationship(parentId: string, childId: string): void {
    this.#dependencyGraph.addDependency(parentId, childId);
  }

  /**
   * Unregister a parent-child relationship
   */
  unregisterRelationship(parentId: string, childId: string): void {
    this.#dependencyGraph.removeDependency(parentId, childId);
  }

  /**
   * Track a value with the given component ID
   */
  trackValue<T>(value: T, componentId: string): T {
    return this.#tracker.track(value, componentId);
  }

  /**
   * Check if a tracked value has changed
   */
  checkValueChanged<T>(prevValue: T, nextValue: T, componentId: string): TrackingResult {
    return this.#tracker.isChanged(prevValue, nextValue, componentId);
  }

  /**
   * Get the original untracked value
   */
  getOriginalValue<T>(trackedValue: T): T {
    return this.#tracker.getOriginal(trackedValue);
  }

  static create(scope?: Core.Scope): EnhancedScopeContainer {
    return new EnhancedScopeContainer(scope);
  }
}

const enhancedScopeContainerContext = createContext<EnhancedScopeContainer | undefined>(
  undefined
);

export function useEnhancedScope(): EnhancedScopeContainer {
  const context = useContext(enhancedScopeContainerContext);
  if (context === undefined) {
    throw new Error("useEnhancedScope must be used within an EnhancedScopeProvider");
  }
  return context;
}

export function EnhancedScopeProvider({
  children,
  scope,
}: {
  children: React.ReactNode;
  scope?: Core.Scope;
}) {
  const scopeRef = useRef<EnhancedScopeContainer | undefined>(undefined);

  if (!scopeRef.current) {
    const _scope = scope ?? createScope();
    scopeRef.current = EnhancedScopeContainer.create(_scope);
  }

  return (
    <enhancedScopeContainerContext.Provider value={scopeRef.current}>
      <TrackingProvider>
        {children}
      </TrackingProvider>
    </enhancedScopeContainerContext.Provider>
  );
}

function TrackingProvider({ children }: { children: React.ReactNode }) {
  const id = useId();
  const parentContext = useContext(TrackingContext);
  const childrenRef = useRef(new Set<string>());
  
  // Register with parent if there is one
  useEffect(() => {
    if (parentContext.parentId) {
      parentContext.registerChild(id);
      return () => {
        parentContext.unregisterChild(id);
      };
    }
    return undefined;
  }, [id, parentContext]);
  
  const contextValue = React.useMemo(() => ({
    parentId: id,
    registerChild: (childId: string) => {
      childrenRef.current.add(childId);
    },
    unregisterChild: (childId: string) => {
      childrenRef.current.delete(childId);
    },
  }), [id]);
  
  return (
    <TrackingContext.Provider value={contextValue}>
      {children}
    </TrackingContext.Provider>
  );
}

type UseEnhancedResolveOption<T> = {
  snapshot?: (value: T) => T;
  equality?: (thisValue: T, thatValue: T) => boolean;
};

export function useEnhancedResolve<T extends Core.BaseExecutor<unknown>>(
  executor: T
): Core.InferOutput<T>;
export function useEnhancedResolve<T extends Core.BaseExecutor<unknown>, K>(
  executor: T,
  selector: (value: Core.InferOutput<T>) => K,
  options?: UseEnhancedResolveOption<T>
): K;

export function useEnhancedResolve<T, K>(
  executor: Core.BaseExecutor<T>,
  selector?: (value: Awaited<T>) => K,
  options?: UseEnhancedResolveOption<T>
): K {
  const scope = useEnhancedScope();
  const componentId = useId();
  const trackingContext = useContext(TrackingContext);
  
  const target =
    isLazyExecutor(executor) ||
    isReactiveExecutor(executor) ||
    isStaticExecutor(executor)
      ? executor.executor
      : (executor as Core.Executor<unknown>);

  const [_, entry] = scope.getResolved(target);
  const valueRef = useRef<any>();
  const prevValueRef = useRef<any>();

  if (isPendingEntry(entry)) {
    throw entry.promise;
  }

  if (isErrorEntry(entry)) {
    throw entry.error;
  }

  if (!valueRef.current) {
    const rawValue = entry.value.get();
    const value = selector ? selector(rawValue as Awaited<T>) : rawValue;

    // Apply tracking to the value
    const trackedValue = scope.trackValue(
      options?.snapshot ? options.snapshot(value as any) : value,
      componentId
    );
    
    valueRef.current = trackedValue;
    prevValueRef.current = trackedValue;
  }

  // Register this component with the parent for tracking propagation
  useEffect(() => {
    if (trackingContext.parentId) {
      scope.registerRelationship(trackingContext.parentId, componentId);
      
      return () => {
        scope.unregisterRelationship(trackingContext.parentId, componentId);
      };
    }
    return undefined;
  }, [componentId, scope, trackingContext.parentId]);

  let isRendering = false;

  return useSyncExternalStore(
    (cb) => {
      if (isReactiveExecutor(executor)) {
        return scope.scope.onUpdate(target, (next) => {
          const equalityFn = options?.equality ?? Object.is;
          const rawValue = next.get();
          const value = selector ? selector(rawValue as Awaited<T>) : rawValue;
          
          // Apply tracking to the new value
          const trackedValue = scope.trackValue(
            options?.snapshot ? options.snapshot(value as any) : value,
            componentId
          );
          
          // Check if tracked properties have changed
          const trackingResult = scope.checkValueChanged(
            prevValueRef.current,
            trackedValue,
            componentId
          );
          
          if (trackingResult.isChanged) {
            valueRef.current = trackedValue;
            prevValueRef.current = trackedValue;

            if (!isRendering) {
              startTransition(() => cb());
              isRendering = true;
            }
          }
        });
      }
      
      // Subscribe to changes in this component's tracked values
      return scope.subscribe(componentId, () => {
        if (!isRendering) {
          startTransition(() => cb());
          isRendering = true;
        }
      });
    },
    () => valueRef.current,
    () => valueRef.current
  );
}

export function useEnhancedResolveMany<T extends Array<Core.BaseExecutor<unknown>>>(
  ...executors: { [K in keyof T]: T[K] }
): { [K in keyof T]: Core.InferOutput<T[K]> } {
  const scope = useEnhancedScope();
  const componentId = useId();
  const trackingContext = useContext(TrackingContext);
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
  
  const prevResultRef = useRef<{ [K in keyof T]: Core.InferOutput<T[K]> }>(
    undefined as unknown as { [K in keyof T]: Core.InferOutput<T[K]> }
  );

  if (!resultRef.current) {
    // Get raw values and apply tracking
    const rawValues = resolvedRef.current.map((entry) => entry.value.get());
    const trackedValues = rawValues.map((value) => scope.trackValue(value, componentId));
    
    resultRef.current = trackedValues as any;
    prevResultRef.current = trackedValues as any;
  }

  // Register this component with the parent for tracking propagation
  useEffect(() => {
    if (trackingContext.parentId) {
      scope.registerRelationship(trackingContext.parentId, componentId);
      
      return () => {
        scope.unregisterRelationship(trackingContext.parentId, componentId);
      };
    }
    return undefined;
  }, [componentId, scope, trackingContext.parentId]);

  let isRendering = false;

  return useSyncExternalStore(
    (cb) => {
      const cleanups = [] as Core.Cleanup[];
      for (let i = 0; i < entries.length; i++) {
        const executor = executors[i];

        if (isReactiveExecutor(executor)) {
          const target = executor.executor;
          const cleanup = scope.scope.onUpdate(target, () => {
            // Get updated raw values
            const rawValues = resolvedRef.current.map((entry) => entry.value.get());
            
            // Apply tracking to the new values
            const trackedValues = rawValues.map((value) => scope.trackValue(value, componentId));
            
            // Check if any tracked properties have changed
            let hasChanges = false;
            for (let j = 0; j < trackedValues.length; j++) {
              const trackingResult = scope.checkValueChanged(
                (prevResultRef.current as any)[j],
                trackedValues[j],
                componentId
              );
              
              if (trackingResult.isChanged) {
                hasChanges = true;
                break;
              }
            }
            
            if (hasChanges) {
              resultRef.current = trackedValues as any;
              prevResultRef.current = trackedValues as any;
              
              if (!isRendering) {
                startTransition(() => cb());
                isRendering = true;
              }
            }
          });

          cleanups.push(cleanup);
        }
      }
      
      // Subscribe to changes in this component's tracked values
      const unsubscribe = scope.subscribe(componentId, () => {
        if (!isRendering) {
          startTransition(() => cb());
          isRendering = true;
        }
      });
      
      return () => {
        for (const cleanup of cleanups) {
          cleanup();
        }
        unsubscribe();
      };
    },
    () => resultRef.current,
    () => resultRef.current
  );
}

export function useEnhancedUpdate<T>(
  executor: Core.Executor<T>
): (updateFn: T | ((current: T) => T)) => void {
  const scope = useEnhancedScope();

  return (updateFn: T | ((current: T) => T)) => {
    scope.scope.update(executor, updateFn);
  };
}

export function useEnhancedReset(executor: Core.Executor<unknown>): () => void {
  const scope = useEnhancedScope();

  return () => {
    scope.scope.reset(executor);
  };
}

export function useEnhancedRelease(executor: Core.Executor<unknown>): () => void {
  const scope = useEnhancedScope();

  return () => {
    scope.scope.release(executor);
  };
}

export type EnhancedResolveProps<T> = {
  e: Core.Executor<T>;
  children: (props: T) => React.ReactNode | React.ReactNode[];
};

export function EnhancedResolve<T>(props: EnhancedResolveProps<T>) {
  const value = useEnhancedResolve(props.e);
  return props.children(value);
}

export function EnhancedResolves<T extends Core.BaseExecutor<unknown>[]>(props: {
  e: { [K in keyof T]: T[K] };
  children: (props: { [K in keyof T]: Core.InferOutput<T[K]> }) =>
    | React.ReactNode
    | React.ReactNode[];
}) {
  const values = useEnhancedResolveMany(...props.e);
  return props.children(values);
}

export function EnhancedReselect<T, K>(props: {
  e: Core.Executor<T>;
  selector: (value: T) => K;
  children: (props: K) => React.ReactNode | React.ReactNode[];
  equality?: (thisValue: T, thatValue: T) => boolean;
}) {
  const value = useEnhancedResolve(props.e.reactive, props.selector, {
    equality: props.equality as any,
  });
  return props.children(value);
}

export function EnhancedReactives<T extends Core.Executor<unknown>[]>(props: {
  e: { [K in keyof T]: T[K] };
  children: (props: { [K in keyof T]: Core.InferOutput<T[K]> }) =>
    | React.ReactNode
    | React.ReactNode[];
}) {
  const values = useEnhancedResolveMany(...props.e.map((e) => e.reactive));
  return props.children(values as any);
}

export function EnhancedEffect(props: { e: Core.Executor<unknown>[] }) {
  const scope = useEnhancedScope();

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

export const enhancedPumped = {
  Effect: EnhancedEffect,
  Reactives: EnhancedReactives,
  Resolve: EnhancedResolve,
  Resolves: EnhancedResolves,
  Reselect: EnhancedReselect,
};


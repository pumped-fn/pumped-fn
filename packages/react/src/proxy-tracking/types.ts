import { Core } from "@pumped-fn/core-next";

export type TrackedValue<T> = T;

export interface TrackingResult {
  isChanged: boolean;
  dependencies: Set<string | symbol>;
}

export interface Tracker {
  track<T>(value: T, id: string): TrackedValue<T>;
  isChanged<T>(prevValue: T, nextValue: T, id: string): TrackingResult;
  getOriginal<T>(trackedValue: TrackedValue<T>): T;
  clearTracking(id: string): void;
}

export interface TrackerOptions {
  /**
   * Custom equality function to determine if two values are equal
   * @default Object.is
   */
  isEqual?: (a: any, b: any) => boolean;
}

export interface TrackingSubscription {
  id: string;
  callback: (result: TrackingResult) => void;
}

export interface DependencyNode {
  id: string;
  dependencies: Set<string>;
  subscribers: Set<string>;
}

export interface DependencyGraph {
  addNode(id: string): void;
  removeNode(id: string): void;
  addDependency(fromId: string, toId: string): void;
  removeDependency(fromId: string, toId: string): void;
  getAffectedNodes(changedNodeId: string): Set<string>;
}

export interface AccessorCache {
  get<T>(executor: Core.Executor<T>): Core.Accessor<T> | undefined;
  set<T>(executor: Core.Executor<T>, accessor: Core.Accessor<T>): void;
  has<T>(executor: Core.Executor<T>): boolean;
  delete<T>(executor: Core.Executor<T>): boolean;
  clear(): void;
}


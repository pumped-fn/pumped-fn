/**
 * @pumped-fn/react
 * React bindings for Pumped Functions
 * 
 * This file provides TypeScript type definitions and documentation for the @pumped-fn/react package.
 */

import { Core } from '@pumped-fn/core-next';
import React from 'react';

/**
 * Options for the useResolve hook
 */
export interface UseResolveOption<T> {
  /**
   * Optional function to create a snapshot of the value
   * @param value The current value
   * @returns A snapshot of the value
   */
  snapshot?: (value: T) => T;
  
  /**
   * Optional equality function to determine if the value has changed
   * @param thisValue The current value
   * @param thatValue The new value
   * @returns Whether the values are equal
   */
  equality?: (thisValue: T, thatValue: T) => boolean;
}

/**
 * Props for the ScopeProvider component
 */
export interface ScopeProviderProps {
  /**
   * Child components that will have access to the scope
   */
  children: React.ReactNode;
  
  /**
   * Optional scope to provide. If not provided, a new scope will be created.
   */
  scope?: Core.Scope;
}

/**
 * Props for the Resolve component
 */
export interface ResolveProps<T> {
  /**
   * The executor to resolve
   */
  e: Core.Executor<T>;
  
  /**
   * Function that receives the resolved value and returns React nodes
   * @param props The resolved value
   * @returns React nodes
   */
  children: (props: T) => React.ReactNode | React.ReactNode[];
}

/**
 * Props for the Resolves component
 */
export interface ResolvesProps<T extends Core.BaseExecutor<unknown>[]> {
  /**
   * Array of executors to resolve
   */
  e: { [K in keyof T]: T[K] };
  
  /**
   * Function that receives the resolved values and returns React nodes
   * @param props Object containing the resolved values
   * @returns React nodes
   */
  children: (props: { [K in keyof T]: Core.InferOutput<T[K]> }) =>
    | React.ReactNode
    | React.ReactNode[];
}

/**
 * Props for the Reselect component
 */
export interface ReselectProps<T, K> {
  /**
   * The executor to resolve
   */
  e: Core.Executor<T>;
  
  /**
   * Function to select a specific part of the resolved value
   * @param value The resolved value
   * @returns The selected part of the value
   */
  selector: (value: T) => K;
  
  /**
   * Function that receives the selected value and returns React nodes
   * @param props The selected value
   * @returns React nodes
   */
  children: (props: K) => React.ReactNode | React.ReactNode[];
  
  /**
   * Optional equality function to determine if the value has changed
   * @param thisValue The current value
   * @param thatValue The new value
   * @returns Whether the values are equal
   */
  equality?: (thisValue: T, thatValue: T) => boolean;
}

/**
 * Props for the Reactives component
 */
export interface ReactivesProps<T extends Core.Executor<unknown>[]> {
  /**
   * Array of executors to resolve
   */
  e: { [K in keyof T]: T[K] };
  
  /**
   * Function that receives the resolved values and returns React nodes
   * @param props Object containing the resolved values
   * @returns React nodes
   */
  children: (props: { [K in keyof T]: Core.InferOutput<T[K]> }) =>
    | React.ReactNode
    | React.ReactNode[];
}

/**
 * Props for the Effect component
 */
export interface EffectProps {
  /**
   * Array of executors to resolve for side effects
   */
  e: Core.Executor<unknown>[];
}

/**
 * Provides a scope context for all child components
 * @param props The component props
 * @returns A React component
 */
export function ScopeProvider(props: ScopeProviderProps): JSX.Element;

/**
 * Returns the current scope from the nearest ScopeProvider
 * @throws Error if used outside of a ScopeProvider
 * @returns The current scope container
 */
export function useScope(): { scope: Core.Scope };

/**
 * Resolves an executor and returns its value
 * @param executor The executor to resolve
 * @returns The resolved value
 */
export function useResolve<T extends Core.BaseExecutor<unknown>>(
  executor: T
): Core.InferOutput<T>;

/**
 * Resolves an executor, applies a selector function, and returns the result
 * @param executor The executor to resolve
 * @param selector Function to select a specific part of the resolved value
 * @param options Optional configuration options
 * @returns The selected value
 */
export function useResolve<T extends Core.BaseExecutor<unknown>, K>(
  executor: T,
  selector: (value: Core.InferOutput<T>) => K,
  options?: UseResolveOption<T>
): K;

/**
 * Resolves multiple executors and returns their values as an array
 * @param executors The executors to resolve
 * @returns Array of resolved values
 */
export function useResolveMany<T extends Array<Core.BaseExecutor<unknown>>>(
  ...executors: { [K in keyof T]: T[K] }
): { [K in keyof T]: Core.InferOutput<T[K]> };

/**
 * Returns a function that can update an executor's value
 * @param executor The executor to update
 * @returns Update function
 */
export function useUpdate<T>(
  executor: Core.Executor<T>
): (updateFn: T | ((current: T) => T)) => void;

/**
 * Returns a function that resets an executor to its initial value
 * @param executor The executor to reset
 * @returns Reset function
 */
export function useReset(executor: Core.Executor<unknown>): () => void;

/**
 * Returns a function that releases an executor from the scope
 * @param executor The executor to release
 * @returns Release function
 */
export function useRelease(executor: Core.Executor<unknown>): () => void;

/**
 * A component that resolves an executor and passes the value to its children
 * @param props The component props
 * @returns A React component
 */
export function Resolve<T>(props: ResolveProps<T>): JSX.Element;

/**
 * A component that resolves multiple executors and passes the values to its children
 * @param props The component props
 * @returns A React component
 */
export function Resolves<T extends Core.BaseExecutor<unknown>[]>(
  props: ResolvesProps<T>
): JSX.Element;

/**
 * A component that resolves an executor, applies a selector function, and passes the result to its children
 * @param props The component props
 * @returns A React component
 */
export function Reselect<T, K>(props: ReselectProps<T, K>): JSX.Element;

/**
 * A component that resolves multiple reactive executors and passes the values to its children
 * @param props The component props
 * @returns A React component
 */
export function Reactives<T extends Core.Executor<unknown>[]>(
  props: ReactivesProps<T>
): JSX.Element;

/**
 * A component that resolves executors for side effects without rendering anything
 * @param props The component props
 * @returns null
 */
export function Effect(props: EffectProps): null;

/**
 * Namespace containing all component exports for convenience
 */
export const pumped: {
  Effect: typeof Effect;
  Reactives: typeof Reactives;
  Resolve: typeof Resolve;
  Resolves: typeof Resolves;
  Reselect: typeof Reselect;
};


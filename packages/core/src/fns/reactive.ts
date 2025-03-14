import {
  Cleanup,
  Executor,
  executorSymbol,
  GetAccessor,
  isExecutor,
  ReactiveExecutor,
  ReactiveResourceExecutor,
} from "../types";
import { Factory } from "../types";

let reactiveId = 0;

const nextReactiveId = () => {
  return `reactive:${reactiveId++}`;
};

export function reactive<P, T>(executor: Executor<T>, factory: Factory<P, GetAccessor<T>>): ReactiveExecutor<P>;

export function reactive<P, T extends Array<unknown> | object>(
  executor: { [K in keyof T]: Executor<T[K]> },
  factory: Factory<P, { [K in keyof T]: GetAccessor<T[K]> }>,
): ReactiveExecutor<P>;

export function reactive<P, T>(
  pDependencyOrFactory: Executor<T> | { [K in keyof T]: Executor<T[K]> },
  factory: Factory<P, GetAccessor<T>> | Factory<P, { [K in keyof T]: GetAccessor<T[K]> }>,
): ReactiveExecutor<P> {
  if (isExecutor(pDependencyOrFactory)) {
    return {
      [executorSymbol]: { kind: "reactive" },
      factory: (dependencies, scope) => factory(dependencies as any, scope),
      dependencies: pDependencyOrFactory,
      id: nextReactiveId(),
    };
  }

  return {
    [executorSymbol]: { kind: "reactive" },
    factory: (dependencies, scope) => factory(dependencies as any, scope),
    dependencies: pDependencyOrFactory,
    id: nextReactiveId(),
  };
}

export function reactiveResource<P, T>(
  executor: Executor<T>,
  factory: Factory<[P, Cleanup], T>,
): ReactiveResourceExecutor<P>;

export function reactiveResource<P, T extends Array<unknown> | object>(
  executor: { [K in keyof T]: Executor<T[K]> },
  factory: Factory<[P, Cleanup], T>,
): ReactiveResourceExecutor<P>;

export function reactiveResource<P, T>(
  pDependencyOrFactory: Executor<T> | { [K in keyof T]: Executor<T[K]> },
  factory: Factory<[P, Cleanup], T>,
): ReactiveResourceExecutor<P> {
  if (isExecutor(pDependencyOrFactory)) {
    return {
      [executorSymbol]: { kind: "reactive-resource" },
      factory: (dependencies, scope) => factory(dependencies as any, scope),
      dependencies: [pDependencyOrFactory],
      id: nextReactiveId(),
    };
  }

  return {
    [executorSymbol]: { kind: "reactive-resource" },
    factory: (dependencies, scope) => factory(dependencies as any, scope),
    dependencies: pDependencyOrFactory,
    id: nextReactiveId(),
  };
}

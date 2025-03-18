import { Meta } from "../meta";
import {
  Cleanup,
  createExecutor,
  Executor,
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

export function reactive<P, T>(
  executor: Executor<T>,
  factory: Factory<P, GetAccessor<T>>,
  ...metas: Meta<unknown>[]
): ReactiveExecutor<P>;

export function reactive<P, T extends Array<unknown> | object>(
  executor: { [K in keyof T]: Executor<T[K]> },
  factory: Factory<P, { [K in keyof T]: GetAccessor<T[K]> }>,
  ...metas: Meta<unknown>[]
): ReactiveExecutor<P>;

export function reactive<P, T>(
  pDependencyOrFactory: Executor<T> | { [K in keyof T]: Executor<T[K]> },
  factory: Factory<P, GetAccessor<T>> | Factory<P, { [K in keyof T]: GetAccessor<T[K]> }>,
  ...metas: Meta<unknown>[]
): ReactiveExecutor<P> {
  if (isExecutor(pDependencyOrFactory)) {
    return createExecutor({ kind: "reactive" }, factory, pDependencyOrFactory, nextReactiveId(), metas);
  }

  return createExecutor({ kind: "reactive" }, factory, pDependencyOrFactory, nextReactiveId(), metas);
}

export function reactiveResource<P, T>(
  executor: Executor<T>,
  factory: Factory<[P, Cleanup], T>,
  ...metas: Meta<unknown>[]
): ReactiveResourceExecutor<P>;

export function reactiveResource<P, T extends Array<unknown> | object>(
  executor: { [K in keyof T]: Executor<T[K]> },
  factory: Factory<[P, Cleanup], T>,
  ...metas: Meta<unknown>[]
): ReactiveResourceExecutor<P>;

export function reactiveResource<P, T>(
  pDependencyOrFactory: Executor<T> | { [K in keyof T]: Executor<T[K]> },
  factory: Factory<[P, Cleanup], T>,
  ...metas: Meta<unknown>[]
): ReactiveResourceExecutor<P> {
  if (isExecutor(pDependencyOrFactory)) {
    return createExecutor(
      { kind: "reactive-resource" },
      factory,
      pDependencyOrFactory,
      nextReactiveId(),
      metas,
    ) as ReactiveResourceExecutor<P>;
  }

  return createExecutor(
    { kind: "reactive-resource" },
    factory,
    pDependencyOrFactory,
    nextReactiveId(),
    metas,
  ) as ReactiveResourceExecutor<P>;
}

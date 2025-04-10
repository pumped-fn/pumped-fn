import { Meta } from "../meta";
import {
  Cleanup,
  Executor,
  executorSymbol,
  GetAccessor,
  InferOutput,
  ReactiveExecutor,
  ReactiveResourceExecutor,
} from "../types";
import { Factory } from "../types";
import { anyCreate } from "./_internal";

let reactiveId = 0;

const nextReactiveId = () => {
  return `reactive:${reactiveId++}`;
};

export function isReactiveExecutor<T>(executor: Executor<unknown>): executor is ReactiveExecutor<T> {
  return executor[executorSymbol].kind === "reactive";
}

export function reactive<P, T>(
  executor: Executor<T>,
  factory: Factory<P, GetAccessor<InferOutput<Executor<T>>>>,
  ...metas: Meta<unknown>[]
): ReactiveExecutor<P>;

export function reactive<P, T extends Array<unknown> | object>(
  executor: { [K in keyof T]: Executor<T[K]> },
  factory: Factory<P, { [K in keyof T]: GetAccessor<InferOutput<Executor<T[K]>>> }>,
  ...metas: Meta<unknown>[]
): ReactiveExecutor<P>;

export function reactive<P, T>(
  pDependencyOrFactory: Executor<T> | { [K in keyof T]: Executor<T[K]> },
  factory: Factory<P, GetAccessor<T>> | Factory<P, { [K in keyof T]: GetAccessor<T[K]> }>,
  ...metas: Meta<unknown>[]
): ReactiveExecutor<P> {
  return anyCreate({ kind: "reactive" }, nextReactiveId(), pDependencyOrFactory, factory, ...metas);
}

let reactiveResourceId = 0;

const nextReactiveResourceId = () => {
  return `reactive-resource:${reactiveResourceId++}`;
};

export function isReactiveResourceExecutor<P>(executor: Executor<unknown>): executor is ReactiveResourceExecutor<P> {
  return executor[executorSymbol].kind === "reactive-resource";
}

export function reactiveResource<P, T extends Executor<unknown>>(
  executor: T,
  factory: Factory<[P, Cleanup], GetAccessor<InferOutput<T>>>,
  ...metas: Meta<unknown>[]
): ReactiveResourceExecutor<P>;

export function reactiveResource<P, T extends Array<Executor<unknown>> | Record<string, Executor<unknown>>>(
  executor: T,
  factory: Factory<[P, Cleanup], { [K in keyof T]: GetAccessor<InferOutput<T[K]>> }>,
  ...metas: Meta<unknown>[]
): ReactiveResourceExecutor<P>;

export function reactiveResource<P, T>(
  pDependencyOrFactory: Executor<T> | { [K in keyof T]: Executor<T[K]> },
  factory: Factory<[P, Cleanup], T>,
  ...metas: unknown[]
): ReactiveResourceExecutor<P> {
  return anyCreate(
    { kind: "reactive-resource" },
    nextReactiveResourceId(),
    pDependencyOrFactory,
    factory,
    ...metas,
  ) as ReactiveResourceExecutor<P>;
}

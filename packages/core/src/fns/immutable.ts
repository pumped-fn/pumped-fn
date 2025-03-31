import { Meta } from "../meta";
import { Executor, ImmutableExecutor, InferOutput, Scope } from "../types";
import { Factory } from "../types";
import { anyCreate } from "./_internal";

let providerId = 0;

const nextProviderId = () => {
  return `immutable:${providerId++}`;
};

export function provide<P>(factory: (scope: Scope) => P, ...metas: Meta<unknown>[]): ImmutableExecutor<P>;

export function provide<P, T extends Executor<unknown>>(
  executor: T,
  factory: Factory<P, InferOutput<T>>,
  ...metas: Meta<unknown>[]
): ImmutableExecutor<P>;

export function provide<P, T extends Array<Executor<unknown>> | Record<string, Executor<unknown>>>(
  executor: { [K in keyof T]: T[K] },
  factory: Factory<P, { [K in keyof T]: InferOutput<T[K]> }>,
  ...metas: Meta<unknown>[]
): ImmutableExecutor<P>;

export function provide<P, T>(
  pDependencyOrFactory: Executor<T> | { [K in keyof T]: Executor<T[K]> } | ((scope: Scope) => P | Promise<P>),
  ...params: unknown[]
): ImmutableExecutor<P> {
  return anyCreate({ kind: "immutable" }, nextProviderId(), pDependencyOrFactory, ...params);
}

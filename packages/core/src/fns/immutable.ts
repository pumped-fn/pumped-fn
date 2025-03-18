import { Meta } from "../meta";
import { createExecutor, Executor, ImmutableExecutor, InferOutput, isExecutor, Scope } from "../types";
import { Factory } from "../types";

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
  if (typeof pDependencyOrFactory === "function") {
    return createExecutor(
      { kind: "immutable" },
      pDependencyOrFactory,
      undefined,
      nextProviderId(),
      params as Meta<unknown>[],
    );
  }

  if (params.length === 0) {
    throw new Error("Expected a factory function.");
  }

  const [factory, ...metas] = params;

  if (isExecutor(pDependencyOrFactory)) {
    return createExecutor(
      { kind: "immutable" },
      factory as any,
      pDependencyOrFactory,
      nextProviderId(),
      metas as Meta<unknown>[] | undefined,
    );
  }

  return createExecutor(
    { kind: "immutable" },
    factory as any,
    pDependencyOrFactory,
    nextProviderId(),
    metas as Meta<unknown>[] | undefined,
  );
}

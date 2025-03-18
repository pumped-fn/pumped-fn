import { Meta } from "../meta";
import { createExecutor, Executor, Factory, InferOutput, isExecutor, MutableExecutor, Scope } from "../types";

let mutableId = 0;

const nextMutableId = () => {
  return `mutable:${mutableId++}`;
};

export function mutable<P>(factory: (scope: Scope) => P, ...metas: Meta<unknown>[]): MutableExecutor<P>;

export function mutable<P, T extends Executor<unknown>>(
  executor: T,
  factory: Factory<P, InferOutput<T>>,
  ...metas: Meta<unknown>[]
): MutableExecutor<P>;

export function mutable<P, T extends Array<Executor<unknown>> | Record<string, Executor<unknown>>>(
  executor: { [K in keyof T]: T[K] },
  factory: Factory<P, { [K in keyof T]: InferOutput<T[K]> }>,
  ...metas: Meta<unknown>[]
): MutableExecutor<P>;

export function mutable<P, T>(
  pDependencyOrFactory: Executor<T> | { [K in keyof T]: Executor<T[K]> } | ((scope: Scope) => P | Promise<P>),
  ...params: unknown[]
): MutableExecutor<P> {
  if (typeof pDependencyOrFactory === "function") {
    return createExecutor(
      { kind: "mutable" },
      pDependencyOrFactory,
      undefined,
      nextMutableId(),
      params as Meta<unknown>[],
    );
  }

  if (params.length === 0) {
    throw new Error("Factory is required");
  }

  const [factory, ...metas] = params;

  if (isExecutor(pDependencyOrFactory)) {
    return createExecutor({ kind: "mutable" }, factory as any, pDependencyOrFactory, nextMutableId(), metas as any);
  }

  return createExecutor({ kind: "mutable" }, factory as any, pDependencyOrFactory, nextMutableId(), metas as any);
}

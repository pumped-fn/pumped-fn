import type { Core } from "@pumped-fn/core-next";
import { resolves as explicitResolves } from "@pumped-fn/core-next";
import { AsyncLocalStorage } from "node:async_hooks";

export const implicitStore = new AsyncLocalStorage<Core.Scope>();

export const run = <T>(scope: Core.Scope, fn: () => Promise<T>): Promise<T> => {
  return implicitStore.run(scope, fn);
};

export function resolves<I extends Record<string, Core.Executor<unknown>>>(
  input: I
): Promise<{ [K in keyof I]: Core.InferOutput<I[K]> }> {
  const currentScope = implicitStore.getStore();

  if (!currentScope) {
    throw new Error("No current scope found in implicit store");
  }

  return explicitResolves(currentScope, input) as Promise<{
    [K in keyof I]: Core.InferOutput<I[K]>;
  }>;
}

export function adapt<
  I extends Record<string, Core.Executor<unknown>>,
  O extends (...args: any[]) => Promise<any>
>(
  dependency: I,
  o: (
    resolved: { [K in keyof I]: Core.InferOutput<I[K]> },
    ...params: Parameters<O>
  ) => Promise<Awaited<ReturnType<O>>>
): O {
  return (async (...args: Parameters<O>) => {
    const resolved = await resolves(dependency);
    return o(resolved, ...args);
  }) as O;
}

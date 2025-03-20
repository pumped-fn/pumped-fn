import { ScopeMiddleware } from "./core";
import { provide } from "./fns/immutable";
import { mutable } from "./fns/mutable";
import { Scope, Executor, GetAccessor, InferOutput, isExecutor, Cleanup, Middleware, MutableExecutor } from "./types";

export function resolve<T extends Executor<unknown>>(scope: Scope, input: T): Promise<GetAccessor<InferOutput<T>>>;
export function resolve<T extends Array<Executor<unknown>> | Record<string, Executor<unknown>>>(
  scope: Scope,
  input: { [K in keyof T]: T[K] },
): Promise<{ [K in keyof T]: GetAccessor<InferOutput<T[K]>> }>;

export async function resolve<T>(
  scope: Scope,
  input: Executor<T> | { [K in keyof T]: Executor<T[K]> },
): Promise<GetAccessor<T> | { [K in keyof T]: GetAccessor<T[K]> }> {
  if (input === undefined || input === null || typeof input !== "object") {
    throw new Error("Invalid input");
  }

  if (isExecutor(input)) {
    return (await scope.resolve(input)) as any;
  }

  if (Array.isArray(input)) {
    return Promise.all(input.map(async (executor) => await scope.resolve(executor))) as {
      [K in keyof T]: GetAccessor<T[K]>;
    };
  }

  const keys = Object.keys(input) as (keyof T)[];

  const entries = await Promise.all(keys.map(async (key) => [key, await scope.resolve(input[key])]));

  return Object.fromEntries(entries);
}

export function resolveOnce<T extends Executor<unknown>>(scope: Scope, input: T): Promise<InferOutput<T>>;
export function resolveOnce<T extends Array<unknown> | object>(
  scope: Scope,
  input: { [K in keyof T]: Executor<T[K]> },
): Promise<{ [K in keyof T]: Awaited<T[K]> }>;

export async function resolveOnce(scope: Scope, input: unknown): Promise<unknown> {
  if (input === undefined || input === null || typeof input !== "object") {
    throw new Error("Invalid input");
  }

  if (isExecutor(input)) {
    return (await scope.resolve(input)).get();
  }

  if (Array.isArray(input)) {
    return Promise.all(input.map(async (executor) => (await scope.resolve(executor)).get()));
  }

  const entries = await Promise.all(
    Object.entries(input).map(async ([key, executor]) => [key, (await scope.resolve(executor)).get()]),
  );
  const result = Object.fromEntries(entries);
  return result;
}

export function run<I extends Executor<unknown>, O>(
  scope: Scope,
  executor: I,
  effect: (input: InferOutput<I>) => O | Promise<O>,
): Promise<O>;

export function run<I extends Array<Executor<unknown>> | Record<string, Executor<unknown>>, O>(
  scope: Scope,
  executor: { [K in keyof I]: I[K] },
  effect: (input: { [K in keyof I]: InferOutput<I[K]> }) => O | Promise<O>,
): Promise<O>;

export async function run(scope: Scope, executor: any, effect: any): Promise<any> {
  const resolved = await resolveOnce(scope, executor);
  return await effect(resolved);
}

export function prepare<I extends Executor<unknown>, O, P extends Array<unknown>>(
  scope: Scope,
  executor: I,
  effect: (input: InferOutput<I>, ...params: P) => O | Promise<O>,
): (...params: P) => Promise<O>;

export function prepare<
  I extends Array<Executor<unknown>> | Record<string, Executor<unknown>>,
  O,
  P extends Array<unknown>,
>(
  scope: Scope,
  executor: { [K in keyof I]: I[K] },
  effect: (input: { [K in keyof I]: InferOutput<I[K]> }, ...params: P) => O | Promise<O>,
): (...params: P) => Promise<O>;

export function prepare<I, O, P extends Array<unknown>>(
  scope: Scope,
  executor: any,
  effect: (input: any, ...params: P) => O | Promise<O>,
): (...params: P) => Promise<O> {
  return (...params: P) => {
    return run(scope, executor, async (input) => await effect(input, ...params));
  };
}

type OKResult<T> = { status: "ok"; value: T };
type ErrorResult = { status: "error"; error: Error };
type Result<T> = OKResult<T> | ErrorResult;

export function safeResolve<T>(scope: Scope, input: Executor<T>): Promise<Result<GetAccessor<Awaited<T>>>>;
export function safeResolve<T extends Array<Executor<unknown>> | Record<string, Executor<unknown>>>(
  scope: Scope,
  input: { [K in keyof T]: T[K] },
): Promise<Result<{ [K in keyof T]: GetAccessor<InferOutput<T[K]>> }>>;

export async function safeResolve(scope: Scope, input: unknown): Promise<unknown> {
  try {
    if (input === undefined || input === null || typeof input !== "object") {
      throw new Error("Invalid input");
    }

    if (isExecutor(input)) {
      return await scope.resolve(input);
    }

    if (Array.isArray(input)) {
      return {
        status: "ok",
        value: await Promise.all(input.map((executor) => scope.resolve(executor))),
      };
    }

    const entries = await Promise.all(
      Object.entries(input).map(async ([key, executor]) => [key, await scope.resolve(executor)]),
    );

    const result = Object.fromEntries(entries);

    return { status: "ok", value: result };
  } catch (error) {
    return { status: "error", error };
  }
}

export function safeResolveOnce<T>(scope: Scope, input: Executor<T>): Promise<Result<InferOutput<T>>>;
export function safeResolveOnce<T extends Array<Executor<unknown>> | Record<string, Executor<unknown>>>(
  scope: Scope,
  input: { [K in keyof T]: T[K] },
): Promise<Result<{ [K in keyof T]: InferOutput<T[K]> }>>;

export async function safeResolveOnce(scope: Scope, input: unknown): Promise<unknown> {
  try {
    if (input === undefined || input === null || typeof input !== "object") {
      throw new Error("Invalid input");
    }

    if (isExecutor(input)) {
      return await resolveOnce(scope, input);
    }

    if (Array.isArray(input)) {
      return {
        status: "ok",
        value: await Promise.all(input.map(async (executor) => await resolveOnce(scope, executor))),
      };
    }

    const entries = await Promise.all(
      Object.entries(input).map(async ([key, executor]) => [key, await resolveOnce(scope, executor)]),
    );

    const result = Object.fromEntries(entries);

    return { status: "ok", value: result };
  } catch (error) {
    return { status: "error", error };
  }
}

export function safeRun<I extends Executor<unknown>, O>(
  scope: Scope,
  executor: I,
  effect: (input: InferOutput<I>) => O | Promise<O>,
): Promise<Result<O>>;

export function safeRun<I extends Array<Executor<unknown>> | Record<string, Executor<unknown>>, O>(
  scope: Scope,
  executor: { [K in keyof I]: I[K] },
  effect: (input: { [K in keyof I]: InferOutput<I[K]> }) => O | Promise<O>,
): Promise<Result<O>>;

export async function safeRun<I, O>(
  scope: Scope,
  executor: Executor<I> | { [K in keyof I]: Executor<I[K]> },
  effect: (input: any) => O | Promise<O>,
): Promise<Result<O>> {
  try {
    if (isExecutor(executor)) {
      const resolved = await safeResolveOnce(scope, executor);
      if (resolved.status === "error") {
        return resolved as Result<O>;
      }

      return {
        status: "ok",
        value: await effect(resolved.value),
      };
    }

    const resolved = await safeResolveOnce(scope, executor);
    if (resolved.status === "error") {
      return resolved as Result<O>;
    }

    return {
      status: "ok",
      value: await effect(resolved.value as any),
    };
  } catch (error) {
    return { status: "error", error: error as any };
  }
}

export function runEffect<I extends Executor<unknown>>(
  scope: Scope,
  executor: I,
  effect: (input: GetAccessor<InferOutput<I>>) => Cleanup | Promise<Cleanup>,
): Cleanup;

export function runEffect<I extends Array<Executor<unknown>> | Record<string, Executor<unknown>>>(
  scope: Scope,
  executor: { [K in keyof I]: I[K] },
  effect: (input: { [K in keyof I]: GetAccessor<InferOutput<I[K]>> }) => Cleanup | Promise<Cleanup>,
): Cleanup;

export function runEffect(scope: Scope, executor: any, effect: any): Cleanup {
  const controller = new AbortController();
  const { signal } = controller;

  if (scope.isDisposed) {
    throw new Error("Scope is disposed");
  }

  let cleanup: Cleanup | undefined = undefined;
  let removeCleanup: Cleanup | undefined = undefined;

  const process = new Promise<void>(async (_resolve, _reject) => {
    signal.addEventListener(
      "abort",
      () => {
        _resolve();
      },
      {
        once: true,
      },
    );

    const resolved = await resolve(scope, executor as any);
    cleanup = await effect(resolved);

    removeCleanup = scope.addCleanup(cleanup!);
  }).finally(() => {
    cleanup?.();
    removeCleanup?.();
  });

  return async () => {
    controller.abort();
    await process;
  };
}

export function registerMiddlewares(scope: Scope, ...middlewares: Middleware[]) {
  const middlwareScope = scope as unknown as ScopeMiddleware;

  for (const m of middlewares) {
    middlwareScope.registerMiddleware(m);
  }
}

export async function cleanMiddlewares(scope: Scope, ...middleware: Middleware[]): Promise<void> {
  const middlwareScope = scope as unknown as ScopeMiddleware;

  for (const m of middleware) {
    await middlwareScope.cleanMiddleware(m);
  }
}

export function value<V>(value: V): Executor<V> {
  return provide(() => value);
}

export function mvalue<V>(value: V): MutableExecutor<V> {
  return mutable(() => value);
}

export type ReduceFn<A, C> = (accumulator: A, currentValue: C, index: number) => A;

export function reduce<Arr extends Array<Executor<unknown>>, A>(
  input: Arr,
  preduceFn: Executor<ReduceFn<A, InferOutput<Arr[number]>>> | ReduceFn<A, InferOutput<Arr[number]>>,
  accumulator: Executor<A>,
): Executor<A> {
  const reduceFn = isExecutor(preduceFn) ? preduceFn : value(preduceFn);
  return provide([reduceFn, accumulator, ...input], async ([reduceFn, accumulator, ...input]) => {
    return input.reduce(reduceFn, accumulator);
  });
}

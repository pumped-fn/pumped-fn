import {
  Scope,
  Executor,
  GetAccessor,
  InferOutput,
  executorSymbol,
  isExecutor,
  ResourceOutput,
  EffectOutput,
} from "./core";
import { resource } from "./outputs";

let id = 0;
function nextId(type: string) {
  return `${id++}:${type}`;
}

export function bundle<B extends object>(
  input: { [K in keyof B]: Executor<B[K]> },
): Executor<ResourceOutput<{ [K in keyof B as B[K] extends EffectOutput ? never : K]: GetAccessor<B[K]> }>> {
  const refs = Object.fromEntries(
    Object.entries(input).map(([key, executor]) => [key, ref(executor as Executor<unknown>)]),
  );

  const executor: Executor<any> = {
    async factory(_refs, scope) {
      const values = await resolve(scope, _refs as any);

      return resource(values, async () => {
        await Promise.all(Object.values(input).map(async (ref) => await scope.release(ref as Executor<unknown>, true)));
        await Promise.all(Object.values(refs).map(async (ref) => await scope.release(ref as Executor<unknown>, true)));
      });
    },
    dependencies: refs,
    [executorSymbol]: true,
    id: nextId("bundle"),
  };

  return executor;
}

const refSymbol = Symbol("jumped-fn.ref");
type RefExecutor<T> = Executor<Executor<T>> & { [refSymbol]: true };

export const ref = <T>(executor: Executor<T>): RefExecutor<T> => {
  return {
    factory: async (_, scope) => {
      await scope.resolve(executor);

      return executor;
    },
    id: nextId("ref"),
    dependencies: [],
    [executorSymbol]: true,
    [refSymbol]: true,
  };
};

export function resolve<T>(scope: Scope, input: Executor<T>): Promise<GetAccessor<Awaited<T>>>;
export function resolve<T extends Array<unknown> | object>(
  scope: Scope,
  input: { [K in keyof T]: Executor<T[K]> },
): Promise<{ [K in keyof T]: GetAccessor<Awaited<T[K]>> }>;

export async function resolve<T>(scope: Scope, input: unknown): Promise<unknown> {
  if (input === undefined || input === null || typeof input !== "object") {
    throw new Error("Invalid input");
  }

  if (isExecutor(input)) {
    return scope.resolve(input);
  }

  if (Array.isArray(input)) {
    return Promise.all(input.map((executor) => scope.resolve(executor)));
  }

  const entries = await Promise.all(
    Object.entries(input).map(async ([key, executor]) => [key, await scope.resolve(executor)]),
  );
  const result = Object.fromEntries(entries);
  return result;
}

export function run<I, O>(
  scope: Scope,
  executor: Executor<I>,
  effect: (input: GetAccessor<I>) => O | Promise<O>,
): Promise<O>;

export function run<I extends Array<unknown> | object, O>(
  scope: Scope,
  executor: { [K in keyof I]: Executor<I[K]> },
  effect: (input: { [K in keyof I]: GetAccessor<I[K]> }) => O | Promise<O>,
): Promise<O>;

export async function run(scope: Scope, executor: any, effect: any): Promise<any> {
  const resolved = await resolve(scope, executor);
  return await effect(resolved);
}

export function prepare<I, O, P extends Array<unknown>>(
  scope: Scope,
  executor: Executor<I>,
  effect: (input: GetAccessor<I>, ...params: P) => O | Promise<O>,
): (...params: P) => Promise<O>;

export function prepare<I extends Array<unknown> | object, O, P extends Array<unknown>>(
  scope: Scope,
  executor: { [K in keyof I]: Executor<I[K]> },
  effect: (input: { [K in keyof I]: GetAccessor<I[K]> }, ...params: P) => O | Promise<O>,
): (...params: P) => Promise<O>;

export function prepare(scope: Scope, executor: any, effect: any): any {
  return (...params: any[]) => run(scope, executor, (input: any) => effect(input, ...params));
}

export const provide = <T>(factory: (scope: Scope) => T): Executor<T> => {
  return {
    factory: (_, scope) => factory(scope),
    get dependencies(): never[] {
      return [];
    },
    [executorSymbol]: true,
    id: nextId("provide"),
  };
};

export const derive = <T extends Array<unknown> | object, R>(
  dependencies: { [K in keyof T]: Executor<T[K]> },
  factory: (dependency: { [K in keyof T]: InferOutput<T[K]> }, scope: Scope) => R | Promise<R>,
): Executor<R> => {
  return {
    factory: (dependencies, scope) => factory(dependencies as any, scope),
    dependencies,
    [executorSymbol]: true,
    id: nextId("derive"),
  };
};

type OKResult<T> = { status: "ok"; value: T };
type ErrorResult = { status: "error"; error: Error };
type Result<T> = OKResult<T> | ErrorResult;

export function safeResolve<T>(scope: Scope, input: Executor<T>): Promise<Result<GetAccessor<Awaited<T>>>>;
export function safeResolve<T extends Array<unknown> | object>(
  scope: Scope,
  input: { [K in keyof T]: Executor<T[K]> },
): Promise<Result<{ [K in keyof T]: GetAccessor<Awaited<T[K]>> }>>;

export async function safeResolve<T>(scope: Scope, input: unknown): Promise<unknown> {
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

export function safeRun<I, O>(
  scope: Scope,
  executor: Executor<I>,
  effect: (input: GetAccessor<I>) => O | Promise<O>,
): Promise<Result<O>>;

export function safeRun<I extends Array<unknown> | object, O>(
  scope: Scope,
  executor: { [K in keyof I]: Executor<I[K]> },
  effect: (input: { [K in keyof I]: GetAccessor<I[K]> }) => O | Promise<O>,
): Promise<Result<O>>;

export async function safeRun(scope: Scope, executor: any, effect: any): Promise<Result<any>> {
  try {
    const resolved = await resolve(scope, executor);
    return {
      status: "ok",
      value: await effect(resolved),
    };
  } catch (error) {
    return { status: "error", error: error as any };
  }
}

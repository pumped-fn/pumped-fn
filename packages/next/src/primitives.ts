import type { Flow, StandardSchemaV1 } from "./types";
import { SchemaError } from "./errors";

export class Promised<T> implements PromiseLike<T> {
  private executionDataPromise?: Promise<Flow.ExecutionData | undefined>;
  private promise: Promise<T>;

  constructor(
    promise: Promise<T> | Promised<T>,
    executionDataPromise?: Promise<Flow.ExecutionData | undefined>
  ) {
    this.promise = promise instanceof Promised ? promise.promise : promise;
    this.executionDataPromise = executionDataPromise;
    this.promise.catch(() => {});
  }

  static create<T>(
    promise: Promise<T> | Promised<T>,
    executionDataPromise?: Promise<Flow.ExecutionData | undefined>
  ): Promised<T> {
    return new Promised(promise, executionDataPromise);
  }

  map<U>(fn: (value: T) => U | Promise<U>): Promised<U> {
    return Promised.create(this.promise.then(fn),
    this.executionDataPromise);
  }

  mapError(fn: (error: unknown) => unknown): Promised<T> {
    return Promised.create(this.promise.catch((error) => {
      throw fn(error);
    }),
    this.executionDataPromise);
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null | undefined
  ): Promised<TResult1 | TResult2> {
    return Promised.create(this.promise.then(onfulfilled, onrejected),
    this.executionDataPromise);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null | undefined
  ): Promised<T | TResult> {
    return Promised.create(this.promise.catch(onrejected),
    this.executionDataPromise);
  }

  finally(onfinally?: (() => void) | null | undefined): Promised<T> {
    return Promised.create(this.promise.finally(onfinally),
    this.executionDataPromise);
  }

  toPromise(): Promise<T> {
    return this.promise;
  }

  async ctx(): Promise<Flow.ExecutionData | undefined> {
    if (!this.executionDataPromise) {
      return undefined;
    }
    return this.executionDataPromise;
  }

  async inDetails(): Promise<Flow.ExecutionDetails<T>> {
    return Promised.try(async () => {
      const [result, ctx] = await Promise.all([
        this.promise,
        this.executionDataPromise,
      ]);

      if (!ctx) {
        throw new Error(
          "Execution context not available. inDetails() can only be used on flows executed via flow.execute()"
        );
      }

      return { success: true as const, result, ctx };
    }).catch(async (error) => {
      const ctx = await this.executionDataPromise;

      if (!ctx) {
        throw new Error(
          "Execution context not available. inDetails() can only be used on flows executed via flow.execute()"
        );
      }

      return { success: false as const, error, ctx };
    });
  }

  static all<T extends readonly unknown[] | []>(
    values: T
  ): Promised<{ [K in keyof T]: Awaited<T[K]> }> {
    const flowPromises = values as readonly (Promised<unknown> | unknown)[];
    const promises = flowPromises.map((v) =>
      v instanceof Promised ? v.toPromise() : Promise.resolve(v)
    );

    return Promised.create(Promise.all(promises) as Promise<any>);
  }

  static race<T extends readonly unknown[] | []>(
    values: T
  ): Promised<Awaited<T[number]>> {
    const flowPromises = values as readonly (Promised<unknown> | unknown)[];
    const promises = flowPromises.map((v) =>
      v instanceof Promised ? v.toPromise() : Promise.resolve(v)
    );

    return Promised.create(Promise.race(promises) as Promise<any>);
  }

  static allSettled<T extends readonly unknown[] | []>(
    values: T
  ): Promised<{ [K in keyof T]: PromiseSettledResult<Awaited<T[K]>> }> {
    const flowPromises = values as readonly (Promised<unknown> | unknown)[];
    const promises = flowPromises.map((v) =>
      v instanceof Promised ? v.toPromise() : Promise.resolve(v)
    );

    return Promised.create(Promise.allSettled(promises) as Promise<any>);
  }

  static try<T>(fn: () => T | Promise<T>): Promised<T> {
    const promise = new Promise<T>((resolve, reject) => {
      try {
        const result = fn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });

    return Promised.create(promise);
  }

  partition<U>(
    this: Promised<readonly PromiseSettledResult<U>[]> | Promised<{ results: readonly PromiseSettledResult<any>[] }>
  ): Promised<{ fulfilled: any[]; rejected: unknown[] }> {
    return this.map((value: any) => {
      const results = Array.isArray(value) ? value : value.results;
      const fulfilled: any[] = [];
      const rejected: unknown[] = [];

      for (const result of results) {
        if (result.status === "fulfilled") {
          fulfilled.push(result.value);
        } else {
          rejected.push(result.reason);
        }
      }

      return { fulfilled, rejected };
    });
  }
}

export function validate<TSchema extends StandardSchemaV1>(
  schema: TSchema,
  data: unknown
): Awaited<StandardSchemaV1.InferOutput<TSchema>> {
  const result = schema["~standard"].validate(data);

  if ("then" in result) {
    throw new Error("validating async is not supported");
  }

  if (result.issues) {
    throw new SchemaError(result.issues);
  }
  return result.value as Awaited<StandardSchemaV1.InferOutput<TSchema>>;
}

type ValidationError = { success: false; issues: StandardSchemaV1.Issue[] };

export function custom<T>(
  validator?: (value: unknown) => T | ValidationError
): StandardSchemaV1<T, T> {
  return {
    "~standard": {
      vendor: "pumped-fn",
      version: 1,
      validate: (value): StandardSchemaV1.Result<T> => {
        if (!validator) {
          return { value: value as T };
        }

        const result = validator(value);

        if (typeof result === "object" && result !== null && "success" in result && result.success === false) {
          return { issues: result.issues };
        }

        return { value: result as T };
      },
    },
  };
}

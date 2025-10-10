import type { Core, Flow } from "./types";

export class Promised<T> implements PromiseLike<T> {
  private executionDataPromise?: Promise<Flow.ExecutionData | undefined>;
  private promise: Promise<T>;

  constructor(
    private pod: Core.Pod,
    promise: Promise<T> | Promised<T>,
    executionDataPromise?: Promise<Flow.ExecutionData | undefined>
  ) {
    this.promise = promise instanceof Promised ? promise.promise : promise;
    this.executionDataPromise = executionDataPromise;
  }

  map<U>(fn: (value: T) => U | Promise<U>): Promised<U> {
    return new Promised(
      this.pod,
      this.promise.then(fn),
      this.executionDataPromise
    );
  }

  switch<U>(fn: (value: T) => Promised<U>): Promised<U> {
    return new Promised(
      this.pod,
      this.promise.then(fn),
      this.executionDataPromise
    );
  }

  mapError(fn: (error: unknown) => unknown): Promised<T> {
    return new Promised(
      this.pod,
      this.promise.catch((error) => {
        throw fn(error);
      }),
      this.executionDataPromise
    );
  }

  switchError(fn: (error: unknown) => Promised<T>): Promised<T> {
    return new Promised(
      this.pod,
      this.promise.catch(fn),
      this.executionDataPromise
    );
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null | undefined
  ): Promised<TResult1 | TResult2> {
    return new Promised(
      this.pod,
      this.promise.then(onfulfilled, onrejected),
      this.executionDataPromise
    );
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null | undefined
  ): Promised<T | TResult> {
    return new Promised(
      this.pod,
      this.promise.catch(onrejected),
      this.executionDataPromise
    );
  }

  finally(onfinally?: (() => void) | null | undefined): Promised<T> {
    return new Promised(
      this.pod,
      this.promise.finally(onfinally),
      this.executionDataPromise
    );
  }

  toPromise(): Promise<T> {
    return this.promise;
  }

  getPod(): Core.Pod {
    return this.pod;
  }

  async ctx(): Promise<Flow.ExecutionData | undefined> {
    if (!this.executionDataPromise) {
      return undefined;
    }
    return this.executionDataPromise;
  }

  async inDetails(): Promise<Flow.ExecutionDetails<T>> {
    return Promised.try(this.pod, async () => {
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
    const pod = flowPromises.find((v): v is Promised<unknown> => v instanceof Promised)?.getPod();

    if (!pod) {
      throw new Error("At least one Promised is required");
    }

    const promises = flowPromises.map((v) =>
      v instanceof Promised ? v.toPromise() : Promise.resolve(v)
    );

    return new Promised(pod, Promise.all(promises) as Promise<any>);
  }

  static race<T extends readonly unknown[] | []>(
    values: T
  ): Promised<Awaited<T[number]>> {
    const flowPromises = values as readonly (Promised<unknown> | unknown)[];
    const pod = flowPromises.find((v): v is Promised<unknown> => v instanceof Promised)?.getPod();

    if (!pod) {
      throw new Error("At least one Promised is required");
    }

    const promises = flowPromises.map((v) =>
      v instanceof Promised ? v.toPromise() : Promise.resolve(v)
    );

    return new Promised(pod, Promise.race(promises) as Promise<any>);
  }

  static allSettled<T extends readonly unknown[] | []>(
    values: T
  ): Promised<{ [K in keyof T]: PromiseSettledResult<Awaited<T[K]>> }> {
    const flowPromises = values as readonly (Promised<unknown> | unknown)[];
    const pod = flowPromises.find((v): v is Promised<unknown> => v instanceof Promised)?.getPod();

    if (!pod) {
      throw new Error("At least one Promised is required");
    }

    const promises = flowPromises.map((v) =>
      v instanceof Promised ? v.toPromise() : Promise.resolve(v)
    );

    return new Promised(pod, Promise.allSettled(promises) as Promise<any>);
  }

  static try<T>(pod: Core.Pod, fn: () => T | Promise<T>): Promised<T> {
    const promise = new Promise<T>((resolve, reject) => {
      try {
        const result = fn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });

    return new Promised(pod, promise);
  }

  private static extractResults<U>(
    value: readonly PromiseSettledResult<U>[] | { results: readonly PromiseSettledResult<U>[] }
  ): readonly PromiseSettledResult<U>[] {
    if (Array.isArray(value)) {
      return value;
    }
    return (value as { results: readonly PromiseSettledResult<U>[] }).results;
  }

  fulfilled<U>(
    this: Promised<readonly PromiseSettledResult<U>[]> | Promised<{ results: readonly PromiseSettledResult<any>[] }>
  ): Promised<any[]> {
    return this.map((value: any) => {
      const results = Promised.extractResults(value);
      return results
        .filter((r: any): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
        .map((r: any) => r.value);
    });
  }

  rejected<U>(
    this: Promised<readonly PromiseSettledResult<U>[]> | Promised<{ results: readonly PromiseSettledResult<any>[] }>
  ): Promised<unknown[]> {
    return this.map((value: any) => {
      const results = Promised.extractResults(value);
      return results
        .filter((r: any): r is PromiseRejectedResult => r.status === "rejected")
        .map((r: any) => r.reason);
    });
  }

  partition<U>(
    this: Promised<readonly PromiseSettledResult<U>[]> | Promised<{ results: readonly PromiseSettledResult<any>[] }>
  ): Promised<{ fulfilled: any[]; rejected: unknown[] }> {
    return this.map((value: any) => {
      const results = Promised.extractResults(value);
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

  firstFulfilled<U>(
    this: Promised<readonly PromiseSettledResult<U>[]> | Promised<{ results: readonly PromiseSettledResult<any>[] }>
  ): Promised<any> {
    return this.map((value: any) => {
      const results = Promised.extractResults(value);
      const found = results.find((r: any): r is PromiseFulfilledResult<any> => r.status === "fulfilled");
      return found?.value;
    });
  }

  firstRejected<U>(
    this: Promised<readonly PromiseSettledResult<U>[]> | Promised<{ results: readonly PromiseSettledResult<any>[] }>
  ): Promised<unknown | undefined> {
    return this.map((value: any) => {
      const results = Promised.extractResults(value);
      const found = results.find((r: any): r is PromiseRejectedResult => r.status === "rejected");
      return found?.reason;
    });
  }

  findFulfilled<U>(
    this: Promised<readonly PromiseSettledResult<U>[]> | Promised<{ results: readonly PromiseSettledResult<any>[] }>,
    predicate: (value: any, index: number) => boolean
  ): Promised<any> {
    return this.map((value: any) => {
      const results = Promised.extractResults(value);
      let fulfilledIndex = 0;

      for (const result of results) {
        if (result.status === "fulfilled") {
          if (predicate(result.value, fulfilledIndex)) {
            return result.value;
          }
          fulfilledIndex++;
        }
      }

      return undefined;
    });
  }

  mapFulfilled<U, R>(
    this: Promised<readonly PromiseSettledResult<U>[]> | Promised<{ results: readonly PromiseSettledResult<any>[] }>,
    fn: (value: any, index: number) => R
  ): Promised<R[]> {
    return this.map((value: any) => {
      const results = Promised.extractResults(value);
      const mapped: R[] = [];
      let fulfilledIndex = 0;

      for (const result of results) {
        if (result.status === "fulfilled") {
          mapped.push(fn(result.value, fulfilledIndex));
          fulfilledIndex++;
        }
      }

      return mapped;
    });
  }

  assertAllFulfilled<U>(
    this: Promised<readonly PromiseSettledResult<U>[]> | Promised<{ results: readonly PromiseSettledResult<any>[] }>,
    errorMapper?: (reasons: unknown[], fulfilledCount: number, totalCount: number) => Error
  ): Promised<any[]> {
    return this.map((value: any) => {
      const results = Promised.extractResults(value);
      const fulfilled: any[] = [];
      const rejected: unknown[] = [];

      for (const result of results) {
        if (result.status === "fulfilled") {
          fulfilled.push(result.value);
        } else {
          rejected.push(result.reason);
        }
      }

      if (rejected.length > 0) {
        const error = errorMapper
          ? errorMapper(rejected, fulfilled.length, results.length)
          : new Error(
              `${rejected.length} of ${results.length} operations failed: ${rejected.map((r: unknown) => String(r)).join(", ")}`
            );
        throw error;
      }

      return fulfilled;
    });
  }
}

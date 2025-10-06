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
    const promise = (async () => {
      return await fn();
    })();

    return new Promised(pod, promise);
  }
}

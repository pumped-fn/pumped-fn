import type { Core, Flow } from "./types";

export class FlowPromise<T> implements PromiseLike<T> {
  private executionDataPromise?: Promise<Flow.ExecutionData | undefined>;

  constructor(
    private pod: Core.Pod,
    private promise: Promise<T>,
    executionDataPromise?: Promise<Flow.ExecutionData | undefined>
  ) {
    this.executionDataPromise = executionDataPromise;
  }

  map<U>(fn: (value: T) => U | Promise<U>): FlowPromise<U> {
    return new FlowPromise(
      this.pod,
      this.promise.then(fn),
      this.executionDataPromise
    );
  }

  switch<U>(fn: (value: T) => FlowPromise<U>): FlowPromise<U> {
    return new FlowPromise(
      this.pod,
      this.promise.then(async (value) => {
        const result = fn(value);
        return result.toPromise();
      }),
      this.executionDataPromise
    );
  }

  mapError(fn: (error: unknown) => unknown): FlowPromise<T> {
    return new FlowPromise(
      this.pod,
      this.promise.catch((error) => {
        throw fn(error);
      }),
      this.executionDataPromise
    );
  }

  switchError(fn: (error: unknown) => FlowPromise<T>): FlowPromise<T> {
    return new FlowPromise(
      this.pod,
      this.promise.catch(async (error) => {
        const result = fn(error);
        return result.toPromise();
      }),
      this.executionDataPromise
    );
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null | undefined
  ): FlowPromise<TResult1 | TResult2> {
    return new FlowPromise(
      this.pod,
      this.promise.then(onfulfilled, onrejected),
      this.executionDataPromise
    );
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null | undefined
  ): FlowPromise<T | TResult> {
    return new FlowPromise(
      this.pod,
      this.promise.catch(onrejected),
      this.executionDataPromise
    );
  }

  finally(onfinally?: (() => void) | null | undefined): FlowPromise<T> {
    return new FlowPromise(
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
    try {
      const [result, ctx] = await Promise.all([
        this.promise,
        this.executionDataPromise,
      ]);

      if (!ctx) {
        throw new Error(
          "Execution context not available. inDetails() can only be used on flows executed via flow.execute()"
        );
      }

      return { success: true, result, ctx };
    } catch (error) {
      const ctx = await this.executionDataPromise;

      if (!ctx) {
        throw new Error(
          "Execution context not available. inDetails() can only be used on flows executed via flow.execute()"
        );
      }

      return { success: false, error, ctx };
    }
  }

  static all<T extends readonly unknown[] | []>(
    values: T
  ): FlowPromise<{ [K in keyof T]: Awaited<T[K]> }> {
    const flowPromises = values as readonly (FlowPromise<unknown> | unknown)[];
    const pod = flowPromises.find((v): v is FlowPromise<unknown> => v instanceof FlowPromise)?.getPod();

    if (!pod) {
      throw new Error("At least one FlowPromise is required");
    }

    const promises = flowPromises.map((v) =>
      v instanceof FlowPromise ? v.toPromise() : Promise.resolve(v)
    );

    return new FlowPromise(pod, Promise.all(promises) as Promise<any>);
  }

  static race<T extends readonly unknown[] | []>(
    values: T
  ): FlowPromise<Awaited<T[number]>> {
    const flowPromises = values as readonly (FlowPromise<unknown> | unknown)[];
    const pod = flowPromises.find((v): v is FlowPromise<unknown> => v instanceof FlowPromise)?.getPod();

    if (!pod) {
      throw new Error("At least one FlowPromise is required");
    }

    const promises = flowPromises.map((v) =>
      v instanceof FlowPromise ? v.toPromise() : Promise.resolve(v)
    );

    return new FlowPromise(pod, Promise.race(promises) as Promise<any>);
  }

  static allSettled<T extends readonly unknown[] | []>(
    values: T
  ): FlowPromise<{ [K in keyof T]: PromiseSettledResult<Awaited<T[K]>> }> {
    const flowPromises = values as readonly (FlowPromise<unknown> | unknown)[];
    const pod = flowPromises.find((v): v is FlowPromise<unknown> => v instanceof FlowPromise)?.getPod();

    if (!pod) {
      throw new Error("At least one FlowPromise is required");
    }

    const promises = flowPromises.map((v) =>
      v instanceof FlowPromise ? v.toPromise() : Promise.resolve(v)
    );

    return new FlowPromise(pod, Promise.allSettled(promises) as Promise<any>);
  }
}

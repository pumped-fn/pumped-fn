import type { Core } from "./types";

export class FlowPromise<T> implements PromiseLike<T> {
  constructor(
    private pod: Core.Pod,
    private promise: Promise<T>
  ) {}

  map<U>(fn: (value: T) => U | Promise<U>): FlowPromise<U> {
    return new FlowPromise(
      this.pod,
      this.promise.then(fn)
    );
  }

  switch<U>(fn: (value: T) => FlowPromise<U>): FlowPromise<U> {
    return new FlowPromise(
      this.pod,
      this.promise.then(async (value) => {
        const result = fn(value);
        return result.toPromise();
      })
    );
  }

  mapError(fn: (error: unknown) => unknown): FlowPromise<T> {
    return new FlowPromise(
      this.pod,
      this.promise.catch((error) => {
        throw fn(error);
      })
    );
  }

  switchError(fn: (error: unknown) => FlowPromise<T>): FlowPromise<T> {
    return new FlowPromise(
      this.pod,
      this.promise.catch(async (error) => {
        const result = fn(error);
        return result.toPromise();
      })
    );
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null | undefined
  ): FlowPromise<TResult1 | TResult2> {
    return new FlowPromise(
      this.pod,
      this.promise.then(onfulfilled, onrejected)
    );
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null | undefined
  ): FlowPromise<T | TResult> {
    return new FlowPromise(
      this.pod,
      this.promise.catch(onrejected)
    );
  }

  finally(onfinally?: (() => void) | null | undefined): FlowPromise<T> {
    return new FlowPromise(
      this.pod,
      this.promise.finally(onfinally)
    );
  }

  toPromise(): Promise<T> {
    return this.promise;
  }

  getPod(): Core.Pod {
    return this.pod;
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

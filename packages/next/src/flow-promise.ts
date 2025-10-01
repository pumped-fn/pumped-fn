import type { Core, Flow } from "./types";

export class FlowPromise<T> {
  constructor(
    private pod: Core.Pod,
    private promise: Promise<T>
  ) {}

  static all<T extends readonly FlowPromise<any>[]>(
    promises: [...T]
  ): FlowPromise<{ [K in keyof T]: Awaited<T[K] extends FlowPromise<infer U> ? U : never> }> {
    if (!promises || promises.length === 0) {
      throw new Error("No promises provided to FlowPromise.all");
    }

    const parentPod = promises[0]?.pod;
    if (!parentPod) {
      throw new Error("No pod found in first promise");
    }

    const innerPromises = promises.map(p => p.promise);

    return new FlowPromise(
      parentPod,
      Promise.all(innerPromises) as any
    );
  }

  static race<T extends readonly FlowPromise<any>[]>(
    promises: [...T]
  ): FlowPromise<Awaited<T[number] extends FlowPromise<infer U> ? U : never>> {
    if (!promises || promises.length === 0) {
      throw new Error("No promises provided to FlowPromise.race");
    }

    const parentPod = promises[0]?.pod;
    if (!parentPod) {
      throw new Error("No pod found in first promise");
    }

    const innerPromises = promises.map(p => p.promise);

    return new FlowPromise(
      parentPod,
      Promise.race(innerPromises) as any
    );
  }

  static allSettled<T extends readonly FlowPromise<any>[]>(
    promises: [...T]
  ): FlowPromise<PromiseSettledResult<Awaited<T[number] extends FlowPromise<infer U> ? U : never>>[]> {
    if (!promises || promises.length === 0) {
      throw new Error("No promises provided to FlowPromise.allSettled");
    }

    const parentPod = promises[0]?.pod;
    if (!parentPod) {
      throw new Error("No pod found in first promise");
    }

    const innerPromises = promises.map(p => p.promise);

    return new FlowPromise(
      parentPod,
      Promise.allSettled(innerPromises) as any
    );
  }

  then<U>(
    onFulfilled?: (value: T) => U | Promise<U>,
    onRejected?: (reason: any) => U | Promise<U>
  ): FlowPromise<U> {
    return new FlowPromise(
      this.pod,
      this.promise.then(onFulfilled, onRejected)
    );
  }

  catch<U = T>(
    onRejected: (reason: any) => U | Promise<U>
  ): FlowPromise<U> {
    return new FlowPromise(
      this.pod,
      this.promise.catch(onRejected) as any
    );
  }

  finally(
    onFinally: () => void | Promise<void>
  ): FlowPromise<T> {
    return new FlowPromise(
      this.pod,
      this.promise.finally(onFinally)
    );
  }

  async unwrap(): Promise<T extends Flow.OutputLike<infer S, any> ? S : T> {
    const result = await this.promise;

    if (result && typeof result === 'object' && 'type' in result) {
      const flowResult = result as any;
      if (flowResult.type === 'ko') {
        const error = new Error(flowResult.data?.message || 'Flow error');
        (error as any).data = flowResult.data;
        (error as any).cause = flowResult.cause;
        throw error;
      }
      if (flowResult.type === 'ok') {
        return flowResult.data;
      }
    }

    return result as any;
  }

  async unwrapOr<D>(defaultValue: D): Promise<T extends Flow.OutputLike<infer S, any> ? S : T | D> {
    try {
      return await this.unwrap();
    } catch {
      return defaultValue as any;
    }
  }

  async match<U>(handlers: {
    ok: (data: any) => U | Promise<U>;
    ko: (error: any) => U | Promise<U>;
  }): Promise<U> {
    const result = await this.promise;

    if (result && typeof result === 'object' && 'type' in result) {
      const flowResult = result as any;
      return flowResult.type === 'ok'
        ? handlers.ok(flowResult.data)
        : handlers.ko(flowResult.data);
    }

    return handlers.ok(result);
  }

  toPromise(): Promise<T> {
    return this.promise;
  }

  getPod(): Core.Pod {
    return this.pod;
  }
}

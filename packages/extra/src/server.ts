import { Executor, type Meta, provide, type StandardSchemaV1 } from "@pumped-fn/core";
import type { Context, Def, Impl } from "./types";

export declare namespace Server {
  export type RequestHandler<D extends Impl.AnyAPI> = (
    def: D,
    rawContext: unknown,
  ) => Promise<StandardSchemaV1.InferOutput<D["output"]>>;

  export type Caller<D extends Impl.AnyAPI> = (
    rawContext: unknown,
  ) => Promise<StandardSchemaV1.InferOutput<D["output"]>>;

  export type ServiceCaller<S extends Impl.AnyService, K extends keyof S> = (
    path: K,
    rawContext: unknown,
  ) => Promise<StandardSchemaV1.InferOutput<S[K]["output"]>>;
}

export const server = {
  createCallerContext<T>(data: T, ...extended: Record<string, unknown>[]): Context<T> {
    const callerContext = {} as Context<T>;
    Object.defineProperty(callerContext, "data", {
      value: data,
      writable: false,
      configurable: false,
      enumerable: true,
    });

    for (const [key, value] of Object.entries(extended)) {
      Object.assign(callerContext, { [key]: value });
    }

    return callerContext;
  },
  createAnyRequestHandler(
    handler: Executor<Server.RequestHandler<Impl.AnyAPI>>,
  ): Executor<Server.RequestHandler<Impl.AnyAPI>> {
    return handler;
  },
  createCaller<D extends Impl.AnyAPI>(
    def: Executor<D>,
    implementation: Executor<Server.RequestHandler<D>>,
    ...metas: Meta<unknown>[]
  ): Executor<Server.Caller<D>> {
    return provide(
      { def, implementation },
      async ({ def, implementation }) => {
        return async (rawContext) => implementation(def, rawContext);
      },
      ...metas,
    );
  },
  createServiceCaller<S extends Impl.AnyService, K extends keyof S>(
    service: Executor<S>,
    handler: Executor<Server.RequestHandler<S[K]>>,
    ...metas: Meta[]
  ): Executor<Server.ServiceCaller<S, K>> {
    return provide(
      { service, handler },
      ({ service, handler }) => {
        return async (path, rawContext) => handler(service[path], rawContext);
      },
      ...metas,
    );
  },
};

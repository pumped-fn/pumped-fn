import { Executor, isExecutor, type Meta, provide, type StandardSchemaV1 } from "@pumped-fn/core";
import type { Context, Def, Impl } from "./types";

export declare namespace Server {
  export type RequestHandler<D extends Impl.AnyService> = <K extends keyof D>(
    def: D,
    path: K,
    rawContext: unknown,
  ) => Promise<StandardSchemaV1.InferOutput<D[K]["output"]>>;

  export type Caller<D extends Impl.AnyAPI> = (
    rawContext: unknown,
  ) => Promise<StandardSchemaV1.InferOutput<D["output"]>>;

  export type ServiceCaller<S extends Impl.AnyService> = <K extends keyof S>(
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
    handler: Executor<Server.RequestHandler<Impl.AnyService>> | Server.RequestHandler<Impl.AnyService>,
    ...metas: Meta[]
  ): Executor<Server.RequestHandler<Impl.AnyService>> {
    if (isExecutor(handler)) {
      return handler;
    }

    return provide(() => handler, ...metas);
  },
  createServiceCaller<S extends Impl.AnyService>(
    service: Executor<S>,
    phandler: Executor<Server.RequestHandler<S>> | Server.RequestHandler<S>,
    ...metas: Meta[]
  ): Executor<Server.ServiceCaller<S>> {
    const handler = isExecutor(phandler) ? phandler : provide(() => phandler);

    return provide(
      { service, handler },
      ({ service, handler }) =>
        async (path, rawContext) => {
          return await handler(service, path, rawContext);
        },
      ...metas,
    );
  },
};
